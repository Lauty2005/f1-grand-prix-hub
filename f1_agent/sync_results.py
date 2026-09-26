"""
Sync de resultados F1 desde Jolpica → f1-grand-prix-hub.
=========================================================
Transporte puro: pide al backend qué carreras faltan, trae de Jolpica las
respuestas COMPLETAS (sin transformar) y las manda a PUT /api/admin/sync/races/:id.
El backend valida, mapea y escribe (una transacción por carrera).

Prácticas libres: Jolpica no las publica; vienen de OpenF1 (sessions +
session_result + drivers) y van a PUT /api/admin/sync/races/:id/practices. Se
sincronizan desde el jueves previo a la carrera. --skip-practices las omite.
Si OpenF1 responde 401/403 (sesión en vivo), queda como "no disponible", no es error.

Horarios: en las corridas completas (sin --jolpica-round) también manda el
calendario de la temporada a PUT /api/admin/sync/schedule. Carreras futuras: se
actualizan los horarios que cambiaron; pasadas: solo se completan los vacíos.

Uso:
  python f1_agent/sync_results.py                         # temporada actual, solo pendientes
  python f1_agent/sync_results.py --season 2026 --dry-run
  python f1_agent/sync_results.py --jolpica-round 6 --dry-run      # una carrera, aunque esté cargada
  python f1_agent/sync_results.py --jolpica-round 6 --force        # aplicar corrección

Variables de entorno:
  F1_API_URL, CRON_SECRET   → ver api_client.py
  JOLPICA_BASE_URL          → opcional (default https://api.jolpi.ca/ergast/f1)

Exit code: 0 si todo OK (incluye "todavía no publicado"); 1 si hubo errores de
validación (422), conflictos (409), o fallas de red/HTTP. Así el workflow falla visible.
"""
import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import requests

from api_client import fetch_agent_token, wake_up_server

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
log = logging.getLogger("f1-sync")

JOLPICA_BASE_URL = os.getenv("JOLPICA_BASE_URL", "https://api.jolpi.ca/ergast/f1").rstrip("/")
OPENF1_BASE_URL = os.getenv("OPENF1_BASE_URL", "https://api.openf1.org/v1").rstrip("/")
PRACTICE_NAMES = {"p1": "Practice 1", "p2": "Practice 2", "p3": "Practice 3"}
USER_AGENT = "F1GrandPrixHub/1.0 (+https://f1grandprixhub.com)"
KINDS = ("results", "sprint", "qualifying")


# ─────────────────────────────────────────────────────────────────────────────
# Jolpica
# ─────────────────────────────────────────────────────────────────────────────

class JolpicaError(Exception):
    pass


class JolpicaClient:
    """GET a Jolpica con throttle (límite 4 req/s, 500 req/h) y backoff ante 429/5xx/red."""

    def __init__(self, base_url: str = JOLPICA_BASE_URL, session=None, min_interval: float = 0.5,
                 retries: int = 4, timeout: int = 20, sleep=time.sleep, clock=time.monotonic):
        self.base_url = base_url.rstrip("/")
        self.http = session or requests.Session()
        self.min_interval = min_interval
        self.retries = retries
        self.timeout = timeout
        self.sleep = sleep
        self.clock = clock
        self._last = None
        self.requests_made = 0

    def _throttle(self):
        if self._last is not None:
            wait = self.min_interval - (self.clock() - self._last)
            if wait > 0:
                self.sleep(wait)
        self._last = self.clock()

    def get(self, path: str) -> dict:
        url = f"{self.base_url}/{path}"
        last_error = None
        for attempt in range(1, self.retries + 1):
            self._throttle()
            self.requests_made += 1
            try:
                r = self.http.get(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                                  timeout=self.timeout)
            except requests.RequestException as e:
                last_error = f"red: {e}"
            else:
                if r.status_code == 200:
                    try:
                        return r.json()
                    except ValueError as e:
                        raise JolpicaError(f"{url}: respuesta no es JSON ({e})") from e
                if r.status_code == 429 or r.status_code >= 500:
                    last_error = f"HTTP {r.status_code}"
                    retry_after = r.headers.get("Retry-After") if hasattr(r, "headers") else None
                    if retry_after and str(retry_after).isdigit() and attempt < self.retries:
                        self.sleep(min(int(retry_after), 60))
                        continue
                else:
                    raise JolpicaError(f"{url}: HTTP {r.status_code}")
            if attempt < self.retries:
                self.sleep(2 ** attempt)  # 2, 4, 8 s
        raise JolpicaError(f"{url}: sin respuesta tras {self.retries} intentos ({last_error})")

    def session(self, season: int, rnd: int, kind: str) -> dict:
        return self.get(f"{season}/{rnd}/{kind}.json?limit=100")

    def calendar(self, season: int) -> dict:
        """Respuesta COMPLETA del calendario (se manda tal cual al backend)."""
        return self.get(f"{season}.json?limit=100")


