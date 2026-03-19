import fs from 'fs';
import path from 'path';
import * as racesService from '../services/races.service.js';

export const getAll = async (req, res) => {
    try {
        const year = req.query.year || '2025';
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

export const getSession = async (req, res) => {
    try {
        // Obtenemos del URL qué tipo de sesión se pide (results, qualifying, practices...)
        const routePath = req.path.split('/').pop(); 
        let sessionType = routePath;
        if(routePath === req.params.id) {
            // Un truquito: express params hace que a veces fallé el pop si usamos el mismo router handler
            // Mejor pasarlo estático por un middleware o leer el final de req.originalUrl
        }
        
        // Pero como es más directo, puedo crear distintos handlers o leer el param
        // En Express: router.get('/:id/:session', ...)
    } catch (e) { res.status(500).json({ error: 'Error' }); }
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
        let map_image_url = req.body.existing_map_image || '/images/schedule/default.png';
        if (req.files && req.files['map_image']) {
            map_image_url = `/images/schedule/${req.files['map_image'][0].filename}`;
        }

        let circuit_image_url = req.body.existing_circuit_image || null;
        if (req.files && req.files['circuit_image']) {
            circuit_image_url = `/images/circuits/${req.files['circuit_image'][0].filename}`;
        }

        const data = {
            ...req.body,
            map_image_url,
            circuit_image_url,
            hasSprint: req.body.sprint === 'true',
            lapsInt: req.body.total_laps ? parseInt(req.body.total_laps) : 0
        };

        await racesService.insertRace(data);
        res.json({ success: true, message: 'Carrera creada correctamente' });
    } catch (e) {
        console.error("ERROR:", e);
        res.status(500).json({ error: e.message });
    }
};

export const deleteResult = (session) => async (req, res) => {
    try {
        const { race_id, driver_id } = req.params;
        await racesService.deleteResultEntry(session, race_id, driver_id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error al eliminar' }); }
};

export const getServerImages = (req, res) => {
    try {
        const schedulePath = path.join(process.cwd(), 'public/images/schedule');
        const circuitsPath = path.join(process.cwd(), 'public/images/circuits');

        const getFiles = (dir, urlPrefix) => {
            if (!fs.existsSync(dir)) return [];
            return fs.readdirSync(dir)
                .filter(file => /\.(jpg|jpeg|png|webp|avif)$/i.test(file))
                .map(file => ({ name: file, url: `${urlPrefix}/${file}` }));
        };

        res.json({ success: true, data: { maps: getFiles(schedulePath, '/images/schedule'), circuits: getFiles(circuitsPath, '/images/circuits') } });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error leyendo imágenes' });
    }
};
