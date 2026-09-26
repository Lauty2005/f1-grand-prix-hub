"""Tests de sync_results.py — sin red, sin dependencias extra.

    cd f1_agent && python -m unittest -v test_sync_results
"""
import json
import unittest

import requests

import sync_results as sr


class FakeResponse:
    def __init__(self, status=200, body=None, headers=None):
        self.status_code = status
        self._body = body if body is not None else {}
        self.headers = headers or {}
        self.text = json.dumps(self._body)

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


class ScriptedSession:
    """Devuelve respuestas en orden; registra las llamadas."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, **kw):
        self.calls.append(("GET", url, kw))
        nxt = self.responses.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt


def jolpica_resp(season, rnd, key=None, rows=None):
    races = [] if key is None else [{"season": str(season), "round": str(rnd), key: rows or [{}]}]
    return {"MRData": {"RaceTable": {"Races": races}}}


# ── JolpicaClient ───────────────────────────────────────────────────────────

class JolpicaClientTest(unittest.TestCase):
    def make(self, responses, **kw):
        self.sleeps = []
        session = ScriptedSession(responses)
        clock = iter(range(0, 10_000, 10))  # cada llamada al reloj avanza 10s → sin throttle
        client = sr.JolpicaClient(base_url="https://j.test/f1", session=session,
                                  sleep=self.sleeps.append, clock=lambda: next(clock), **kw)
        return client, session

    def test_ok_manda_user_agent_y_limit(self):
        client, session = self.make([FakeResponse(200, jolpica_resp(2026, 6, "Results"))])
        data = client.session(2026, 6, "results")
        self.assertTrue(sr.is_published(data))
        _, url, kw = session.calls[0]
        self.assertEqual(url, "https://j.test/f1/2026/6/results.json?limit=100")
        self.assertIn("F1GrandPrixHub/", kw["headers"]["User-Agent"])

    def test_reintenta_429_y_5xx_con_backoff(self):
        client, session = self.make([FakeResponse(429), FakeResponse(503), FakeResponse(200, {"ok": 1})])
        self.assertEqual(client.get("x"), {"ok": 1})
        self.assertEqual(len(session.calls), 3)
        self.assertEqual(self.sleeps, [2, 4])

    def test_respeta_retry_after(self):
        client, _ = self.make([FakeResponse(429, headers={"Retry-After": "7"}), FakeResponse(200, {})])
        client.get("x")
        self.assertEqual(self.sleeps, [7])

    def test_reintenta_errores_de_red(self):
        client, _ = self.make([requests.exceptions.ConnectionError("boom"), FakeResponse(200, {})])
        self.assertEqual(client.get("x"), {})

    def test_se_rinde_tras_n_intentos(self):
        client, _ = self.make([FakeResponse(500)] * 4)
        with self.assertRaises(sr.JolpicaError) as ctx:
            client.get("x")
        self.assertIn("4 intentos", str(ctx.exception))

    def test_404_no_reintenta(self):
        client, session = self.make([FakeResponse(404)])
        with self.assertRaises(sr.JolpicaError):
            client.get("x")
        self.assertEqual(len(session.calls), 1)

    def test_throttle_entre_requests(self):
        sleeps = []
        t = [0.0]
        session = ScriptedSession([FakeResponse(200, {}), FakeResponse(200, {})])
        client = sr.JolpicaClient(session=session, min_interval=0.5, sleep=sleeps.append, clock=lambda: t[0])
        client.get("a")
        t[0] += 0.1
        client.get("b")
        self.assertEqual(len(sleeps), 1)
        self.assertAlmostEqual(sleeps[0], 0.4)


# ── run() con fakes de backend y Jolpica ────────────────────────────────────

class FakeHub:
    def __init__(self, pending, put_responses, schedule_response=None):
        self._pending = pending
        self.put_responses = dict(put_responses)
        self.puts = []
        self.pending_calls = []
        self.schedule_calls = []
        self.schedule_response = schedule_response or (200, {"data": {"updated": 0, "unchanged": 0, "changes": [], "warnings": []}})

    def put_schedule(self, season, calendar, dry_run):
        self.schedule_calls.append((season, calendar, dry_run))
        return self.schedule_response

    def pending(self, season, jolpica_round=None):
        self.pending_calls.append((season, jolpica_round))
        return self._pending

    def put_race(self, race_id, payload, dry_run, force):
        self.puts.append((race_id, payload, dry_run, force))
        return self.put_responses[race_id]


class FakeJolpica:
    def __init__(self, published, calendar=None, fail=None):
        self.published = published            # {(round, kind): True}
        self._calendar = calendar or []
        self.fail = fail or set()
        self.calls = []

    def session(self, season, rnd, kind):
        self.calls.append((rnd, kind))
        if (rnd, kind) in self.fail:
            raise sr.JolpicaError(f"R{rnd} {kind}: HTTP 500")
        key = {"results": "Results", "sprint": "SprintResults", "qualifying": "QualifyingResults"}[kind]
        return jolpica_resp(season, rnd, key) if self.published.get((rnd, kind)) else jolpica_resp(season, rnd)

    def calendar(self, season):
        return {"MRData": {"RaceTable": {"season": str(season), "Races": self._calendar}}}


def race(rid, rnd, needs, name=None):
    return {"race_id": rid, "name": name or f"GP{rnd}", "jolpica_round": rnd, "needs": needs}


def ok(tables, requires_force=False):
    return (200, {"success": True, "data": {"tables": tables, "requires_force": requires_force}})


ADDED22 = {"added": [{"driver": f"P{i}", "position": i} for i in range(1, 23)], "changed": [], "removed": [], "unchanged": 0}
SAME22 = {"added": [], "changed": [], "removed": [], "unchanged": 22}


class RunTest(unittest.TestCase):
    def test_flujo_completo(self):
        hub = FakeHub(
            pending={"data": [
                race(46, 8, ["results", "qualifying"]),
                race(47, 9, ["results", "sprint", "qualifying"]),
                race(53, 15, ["results", "qualifying"]),     # no publicada
                race(48, 10, ["results", "qualifying"]),     # 422
                race(49, 11, ["results", "qualifying"]),     # sin cambios
            ], "mapped_rounds": [8, 9, 10, 11, 15]},
            put_responses={
                46: ok({"results": ADDED22, "qualifying": ADDED22}),
                47: ok({"results": ADDED22, "qualifying": ADDED22}),
                48: (422, {"issues": ["results: Pilotos sin jolpica_id en la base: novato_x"]}),
                49: ok({"results": SAME22, "qualifying": SAME22}),
            },
        )
        jolpica = FakeJolpica(
            published={(8, "results"): True, (8, "qualifying"): True,
                       (9, "results"): True, (9, "qualifying"): True,   # sprint de R9 todavía no
                       (10, "results"): True, (10, "qualifying"): True,
                       (11, "results"): True, (11, "qualifying"): True},
            calendar=[{"round": "8"}, {"round": "16", "raceName": "Bahrain Grand Prix in Malaysia", "date": "2026-10-04"}],
        )
        report = sr.run(2026, hub, jolpica)

        by = {o.race_id: o for o in report.outcomes}
        self.assertEqual(by[46].status, "applied")
        self.assertEqual(by[47].status, "applied")
        self.assertIn("sin publicar: sprint", by[47].detail)
        self.assertEqual(by[53].status, "not_published")
        self.assertEqual(by[48].status, "error")
        self.assertIn("novato_x", by[48].detail)
        self.assertEqual(by[49].status, "unchanged")

        # No se hace PUT si no hay nada publicado; el sprint no publicado no viaja.
        put_ids = [p[0] for p in hub.puts]
        self.assertNotIn(53, put_ids)
        payload47 = next(p[1] for p in hub.puts if p[0] == 47)
        self.assertEqual(set(payload47), {"source", "results", "qualifying"})
        self.assertEqual(payload47["source"], "jolpica")
        self.assertIn("MRData", payload47["results"], "se manda la respuesta completa, sin transformar")

        self.assertEqual(report.unlinked, ["R16 Bahrain Grand Prix in Malaysia (2026-10-04)"])
        self.assertEqual(len(report.errors), 1)

        summary = sr.format_summary(report)
        self.assertIn("Cargadas: **2**", summary)
        self.assertIn("Errores: **1**", summary)
        self.assertIn("Malaysia", summary)

    def test_dry_run_y_force_viajan_al_backend(self):
        changed = {"added": [], "removed": [], "unchanged": 16,
                   "changed": [{"driver": "Gastly", "changes": {"position": [3, 7], "points": [15, 6]}}]}
        hub = FakeHub({"data": [race(44, 6, ["results"], "MONACO")], "mapped_rounds": [6]},
                      {44: ok({"results": changed}, requires_force=True)})
        report = sr.run(2026, hub, FakeJolpica({(6, "results"): True}), jolpica_round=6, dry_run=True)
        self.assertEqual(hub.pending_calls, [(2026, 6)])
        self.assertEqual(hub.puts[0][2:], (True, False))
        o = report.outcomes[0]
        self.assertEqual(o.status, "dry_run")
        self.assertIn("REQUIERE --force", o.detail)
        self.assertEqual(o.changes, ["results: ~ Gastly: position 3→7, points 15→6"])
        self.assertIn("Gastly", sr.format_summary(report))

    def test_409_es_error(self):
        hub = FakeHub({"data": [race(44, 6, ["results"])], "mapped_rounds": [6]},
                      {44: (409, {"error": "usar force", "data": {"tables": {}}})})
        report = sr.run(2026, hub, FakeJolpica({(6, "results"): True}))
        self.assertEqual(report.outcomes[0].status, "error")
        self.assertIn("409", report.outcomes[0].detail)

    def test_falla_de_jolpica_no_corta_el_resto(self):
        hub = FakeHub({"data": [race(46, 8, ["results"]), race(47, 9, ["results"])], "mapped_rounds": [8, 9]},
                      {47: ok({"results": ADDED22})})
        report = sr.run(2026, hub, FakeJolpica({(9, "results"): True}, fail={(8, "results")}))
        self.assertEqual([o.status for o in report.outcomes], ["error", "applied"])

    def test_ronda_inexistente_avisa(self):
        report = sr.run(2026, FakeHub({"data": [], "mapped_rounds": []}, {}), FakeJolpica({}), jolpica_round=16)
        self.assertTrue(any("ronda 16" in w for w in report.warnings))
        self.assertIn("Nada pendiente", sr.format_summary(report))


class GhaOutputsTest(unittest.TestCase):
    def test_escribe_loaded_errors_y_nombres(self):
        import os
        import tempfile
        report = sr.Report(season=2026, dry_run=False, force=False, outcomes=[
            sr.RaceOutcome(53, "AZERBAIJAN GRAND PRIX", 15, "applied"),
            sr.RaceOutcome(54, "SINGAPORE GRAND PRIX", 17, "not_published"),
            sr.RaceOutcome(46, "AUSTRIAN GRAND PRIX", 8, "error", "422"),
        ])
        with tempfile.NamedTemporaryFile("w+", delete=False, suffix=".txt") as f:
            path = f.name
        try:
            sr.write_gha_outputs(report, path)
            with open(path, encoding="utf-8") as f:
                out = f.read()
        finally:
            os.unlink(path)
        self.assertIn("loaded=1\n", out)
        self.assertIn("errors=1\n", out)
        self.assertIn("loaded_names=R15 Azerbaijan Grand Prix\n", out)

    def test_sin_path_no_hace_nada(self):
        sr.write_gha_outputs(sr.Report(2026, False, False), None)


class MainTest(unittest.TestCase):
    def test_force_sin_ronda_se_rechaza(self):
        with self.assertRaises(SystemExit):
            sr.main(["--force"])

    def test_sin_env_devuelve_1(self):
        import os
        old = {k: os.environ.pop(k, None) for k in ("F1_API_URL", "CRON_SECRET")}
        try:
            self.assertEqual(sr.main(["--dry-run"]), 1)
        finally:
            for k, v in old.items():
                if v is not None:
                    os.environ[k] = v


# ── Horarios ────────────────────────────────────────────────────────────────

class ScheduleTest(unittest.TestCase):
    CHANGES = {"updated": 1, "unchanged": 7, "warnings": ["R16 X: fecha distinta"], "changes": [
        {"race_id": 53, "name": "AZERBAIJAN GRAND PRIX", "jolpica_round": 15,
         "changes": {"race_time": [None, "2026-09-26T11:00:00.000Z"], "qualy_time": [None, "2026-09-25T12:00:00.000Z"]}}]}

    def test_corrida_completa_manda_el_calendario_completo(self):
        hub = FakeHub({"data": [], "mapped_rounds": [15]}, {}, (200, {"data": self.CHANGES}))
        jolpica = FakeJolpica({}, calendar=[{"round": "15", "raceName": "Azerbaijan Grand Prix", "date": "2026-09-26"}])
        report = sr.run(2026, hub, jolpica, dry_run=True)
        season, calendar, dry = hub.schedule_calls[0]
        self.assertEqual((season, dry), (2026, True))
        self.assertIn("MRData", calendar, "se manda la respuesta completa, sin transformar")
        summary = sr.format_summary(report)
        self.assertIn("### Horarios", summary)
        self.assertIn("Carreras a actualizar: **1**", summary)
        self.assertIn("R15 AZERBAIJAN GRAND PRIX: race —→26/09 11:00Z, qualy —→25/09 12:00Z", summary)
        self.assertIn("⚠️ R16 X: fecha distinta", summary)
        self.assertEqual(report.error_count, 0)

    def test_correccion_puntual_no_toca_horarios(self):
        hub = FakeHub({"data": [], "mapped_rounds": [6]}, {})
        sr.run(2026, hub, FakeJolpica({}), jolpica_round=6)
        self.assertEqual(hub.schedule_calls, [])

    def test_error_de_horarios_cuenta_como_error(self):
        hub = FakeHub({"data": [], "mapped_rounds": []}, {}, (422, {"issues": ["El calendario no es de la temporada 2026"]}))
        report = sr.run(2026, hub, FakeJolpica({}))
        self.assertEqual(report.error_count, 1)
        self.assertIn("horarios HTTP 422", sr.format_summary(report))

    def test_falla_del_calendario_de_jolpica_es_error(self):
        class Broken(FakeJolpica):
            def calendar(self, season):
                raise sr.JolpicaError("HTTP 500")
        hub = FakeHub({"data": [], "mapped_rounds": []}, {})
        report = sr.run(2026, hub, Broken({}))
        self.assertEqual(report.error_count, 1)
        self.assertEqual(hub.schedule_calls, [])


# ── Prácticas (OpenF1) ──────────────────────────────────────────────────────

def _session(key, name, start, cancelled=False):
    return {"session_key": key, "session_name": name, "date_start": start, "is_cancelled": cancelled}


class FakeOpenF1:
    def __init__(self, sessions, results=None, unavailable=False):
        self.sessions = sessions
        self.results = results or {}
        self.unavailable = unavailable
        self.calls = []

    def practice_sessions(self, season):
        if self.unavailable:
            raise sr.OpenF1Unavailable("OpenF1 sessions: HTTP 401")
        return self.sessions

    def session_result(self, key):
        self.calls.append(("result", key))
        return self.results.get(key, [])

    def drivers(self, key):
        self.calls.append(("drivers", key))
        return [{"driver_number": 16, "name_acronym": "LEC"}]


BAKU_SESSIONS = [
    _session(11300, "Practice 1", "2026-09-24T08:30:00+00:00"),
    _session(11301, "Practice 2", "2026-09-24T12:00:00+00:00"),
    _session(11302, "Practice 3", "2026-09-25T08:30:00+00:00"),
    _session(11290, "Practice 1", "2026-09-11T11:30:00+00:00"),   # Madrid: otro fin de semana
    _session(11303, "Qualifying", "2026-09-25T12:00:00+00:00"),    # no es práctica
]
BAKU = {"race_id": 53, "name": "AZERBAIJAN GRAND PRIX", "jolpica_round": 15, "date": "2026-09-26", "needs": ["practices"]}


class PracticesTest(unittest.TestCase):
    def test_elige_las_sesiones_del_fin_de_semana(self):
        found = sr.practice_sessions_for(BAKU, BAKU_SESSIONS)
        self.assertEqual({c: s["session_key"] for c, s in found.items()}, {"p1": 11300, "p2": 11301, "p3": 11302})

    def test_sesion_cancelada_se_ignora(self):
        sessions = [_session(1, "Practice 1", "2026-09-24T08:30:00+00:00", cancelled=True)]
        self.assertEqual(sr.practice_sessions_for(BAKU, sessions), {})

    def test_manda_solo_sesiones_con_resultados(self):
        openf1 = FakeOpenF1(BAKU_SESSIONS, {11300: [{"driver_number": 16, "duration": 102.1}]})
        hub = FakeHub({"data": [BAKU], "mapped_rounds": [15]}, {})
        sent = {}

        def put_practices(race_id, payload, dry_run, force):
            sent.update(payload)
            return 200, {"data": {"tables": {"practices": {"added": [{}], "changed": [], "removed": [], "unchanged": 0}}, "warnings": []}}
        hub.put_practices = put_practices

        report = sr.run(2026, hub, FakeJolpica({}), openf1=openf1)
        self.assertEqual(set(sent), {"source", "p1"}, "p2/p3 sin resultados no viajan")
        self.assertEqual(sent["source"], "openf1")
        self.assertEqual(sent["p1"]["session"]["session_key"], 11300)
        self.assertIn("drivers", sent["p1"])
        o = report.outcomes[0]
        self.assertEqual((o.status, o.name), ("applied", "AZERBAIJAN GRAND PRIX · prácticas"))

    def test_nada_publicado(self):
        report = sr.run(2026, FakeHub({"data": [BAKU], "mapped_rounds": [15]}, {}), FakeJolpica({}), openf1=FakeOpenF1(BAKU_SESSIONS))
        self.assertEqual(report.outcomes[0].status, "not_published")

    def test_openf1_401_no_es_error(self):
        report = sr.run(2026, FakeHub({"data": [BAKU], "mapped_rounds": [15]}, {}), FakeJolpica({}),
                        openf1=FakeOpenF1([], unavailable=True))
        self.assertEqual(report.outcomes[0].status, "not_published")
        self.assertEqual(report.error_count, 0)

    def test_sin_openf1_no_hace_practicas(self):
        report = sr.run(2026, FakeHub({"data": [BAKU], "mapped_rounds": [15]}, {}), FakeJolpica({}), openf1=None)
        self.assertEqual(report.outcomes, [])

    def test_carrera_con_resultados_y_practicas_da_dos_filas(self):
        race = dict(BAKU, needs=["results", "practices"])
        hub = FakeHub({"data": [race], "mapped_rounds": [15]}, {53: ok({"results": ADDED22})})
        hub.put_practices = lambda *a, **k: (200, {"data": {"tables": {"practices": {"added": [], "changed": [], "removed": [], "unchanged": 22}}}})
        openf1 = FakeOpenF1(BAKU_SESSIONS, {11300: [{"driver_number": 16, "duration": 102.1}]})
        report = sr.run(2026, hub, FakeJolpica({(15, "results"): True}), openf1=openf1)
        self.assertEqual([o.status for o in report.outcomes], ["applied", "unchanged"])


class OpenF1ClientTest(unittest.TestCase):
    def make(self, responses):
        sleeps = []
        clock = iter(range(0, 10_000, 10))
        c = sr.OpenF1Client(base_url="https://o.test/v1", session=ScriptedSession(responses), sleep=sleeps.append, clock=lambda: next(clock))
        return c, sleeps

    def test_401_es_unavailable(self):
        c, _ = self.make([FakeResponse(401)])
        with self.assertRaises(sr.OpenF1Unavailable):
            c.session_result(1)

    def test_404_es_lista_vacia(self):
        c, _ = self.make([FakeResponse(404)])
        self.assertEqual(c.drivers(1), [])

    def test_429_reintenta(self):
        c, sleeps = self.make([FakeResponse(429), FakeResponse(200, [{"driver_number": 1}])])
        self.assertEqual(c.session_result(1), [{"driver_number": 1}])
        self.assertEqual(sleeps, [4])

    def test_sessions_se_cachean(self):
        c, _ = self.make([FakeResponse(200, [{"session_key": 1}])])
        c.practice_sessions(2026)
        self.assertEqual(c.practice_sessions(2026), [{"session_key": 1}])


if __name__ == "__main__":
    unittest.main()