class OpenF1Unavailable(Exception):
    """OpenF1 no da acceso (401/403: sesión en vivo o restricción del plan gratuito). No es error del sync."""


class OpenF1Client:
    """GET a OpenF1 con throttle (plan gratuito: 3 req/s y 30 req/min → 1 pedido cada 2.1 s) y backoff."""

    def __init__(self, base_url: str = OPENF1_BASE_URL, session=None, min_interval: float = 2.1,
                 retries: int = 4, timeout: int = 30, sleep=time.sleep, clock=time.monotonic):
        self.base_url = base_url.rstrip("/")
        self.http = session or requests.Session()
        self.min_interval = min_interval
        self.retries = retries
        self.timeout = timeout
        self.sleep = sleep
        self.clock = clock
        self._last = None
        self._sessions_cache = {}

    def _throttle(self):
        if self._last is not None:
            wait = self.min_interval - (self.clock() - self._last)
            if wait > 0:
                self.sleep(wait)
        self._last = self.clock()

    def get(self, path: str, params: dict) -> list:
        url = f"{self.base_url}/{path}"
        last_error = None
        for attempt in range(1, self.retries + 1):
            self._throttle()
            try:
                r = self.http.get(url, params=params, headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                                  timeout=self.timeout)
            except requests.RequestException as e:
                last_error = f"red: {e}"
            else:
                if r.status_code == 200:
                    try:
                        data = r.json()
                    except ValueError as e:
                        raise JolpicaError(f"OpenF1 {path}: respuesta no es JSON ({e})") from e
                    return data if isinstance(data, list) else []
                if r.status_code == 404:
                    return []  # OpenF1 responde 404 cuando no hay datos para el filtro
                if r.status_code in (401, 403):
                    raise OpenF1Unavailable(f"OpenF1 {path}: HTTP {r.status_code}")
                if r.status_code == 429 or r.status_code >= 500:
                    last_error = f"HTTP {r.status_code}"
                else:
                    raise JolpicaError(f"OpenF1 {path}: HTTP {r.status_code}")
            if attempt < self.retries:
                self.sleep(2 ** attempt * 2)  # 4, 8, 16 s
        raise JolpicaError(f"OpenF1 {path}: sin respuesta tras {self.retries} intentos ({last_error})")

    def practice_sessions(self, season: int) -> list:
        if season not in self._sessions_cache:
            self._sessions_cache[season] = self.get("sessions", {"year": season, "session_type": "Practice"})
        return self._sessions_cache[season]

    def session_result(self, session_key: int) -> list:
        return self.get("session_result", {"session_key": session_key})

    def drivers(self, session_key: int) -> list:
        return self.get("drivers", {"session_key": session_key})


def practice_sessions_for(race: dict, sessions: list) -> dict:
    """Sesiones Practice 1/2/3 de OpenF1 que caen en el fin de semana de la carrera (fecha-4 días … fecha)."""
    race_day = datetime.fromisoformat(f"{race['date']}T23:59:59+00:00")
    found = {}
    for s in sessions:
        name = s.get("session_name")
        col = next((c for c, n in PRACTICE_NAMES.items() if n == name), None)
        if not col or s.get("is_cancelled"):
            continue
        try:
            start = datetime.fromisoformat(str(s.get("date_start")).replace("Z", "+00:00"))
        except ValueError:
            continue
        if 0 <= (race_day - start).total_seconds() <= 5 * 86400:
            found[col] = s
    return found


