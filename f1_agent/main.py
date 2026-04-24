"""
F1 Off-Weekend Content Agent — main.py
=======================================
Scrape noticias off-weekend de F1, genera artículos con Gemini y los publica
directamente como borradores en la API REST de f1-grand-prix-hub.

Variables de entorno requeridas:
  GEMINI_API_KEY   → API key de Google AI Studio
  F1_API_URL       → URL base del backend (ej: https://f1-grand-prix-hub.onrender.com)
  F1_ADMIN_TOKEN   → JWT de admin (sin el prefijo "Bearer ")

Variables opcionales:
  DRY_RUN          → "true" para scrapear/generar sin publicar (default: "false")
  GEMINI_MODEL     → modelo a usar (default: gemini-2.5-flash)
"""

import os
import re
import sys
import json
import hashlib
import logging
import argparse
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Optional

import google.generativeai as genai

# ── Configuración de logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("f1-agent")

# ── Constantes ────────────────────────────────────────────────────────────────
MAX_ARTICLES_PER_RUN = 5

CATEGORY_MAP = {
    "Fichajes y Rumores":       "noticias",
    "Declaraciones":            "noticias",
    "Técnico y Desarrollo":     "tecnico",
    "Internas de Equipos":      "noticias",
    "Polémicas y Sanciones":    "noticias",
    "Noticias Generales / Estrategia": "estrategia",
}

RSS_SOURCES = [
    "https://es.motorsport.com/rss/f1/news/",
]

EXCLUDE_KEYWORDS = [
    "prácticas", "libres", "fp1", "fp2", "fp3", "free practice",
    "clasificación", "qualifying", "pole", "sprint",
    "carrera", "race results", "parrilla", "grid", "vuelta rápida",
]

CATEGORIES = {
    "Fichajes y Rumores":    ["fichaje", "rumor", "contrato", "transferencia", "mercado", "renueva", "firma", "asiento"],
    "Declaraciones":         ["dice", "declara", "comenta", "opina", "habla", "entrevista", "revela"],
    "Técnico y Desarrollo":  ["alerón", "suelo", "motor", "chasis", "actualización", "mejora", "túnel de viento", "simulador", "fia", "reglamento", "peso"],
    "Internas de Equipos":   ["jefe", "director", "fábrica", "inversión", "patrocinador", "reestructuración"],
    "Polémicas y Sanciones": ["sanción", "penalización", "investiga", "polémica", "choque", "conflicto", "queja"],
}


# ─────────────────────────────────────────────────────────────────────────────
# SCRAPER
# ─────────────────────────────────────────────────────────────────────────────

class F1Scraper:
    """Extrae y filtra noticias off-weekend desde feeds RSS."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/114.0.0.0 Safari/537.36"
            )
        })

    # ── Helpers privados ──────────────────────────────────────────────────────

    def _fetch(self, url: str) -> Optional[str]:
        try:
            r = self.session.get(url, timeout=15)
            r.raise_for_status()
            return r.text
        except requests.HTTPError as e:
            log.error(f"HTTP {e.response.status_code} al acceder a {url}")
        except requests.ConnectionError:
            log.error(f"Error de conexión: {url}")
        except requests.Timeout:
            log.error(f"Timeout: {url}")
        except requests.RequestException as e:
            log.error(f"Error inesperado en {url}: {e}")
        return None

    def _is_off_weekend(self, text: str) -> bool:
        """True si el texto NO menciona actividad de fin de semana de carrera."""
        text_lower = text.lower()
        return not any(
            re.search(r"\b" + re.escape(kw) + r"\b", text_lower)
            for kw in EXCLUDE_KEYWORDS
        )

    def _categorize(self, title: str, summary: str) -> str:
        text_lower = (title + " " + summary).lower()
        for category, keywords in CATEGORIES.items():
            if any(re.search(r"\b" + re.escape(kw) + r"\b", text_lower) for kw in keywords):
                return category
        return "Noticias Generales / Estrategia"

    # ── API pública ───────────────────────────────────────────────────────────

    def scrape_rss(self, url: str, target_dates: Optional[list] = None) -> list:
        """Parsea un feed RSS y retorna noticias off-weekend filtradas."""
        raw = self._fetch(url)
        if not raw:
            return []

        items = []
        try:
            root = ET.fromstring(raw)
        except ET.ParseError as e:
            log.error(f"XML inválido en {url}: {e}")
            return []

        for item in root.findall(".//item")[:20]:
            title_el  = item.find("title")
            desc_el   = item.find("description")
            link_el   = item.find("link")
            date_el   = item.find("pubDate")

            if title_el is None:
                continue

            title   = (title_el.text or "").strip()
            summary = re.sub(r"<[^>]+>", "", (desc_el.text or "") if desc_el is not None else "").strip()
            link    = (link_el.text or url).strip() if link_el is not None else url

            # Parsear fecha
            if date_el is not None and date_el.text:
                try:
                    date_str = parsedate_to_datetime(date_el.text).strftime("%Y-%m-%d")
                except Exception:
                    date_str = datetime.now().strftime("%Y-%m-%d")
            else:
                date_str = datetime.now().strftime("%Y-%m-%d")

            # Filtros
            if target_dates and date_str not in target_dates:
                continue
            if not self._is_off_weekend(title) or not self._is_off_weekend(summary):
                continue

            category = self._categorize(title, summary)
            items.append({
                "title":    title,
                "summary":  summary or "Sin resumen disponible.",
                "source":   link,
                "date":     date_str,
                "category": category,
            })

        return items


# ─────────────────────────────────────────────────────────────────────────────
# GENERADOR DE CONTENIDO (GEMINI)
# ─────────────────────────────────────────────────────────────────────────────

class ContentGenerator:
    """Genera el cuerpo del artículo usando Gemini."""

    def __init__(self):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError("GEMINI_API_KEY no está definida.")

        model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
        log.info(f"Gemini configurado → modelo: {model_name}")

    def generate(self, news: dict) -> dict:
        """
        Toma una noticia y devuelve un dict listo para POST /api/articles.
        El contenido HTML es compatible con el editor Quill del admin.
        """
        title   = news["title"]
        summary = news["summary"]
        cat_label = news["category"]

        prompt = f"""
