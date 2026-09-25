// Tests de integración del sync. Necesitan Postgres LOCAL:
//   TEST_DATABASE_URL → se crea un schema aislado y se borra al final.
// Sin TEST_DATABASE_URL se saltean (npm test sigue pasando). Nunca se usa
// DATABASE_URL, y cualquier host de Supabase se rechaza: estos tests no
// pueden correr contra producción.
//
//   make test                                     (dentro de Docker, usa la base local)
//   TEST_DATABASE_URL=postgres://f1:f1@localhost:5432/f1hub npm test
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createSyncService, SyncError, diffRows } from './syncService.js';
import { ValidationError } from './mapper.js';

const DB_URL = process.env.TEST_DATABASE_URL;
if (DB_URL && /supabase\.(co|com)/i.test(DB_URL)) {
    throw new Error('TEST_DATABASE_URL apunta a Supabase: los tests de integración solo corren contra Postgres local.');
}
const SCHEMA = `sync_test_${process.pid}_${Date.now()}`;
const skip = !DB_URL && 'sin TEST_DATABASE_URL';

// ── Fixtures ────────────────────────────────────────────────────────────────

const N = 22;
const JIDS = Array.from({ length: N }, (_, i) => `drv${i + 1}`);

/** Respuesta completa estilo Jolpica. */
function apiResponse(season, round, key, rows) {
    return { MRData: { RaceTable: { season: String(season), Races: rows === null ? [] : [{ season: String(season), round: String(round), [key]: rows }] } } };
}

function raceRows({ order = JIDS, points = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] } = {}) {
    return order.map((jid, i) => ({
        position: String(i + 1),
        positionText: i >= 20 ? 'R' : String(i + 1),
        points: String(points[i] ?? 0),
        Driver: { driverId: jid },
        laps: i >= 20 ? '10' : '58',
        status: i >= 20 ? 'Retired' : 'Finished',
        ...(i === 0 ? { FastestLap: { rank: '1' } } : {}),
    }));
}

function sprintRows() {
    return JIDS.map((jid, i) => ({
        position: String(i + 1), positionText: String(i + 1), points: String(Math.max(8 - i, 0)),
        Driver: { driverId: jid }, laps: '19', status: 'Finished',
        Time: { time: i === 0 ? '30:00.000' : `+${i}.000` },
    }));
}

function qualiRows() {
    return JIDS.map((jid, i) => ({ position: String(i + 1), Driver: { driverId: jid }, Q1: '1:30.000', ...(i < 15 ? { Q2: '1:29.000' } : {}), ...(i < 10 ? { Q3: '1:28.000' } : {}) }));
}

// ── Setup ───────────────────────────────────────────────────────────────────

let pool;
let sync;
const ids = {};

async function q(sql, params) {
    return (await pool.query(sql, params)).rows;
}

