import fs from 'fs';
import path from 'path';
import * as racesService from '../services/races.service.js';
import { NotFoundError } from '../errors/AppError.js';

export const getAll = async (req, res, next) => {
    try {
        const year = req.query.year || '2025';
        const races = await racesService.getCalendar(year);
        res.json({ success: true, data: races });
    } catch (err) {
        next(err);
    }
};

export const getById = async (req, res, next) => {
    try {
        const race = await racesService.getRaceById(req.params.id);
        if (!race) return next(new NotFoundError('Carrera'));
        res.json({ success: true, data: race });
    } catch (err) {
        next(err);
    }
};

export const deleteRace = async (req, res, next) => {
    try {
        await racesService.deleteRaceById(req.params.id);
        res.json({ success: true, message: 'Carrera eliminada correctamente' });
    } catch (err) {
        next(err);
    }
};

export const postResult = async (req, res, next) => {
    try {
        const points = await racesService.insertRaceResult(req.body);
        res.json({ success: true, points });
    } catch (err) {
        next(err);
    }
};

// Factory: returns a handler for any GET session endpoint (results, qualifying, sprint, etc.)
export const getRaceSession = (session) => async (req, res, next) => {
    try {
        const data = await racesService.getSessionResults(req.params.id, session);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

export const postSprint = async (req, res, next) => {
    try {
        const points = await racesService.insertSprintResult(req.body);
        res.json({ success: true, points });
    } catch (err) {
        next(err);
    }
};

export const postQualifying = async (req, res, next) => {
    try {
        await racesService.insertQualifying(req.body);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

export const postSprintQualifying = async (req, res, next) => {
    try {
        await racesService.insertSprintQualifying(req.body);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

export const postPractices = async (req, res, next) => {
    try {
        await racesService.insertPractices(req.body);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

export const postRace = async (req, res, next) => {
    try {
        let map_image_url = req.body.existing_map_image || '/images/schedule/default.png';
        if (req.files?.['map_image']) {
            map_image_url = `/images/schedule/${req.files['map_image'][0].filename}`;
        }

        let circuit_image_url = req.body.existing_circuit_image || null;
        if (req.files?.['circuit_image']) {
            circuit_image_url = `/images/circuits/${req.files['circuit_image'][0].filename}`;
        }

        const data = {
            ...req.body,
            map_image_url,
            circuit_image_url,
            hasSprint: req.body.sprint === 'true',
            lapsInt: req.body.total_laps ? parseInt(req.body.total_laps) : 0,
        };

        await racesService.insertRace(data);
        res.json({ success: true, message: 'Carrera creada correctamente' });
    } catch (err) {
        next(err);
    }
};

// Factory: returns a handler for any DELETE session result endpoint.
export const deleteResult = (session) => async (req, res, next) => {
    try {
        const { race_id, driver_id } = req.params;
        await racesService.deleteResultEntry(session, race_id, driver_id);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

export const getServerImages = (req, res, next) => {
    try {
        const schedulePath = path.join(process.cwd(), 'public/images/schedule');
        const circuitsPath = path.join(process.cwd(), 'public/images/circuits');

        const getFiles = (dir, urlPrefix) => {
            if (!fs.existsSync(dir)) return [];
            return fs.readdirSync(dir)
                .filter(file => /\.(jpg|jpeg|png|webp|avif)$/i.test(file))
                .map(file => ({ name: file, url: `${urlPrefix}/${file}` }));
        };

        res.json({
            success: true,
            data: {
                maps: getFiles(schedulePath, '/images/schedule'),
                circuits: getFiles(circuitsPath, '/images/circuits'),
            },
        });
    } catch (err) {
        next(err);
    }
};
