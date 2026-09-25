/**
 * Sync de resultados desde Jolpica: detecta carreras pendientes y aplica
 * resultados / sprint / clasificación en una transacción por carrera.
 *
 * El backend es la única fuente de verdad sobre las convenciones de datos: el
 * cliente (f1_agent/sync_results.py) manda las respuestas COMPLETAS de Jolpica
 * sin transformar, y acá se valida, se mapea (mapper.js) y se escribe.
 *
 * Seguridad de datos:
 *  - Verifica que season/round de cada respuesta coincidan con la carrera
 *    (races.jolpica_round). Evita cargar resultados en el GP equivocado.
 *  - Toda la validación ocurre ANTES de escribir; una transacción por carrera.
 *  - Fuera de la ventana de 7 días, sobrescribir datos existentes exige force.
 *    Si los datos ya son idénticos no hace falta force (no-op).
 *  - dry_run calcula el diff completo y no escribe nada.
 *
 * Uso: createSyncService(pool) — el pool se inyecta para poder testear contra
 * una base aislada. La instancia por defecto usa src/config/db.js.
 */
import {
    ValidationError, extractRows, buildDriverMap,
    mapRaceResults, mapSprintResults, mapQualifying,
} from './mapper.js';

/** Días después de la carrera en que se re-sincroniza sin force (penalizaciones). */
export const RESYNC_WINDOW_DAYS = 7;

export class SyncError extends Error {
    constructor(status, message, extra = {}) {
        super(message);
        this.name = 'SyncError';
        this.status = status;
        Object.assign(this, extra);
    }
}

// Tablas y columnas: constantes internas, nunca input del usuario.
const KINDS = {
    results: {
        table: 'results',
        columns: ['position', 'points', 'fastest_lap', 'dnf', 'dsq', 'dns', 'dnq'],
        map: mapRaceResults,
    },
    sprint: {
        table: 'sprint_results',
        columns: ['position', 'points', 'dnf', 'dns', 'dsq', 'time_gap'],
        map: mapSprintResults,
    },
    qualifying: {
        table: 'qualifying',
        columns: ['position', 'q1', 'q2', 'q3'],
        map: mapQualifying,
    },
};
export const SYNC_KINDS = Object.keys(KINDS);

const BOOL_COLS = new Set(['fastest_lap', 'dnf', 'dsq', 'dns', 'dnq']);
const TEXT_EMPTY_COLS = new Set(['q1', 'q2', 'q3']);

/** Normaliza un valor de la base para comparar con la salida del mapper. */
function normalize(col, value) {
    if (col === 'position') return Number(value);
    if (col === 'points') return Number(value ?? 0); // pg devuelve numeric como string
    if (BOOL_COLS.has(col)) return value === true;   // null/false → false
    if (TEXT_EMPTY_COLS.has(col)) return value ?? '';
    return value ?? null;
}

/**
 * Diff entre filas actuales (base) y nuevas (mapper), por driver_id.
 * @returns {{added:object[], changed:object[], removed:object[], unchanged:number}}
 */
export function diffRows(columns, currentRows, nextRows, driverNames = new Map()) {
    const label = (id) => driverNames.get(id) ?? `#${id}`;
    const current = new Map(currentRows.map((r) => [Number(r.driver_id), r]));
    const next = new Map(nextRows.map((r) => [r.driver_id, r]));
    const diff = { added: [], changed: [], removed: [], unchanged: 0 };

    for (const [driverId, row] of next) {
        const before = current.get(driverId);
        if (!before) {
            diff.added.push({ driver_id: driverId, driver: label(driverId), ...pick(row, columns) });
            continue;
        }
        const changes = {};
        for (const col of columns) {
            const a = normalize(col, before[col]);
            const b = row[col];
            if (a !== b) changes[col] = [a, b];
        }
        if (Object.keys(changes).length > 0) {
            diff.changed.push({ driver_id: driverId, driver: label(driverId), changes });
        } else {
            diff.unchanged += 1;
        }
    }
    for (const [driverId, row] of current) {
        if (!next.has(driverId)) {
            diff.removed.push({ driver_id: driverId, driver: label(driverId), position: Number(row.position) });
        }
    }
    diff.added.sort((a, b) => a.position - b.position);
    diff.changed.sort((a, b) => a.driver_id - b.driver_id);
    return diff;
}

