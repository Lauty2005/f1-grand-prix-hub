import * as teamsService from '../services/teams.service.js';

export const getAll = async (req, res, next) => {
    try {
        const teams = await teamsService.getAllTeams();
        res.json({ success: true, data: teams });
    } catch (err) {
        next(err);
    }
};

export const create = async (req, res, next) => {
    try {
        const { name, primary_color } = req.body;
        const logo_url = req.file ? `/images/teams/${req.file.filename}` : null;
        await teamsService.createTeam({ name, primary_color, logo_url });
        res.json({ success: true, message: 'Escudería creada exitosamente' });
    } catch (err) {
        next(err);
    }
};

export const remove = async (req, res, next) => {
    try {
        await teamsService.deleteTeam(req.params.id);
        res.json({ success: true, message: 'Escudería eliminada' });
    } catch (err) {
        next(err);
    }
};
