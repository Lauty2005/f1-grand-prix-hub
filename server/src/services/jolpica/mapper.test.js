// Tests del mapper Jolpica → base. Correr: cd server && node --test
// Los casos reproducen valores reales de Jolpica verificados el 2026-09-25.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    ValidationError, MIN_ROWS, extractRows, buildDriverMap, buildConstructorMap, classifyResult,
    toSecondsGap, sprintTimeGap, mapRaceResults, mapSprintResults, mapQualifying,
    mapSchedule, toUtcIso,
} from './mapper.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Fila con forma Ergast. `time` y `fl` opcionales. */
function row(position, positionText, driverId, { points = '0', laps = '58', status = 'Finished', time, fl } = {}) {
    const r = { number: '0', position: String(position), positionText, points, Driver: { driverId }, laps, status };
    if (time) r.Time = { time };
    if (fl) r.FastestLap = { rank: String(fl) };
    return r;
}

/** Completa hasta MIN_ROWS con pilotos "fillerN" clasificados detrás. */
function padded(rows, extra = {}) {
    const out = [...rows];
    for (let p = out.length + 1; p <= MIN_ROWS; p++) out.push(row(p, String(p), `filler${p}`, extra));
    return out;
}

function mapFor(rows) {
    const ids = rows.map((r) => r.Driver.driverId);
    return buildDriverMap(ids.map((jid, i) => ({ id: i + 100, jolpica_id: jid })));
}

// ── classifyResult ──────────────────────────────────────────────────────────

describe('classifyResult', () => {
    const cases = [
        ['1', { dnf: false, dsq: false, dns: false, dnq: false }],
        ['R', { dnf: true, dsq: false, dns: false, dnq: false }],
        ['N', { dnf: true, dsq: false, dns: false, dnq: false }],
        ['D', { dnf: false, dsq: true, dns: false, dnq: false }],
        ['E', { dnf: false, dsq: true, dns: false, dnq: false }],
        ['W', { dnf: false, dsq: false, dns: true, dnq: false }],
        ['F', { dnf: false, dsq: false, dns: false, dnq: true }],
    ];
    for (const [pt, expected] of cases) {
        test(`positionText ${pt}`, () => assert.deepEqual(classifyResult({ positionText: pt }), expected));
    }

    test('clasificado con status Retired NO es dnf (Sainz, Monaco 2026)', () => {
        const r = row(16, '16', 'sainz', { laps: '70', status: 'Retired' });
        assert.equal(classifyResult(r).dnf, false);
    });

    test("'R' con status Lapped SÍ es dnf (Stroll, Australia 2026)", () => {
        const r = row(17, 'R', 'stroll', { laps: '43', status: 'Lapped' });
        assert.equal(classifyResult(r).dnf, true);
    });
});

// ── toSecondsGap / sprintTimeGap ────────────────────────────────────────────

describe('time_gap de sprint', () => {
    test('toSecondsGap', () => {
        assert.equal(toSecondsGap('+1.272'), '+1.272s');
        assert.equal(toSecondsGap('+1:01.344'), '+61.344s');
        assert.equal(toSecondsGap('+1:12.158'), '+72.158s');
        assert.equal(toSecondsGap('28:50.951'), null); // sin "+": no es un gap
        assert.equal(toSecondsGap(undefined), null);
    });

    const none = { dnf: false, dns: false, dsq: false };
    test('ganador → tiempo total tal cual', () => {
        assert.equal(sprintTimeGap(row(1, '1', 'russell', { laps: '23', time: '28:50.951' }), 23, none), '28:50.951');
    });
    test('doblado → "+N lap" aunque Jolpica traiga Time', () => {
        assert.equal(sprintTimeGap(row(16, '16', 'stroll', { laps: '22', status: 'Lapped', time: '+13.127' }), 23, none), '+1 lap');
        assert.equal(sprintTimeGap(row(21, '21', 'hadjar', { laps: '20', status: 'Lapped', time: '+18.135' }), 23, none), '+3 lap');
    });
    test('DNF / DNS / DSQ', () => {
        const r = row(22, 'R', 'alonso', { laps: '15', status: 'Retired' });
        assert.equal(sprintTimeGap(r, 23, { ...none, dnf: true }), 'DNF');
        assert.equal(sprintTimeGap(r, 23, { ...none, dns: true }), 'DNS');
        assert.equal(sprintTimeGap(r, 23, { ...none, dsq: true }), 'DSQ');
    });
});

// ── mapRaceResults (Monaco 2026, valores reales) ────────────────────────────

