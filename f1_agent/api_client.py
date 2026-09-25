"""
Cliente mínimo del backend de f1-grand-prix-hub para scripts del agente.

Mismo comportamiento que ArticlePublisher._wake_up_server / _fetch_agent_token
en main.py (Render free tier tarda ~30-60s en despertar), pero sin depender de
Gemini ni del resto de main.py. main.py no se modifica.

Variables de entorno:
  F1_API_URL   → URL base del backend (ej: https://f1-grand-prix-hub.onrender.com)
  CRON_SECRET  → secreto para GET /api/auth/agent-token
"""
import logging
import time

import requests

log = logging.getLogger("f1-agent")


def wake_up_server(api_url: str, max_attempts: int = 5, timeout: int = 30,
                   session=None, sleep=time.sleep) -> None:
    """Hace ping a /api/health hasta que responda (<500). Lanza EnvironmentError si no."""
    http = session or requests
    health_url = f"{api_url}/api/health"
    log.info(f"⏳ Verificando disponibilidad del servidor ({health_url})...")

    for attempt in range(1, max_attempts + 1):
        try:
            r = http.get(health_url, timeout=timeout)
            if r.status_code < 500:
                log.info(f"✅ Servidor disponible (intento {attempt}, status {r.status_code}).")
                return
            log.warning(f"  Intento {attempt}/{max_attempts}: status {r.status_code}.")
        except requests.exceptions.Timeout:
            log.warning(f"  Intento {attempt}/{max_attempts}: timeout ({timeout}s).")
        except requests.exceptions.ConnectionError as e:
            log.warning(f"  Intento {attempt}/{max_attempts}: conexión fallida — {e}.")

        if attempt < max_attempts:
            wait = attempt * 10  # 10s, 20s, 30s, 40s
            log.info(f"  Esperando {wait}s antes del próximo intento...")
            sleep(wait)

    raise EnvironmentError(f"El servidor no respondió después de {max_attempts} intentos ({api_url}).")


def fetch_agent_token(api_url: str, cron_secret: str, session=None) -> str:
    """Obtiene un JWT de agente con CRON_SECRET. Lanza EnvironmentError si falla."""
    http = session or requests
    url = f"{api_url}/api/auth/agent-token"
    try:
        r = http.get(url, headers={"Authorization": f"Bearer {cron_secret}"}, timeout=30)
    except requests.RequestException as e:
        raise EnvironmentError(f"Error conectando al servidor para obtener token: {e}") from e
    if r.status_code != 200:
        raise EnvironmentError(f"No se pudo obtener el token: {r.status_code} {r.text[:200]}")
    token = r.json().get("token")
    if not token:
        raise EnvironmentError("La respuesta de agent-token no trae 'token'.")
    log.info("✅ Token de agente obtenido correctamente.")
    return token