def is_published(response: dict) -> bool:
    races = response.get("MRData", {}).get("RaceTable", {}).get("Races", [])
    return bool(races)


# ─────────────────────────────────────────────────────────────────────────────
# Backend
# ─────────────────────────────────────────────────────────────────────────────

class HubClient:
    def __init__(self, api_url: str, token: str, session=None, timeout: int = 60):
        self.api_url = api_url.rstrip("/")
        self.http = session or requests.Session()
        self.headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        self.timeout = timeout

    def pending(self, season: int, jolpica_round: Optional[int] = None) -> dict:
        params = {"season": season}
        if jolpica_round is not None:
            params["jolpica_round"] = jolpica_round
        r = self.http.get(f"{self.api_url}/api/admin/sync/pending", params=params,
                          headers=self.headers, timeout=self.timeout)
        if r.status_code != 200:
            raise EnvironmentError(f"GET /pending → {r.status_code} {r.text[:300]}")
        return r.json()

    def put_schedule(self, season: int, calendar: dict, dry_run: bool):
        params = {"season": season}
        if dry_run:
            params["dry_run"] = 1
        r = self.http.put(f"{self.api_url}/api/admin/sync/schedule", params=params,
                          data=json.dumps({"source": "jolpica", "calendar": calendar}),
                          headers=self.headers, timeout=self.timeout)
        try:
            body = r.json()
        except ValueError:
            body = {"error": r.text[:300]}
        return r.status_code, body

    def put_practices(self, race_id: int, payload: dict, dry_run: bool, force: bool):
        params = {}
        if dry_run:
            params["dry_run"] = 1
        if force:
            params["force"] = 1
        r = self.http.put(f"{self.api_url}/api/admin/sync/races/{race_id}/practices", params=params,
                          data=json.dumps(payload), headers=self.headers, timeout=self.timeout)
        try:
            body = r.json()
        except ValueError:
            body = {"error": r.text[:300]}
        return r.status_code, body

    def put_race(self, race_id: int, payload: dict, dry_run: bool, force: bool):
        params = {}
        if dry_run:
            params["dry_run"] = 1
        if force:
            params["force"] = 1
        r = self.http.put(f"{self.api_url}/api/admin/sync/races/{race_id}", params=params,
                          data=json.dumps(payload), headers=self.headers, timeout=self.timeout)
        try:
            body = r.json()
        except ValueError:
            body = {"error": r.text[:300]}
        return r.status_code, body


# ─────────────────────────────────────────────────────────────────────────────
# Orquestación
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class RaceOutcome:
    race_id: int
    name: str
    jolpica_round: int
    status: str            # applied | unchanged | dry_run | not_published | error
    detail: str = ""
    changes: list = field(default_factory=list)


@dataclass
class Report:
    season: int
    dry_run: bool
    force: bool
    outcomes: list = field(default_factory=list)
    unlinked: list = field(default_factory=list)   # rondas de Jolpica sin carrera en la base
    warnings: list = field(default_factory=list)
    schedule: Optional[dict] = None                # respuesta de PUT /schedule (data)
    schedule_error: Optional[str] = None

    @property
    def errors(self):
        return [o for o in self.outcomes if o.status == "error"]

    @property
    def error_count(self) -> int:
        return len(self.errors) + (1 if self.schedule_error else 0)

    def count(self, status):
        return sum(1 for o in self.outcomes if o.status == status)


def _table_counts(tables: dict) -> str:
    parts = []
    for kind, t in tables.items():
        a, c, r = len(t.get("added", [])), len(t.get("changed", [])), len(t.get("removed", []))
        parts.append(f"{kind} +{a} ~{c} -{r} ={t.get('unchanged', 0)}")
    return ", ".join(parts)


def _has_changes(tables: dict) -> bool:
    return any(t.get("added") or t.get("changed") or t.get("removed") for t in tables.values())


