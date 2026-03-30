import * as circuitService from '../services/circuit.service.js';

export const getCircuitAnalysis = async (req, res) => {
    try {
        const data = await circuitService.getCircuitAnalysis(req.params.id);
        if (!data) return res.status(404).json({ error: 'Circuito no encontrado' });
        res.json({ success: true, data });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener análisis del circuito' });
    }
};

export const getAllCircuitWinners = async (req, res) => {
    try {
        const winners = await circuitService.getAllCircuitWinners();
        res.json({ success: true, data: winners });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener ganadores' });
    }
};

export const addCircuitWinner = async (req, res) => {
    try {
        await circuitService.addCircuitWinner(req.body);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al guardar ganador' });
    }
};

export const deleteCircuitWinner = async (req, res) => {
    try {
        await circuitService.deleteCircuitWinner(req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al eliminar ganador' });
    }
};

export const updateRaceCircuitInfo = async (req, res) => {
    try {
        await circuitService.updateRaceCircuitInfo(req.params.id, req.body);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al actualizar info del circuito' });
    }
};
