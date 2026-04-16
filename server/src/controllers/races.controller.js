import * as racesService from '../services/races.service.js';
import { listR2Objects } from '../config/r2.js';

export const getAll = async (req, res) => {
    try {
        const year = req.query.year || String(new Date().getFullYear());
        const races = await racesService.getCalendar(year);
        res.json({ success: true, data: races });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener calendario' });
    }
};

export const getById = async (req, res) => {
    try {
        const race = await racesService.getRaceById(req.params.id);
        if (!race) return res.status(404).json({ error: 'Carrera no encontrada' });
        res.json({ success: true, data: race });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error del servidor' });
    }
};

export const deleteRace = async (req, res) => {
    try {
        await racesService.deleteRaceTransaction(req.params.id);
        res.json({ success: true, message: 'Carrera eliminada correctamente' });
    } catch (err) {
        console.error("Error transaccional borrando carrera:", err);
        res.status(500).json({ error: 'No se pudo eliminar' }); 
    }
};

export const postResult = async (req, res) => {
    try {
        const points = await racesService.insertRaceResult(req.body);
        res.json({ success: true, points });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error guardando resultado' });
    }
};

// Handlers separadas para GET session outputs
export const getRaceSession = (session) => async (req, res) => {
    try {
        const data = await racesService.getSessionResults(req.params.id, session);
        res.json({ success: true, data });
    } catch (e) { res.status(500).json({ error: 'Error obteniendo ' + session }); }
};

export const postSprint = async (req, res) => {
    try {
        const points = await racesService.insertSprintResult(req.body);
        res.json({ success: true, points });
    } catch (e) { res.status(500).json({ error: 'Error guardando Sprint' }); }
};

export const postQualifying = async (req, res) => {
    try {
        await racesService.insertQualifying(req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error guardando Qualy' }); }
};

export const postSprintQualifying = async (req, res) => {
    try {
        await racesService.insertSprintQualifying(req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error guardando Shootout' }); }
};

export const postPractices = async (req, res) => {
    try {
        await racesService.insertPractices(req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error guardando Prácticas' }); }
};

export const postRace = async (req, res) => {
    try {
        const {
            name, round, date, circuit_name, country,
            total_laps, sprint, existing_map_image, existing_circuit_image,
        } = req.body;

        const map_image_url     = req.fileUrls?.['map_image']     ?? existing_map_image     ?? null;
        const circuit_image_url = req.fileUrls?.['circuit_image'] ?? existing_circuit_image ?? null;

        const data = {
            name,
            round,
            date,
            circuit_name,
            country,
            map_image_url,
            circuit_image_url,
            hasSprint: sprint === 'true',
            lapsInt:   total_laps ? parseInt(total_laps) : 0,
        };

        await racesService.insertRace(data);
        res.json({ success: true, message: 'Carrera creada correctamente' });
    } catch (e) {
        console.error('ERROR postRace:', e);
        res.status(500).json({ error: 'Error al crear carrera' });
    }
};

export const deleteResult = (session) => async (req, res) => {
    try {
        const { race_id, driver_id } = req.params;
        await racesService.deleteResultEntry(session, race_id, driver_id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error al eliminar' }); }
};

export const getServerImages = async (req, res) => {
    try {
        const [maps, circuits] = await Promise.all([
            listR2Objects('schedule/'),
            listR2Objects('circuits/'),
        ]);
        res.json({ success: true, data: { maps, circuits } });
    } catch (e) {
        console.error('[getServerImages] Error listando R2:', e);
        res.status(500).json({ error: 'Error leyendo imágenes del storage' });
    }
};