function pick(obj, keys) {
    return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

function hasChanges(diff) {
    return diff.added.length + diff.changed.length + diff.removed.length > 0;
}

/** Verifica que la respuesta de Jolpica corresponda a esta carrera. */
function assertSameRace(kind, apiResponse, season, jolpicaRound) {
    const race = apiResponse?.MRData?.RaceTable?.Races?.[0];
    if (!race) return; // no publicado: extractRows devuelve null
    if (Number(race.season) !== season || Number(race.round) !== jolpicaRound) {
        throw new ValidationError([
            `${kind}: la respuesta es ${race.season}/${race.round} pero la carrera es ${season}/${jolpicaRound}`,
        ]);
    }
}

export function createSyncService(pool) {
    /**
     * Carreras de la temporada que necesitan sync.
     * needs: qué sesiones pedir a Jolpica. Dentro de la ventana de re-sync se
     * piden todas (para capturar penalizaciones).
     *
     * Con jolpicaRound devuelve ESA carrera aunque no esté pendiente, con todas
     * sus sesiones en needs (sync manual / corrección con force). Sigue
     * excluyendo suspendidas y futuras.
     */
    async function getPendingRaces(season, { jolpicaRound = null } = {}) {
        const { rows } = await pool.query(
            `SELECT r.id AS race_id, r.name, r.jolpica_round, r.date::text AS date, r.has_sprint,
                    (SELECT count(*) FROM results        x WHERE x.race_id = r.id)::int AS n_results,
                    (SELECT count(*) FROM sprint_results x WHERE x.race_id = r.id)::int AS n_sprint,
                    (SELECT count(*) FROM qualifying     x WHERE x.race_id = r.id)::int AS n_qualifying,
                    (r.date >= CURRENT_DATE - $2::int) AS in_window
               FROM races r
              WHERE EXTRACT(YEAR FROM r.date) = $1
                AND r.jolpica_round IS NOT NULL
                AND r.status IS DISTINCT FROM 'suspended'
                AND r.date <= CURRENT_DATE
                AND ($3::int IS NULL OR r.jolpica_round = $3::int)
              ORDER BY r.date`,
            [season, RESYNC_WINDOW_DAYS, jolpicaRound],
        );

        const all = jolpicaRound !== null;
        return rows
            .map((r) => {
                const needs = [];
                if (all || r.in_window || r.n_results === 0) needs.push('results');
                if (r.has_sprint && (all || r.in_window || r.n_sprint === 0)) needs.push('sprint');
                if (all || r.in_window || r.n_qualifying === 0) needs.push('qualifying');
                return {
                    race_id: r.race_id,
                    name: r.name,
                    season,
                    jolpica_round: r.jolpica_round,
                    date: r.date,
                    has_sprint: r.has_sprint,
                    in_window: r.in_window,
                    counts: { results: r.n_results, sprint: r.n_sprint, qualifying: r.n_qualifying },
                    needs,
                };
            })
            .filter((r) => r.needs.length > 0);
    }

    /** Rondas Jolpica vinculadas a alguna carrera de la temporada (para detectar las que faltan en la base). */
    async function getMappedRounds(season) {
        const { rows } = await pool.query(
            `SELECT jolpica_round FROM races
              WHERE EXTRACT(YEAR FROM date) = $1 AND jolpica_round IS NOT NULL
              ORDER BY jolpica_round`,
            [season],
        );
        return rows.map((r) => r.jolpica_round);
    }

    /**
     * Valida, mapea y (salvo dryRun) escribe los datos de una carrera.
     * @param {number} raceId
     * @param {{results?:object, sprint?:object, qualifying?:object}} payload
     *        respuestas COMPLETAS de Jolpica (con MRData)
     */
    async function applyRaceData(raceId, payload, { dryRun = false, force = false } = {}) {
        const kinds = SYNC_KINDS.filter((k) => payload?.[k] !== undefined && payload[k] !== null);
        if (kinds.length === 0) {
            throw new ValidationError([`El body no trae ninguna sesión (${SYNC_KINDS.join(', ')})`]);
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Lock de la carrera: serializa syncs concurrentes sobre el mismo GP.
            const { rows: raceRows } = await client.query(
                `SELECT id, name, jolpica_round, has_sprint, status,
                        EXTRACT(YEAR FROM date)::int AS season,
                        (date >= CURRENT_DATE - $2::int) AS in_window
                   FROM races WHERE id = $1 FOR UPDATE`,
                [raceId, RESYNC_WINDOW_DAYS],
            );
            const race = raceRows[0];
            if (!race) throw new SyncError(404, `Carrera ${raceId} no existe`);
            if (race.jolpica_round === null) {
                throw new SyncError(409, `Carrera ${raceId} (${race.name}) no tiene jolpica_round: no se puede sincronizar`);
            }
            if (race.status === 'suspended') {
                throw new SyncError(409, `Carrera ${raceId} (${race.name}) está suspendida`);
            }
            if (kinds.includes('sprint') && !race.has_sprint) {
                throw new ValidationError([`sprint: la carrera ${raceId} no tiene has_sprint`]);
            }

            const { rows: drivers } = await client.query(
                'SELECT id, last_name, jolpica_id FROM drivers',
            );
            const driverMap = buildDriverMap(drivers);
            const driverNames = new Map(drivers.map((d) => [Number(d.id), d.last_name]));

            // 1) Validar y mapear TODO antes de escribir nada.
            const issues = [];
            const mapped = {};
            const skipped = {};
            for (const kind of kinds) {
                try {
                    assertSameRace(kind, payload[kind], race.season, race.jolpica_round);
                    const rows = extractRows(payload[kind], kind);
                    if (rows === null) {
                        skipped[kind] = 'not_published';
                        continue;
                    }
                    mapped[kind] = KINDS[kind].map(rows, driverMap);
                } catch (err) {
                    if (!(err instanceof ValidationError)) throw err;
                    issues.push(...err.issues.map((i) => (i.startsWith(`${kind}:`) ? i : `${kind}: ${i}`)));
                }
            }
            if (issues.length > 0) throw new ValidationError(issues);

            // 2) Diff contra lo actual.
            const tables = {};
            let needsForce = false;
            for (const [kind, nextRows] of Object.entries(mapped)) {
                const { table, columns } = KINDS[kind];
                const { rows: currentRows } = await client.query(
                    `SELECT driver_id, ${columns.join(', ')} FROM ${table} WHERE race_id = $1`,
                    [raceId],
                );
                const diff = diffRows(columns, currentRows, nextRows, driverNames);
                tables[kind] = diff;
                if (currentRows.length > 0 && hasChanges(diff) && !race.in_window) needsForce = true;
            }

            const summary = {
                race_id: raceId,
                name: race.name,
                season: race.season,
                jolpica_round: race.jolpica_round,
                in_window: race.in_window,
                dry_run: dryRun,
                requires_force: needsForce,
                skipped,
                tables,
            };

            if (dryRun) {
                await client.query('ROLLBACK');
                return { ...summary, applied: false };
            }
            if (needsForce && !force) {
                throw new SyncError(409,
                    `Carrera ${raceId} (${race.name}) ya tiene datos distintos y está fuera de la ventana de ${RESYNC_WINDOW_DAYS} días: usar force`,
                    { summary });
            }

            // 3) Escribir.
            for (const [kind, nextRows] of Object.entries(mapped)) {
                if (!hasChanges(tables[kind])) continue;
                const { table, columns } = KINDS[kind];
                const allCols = ['race_id', 'driver_id', ...columns];
                const placeholders = allCols.map((_, i) => `$${i + 1}`).join(', ');
                const updates = columns.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
                const changedGuard = `(${columns.map((c) => `${table}.${c}`).join(', ')}) IS DISTINCT FROM (${columns.map((c) => `EXCLUDED.${c}`).join(', ')})`;
                const sql = `INSERT INTO ${table} (${allCols.join(', ')}) VALUES (${placeholders})
                             ON CONFLICT (race_id, driver_id) DO UPDATE SET ${updates}
                             WHERE ${changedGuard}`;
                for (const row of nextRows) {
                    await client.query(sql, [raceId, row.driver_id, ...columns.map((c) => row[c])]);
                }
                await client.query(
                    `DELETE FROM ${table} WHERE race_id = $1 AND NOT (driver_id = ANY($2::int[]))`,
                    [raceId, nextRows.map((r) => r.driver_id)],
                );
            }

            await client.query('COMMIT');
            return { ...summary, applied: true };
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    }

    return { getPendingRaces, getMappedRounds, applyRaceData };
}
