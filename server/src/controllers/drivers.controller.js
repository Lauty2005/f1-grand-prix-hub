// server/src/controllers/drivers.controller.js
import * as driversService from '../services/drivers.service.js';

export const getAllDrivers = async (req, res) => {
    try {
        const year = req.query.year || '2025';
        const drivers = await driversService.getDrivers(year);
        res.json({ success: true, data: drivers });
    } catch (err) {
        console.error('ERROR SQL DRIVERS:', err.message);
        res.status(500).json({ error: 'Error interno obteniendo pilotos' });
    }
};

export const getDriverHistorial = async (req, res) => {
    try {
        const { id } = req.params;
        const year = req.query.year || '2025';
        const results = await driversService.getDriverResults(id, year);
        res.json({ success: true, data: results });
    } catch (err) {
        console.error('ERROR historial piloto:', err.message);
        res.status(500).json({ error: 'Error buscando historial' });
    }
};

export const removeDriver = async (req, res) => {
    try {
        const { id } = req.params;
        await driversService.deleteDriver(id);
        res.json({ success: true, message: 'Piloto eliminado correctamente' });
    } catch (err) {
        console.error('Error transaccional eliminando piloto:', err.message);
        res.status(500).json({ error: 'No se pudo eliminar al piloto' });
    }
};

export const listTeams = async (req, res) => {
    try {
        const teams = await driversService.getTeams();
        res.json({ success: true, data: teams });
    } catch (e) {
        res.status(500).json({ error: 'Error cargando equipos' });
    }
};

export const compareDrivers = async (req, res) => {
    try {
        const { ids, year = '2025' } = req.query;
        if (!ids) return res.status(400).json({ error: 'Parámetro ids requerido' });

        const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(n => !isNaN(n));
        if (idArray.length < 2 || idArray.length > 4) {
            return res.status(400).json({ error: 'Se requieren entre 2 y 4 pilotos' });
        }

        const data = await driversService.compareDrivers(idArray, year);
        res.json({ success: true, data });
    } catch (err) {
        console.error('ERROR compare drivers:', err.message);
        res.status(500).json({ error: 'Error comparando pilotos' });
    }
};

export const addDriver = async (req, res) => {
    try {
        // req.fileUrl es la URL absoluta de R2, o undefined si no se subió imagen
        const profileImageUrl = req.fileUrl ?? null;
        await driversService.createDriver(req.body, profileImageUrl);
        res.json({ success: true, message: 'Piloto creado' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al crear piloto: ' + e.message });
    }
};

export const assignDriverSeason = async (req, res) => {
    try {
        const { driver_id, constructor_id, year, number } = req.body;
        if (!driver_id || !constructor_id || !year)
            return res.status(400).json({ error: 'Faltan campos requeridos.' });
        await driversService.assignDriverSeason({ driver_id, constructor_id, year, number });
        res.json({ success: true, message: 'Asignación guardada correctamente.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al asignar: ' + e.message });
    }
};

export const listDriverSeasons = async (req, res) => {
    try {
        const data = await driversService.getDriverSeasons();
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ error: 'Error cargando asignaciones.' });
    }
};
