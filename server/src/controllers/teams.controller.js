import * as teamsService from '../services/teams.service.js';

export const listTeams = async (req, res) => {
    try {
        const data = await teamsService.getAllTeams();
        res.json({ success: true, data });
    } catch (e) {
        console.error('[Teams] Error al listar:', e.message);
        res.status(500).json({ error: 'Error al obtener equipos' });
    }
};

export const addTeam = async (req, res) => {
    try {
        const { name, primary_color, active_seasons } = req.body;
        const logo_url = req.fileUrl ?? null;
        const seasons = active_seasons
            ? (typeof active_seasons === 'string' ? JSON.parse(active_seasons) : active_seasons)
            : [];
        await teamsService.createTeam({ name, primary_color, logo_url, active_seasons: seasons });
        res.json({ success: true, message: 'Escudería creada exitosamente' });
    } catch (e) {
        console.error('[Teams] Error al crear:', e.message);
        res.status(500).json({ error: 'No se pudo crear la escudería' });
    }
};

export const removeTeam = async (req, res) => {
    try {
        await teamsService.deleteTeam(req.params.id);
        res.json({ success: true, message: 'Escudería eliminada' });
    } catch (e) {
        console.error('[Teams] Error al eliminar:', e.message);
        res.status(500).json({ error: 'No se pudo eliminar la escudería' });
    }
};