describe('mapRaceResults', () => {
    const monaco = [
        row(1, '1', 'antonelli', { points: '25', laps: '78', time: '2:23:31.243', fl: 1 }),
        row(2, '2', 'hamilton', { points: '18', laps: '78', time: '+6.271', fl: 2 }),
        row(3, '3', 'hadjar', { points: '15', laps: '78', time: '+23.394', fl: 4 }),
        row(4, '4', 'piastri', { points: '12', laps: '78', fl: 7 }),
        row(5, '5', 'lawson', { points: '10', laps: '78', fl: 5 }),
        row(6, '6', 'arvid_lindblad', { points: '8', laps: '78', fl: 8 }),
        row(7, '7', 'gasly', { points: '6', laps: '78', fl: 3 }),
        row(8, '8', 'albon', { points: '4', laps: '78' }),
        row(9, '9', 'ocon', { points: '2', laps: '78' }),
        row(10, '10', 'alonso', { points: '1', laps: '78' }),
        row(16, '16', 'sainz', { laps: '70', status: 'Retired' }),
        row(22, 'R', 'max_verstappen', { laps: '0', status: 'Retired' }),
    ];
    // Posiciones 11-15 y 17-21 para que sean contiguas
    const fill = [11, 12, 13, 14, 15, 17, 18, 19, 20, 21].map((p) => row(p, p >= 17 ? 'R' : String(p), `x${p}`, { status: p >= 17 ? 'Retired' : 'Finished' }));
    const rows = [...monaco, ...fill];
    const out = mapRaceResults(rows, mapFor(rows));

    test('22 filas ordenadas por posición', () => {
        assert.equal(out.length, 22);
        assert.deepEqual(out.map((r) => r.position), Array.from({ length: 22 }, (_, i) => i + 1));
    });
    test('puntos numéricos', () => {
        assert.equal(out[0].points, 25);
        assert.equal(typeof out[0].points, 'number');
        assert.equal(out[6].points, 6); // Gasly 7º (la base tiene 3º/15 — error de carga)
    });
    test('fastest_lap solo para rank 1', () => {
        assert.deepEqual(out.filter((r) => r.fastest_lap).map((r) => r.position), [1]);
    });
    test('Sainz P16 clasificado, Verstappen P22 dnf', () => {
        assert.equal(out[15].dnf, false);
        assert.equal(out[21].dnf, true);
    });
});

// ── mapSprintResults (Canadá 2026) ──────────────────────────────────────────

describe('mapSprintResults', () => {
    const canada = [
        row(1, '1', 'russell', { points: '8', laps: '23', time: '28:50.951' }),
        row(2, '2', 'norris', { points: '7', laps: '23', time: '+1.272' }),
        row(11, '11', 'lawson', { laps: '23', time: '+1:01.344' }),
        row(16, '16', 'stroll', { laps: '22', status: 'Lapped', time: '+13.127' }),
        row(21, '21', 'hadjar', { laps: '20', status: 'Lapped', time: '+18.135' }),
        row(22, 'R', 'alonso', { laps: '15', status: 'Retired' }),
    ];
    const fill = [3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 17, 18, 19, 20]
        .map((p) => row(p, String(p), `x${p}`, { laps: p >= 17 ? '22' : '23', time: '+30.000' }));
    const rows = [...canada, ...fill];
    const byPos = Object.fromEntries(mapSprintResults(rows, mapFor(rows)).map((r) => [r.position, r]));

    test('coincide con la carga manual', () => {
        assert.equal(byPos[1].time_gap, '28:50.951');
        assert.equal(byPos[2].time_gap, '+1.272s');
        assert.equal(byPos[11].time_gap, '+61.344s');
        assert.equal(byPos[16].time_gap, '+1 lap');
        assert.equal(byPos[21].time_gap, '+3 lap');
        assert.equal(byPos[22].time_gap, 'DNF');
        assert.equal(byPos[22].dnf, true);
        assert.equal(byPos[1].points, 8);
    });
});

// ── mapQualifying (Monaco 2026) ─────────────────────────────────────────────