describe('syncService (integración)', { skip }, () => {
    before(async () => {
        const admin = new pg.Pool({ connectionString: DB_URL, max: 1 });
        await admin.query(`CREATE SCHEMA "${SCHEMA}"`);
        await admin.end();

        pool = new pg.Pool({ connectionString: DB_URL, max: 3, options: `-c search_path="${SCHEMA}"` });
        sync = createSyncService(pool);

        await q(`
            CREATE TABLE drivers (id serial PRIMARY KEY, last_name varchar NOT NULL, jolpica_id varchar(64) UNIQUE);
            CREATE TABLE races (id serial PRIMARY KEY, round int NOT NULL, name varchar NOT NULL, date date NOT NULL,
                                status varchar, has_sprint boolean DEFAULT false, jolpica_round int);
            CREATE TABLE results (id serial PRIMARY KEY, race_id int REFERENCES races(id), driver_id int REFERENCES drivers(id),
                                  position int NOT NULL, points numeric DEFAULT 0, fastest_lap boolean DEFAULT false,
                                  dnf boolean DEFAULT false, dsq boolean DEFAULT false, dns boolean DEFAULT false, dnq boolean DEFAULT false,
                                  UNIQUE (race_id, driver_id));
            CREATE TABLE sprint_results (id serial PRIMARY KEY, race_id int REFERENCES races(id), driver_id int REFERENCES drivers(id),
                                  position int NOT NULL, points numeric DEFAULT 0, dnf boolean DEFAULT false, dns boolean DEFAULT false,
                                  dsq boolean DEFAULT false, time_gap varchar, UNIQUE (race_id, driver_id));
            CREATE TABLE qualifying (id serial PRIMARY KEY, race_id int REFERENCES races(id), driver_id int REFERENCES drivers(id),
                                  position int NOT NULL, q1 varchar, q2 varchar, q3 varchar, UNIQUE (race_id, driver_id));
        `);

        for (const [i, jid] of JIDS.entries()) {
            await q('INSERT INTO drivers (last_name, jolpica_id) VALUES ($1, $2)', [`Piloto${i + 1}`, jid]);
        }
        await q(`INSERT INTO drivers (last_name, jolpica_id) VALUES ('Reserva', NULL)`);

        const addRace = async (key, round, jr, daysAgo, extra = {}) => {
            const [{ id }] = await q(
                `INSERT INTO races (round, name, date, status, has_sprint, jolpica_round)
                 VALUES ($1, $2, CURRENT_DATE - $3::int, $4, $5, $6) RETURNING id`,
                [round, key.toUpperCase(), daysAgo, extra.status ?? null, extra.has_sprint ?? false, jr],
            );
            ids[key] = id;
        };
        // Todas en la temporada actual (EXTRACT(YEAR FROM CURRENT_DATE)); fechas relativas a hoy.
        await addRace('vieja_vacia', 1, 1, 40);
        await addRace('vieja_cargada', 2, 2, 30);
        await addRace('suspendida', 3, null, 25, { status: 'suspended' });
        await addRace('sprint_vieja', 4, 3, 20, { has_sprint: true });
        await addRace('reciente', 5, 4, 2);
        await addRace('futura', 6, 5, -5);
        ids.season = Number((await q('SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y'))[0].y);
        // Si hoy es enero, las fechas relativas caen en el año anterior: los tests de
        // pending lo contemplan leyendo la temporada real de cada carrera.
        ids.seasonOf = Object.fromEntries((await q('SELECT id, EXTRACT(YEAR FROM date)::int AS y FROM races')).map((r) => [r.id, r.y]));

        // Datos previos en vieja_cargada (como si se hubieran cargado a mano).
        const s = ids.seasonOf[ids.vieja_cargada];
        const res = await sync.applyRaceData(ids.vieja_cargada, {
            results: apiResponse(s, 2, 'Results', raceRows()),
            qualifying: apiResponse(s, 2, 'QualifyingResults', qualiRows()),
        }, { force: true });
        assert.equal(res.applied, true);
    });

    after(async () => {
        await pool?.end();
        const admin = new pg.Pool({ connectionString: DB_URL, max: 1 });
        await admin.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        await admin.end();
    });

    // ── getPendingRaces ─────────────────────────────────────────────────────

    test('pending: vacías, sprint faltante y ventana; excluye cargadas, suspendidas y futuras', async () => {
        const seasons = [...new Set(Object.values(ids.seasonOf))];
        const pending = (await Promise.all(seasons.map((s) => sync.getPendingRaces(s)))).flat();
        const byId = Object.fromEntries(pending.map((p) => [p.race_id, p]));

        assert.deepEqual(byId[ids.vieja_vacia]?.needs, ['results', 'qualifying']);
        assert.deepEqual(byId[ids.sprint_vieja]?.needs, ['results', 'sprint', 'qualifying']);
        assert.deepEqual(byId[ids.reciente]?.needs, ['results', 'qualifying']);
        assert.equal(byId[ids.reciente].in_window, true);
        assert.equal(byId[ids.vieja_cargada], undefined, 'cargada y fuera de ventana: no pendiente');
        assert.equal(byId[ids.suspendida], undefined);
        assert.equal(byId[ids.futura], undefined);
    });

    test('pending con jolpicaRound: devuelve la carrera aunque esté cargada, con todas las sesiones', async () => {
        const s = ids.seasonOf[ids.vieja_cargada];
        const out = await sync.getPendingRaces(s, { jolpicaRound: 2 });
        assert.equal(out.length, 1);
        assert.equal(out[0].race_id, ids.vieja_cargada);
        assert.deepEqual(out[0].needs, ['results', 'qualifying']);
        assert.deepEqual(await sync.getPendingRaces(s, { jolpicaRound: 5 }), [], 'futura: no');
        assert.deepEqual(await sync.getPendingRaces(s, { jolpicaRound: 77 }), [], 'inexistente: vacío');
    });

    test('getMappedRounds: solo rondas vinculadas de la temporada', async () => {
        const s = ids.seasonOf[ids.vieja_vacia];
        const rounds = await sync.getMappedRounds(s);
        assert.ok(rounds.includes(1) && rounds.includes(2));
        assert.ok(!rounds.includes(null));
    });

    // ── applyRaceData ───────────────────────────────────────────────────────

    test('carga inicial: 22 filas agregadas, puntos y flags correctos', async () => {
        const s = ids.seasonOf[ids.vieja_vacia];
        const out = await sync.applyRaceData(ids.vieja_vacia, { results: apiResponse(s, 1, 'Results', raceRows()) });
        assert.equal(out.applied, true);
        assert.equal(out.tables.results.added.length, N);

        const rows = await q('SELECT position, points, fastest_lap, dnf FROM results WHERE race_id = $1 ORDER BY position', [ids.vieja_vacia]);
        assert.equal(rows.length, N);
        assert.equal(Number(rows[0].points), 25);
        assert.equal(rows[0].fastest_lap, true);
        assert.equal(rows[21].dnf, true);
    });

    test('idempotencia: repetir la misma carga no cambia nada y no pide force', async () => {
        const s = ids.seasonOf[ids.vieja_vacia];
        const out = await sync.applyRaceData(ids.vieja_vacia, { results: apiResponse(s, 1, 'Results', raceRows()) });
        assert.equal(out.applied, true);
        assert.equal(out.requires_force, false);
        assert.deepEqual(
            [out.tables.results.added.length, out.tables.results.changed.length, out.tables.results.removed.length, out.tables.results.unchanged],
            [0, 0, 0, N],
        );
    });

    test('corrección fuera de ventana: dry-run muestra diff, sin force → 409, con force → aplica', async () => {
        const s = ids.seasonOf[ids.vieja_cargada];
        // Caso Monaco: el 3º pasa al 7º (y 4º-7º suben un puesto)
        const order = [...JIDS];
        const [third] = order.splice(2, 1);
        order.splice(6, 0, third);
        const payload = { results: apiResponse(s, 2, 'Results', raceRows({ order })) };

        const dry = await sync.applyRaceData(ids.vieja_cargada, payload, { dryRun: true });
        assert.equal(dry.applied, false);
        assert.equal(dry.requires_force, true);
        assert.equal(dry.tables.results.changed.length, 5);
        const moved = dry.tables.results.changed.find((c) => c.driver === 'Piloto3');
        assert.deepEqual(moved.changes.position, [3, 7]);
        assert.deepEqual(moved.changes.points, [15, 6]);
        const before = await q('SELECT position FROM results r JOIN drivers d ON d.id = r.driver_id WHERE race_id = $1 AND d.jolpica_id = $2', [ids.vieja_cargada, 'drv3']);
        assert.equal(before[0].position, 3, 'dry-run no escribe');

        await assert.rejects(sync.applyRaceData(ids.vieja_cargada, payload), (err) => {
            assert.ok(err instanceof SyncError);
            assert.equal(err.status, 409);
            assert.equal(err.summary.tables.results.changed.length, 5);
            return true;
        });

        const forced = await sync.applyRaceData(ids.vieja_cargada, payload, { force: true });
        assert.equal(forced.applied, true);
        const afterRows = await q('SELECT position, points FROM results r JOIN drivers d ON d.id = r.driver_id WHERE race_id = $1 AND d.jolpica_id = $2', [ids.vieja_cargada, 'drv3']);
        assert.deepEqual([afterRows[0].position, Number(afterRows[0].points)], [7, 6]);
    });

    test('filas que ya no están en Jolpica se borran', async () => {
        const s = ids.seasonOf[ids.reciente];
        await sync.applyRaceData(ids.reciente, { results: apiResponse(s, 4, 'Results', raceRows()) });
        await q('INSERT INTO results (race_id, driver_id, position) SELECT $1, id, 99 FROM drivers WHERE last_name = $2', [ids.reciente, 'Reserva']);

        const out = await sync.applyRaceData(ids.reciente, { results: apiResponse(s, 4, 'Results', raceRows()) });
        assert.equal(out.tables.results.removed.length, 1);
        assert.equal(out.tables.results.removed[0].driver, 'Reserva');
        const [{ n }] = await q('SELECT count(*)::int AS n FROM results WHERE race_id = $1', [ids.reciente]);
        assert.equal(n, N);
    });

    test('sprint + clasificación en una sola llamada', async () => {
        const s = ids.seasonOf[ids.sprint_vieja];
        const out = await sync.applyRaceData(ids.sprint_vieja, {
            sprint: apiResponse(s, 3, 'SprintResults', sprintRows()),
            qualifying: apiResponse(s, 3, 'QualifyingResults', qualiRows()),
        });
        assert.equal(out.applied, true);
        const sp = await q('SELECT position, time_gap FROM sprint_results WHERE race_id = $1 ORDER BY position LIMIT 2', [ids.sprint_vieja]);
        assert.deepEqual(sp.map((r) => r.time_gap), ['30:00.000', '+1.000s']);
        const ql = await q('SELECT q2, q3 FROM qualifying WHERE race_id = $1 AND position = 22', [ids.sprint_vieja]);
        assert.deepEqual([ql[0].q2, ql[0].q3], ['', '']);
    });

    test('sesión no publicada → skipped, sin error', async () => {
        const s = ids.seasonOf[ids.reciente];
        const out = await sync.applyRaceData(ids.reciente, { qualifying: apiResponse(s, 4, 'QualifyingResults', null) });
        assert.deepEqual(out.skipped, { qualifying: 'not_published' });
    });

    // ── Errores (nada se escribe) ───────────────────────────────────────────

    test('respuesta de otra ronda → 422 sin escribir', async () => {
        const s = ids.seasonOf[ids.vieja_vacia];
        await assert.rejects(
            sync.applyRaceData(ids.vieja_vacia, { results: apiResponse(s, 99, 'Results', raceRows()) }),
            (err) => err instanceof ValidationError && /99 pero la carrera es/.test(err.message),
        );
    });

    test('piloto sin mapear → 422 que lo nombra, y rollback de TODAS las sesiones', async () => {
        await q('UPDATE races SET date = CURRENT_DATE - 60 WHERE id = $1', [ids.futura]); // pasa a vieja y vacía
        const [{ y: s }] = await q('SELECT EXTRACT(YEAR FROM date)::int AS y FROM races WHERE id = $1', [ids.futura]);
        const bad = raceRows();
        bad[5].Driver.driverId = 'novato_x';
        await assert.rejects(
            sync.applyRaceData(ids.futura, {
                qualifying: apiResponse(s, 5, 'QualifyingResults', qualiRows()),
                results: apiResponse(s, 5, 'Results', bad),
            }),
            (err) => err instanceof ValidationError && /results: Pilotos sin jolpica_id en la base: novato_x/.test(err.message),
        );
        const [{ n }] = await q('SELECT count(*)::int AS n FROM qualifying WHERE race_id = $1', [ids.futura]);
        assert.equal(n, 0, 'la clasificación válida tampoco se escribió');
    });

    test('sprint en carrera sin has_sprint → 422', async () => {
        const s = ids.seasonOf[ids.vieja_vacia];
        await assert.rejects(
            sync.applyRaceData(ids.vieja_vacia, { sprint: apiResponse(s, 1, 'SprintResults', sprintRows()) }),
            /no tiene has_sprint/,
        );
    });

    test('carrera inexistente → 404; suspendida/sin jolpica_round → 409; body vacío → 422', async () => {
        await assert.rejects(sync.applyRaceData(999999, { results: {} }), (e) => e.status === 404);
        await assert.rejects(sync.applyRaceData(ids.suspendida, { results: {} }), (e) => e.status === 409);
        await assert.rejects(sync.applyRaceData(ids.vieja_vacia, {}), (e) => e instanceof ValidationError);
    });
});

// ── diffRows (unitario, sin base) ───────────────────────────────────────────

describe('diffRows', () => {
    test('normaliza numeric string, null booleano y null de clasificación', () => {
        const cols = ['position', 'points', 'dnf', 'q2'];
        const current = [{ driver_id: 1, position: 1, points: '25.0', dnf: null, q2: null }];
        const next = [{ driver_id: 1, position: 1, points: 25, dnf: false, q2: '' }];
        const d = diffRows(cols, current, next);
        assert.equal(d.unchanged, 1);
        assert.equal(d.changed.length, 0);
    });
});