def _change_lines(tables: dict) -> list:
    """Cambios y bajas fila por fila (las altas ya van como conteo en el detalle)."""
    lines = []
    for kind, t in tables.items():
        for c in t.get("changed", []):
            ch = ", ".join(f"{k} {json.dumps(v[0])}→{json.dumps(v[1])}" for k, v in c.get("changes", {}).items())
            lines.append(f"{kind}: ~ {c.get('driver')}: {ch}")
        for rm in t.get("removed", []):
            lines.append(f"{kind}: - {rm.get('driver')} P{rm.get('position')}")
    return lines


def sync_race(race: dict, season: int, hub: HubClient, jolpica: JolpicaClient,
              dry_run: bool, force: bool) -> RaceOutcome:
    rid, name, rnd = race["race_id"], race["name"], race["jolpica_round"]
    payload = {"source": "jolpica"}
    unpublished = []
    try:
        for kind in [k for k in race["needs"] if k in KINDS]:
            response = jolpica.session(season, rnd, kind)
            if is_published(response):
                payload[kind] = response
            else:
                unpublished.append(kind)
    except JolpicaError as e:
        return RaceOutcome(rid, name, rnd, "error", f"Jolpica: {e}")

    if len(payload) == 1:
        return RaceOutcome(rid, name, rnd, "not_published", f"sin publicar: {', '.join(unpublished)}")

    try:
        status, body = hub.put_race(rid, payload, dry_run=dry_run, force=force)
    except requests.RequestException as e:
        return RaceOutcome(rid, name, rnd, "error", f"backend: {e}")

    pending_note = f" · sin publicar: {', '.join(unpublished)}" if unpublished else ""
    if status == 200:
        data = body.get("data", {})
        tables = data.get("tables", {})
        detail = _table_counts(tables) + pending_note
        if dry_run:
            note = " · REQUIERE --force" if data.get("requires_force") else ""
            return RaceOutcome(rid, name, rnd, "dry_run", detail + note, _change_lines(tables))
        st = "applied" if _has_changes(tables) else "unchanged"
        return RaceOutcome(rid, name, rnd, st, detail, _change_lines(tables))
    if status == 422:
        return RaceOutcome(rid, name, rnd, "error", "422 " + " | ".join(body.get("issues", [body.get("error", "")])))
    if status == 409:
        tables = body.get("data", {}).get("tables", {})
        return RaceOutcome(rid, name, rnd, "error", f"409 {body.get('error', '')}", _change_lines(tables))
    return RaceOutcome(rid, name, rnd, "error", f"HTTP {status} {body.get('error', '')}")


def run(season: int, hub: HubClient, jolpica: JolpicaClient, jolpica_round: Optional[int] = None,
        dry_run: bool = False, force: bool = False, openf1: Optional[OpenF1Client] = None) -> Report:
    report = Report(season=season, dry_run=dry_run, force=force)
    pending = hub.pending(season, jolpica_round)
    races = pending.get("data", [])

    if jolpica_round is not None and not races:
        report.warnings.append(f"La ronda {jolpica_round} no existe en la base, es futura o está suspendida.")

    for race in races:
        outcomes = []
        if any(k in KINDS for k in race["needs"]):
            outcomes.append(sync_race(race, season, hub, jolpica, dry_run, force))
        if "practices" in race["needs"] and openf1 is not None:
            outcomes.append(sync_practices(race, season, hub, openf1, dry_run, force))
        for outcome in outcomes:
            log.info(f"[{outcome.status}] {race['race_id']} {outcome.name} (R{race['jolpica_round']}): {outcome.detail}")
            for line in outcome.changes:
                log.info(f"    {line}")
            report.outcomes.append(outcome)

    # Calendario: rondas sin vincular (informativo) + horarios de sesiones.
    try:
        calendar = jolpica.calendar(season)
    except JolpicaError as e:
        report.schedule_error = f"Jolpica (calendario): {e}"
        return report

    try:
        mapped = set(pending.get("mapped_rounds", []))
        for r in calendar.get("MRData", {}).get("RaceTable", {}).get("Races", []):
            if int(r["round"]) not in mapped:
                report.unlinked.append(f"R{r['round']} {r.get('raceName', '?')} ({r.get('date', '?')})")
    except (KeyError, ValueError) as e:
        report.warnings.append(f"No se pudo verificar el calendario: {e}")

    # Horarios: solo en corridas completas; una corrección puntual (--jolpica-round) no los toca.
    if jolpica_round is None:
        try:
            status, body = hub.put_schedule(season, calendar, dry_run=dry_run)
        except requests.RequestException as e:
            report.schedule_error = f"backend (horarios): {e}"
        else:
            if status == 200:
                report.schedule = body.get("data", {})
                for c in report.schedule.get("changes", []):
                    log.info(f"[horarios] R{c['jolpica_round']} {c['name']}: {', '.join(c['changes'])}")
            else:
                issues = body.get("issues") or [body.get("error", "")]
                report.schedule_error = f"horarios HTTP {status}: {' | '.join(issues)}"

    return report