describe('mapQualifying', () => {
    const q = (p, id, Q1, Q2, Q3) => {
        const r = { position: String(p), Driver: { driverId: id } };
        if (Q1 !== undefined) r.Q1 = Q1;
        if (Q2 !== undefined) r.Q2 = Q2;
        if (Q3 !== undefined) r.Q3 = Q3;
        return r;
    };
    const rows = [
        q(1, 'antonelli', '1:13.599', '1:12.704', '1:12.051'),
        q(15, 'arvid_lindblad', '1:14.685', '1:14.248'),
        q(16, 'bortoleto', '1:14.683', ''),       // Q2 presente pero vacío
        q(22, 'stroll', '1:16.061'),              // Q2/Q3 ausentes
        ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21].map((p) => q(p, `x${p}`, '1:14.000')),
    ];
    const byPos = Object.fromEntries(mapQualifying(rows, mapFor(rows)).map((r) => [r.position, r]));

    test('ausente o vacío → "" (nunca null/undefined)', () => {
        assert.deepEqual([byPos[1].q1, byPos[1].q2, byPos[1].q3], ['1:13.599', '1:12.704', '1:12.051']);
        assert.deepEqual([byPos[15].q2, byPos[15].q3], ['1:14.248', '']);
        assert.deepEqual([byPos[16].q2, byPos[16].q3], ['', '']);
        assert.deepEqual([byPos[22].q2, byPos[22].q3], ['', '']);
    });
});

// ── Validación ──────────────────────────────────────────────────────────────

describe('validación', () => {
    test('lista TODOS los pilotos sin mapear', () => {
        const rows = padded([row(1, '1', 'nuevo_a'), row(2, '2', 'nuevo_b')]);
        const map = buildDriverMap(rows.slice(2).map((r, i) => ({ id: i + 1, jolpica_id: r.Driver.driverId })));
        assert.throws(() => mapRaceResults(rows, map), (err) => {
            assert.ok(err instanceof ValidationError);
            assert.equal(err.status, 422);
            assert.match(err.message, /nuevo_a, nuevo_b/);
            return true;
        });
    });
    test('posiciones con hueco o duplicadas', () => {
        const rows = padded([row(1, '1', 'a'), row(3, '3', 'b')]);
        assert.throws(() => mapRaceResults(rows, mapFor(rows)), /contiguas y únicas/);
    });
    test('piloto duplicado', () => {
        const rows = padded([row(1, '1', 'a'), row(2, '2', 'a')]);
        assert.throws(() => mapRaceResults(rows, mapFor(rows)), /duplicados: a/);
    });
    test('puntos inválidos o negativos', () => {
        const rows = padded([row(1, '1', 'a', { points: 'abc' }), row(2, '2', 'b', { points: '-1' })]);
        assert.throws(() => mapRaceResults(rows, mapFor(rows)), /Puntos inválidos: a=abc, b=-1/);
    });
    test('menos de MIN_ROWS filas → dato parcial', () => {
        const rows = [row(1, '1', 'a'), row(2, '2', 'b')];
        assert.throws(() => mapRaceResults(rows, mapFor(rows)), /posible dato parcial/);
    });
    test('medio punto es válido', () => {
        const rows = padded([row(1, '1', 'a', { points: '12.5' })]);
        assert.equal(mapRaceResults(rows, mapFor(rows))[0].points, 12.5);
    });
});

// ── extractRows ─────────────────────────────────────────────────────────────

describe('extractRows', () => {
    const wrap = (race) => ({ MRData: { RaceTable: { Races: race ? [race] : [] } } });
    test('sesión todavía no publicada → null', () => {
        assert.equal(extractRows(wrap(null), 'results'), null);
        assert.equal(extractRows(wrap({ Results: [] }), 'results'), null);
    });
    test('elige la lista según kind', () => {
        const race = { Results: [1], SprintResults: [2], QualifyingResults: [3] };
        assert.deepEqual(extractRows(wrap(race), 'results'), [1]);
        assert.deepEqual(extractRows(wrap(race), 'sprint'), [2]);
        assert.deepEqual(extractRows(wrap(race), 'qualifying'), [3]);
    });
    test('respuesta malformada → ValidationError', () => {
        assert.throws(() => extractRows({}, 'results'), ValidationError);
    });
});

// ── Equipo por resultado ────────────────────────────────────────────────────

