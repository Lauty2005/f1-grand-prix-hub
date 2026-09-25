/**
 * Jolpica → convenciones de la base de f1-grand-prix-hub.
 *
 * Funciones puras: sin I/O, sin acceso a la base. Reciben las filas crudas de
 * la API de Jolpica (formato Ergast) y un Map jolpicaDriverId → drivers.id, y
 * devuelven filas listas para `results`, `sprint_results` y `qualifying`.
 *
 * Las reglas están verificadas contra los datos cargados a mano (2026-09-25):
 *
 *  - Clasificación por `positionText`, NO por `status`:
 *      'R' / 'N' → dnf   ('R' con status "Lapped" existe: Stroll, Australia 2026)
 *      'D' / 'E' → dsq
 *      'W'       → dns   (Jolpica usa W + "Did not start")
 *      'F'       → dnq
 *      número    → clasificado, aunque status sea "Retired"
 *                  (Sainz, Monaco 2026: P16, 70 vueltas, dnf=false en la base)
 *  - `position` se guarda siempre (los no clasificados quedan al fondo).
 *  - `fastest_lap` = FastestLap.rank === '1'.
 *  - Sprint `time_gap`:
 *      ganador       → Time.time tal cual            "28:50.951"
 *      doblado       → "+N lap" (singular siempre)   "+1 lap", "+3 lap"
 *                      tiene prioridad sobre Time: Jolpica trae Time también
 *                      para doblados en sprint.
 *      resto         → gap en segundos con "s"       "+1:01.344" → "+61.344s"
 *      DNF/DNS/DSQ   → "DNF" / "DNS" / "DSQ"
 *  - Qualifying: sesión ausente o vacía → '' (string vacío, no NULL).
 *  - constructor_id (results y sprint): el equipo de Jolpica para ESA carrera
 *    (Constructor.constructorId), no el de driver_seasons. Soporta cambios de
 *    equipo a mitad de temporada (Lawson/Tsunoda 2025 R1-2 y 2026 desde R12).
 *
 * Diferencias conocidas con datos históricos (NO se replican a propósito):
 *  - 2025 R1 Hadjar: Jolpica = 'R' (0 vueltas), la base = dns.
 *  - Algunos sprints viejos cargados a mano: "DNS" con dnf=true, "DSQ" con
 *    dsq=false, "19 Laps", "+12.951" sin "s".
 */

export class ValidationError extends Error {
    /** @param {string[]} issues */
    constructor(issues) {
        super(`Datos de Jolpica inválidos: ${issues.join(' | ')}`);
        this.name = 'ValidationError';
        this.status = 422;
        this.issues = issues;
    }
}

/** Mínimo de filas para aceptar una sesión (menos = datos parciales). */
export const MIN_ROWS = 10;

// ── Helpers de extracción ───────────────────────────────────────────────────

const LIST_KEY = {
    results: 'Results',
    sprint: 'SprintResults',
    qualifying: 'QualifyingResults',
};

/**
 * Saca las filas de una respuesta de Jolpica.
 * @param {object} apiResponse  JSON completo (con MRData)
 * @param {'results'|'sprint'|'qualifying'} kind
 * @returns {object[]|null} null si Jolpica todavía no publicó la sesión
 */
export function extractRows(apiResponse, kind) {
    const key = LIST_KEY[kind];
    if (!key) throw new TypeError(`kind inválido: ${kind}`);
    const races = apiResponse?.MRData?.RaceTable?.Races;
    if (!Array.isArray(races)) throw new ValidationError(['Respuesta sin MRData.RaceTable.Races']);
    if (races.length === 0) return null;
    const rows = races[0][key];
    return Array.isArray(rows) && rows.length > 0 ? rows : null;
}

/**
 * @param {{id:number, jolpica_id:string|null}[]} drivers
 * @returns {Map<string, number>}
 */
/**
 * @param {{id:number, jolpica_id:string|null}[]} constructors
 * @returns {Map<string, number>}  jolpica constructorId → constructors.id
 */
export function buildConstructorMap(constructors) {
    return buildDriverMap(constructors);
}

export function buildDriverMap(drivers) {
    const map = new Map();
    for (const d of drivers) {
        if (d.jolpica_id) map.set(d.jolpica_id, Number(d.id));
    }
    return map;
}