Eres un periodista experto en Fórmula 1. Escribe el cuerpo de un artículo periodístico sobre esta noticia.

Título: {title}
Resumen/Extracto: {summary}
Categoría: {cat_label}

INSTRUCCIONES DE FORMATO (importante):
- Devuelve ÚNICAMENTE el HTML del contenido, sin head ni body.
- Usa estas etiquetas: <p>, <h2>, <strong>, <em>, <ul>, <li>.
- Estructura: párrafo de introducción (enganche), h2 con desarrollo, párrafo de conclusión/impacto.
- Tono profesional, objetivo, accesible para fans hispanohablantes.
- Mínimo 300 palabras. NO repitas el título. NO incluyas saludos.
- Solo devuelve HTML puro, sin bloques de código ni backticks.
"""
        try:
            log.info(f"Generando contenido para: '{title[:60]}...'")
            response = self.model.generate_content(prompt)
            content_html = response.text.strip()
            # Limpiar posibles bloques de código que Gemini a veces agrega
            content_html = re.sub(r"^```html?\s*", "", content_html, flags=re.IGNORECASE)
            content_html = re.sub(r"\s*```$", "", content_html)
        except Exception as e:
            log.error(f"Error Gemini: {e}")
            content_html = f"<p>{summary}</p>"

        # Mapear la categoría del scraper a la categoría de la DB
        db_category = CATEGORY_MAP.get(cat_label, "noticias")

        # Extraer tags relevantes del título
        tags = _extract_tags(title)

        return {
            "title":     title,
            "excerpt":   summary[:157] + "..." if len(summary) > 157 else summary,
            "content":   content_html,
            "author":    "F1 Hub Agent",
            "category":  db_category,
            "tags":      tags,
            "published": False,   # siempre borrador → lo revisás vos en el admin
            "featured":  False,
        }


def _extract_tags(title: str) -> list:
    """Genera tags básicos a partir del título."""
    tags = ["f1", "fórmula 1"]
    pilots = [
        "verstappen", "hamilton", "leclerc", "norris", "sainz", "russell",
        "alonso", "piastri", "perez", "stroll", "tsunoda", "gasly", "hulkenberg",
        "albon", "bottas", "zhou", "ocon", "magnussen", "bearman", "antonelli",
    ]
    teams = [
        "red bull", "mercedes", "ferrari", "mclaren", "aston martin",
        "alpine", "williams", "haas", "rb", "sauber",
    ]
    title_lower = title.lower()
    for name in pilots + teams:
        if name in title_lower:
            tags.append(name)
    return list(set(tags))[:8]   # máx 8 tags


# ─────────────────────────────────────────────────────────────────────────────
# PUBLICADOR (REST API)
# ─────────────────────────────────────────────────────────────────────────────

class ArticlePublisher:
    """Publica artículos directamente en /api/articles con auth JWT."""

    def __init__(self):
        self.api_url   = os.environ.get("F1_API_URL", "").rstrip("/")
        self.token     = os.environ.get("F1_ADMIN_TOKEN", "")
        self.dry_run   = os.environ.get("DRY_RUN", "false").lower() == "true"

        if not self.api_url:
            raise EnvironmentError("F1_API_URL no está definida.")
        if not self.token and not self.dry_run:
            raise EnvironmentError("F1_ADMIN_TOKEN no está definida (o activá DRY_RUN=true).")

        self.endpoint = f"{self.api_url}/api/articles"
        self.headers  = {
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {self.token}",
        }

    def publish(self, article: dict) -> bool:
        """
        Hace POST a /api/articles. Retorna True si fue exitoso.
        En dry_run solo loguea el payload sin publicar.
        """
        if self.dry_run:
            log.info(f"[DRY RUN] Artículo que se publicaría: '{article['title']}'")
            log.info(f"[DRY RUN] Payload: {json.dumps(article, ensure_ascii=False, indent=2)[:400]}...")
            return True

        try:
            r = requests.post(
                self.endpoint,
                json=article,
                headers=self.headers,
                timeout=20,
            )
            if r.status_code == 201:
                data = r.json()
                slug = data.get("data", {}).get("slug", "?")
                log.info(f"✅ Publicado como borrador → slug: {slug}")
                return True
            else:
                log.error(f"❌ Error {r.status_code} publicando '{article['title']}': {r.text[:200]}")
                return False
        except requests.RequestException as e:
            log.error(f"❌ Error de red publicando '{article['title']}': {e}")
            return False


# ─────────────────────────────────────────────────────────────────────────────
# REGISTRO DE PUBLICADOS (deduplicación entre runs)
# ─────────────────────────────────────────────────────────────────────────────

def load_published(path: str) -> set:
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()


def save_published(path: str, hashes: set):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(sorted(hashes), f, indent=2)


def news_hash(news: dict) -> str:
    """Hash MD5 del título + fecha. Identifica la noticia de forma estable."""
    raw = f"{news['title']}|{news['date']}"
    return hashlib.md5(raw.encode()).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# OUTPUT para GitHub Actions
# ─────────────────────────────────────────────────────────────────────────────

def set_gha_output(key: str, value: str):
    """Escribe outputs al archivo especial de GitHub Actions."""
    output_file = os.environ.get("GITHUB_OUTPUT")
    if output_file:
        with open(output_file, "a") as f:
            f.write(f"{key}={value}\n")


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="F1 Off-Weekend Content Agent")
    parser.add_argument(
        "--dates", nargs="*",
        help="Fechas a filtrar YYYY-MM-DD (ej: 2025-05-01 2025-05-02). Vacío = recientes."
    )
    parser.add_argument(
        "--published-registry", default="f1_agent/publicados.json",
        help="Ruta del JSON que registra los hashes ya publicados."
    )
    args = parser.parse_args()

    target_dates = args.dates or None
    registry_path = args.published_registry
    today = datetime.now().strftime("%Y-%m-%d")

    log.info("=" * 60)
    log.info(f"F1 Content Agent — {today}")
    if target_dates:
        log.info(f"Filtrando por fechas: {', '.join(target_dates)}")
    log.info("=" * 60)

    # 1. Scraping
    scraper = F1Scraper()
    all_news = []
    for rss_url in RSS_SOURCES:
        log.info(f"Scrapeando: {rss_url}")
        news = scraper.scrape_rss(rss_url, target_dates=target_dates)
        log.info(f"  → {len(news)} noticias off-weekend encontradas")
        all_news.extend(news)

    if not all_news:
        log.info("Sin noticias nuevas en esta ejecución. Saliendo.")
        set_gha_output("count", "0")
        set_gha_output("date", today)
        sys.exit(0)

    # 2. Deduplicación contra el registro histórico
    published_hashes = load_published(registry_path)
    new_news = [n for n in all_news if news_hash(n) not in published_hashes]
    new_news = new_news[:MAX_ARTICLES_PER_RUN]   # límite por run

    log.info(f"Noticias candidatas: {len(all_news)} | Nuevas tras dedup: {len(new_news)}")

    if not new_news:
        log.info("Todas las noticias ya fueron publicadas anteriormente. Saliendo.")
        set_gha_output("count", "0")
        set_gha_output("date", today)
        sys.exit(0)

    # 3. Generador de contenido + publicador
    try:
        generator = ContentGenerator()
        publisher = ArticlePublisher()
    except EnvironmentError as e:
        log.error(f"Configuración incompleta: {e}")
        sys.exit(1)

    published_count = 0
    for i, news in enumerate(new_news, start=1):
        log.info(f"\n[{i}/{len(new_news)}] Procesando: {news['title'][:70]}")

        # Generar artículo
        article = generator.generate(news)

        # Publicar como borrador
        success = publisher.publish(article)

        if success:
            published_hashes.add(news_hash(news))
            published_count += 1
        else:
            log.warning(f"Saltando registro del hash por fallo en publicación.")

    # 4. Actualizar registro de publicados
    save_published(registry_path, published_hashes)
    log.info(f"\n{'=' * 60}")
    log.info(f"✅ Proceso finalizado. Borradores publicados: {published_count}/{len(new_news)}")
    log.info(f"{'=' * 60}")

    # Outputs para GitHub Actions (usados en notificaciones)
    set_gha_output("count", str(published_count))
    set_gha_output("date", today)

    # Salir con error si no se publicó nada (para que GHA lo marque en rojo)
    if published_count == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