describe('constructor_id', () => {
    const withTeam = (r, team) => ({ ...r, Constructor: { constructorId: team } });
    const rows = padded([
        withTeam(row(1, '1', 'max_verstappen', { points: '25' }), 'red_bull'),
        withTeam(row(2, '2', 'lawson', { points: '18' }), 'red_bull'),     // Lawson en Red Bull (2026 desde R12)
        withTeam(row(3, '3', 'tsunoda', { points: '15' }), 'rb'),          // Tsunoda en Racing Bulls
    ]).map((r) => r.Constructor ? r : withTeam(r, 'rb'));
    const cmap = buildConstructorMap([{ id: 1, jolpica_id: 'red_bull' }, { id: 6, jolpica_id: 'rb' }, { id: 99, jolpica_id: null }]);

    test('sin constructorMap no agrega constructor_id (compatibilidad)', () => {
        assert.equal('constructor_id' in mapRaceResults(rows, mapFor(rows))[0], false);
    });
    test('con constructorMap usa el equipo de Jolpica de esa carrera', () => {
        const out = mapRaceResults(rows, mapFor(rows), cmap);
        assert.deepEqual(out.slice(0, 3).map((r) => r.constructor_id), [1, 1, 6]);
    });
    test('sprint también', () => {
        const sprint = rows.map((r) => ({ ...r, laps: '19', Time: { time: r.position === '1' ? '30:00.000' : '+1.000' } }));
        assert.deepEqual(mapSprintResults(sprint, mapFor(sprint), cmap).slice(0, 3).map((r) => r.constructor_id), [1, 1, 6]);
    });
    test('equipo sin jolpica_id → ValidationError que lista todos', () => {
        const bad = rows.map((r, i) => (i === 0 ? withTeam(r, 'nuevo_a') : i === 1 ? withTeam(r, 'nuevo_b') : r));
        assert.throws(() => mapRaceResults(bad, mapFor(bad), cmap), /Equipos sin jolpica_id en la base: nuevo_a, nuevo_b/);
    });
});

// ── Horarios ────────────────────────────────────────────────────────────────

describe('mapSchedule', () => {
    // Valores reales de Jolpica (2026 R15 Bakú, R17 Singapur; 2023 R4 con SprintShootout)
    const baku = {
        round: '15', raceName: 'Azerbaijan Grand Prix', date: '2026-09-26', time: '11:00:00Z',
        FirstPractice: { date: '2026-09-24', time: '08:30:00Z' }, SecondPractice: { date: '2026-09-24', time: '12:00:00Z' },
        ThirdPractice: { date: '2026-09-25', time: '08:30:00Z' }, Qualifying: { date: '2026-09-25', time: '12:00:00Z' },
    };
    const singapore = {
        round: '17', raceName: 'Singapore Grand Prix', date: '2026-10-11', time: '12:00:00Z',
        FirstPractice: { date: '2026-10-09', time: '08:30:00Z' }, Qualifying: { date: '2026-10-10', time: '13:00:00Z' },
        Sprint: { date: '2026-10-10', time: '09:00:00Z' }, SprintQualifying: { date: '2026-10-09', time: '12:30:00Z' },
    };
    const baku2023 = {
        round: '4', date: '2023-04-30', time: '11:00:00Z',
        SprintShootout: { date: '2023-04-29', time: '09:30:00Z' }, Sprint: { date: '2023-04-29', time: '13:30:00Z' },
    };

    test('fin de semana normal: FP1-3, clasificación y carrera en UTC', () => {
        const [s] = mapSchedule([baku]);
        assert.deepEqual(s.times, {
            fp1_time: '2026-09-24T08:30:00.000Z', fp2_time: '2026-09-24T12:00:00.000Z', fp3_time: '2026-09-25T08:30:00.000Z',
            qualy_time: '2026-09-25T12:00:00.000Z', race_time: '2026-09-26T11:00:00.000Z',
        });
        assert.equal(s.has_sprint, false);
        assert.equal(s.round, 15);
    });
    test('sprint: SprintQualifying y Sprint; sin FP2/FP3 (no se inventan)', () => {
        const [s] = mapSchedule([singapore]);
        assert.equal(s.has_sprint, true);
        assert.equal(s.times.sprint_quali_time, '2026-10-09T12:30:00.000Z');
        assert.equal(s.times.sprint_time, '2026-10-10T09:00:00.000Z');
        assert.equal('fp2_time' in s.times, false);
        assert.equal('fp3_time' in s.times, false);
    });
    test('2023: SprintShootout → sprint_quali_time', () => {
        assert.equal(mapSchedule([baku2023])[0].times.sprint_quali_time, '2023-04-29T09:30:00.000Z');
    });
    test('sin hora (datos históricos) → la sesión no aparece', () => {
        assert.deepEqual(mapSchedule([{ round: '1', date: '1990-03-11' }])[0].times, {});
    });
    test('toUtcIso acepta hora sin Z', () => {
        assert.equal(toUtcIso('2026-09-26', '11:00:00'), '2026-09-26T11:00:00.000Z');
        assert.equal(toUtcIso('2026-09-26', null), null);
    });
    test('calendario vacío o rondas duplicadas → ValidationError', () => {
        assert.throws(() => mapSchedule([]), ValidationError);
        assert.throws(() => mapSchedule([baku, baku]), /duplicadas/);
    });
});
