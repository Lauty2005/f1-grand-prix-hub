import * as driversService from '../services/drivers.service.js';

export const getAllDrivers = async (req, res) => {
    try {
        const year = req.query.year || '2025';
        const drivers = await driversService.getDrivers(year);
        res.json({ success: true, data: drivers });
    } catch (err) {
        console.error("ERROR SQL DRIVERS:", err.message);
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
        console.error("ERROR historial piloto:", err.message);
        res.status(500).json({ error: 'Error buscando historial' });
    }
};

export const removeDriver = async (req, res) => {
    try {
        const { id } = req.params;
        await driversService.deleteDriver(id);
        res.json({ success: true, message: 'Piloto eliminado correctamente' });
    } catch (err) {
        console.error("Error transaccional eliminando piloto:", err.message);
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

export const addDriver = async (req, res) => {
    try {
        const fileData = req.file ? {
            protocol: req.protocol,
            host: req.get('host'),
            filename: req.file.filename
        } : null;

        await driversService.createDriver(req.body, fileData);
        res.json({ success: true, message: 'Piloto creado' });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: 'Error al crear piloto: ' + e.message }); 
    }
};
