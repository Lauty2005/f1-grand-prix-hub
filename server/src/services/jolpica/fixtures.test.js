/**
 * Tests de paridad contra respuestas REALES de Jolpica.
 *
 * Los archivos de __fixtures__/ son la respuesta cruda de la API, sin editar ni
 * reformatear (descargados el 2026-09-25 de https://api.jolpi.ca/ergast/f1).
 * mapper.test.js cubre las reglas con datos sintéticos; esto comprueba que esas
 * reglas siguen valiendo sobre lo que la API devuelve de verdad.
 *
 * Si alguno falla después de actualizar un fixture, el mapper NO se ajusta sin
 * antes mirar la fila cruda: puede ser un cambio real de la API.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    extractRows,
    buildDriverMap,
    mapRaceResults,
    mapSprintResults,
    mapQualifying,
} from './mapper.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');

const loadFixture = (name) =>
    JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));

/**
 * Corre un fixture entero por el mapper y devuelve las filas indexadas por
 * driverId de Jolpica. El driverMap se arma desde el propio fixture, así el
 * test no depende de los ids de la base.
 */
function mapFixture(name, kind, mapFn) {
    const rows = extractRows(loadFixture(name), kind);
    assert.ok(rows, `${name}: extractRows devolvió null`);

    const jolpicaIds = rows.map((r) => r.Driver.driverId);
    const driverMap = buildDriverMap(jolpicaIds.map((jid, i) => ({ id: i + 1, jolpica_id: jid })));
    const mapped = mapFn(rows, driverMap);

    const byDriver = new Map();
    for (const row of mapped) byDriver.set(jolpicaIds[row.driver_id - 1], row);

    return { rows, mapped, byDriver };
}

describe('2026 R6 Monaco — results', () => {
    const { mapped, byDriver } = mapFixture('2026-6-results', 'results', mapRaceResults);

    test('22 filas con posiciones 1..22', () => {
        assert.equal(mapped.length, 22);
        assert.deepEqual(mapped.map((r) => r.position), Array.from({ length: 22 }, (_, i) => i + 1));
    });

    test('antonelli gana con vuelta rápida', () => {
        const row = byDriver.get('antonelli');
        assert.equal(row.position, 1);
        assert.equal(row.points, 25);
        assert.equal(row.fastest_lap, true);
    });

    test('fastest_lap es exclusivo de una fila', () => {
        assert.equal(mapped.filter((r) => r.fastest_lap).length, 1);
    });

    test('gasly 7º con 6 puntos — el resultado oficial de Monaco', () => {
        const row = byDriver.get('gasly');
        assert.equal(row.position, 7);
        assert.equal(row.points, 6);
    });

    test('sainz P16 cuenta como clasificado aunque el status sea "Retired"', () => {
        // La clasificación sale de positionText (un número), no de status.
        const row = byDriver.get('sainz');
        assert.equal(row.position, 16);
        assert.equal(row.dnf, false);
    });

    test('max_verstappen es DNF real', () => {
        const row = byDriver.get('max_verstappen');
        assert.equal(row.position, 22);
        assert.equal(row.dnf, true);
    });
});

describe('2026 R6 Monaco — qualifying', () => {
    const { mapped, byDriver } = mapFixture('2026-6-qualifying', 'qualifying', mapQualifying);

    test('la pole trae las tres sesiones', () => {
        const row = byDriver.get('antonelli');
        assert.equal(row.q1, '1:13.599');
        assert.equal(row.q2, '1:12.704');
        assert.equal(row.q3, '1:12.051');
    });

    test('eliminado en Q1 queda con q2 y q3 en string vacío', () => {
        for (const id of ['bortoleto', 'stroll']) {
            const row = byDriver.get(id);
            assert.equal(row.q2, '', `${id}.q2`);
            assert.equal(row.q3, '', `${id}.q3`);
        }
    });

    test('ningún tiempo es null ni undefined', () => {
        for (const row of mapped) {
            for (const key of ['q1', 'q2', 'q3']) {
                assert.equal(typeof row[key], 'string', `${key} de driver_id ${row.driver_id}`);
            }
        }
    });
});

describe('2026 R5 Canadá — sprint', () => {
    const { byDriver } = mapFixture('2026-5-sprint', 'sprint', mapSprintResults);

    test('el ganador guarda su tiempo total, no un gap', () => {
        const row = byDriver.get('russell');
        assert.equal(row.time_gap, '28:50.951');
        assert.equal(row.points, 8);
    });

    test('gap corto en segundos', () => {
        assert.equal(byDriver.get('norris').time_gap, '+1.272s');
    });

    test('gap con minutos se normaliza a segundos', () => {
        // Jolpica devuelve "+1:01.344".
        assert.equal(byDriver.get('lawson').time_gap, '+61.344s');
    });

    test('doblados usan "+N lap", con prioridad sobre Time', () => {
        assert.equal(byDriver.get('stroll').time_gap, '+1 lap');
        assert.equal(byDriver.get('hadjar').time_gap, '+3 lap');
    });

    test('abandono queda como DNF', () => {
        const row = byDriver.get('alonso');
        assert.equal(row.time_gap, 'DNF');
        assert.equal(row.dnf, true);
    });
});

describe('2026 R1 Australia — results', () => {
    const { byDriver } = mapFixture('2026-1-results', 'results', mapRaceResults);

    test('positionText "W" es DNS, no DNF', () => {
        for (const id of ['piastri', 'hulkenberg']) {
            const row = byDriver.get(id);
            assert.equal(row.dns, true, `${id}.dns`);
            assert.equal(row.dnf, false, `${id}.dnf`);
        }
    });

    test('positionText "R" es DNF aunque el status sea "Lapped"', () => {
        assert.equal(byDriver.get('stroll').dnf, true);
    });
});

describe('2025 R2 China — results', () => {
    const { byDriver } = mapFixture('2025-2-results', 'results', mapRaceResults);

    test('positionText "D" es DSQ y no marca DNF', () => {
        for (const id of ['leclerc', 'hamilton', 'gasly']) {
            const row = byDriver.get(id);
            assert.equal(row.dsq, true, `${id}.dsq`);
            assert.equal(row.dnf, false, `${id}.dnf`);
        }
    });
});

describe('2025 R1 Australia — results', () => {
    const { byDriver } = mapFixture('2025-1-results', 'results', mapRaceResults);

    test('hadjar: diferencia conocida y aceptada con la base', () => {
        // Jolpica lo da como 'R' (0 vueltas) y el mapper lo traduce a dnf.
        // La base lo tiene cargado a mano como DNS. La diferencia se deja como
        // está a propósito: el mapper refleja a Jolpica, no al dato histórico.
        // No es un bug — si esto cambia, es que cambió la API.
        const row = byDriver.get('hadjar');
        assert.equal(row.dnf, true);
        assert.equal(row.dns, false);
    });
});

describe('2026 R23 Abu Dhabi — todavía sin correr', () => {
    test('extractRows devuelve null cuando Races viene vacío', () => {
        assert.equal(extractRows(loadFixture('2026-23-results'), 'results'), null);
    });
});
