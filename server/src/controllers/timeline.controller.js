import * as timelineService from '../services/timeline.service.js';

export const getTimeline = async (req, res) => {
    try {
        const year = req.query.year || '2025';
        const [evolution, moments] = await Promise.all([
            timelineService.getStandingsEvolution(year),
            timelineService.getMoments(year),
        ]);
        res.json({ success: true, data: { evolution, moments } });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener timeline' });
    }
};

export const getAllMomentsAdmin = async (req, res) => {
    try {
        const moments = await timelineService.getAllMomentsAdmin();
        res.json({ success: true, data: moments });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener momentos' });
    }
};

export const addMoment = async (req, res) => {
    try {
        await timelineService.addMoment(req.body);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al crear momento' });
    }
};

export const deleteMoment = async (req, res) => {
    try {
        await timelineService.deleteMoment(req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al eliminar momento' });
    }
};