def _fmt_utc(iso: Optional[str]) -> str:
    """'2026-09-26T11:00:00.000Z' → '26/09 11:00Z'."""
    if not iso:
        return "—"
    return f"{iso[8:10]}/{iso[5:7]} {iso[11:16]}Z"


def sync_practices(race: dict, season: int, hub: HubClient, openf1: OpenF1Client,
                   dry_run: bool, force: bool) -> RaceOutcome:
    rid, rnd = race["race_id"], race["jolpica_round"]
    name = f"{race['name']} · prácticas"
    try:
        matched = practice_sessions_for(race, openf1.practice_sessions(season))
        payload = {"source": "openf1"}
        for col, session in sorted(matched.items()):
            results = openf1.session_result(session["session_key"])
            if not results:
                continue  # sesión sin resultados todavía
            payload[col] = {"session": session, "results": results, "drivers": openf1.drivers(session["session_key"])}
    except OpenF1Unavailable as e:
        return RaceOutcome(rid, name, rnd, "not_published", f"OpenF1 no disponible ahora ({e})")
    except JolpicaError as e:
        return RaceOutcome(rid, name, rnd, "error", str(e))

    if len(payload) == 1:
        return RaceOutcome(rid, name, rnd, "not_published", "sin prácticas publicadas en OpenF1")

    try:
        status, body = hub.put_practices(rid, payload, dry_run=dry_run, force=force)
    except requests.RequestException as e:
        return RaceOutcome(rid, name, rnd, "error", f"backend: {e}")

    data = body.get("data", {}) if isinstance(body, dict) else {}
    warn = data.get("warnings") or []
    note = f" · ⚠️ {' | '.join(warn)}" if warn else ""
    sessions = ",".join(c for c in PRACTICE_NAMES if c in payload)
    if status == 200:
        tables = data.get("tables", {})
        detail = f"{sessions}: " + _table_counts(tables) + note
        if dry_run:
            extra = " · REQUIERE --force" if data.get("requires_force") else ""
            return RaceOutcome(rid, name, rnd, "dry_run", detail + extra, _change_lines(tables))
        st = "applied" if _has_changes(tables) else "unchanged"
        return RaceOutcome(rid, name, rnd, st, detail, _change_lines(tables))
    if status == 422:
        return RaceOutcome(rid, name, rnd, "error", "422 " + " | ".join(body.get("issues", [body.get("error", "")])))
    if status == 409:
        tables = body.get("data", {}).get("tables", {})
        return RaceOutcome(rid, name, rnd, "error", f"409 {body.get('error', '')}", _change_lines(tables))
    return RaceOutcome(rid, name, rnd, "error", f"HTTP {status} {body.get('error', '')}")


ICONS = {"applied": "✅", "unchanged": "➖", "dry_run": "🔍", "not_published": "⏳", "error": "❌"}


