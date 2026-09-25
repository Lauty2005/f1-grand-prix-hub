import { pool } from '../config/db.js';
import { createSyncService, SyncError, SYNC_KINDS } from '../services/jolpica/syncService.js';
import { ValidationError } from '../services/jolpica/mapper.js';

const sync = createSyncService(pool);

const MIN_SEASON = 1950;

function parseSeason(raw) {
    if (raw === undefined || raw === '') return new Date().getUTCFullYear();
    const n = Number(raw);
    const max = new Date().getUTCFullYear() + 1;
    return Number.isInteger(n) && n >= MIN_SEASON && n <= max ? n : null;
}

const isFlag = (v) => v === '1' || v === 'true';

function sendError(res, err) {
    if (err instanceof ValidationError) {
        return res.status(422).json({ success: false, error: 'Datos inválidos', issues: err.issues });
    }
    if (err instanceof SyncError) {
        return res.status(err.status).json({ success: false, error: err.message, ...(err.summary ? { data: err.summary } : {}) });
    }
    console.error('[sync]', err);
    return res.status(500).json({ success: false, error: 'Error interno en el sync' });
}

/**
 * GET /api/admin/sync/pending?season=2026[&jolpica_round=6]
 * Con jolpica_round devuelve esa carrera aunque no esté pendiente (sync manual).
 * mapped_rounds: rondas Jolpica vinculadas en la base (el cliente detecta las que faltan).
 */
export const getPending = async (req, res) => {
    const season = parseSeason(req.query.season);
    if (season === null) return res.status(400).json({ success: false, error: 'season inválida' });

    let jolpicaRound = null;
    if (req.query.jolpica_round !== undefined && req.query.jolpica_round !== '') {
        jolpicaRound = Number(req.query.jolpica_round);
        if (!Number.isInteger(jolpicaRound) || jolpicaRound < 1 || jolpicaRound > 30) {
            return res.status(400).json({ success: false, error: 'jolpica_round inválido' });
        }
    }

    try {
        const [data, mappedRounds] = await Promise.all([
            sync.getPendingRaces(season, { jolpicaRound }),
            sync.getMappedRounds(season),
        ]);
        res.json({ success: true, season, count: data.length, mapped_rounds: mappedRounds, data });
    } catch (err) {
        sendError(res, err);
    }
};

/**
 * PUT /api/admin/sync/schedule?season=2026&dry_run=1
 * Body: { source: "jolpica", calendar: <JSON completo de GET /{season}.json> }
 * Futuras: se actualizan los horarios distintos. Pasadas: solo se completan vacíos.
 */
export const putSchedule = async (req, res) => {
    const season = parseSeason(req.query.season);
    if (season === null) return res.status(400).json({ success: false, error: 'season inválida' });

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.source !== 'jolpica') {
        return res.status(400).json({ success: false, error: 'Body { source: "jolpica", calendar } requerido' });
    }
    const unknown = Object.keys(body).filter((k) => k !== 'source' && k !== 'calendar');
    if (unknown.length > 0) {
        return res.status(400).json({ success: false, error: `Claves desconocidas: ${unknown.join(', ')}` });
    }
    if (!body.calendar || typeof body.calendar !== 'object' || !body.calendar.MRData) {
        return res.status(400).json({ success: false, error: 'Se espera la respuesta completa de Jolpica (con MRData) en: calendar' });
    }

    try {
        const data = await sync.applySchedule(season, body.calendar, { dryRun: isFlag(req.query.dry_run) });
        res.json({ success: true, data });
    } catch (err) {
        sendError(res, err);
    }
};

/**
 * PUT /api/admin/sync/races/:raceId?dry_run=1&force=1
 * Body: { source: "jolpica", results?: <JSON Jolpica>, sprint?: <...>, qualifying?: <...> }
 */
export const putRaceData = async (req, res) => {
    const raceId = Number(req.params.raceId);
    if (!Number.isInteger(raceId) || raceId <= 0) {
        return res.status(400).json({ success: false, error: 'raceId inválido' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ success: false, error: 'Body JSON requerido' });
    }
    if (body.source !== 'jolpica') {
        return res.status(400).json({ success: false, error: 'source debe ser "jolpica"' });
    }
    const unknown = Object.keys(body).filter((k) => k !== 'source' && !SYNC_KINDS.includes(k));
    if (unknown.length > 0) {
        return res.status(400).json({ success: false, error: `Claves desconocidas: ${unknown.join(', ')}` });
    }
    const badShape = SYNC_KINDS.filter((k) => body[k] !== undefined && (typeof body[k] !== 'object' || body[k] === null || !body[k].MRData));
    if (badShape.length > 0) {
        return res.status(400).json({ success: false, error: `Se espera la respuesta completa de Jolpica (con MRData) en: ${badShape.join(', ')}` });
    }

    try {
        const data = await sync.applyRaceData(raceId, body, {
            dryRun: isFlag(req.query.dry_run),
            force: isFlag(req.query.force),
        });
        res.json({ success: true, data });
    } catch (err) {
        sendError(res, err);
    }
};