// ── Reglas ──────────────────────────────────────────────────────────────────

/** @returns {{dnf:boolean, dsq:boolean, dns:boolean, dnq:boolean}} */
export function classifyResult(row) {
    const pt = String(row.positionText ?? '').toUpperCase();
    return {
        dnf: pt === 'R' || pt === 'N',
        dsq: pt === 'D' || pt === 'E',
        dns: pt === 'W',
        dnq: pt === 'F',
    };
}

/** "+1:01.344" → "+61.344s" · "+9.797" → "+9.797s" · null si no parsea. */
export function toSecondsGap(time) {
    if (typeof time !== 'string') return null;
    const m = /^\+(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(time.trim());
    if (!m) return null;
    const minutes = m[1] ? Number(m[1]) : 0;
    const seconds = Number(m[2]);
    const decimals = (m[2].split('.')[1] ?? '').length;
    return `+${(minutes * 60 + seconds).toFixed(decimals)}s`;
}

export function sprintTimeGap(row, winnerLaps, flags) {
    if (flags.dsq) return 'DSQ';
    if (flags.dns) return 'DNS';
    if (flags.dnf) return 'DNF';
    if (Number(row.position) === 1) return row.Time?.time ?? null;
    const lapsDown = winnerLaps - Number(row.laps);
    if (lapsDown > 0) return `+${lapsDown} lap`;
    return toSecondsGap(row.Time?.time);
}

// ── Validación ──────────────────────────────────────────────────────────────

function validate(rows, driverMap, { checkPoints, constructorMap = null }) {
    const issues = [];

    if (!Array.isArray(rows) || rows.length === 0) {
        throw new ValidationError(['Sin filas']);
    }
    if (rows.length < MIN_ROWS) {
        issues.push(`Solo ${rows.length} filas (mínimo ${MIN_ROWS}): posible dato parcial`);
    }

    const unmapped = [...new Set(
        rows.map((r) => r.Driver?.driverId).filter((id) => !id || !driverMap.has(id)),
    )];
    if (unmapped.length > 0) {
        issues.push(`Pilotos sin jolpica_id en la base: ${unmapped.map((id) => id ?? '<sin driverId>').join(', ')}`);
    }

    if (constructorMap) {
        const unmappedC = [...new Set(
            rows.map((r) => r.Constructor?.constructorId).filter((id) => !id || !constructorMap.has(id)),
        )];
        if (unmappedC.length > 0) {
            issues.push(`Equipos sin jolpica_id en la base: ${unmappedC.map((id) => id ?? '<sin constructorId>').join(', ')}`);
        }
    }

    const driverIds = rows.map((r) => r.Driver?.driverId);
    const dupDrivers = driverIds.filter((id, i) => id && driverIds.indexOf(id) !== i);
    if (dupDrivers.length > 0) {
        issues.push(`Pilotos duplicados: ${[...new Set(dupDrivers)].join(', ')}`);
    }

    const positions = rows.map((r) => Number(r.position));
    const expected = rows.map((_, i) => i + 1);
    const sorted = [...positions].sort((a, b) => a - b);
    if (sorted.some((p, i) => p !== expected[i])) {
        issues.push(`Posiciones no son 1..${rows.length} contiguas y únicas: [${positions.join(',')}]`);
    }

    if (checkPoints) {
        const badPoints = rows.filter((r) => {
            const n = Number(r.points);
            return r.points === undefined || r.points === '' || !Number.isFinite(n) || n < 0;
        });
        if (badPoints.length > 0) {
            issues.push(`Puntos inválidos: ${badPoints.map((r) => `${r.Driver?.driverId}=${r.points}`).join(', ')}`);
        }
    }

    if (issues.length > 0) throw new ValidationError(issues);
}

function winnerLapsOf(rows) {
    const winner = rows.find((r) => Number(r.position) === 1);
    return Number(winner?.laps ?? 0);
}

// ── Mappers ─────────────────────────────────────────────────────────────────

/** constructor_id solo si se pasó constructorMap (el equipo con el que corrió ESE fin de semana). */
function withConstructor(row, r, constructorMap) {
    if (constructorMap) row.constructor_id = constructorMap.get(r.Constructor.constructorId);
    return row;
}

/**
 * Filas de `results`, ordenadas por posición.
 * @param {Map<string,number>} [constructorMap] si se pasa, agrega constructor_id y valida equipos.
 */
export function mapRaceResults(rows, driverMap, constructorMap = null) {
    validate(rows, driverMap, { checkPoints: true, constructorMap });
    return rows
        .map((r) => withConstructor({
            driver_id: driverMap.get(r.Driver.driverId),
            position: Number(r.position),
            points: Number(r.points),
            fastest_lap: r.FastestLap?.rank === '1',
            ...classifyResult(r),
        }, r, constructorMap))
        .sort((a, b) => a.position - b.position);
}

/** Filas de `sprint_results`, ordenadas por posición. */
export function mapSprintResults(rows, driverMap, constructorMap = null) {
    validate(rows, driverMap, { checkPoints: true, constructorMap });
    const winnerLaps = winnerLapsOf(rows);
    return rows
        .map((r) => {
            const { dnf, dsq, dns } = classifyResult(r);
            return withConstructor({
                driver_id: driverMap.get(r.Driver.driverId),
                position: Number(r.position),
                points: Number(r.points),
                dnf,
                dns,
                dsq,
                time_gap: sprintTimeGap(r, winnerLaps, { dnf, dsq, dns }),
            }, r, constructorMap);
        })
        .sort((a, b) => a.position - b.position);
}

/** Filas de `qualifying`, ordenadas por posición. */
export function mapQualifying(rows, driverMap) {
    validate(rows, driverMap, { checkPoints: false });
    return rows
        .map((r) => ({
            driver_id: driverMap.get(r.Driver.driverId),
            position: Number(r.position),
            q1: r.Q1 ?? '',
            q2: r.Q2 ?? '',
            q3: r.Q3 ?? '',
        }))
        .sort((a, b) => a.position - b.position);
}

// ── Horarios (calendario de la temporada) ───────────────────────────────────

/** Sesión de Jolpica → columna de `races`. SprintShootout es el nombre de 2023. */
export const SCHEDULE_SESSIONS = [
    ['FirstPractice', 'fp1_time'],
    ['SecondPractice', 'fp2_time'],
    ['ThirdPractice', 'fp3_time'],
    ['SprintQualifying', 'sprint_quali_time'],
    ['SprintShootout', 'sprint_quali_time'],
    ['Sprint', 'sprint_time'],
    ['Qualifying', 'qualy_time'],
];
export const SCHEDULE_COLUMNS = [
    'fp1_time', 'fp2_time', 'fp3_time', 'sprint_quali_time', 'sprint_time', 'qualy_time', 'race_time',
];

/** {date:'2026-09-26', time:'11:00:00Z'} → ISO UTC. Sin hora (datos históricos) → null. */
export function toUtcIso(date, time) {
    if (!date || !time) return null;
    const t = /Z$|[+-]\d{2}:?\d{2}$/.test(time) ? time : `${time}Z`;
    const d = new Date(`${date}T${t}`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Calendario de Jolpica → horarios por ronda.
 * @returns {{round:number, name:string, date:string, has_sprint:boolean, times:Object<string,string>}[]}
 *          times solo trae las columnas que Jolpica informa (nunca null).
 */
export function mapSchedule(races) {
    if (!Array.isArray(races) || races.length === 0) {
        throw new ValidationError(['Calendario vacío']);
    }
    const rounds = races.map((r) => Number(r.round));
    const dup = rounds.filter((n, i) => rounds.indexOf(n) !== i);
    if (rounds.some((n) => !Number.isInteger(n) || n < 1) || dup.length > 0) {
        throw new ValidationError([`Rondas inválidas o duplicadas en el calendario: [${rounds.join(',')}]`]);
    }
    return races.map((r) => {
        const times = {};
        for (const [key, col] of SCHEDULE_SESSIONS) {
            const iso = toUtcIso(r[key]?.date, r[key]?.time);
            if (iso) times[col] = iso;
        }
        const raceIso = toUtcIso(r.date, r.time);
        if (raceIso) times.race_time = raceIso;
        return {
            round: Number(r.round),
            name: r.raceName ?? '',
            date: r.date,
            has_sprint: Boolean(r.Sprint),
            times,
        };
    });
}