def format_summary(report: Report) -> str:
    mode = "DRY RUN" if report.dry_run else ("FORCE" if report.force else "normal")
    lines = [
        f"## Sync de resultados {report.season} ({mode})",
        "",
        f"Cargadas: **{report.count('applied')}** · Sin cambios: {report.count('unchanged')} · "
        f"Dry-run: {report.count('dry_run')} · Sin publicar: {report.count('not_published')} · "
        f"Errores: **{report.error_count}**",
        "",
    ]
    if report.outcomes:
        lines += ["| | Carrera | Ronda | Detalle |", "|---|---|---|---|"]
        for o in report.outcomes:
            lines.append(f"| {ICONS.get(o.status, '')} | {o.race_id} {o.name} | {o.jolpica_round} | {o.detail} |")
        lines.append("")
    else:
        lines += ["Nada pendiente.", ""]
    detailed = [o for o in report.outcomes if o.changes and (o.status in ("dry_run", "error") or report.force)]
    for o in detailed:
        lines.append(f"<details><summary>{o.name}: {len(o.changes)} cambios</summary>\n")
        lines += [f"- {c}" for c in o.changes]
        lines.append("\n</details>\n")
    if report.schedule is not None:
        sch = report.schedule
        verb = "a actualizar" if report.dry_run else "actualizadas"
        lines.append(f"### Horarios\n\nCarreras {verb}: **{sch.get('updated', 0)}** · sin cambios: {sch.get('unchanged', 0)}")
        lines.append("")
        for c in sch.get("changes", []):
            det = ", ".join(f"{k.replace('_time', '')} {_fmt_utc(v[0])}→{_fmt_utc(v[1])}" for k, v in c["changes"].items())
            lines.append(f"- R{c['jolpica_round']} {c['name']}: {det}")
        for w in sch.get("warnings", []):
            lines.append(f"- ⚠️ {w}")
        lines.append("")
    if report.schedule_error:
        lines.append(f"❌ {report.schedule_error}")
        lines.append("")
    if report.unlinked:
        lines.append("**Rondas de Jolpica sin carrera en la base** (no se sincronizan): " + ", ".join(report.unlinked))
        lines.append("")
    for w in report.warnings:
        lines.append(f"⚠️ {w}")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Sync de resultados F1 desde Jolpica")
    parser.add_argument("--season", type=int, default=datetime.now(timezone.utc).year)
    parser.add_argument("--jolpica-round", type=int, default=None,
                        help="Sincronizar solo esta ronda de Jolpica, aunque ya esté cargada")
    parser.add_argument("--dry-run", action="store_true", help="Calcular el diff sin escribir")
    parser.add_argument("--force", action="store_true", help="Sobrescribir datos existentes fuera de la ventana de 7 días")
    parser.add_argument("--skip-practices", action="store_true", help="No sincronizar prácticas libres (OpenF1)")
    args = parser.parse_args(argv)

    if args.force and args.jolpica_round is None:
        parser.error("--force solo se permite junto con --jolpica-round (corrección puntual).")

    api_url = os.environ.get("F1_API_URL", "").rstrip("/")
    cron_secret = os.environ.get("CRON_SECRET", "")
    if not api_url or not cron_secret:
        log.error("Faltan F1_API_URL y/o CRON_SECRET.")
        return 1

    try:
        wake_up_server(api_url)
        token = fetch_agent_token(api_url, cron_secret)
        report = run(args.season, HubClient(api_url, token), JolpicaClient(),
                     jolpica_round=args.jolpica_round, dry_run=args.dry_run, force=args.force,
                     openf1=None if args.skip_practices else OpenF1Client())
    except (EnvironmentError, JolpicaError, requests.RequestException) as e:
        log.error(f"❌ {e}")
        return 1

    summary = format_summary(report)
    print("\n" + summary)
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as f:
            f.write(summary + "\n")
    write_gha_outputs(report, os.environ.get("GITHUB_OUTPUT"))

    return 1 if report.error_count else 0


def write_gha_outputs(report: Report, path: Optional[str]) -> None:
    """Outputs para pasos siguientes del workflow (p. ej. avisar solo si se cargó algo)."""
    if not path:
        return
    loaded = [o for o in report.outcomes if o.status == "applied"]
    names = ", ".join(f"R{o.jolpica_round} {o.name.title()}" for o in loaded)
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"loaded={len(loaded)}\n")
        f.write(f"errors={report.error_count}\n")
        f.write(f"loaded_names={names}\n")


if __name__ == "__main__":
    sys.exit(main())
