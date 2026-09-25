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
    def __init__(self, pending, put_responses):
        self._pending = pending
        self.put_responses = dict(put_responses)
        self.puts = []
        self.pending_calls = []

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
        return self._calendar


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


if __name__ == "__main__":
    unittest.main()
