import * as strategyService from '../services/strategy.service.js';

export const getRaceStrategy = async (req, res) => {
    try {
        const data = await strategyService.getRaceStrategy(req.params.id);
        if (!data) return res.status(404).json({ error: 'Carrera no encontrada' });
        res.json({ success: true, data });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener estrategia' });
    }
};

export const getTeamStrategyHistory = async (req, res) => {
    try {
        const year = req.query.year || '2025';
        const data = await strategyService.getTeamStrategyHistory(year);
        res.json({ success: true, data });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener historial de estrategias' });
    }
};

export const getStintsForAdmin = async (req, res) => {
    try {
        const { race_id } = req.query;
        if (!race_id) return res.status(400).json({ error: 'race_id requerido' });
        const data = await strategyService.getStintsForAdmin(race_id);
        res.json({ success: true, data });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener stints' });
    }
};

export const addStint = async (req, res) => {
    try {
        const result = await strategyService.addStint(req.body);
        res.json({ success: true, id: result.id });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al guardar stint' });
    }
};

export const deleteStint = async (req, res) => {
    try {
        await strategyService.deleteStint(req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al eliminar stint' });
    }
};

export const deleteDriverStints = async (req, res) => {
    try {
        const { raceId, driverId } = req.params;
        await strategyService.deleteDriverStints(raceId, driverId);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al eliminar stints del piloto' });
    }
};
