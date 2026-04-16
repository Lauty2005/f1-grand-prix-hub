// server/src/routes/races.routes.js
import { Router } from 'express';
import { adminAuth } from '../middleware/auth.middleware.js';
import { validateResult, validateRace } from '../middleware/validate.middleware.js';
import * as racesController from '../controllers/races.controller.js';
import * as strategyController from '../controllers/strategy.controller.js';
import { createUpload } from '../config/upload.js';

const router = Router();

// Upload de múltiples campos de imagen para la carrera
// req.fileUrls['map_image']     → URL absoluta en R2
// req.fileUrls['circuit_image'] → URL absoluta en R2
const upload = createUpload('schedule'); // prefijo del bucket para mapas de circuito

// ── 1. LECTURAS BÁSICAS ─────────────────────────────────────────────────────
router.get('/',                    racesController.getAll);
router.get('/images/list',         racesController.getServerImages); // antes de /:id
router.get('/:id',                 racesController.getById);

// ── 2. DETALLES DE SESIÓN ───────────────────────────────────────────────────
router.get('/:id/results',          racesController.getRaceSession('results'));
router.get('/:id/qualifying',        racesController.getRaceSession('qualifying'));
router.get('/:id/practices',         racesController.getRaceSession('practices'));
router.get('/:id/sprint',            racesController.getRaceSession('sprint'));
router.get('/:id/sprint-qualifying', racesController.getRaceSession('sprint-qualifying'));
router.get('/:id/strategy',          strategyController.getRaceStrategy);

// ── 3. POSTEO DE DATOS PRINCIPALES ─────────────────────────────────────────
// El middleware de upload sube ambas imágenes a R2 en paralelo antes del handler
router.post(
    '/',
    adminAuth,
    ...upload.fields([
        { name: 'map_image',     maxCount: 1 },
        { name: 'circuit_image', maxCount: 1 },
    ]),
    validateRace,
    racesController.postRace
);
router.delete('/:id', adminAuth, racesController.deleteRace);

// ── 4. POSTEO DE RESULTADOS DE SESIÓN ──────────────────────────────────────
router.post('/results',           adminAuth, validateResult, racesController.postResult);
router.post('/sprint',            adminAuth, racesController.postSprint);
router.post('/qualifying',        adminAuth, racesController.postQualifying);
router.post('/sprint-qualifying', adminAuth, racesController.postSprintQualifying);
router.post('/practices',         adminAuth, racesController.postPractices);

// ── 5. BORRADO INDIVIDUAL ───────────────────────────────────────────────────
router.delete('/:race_id/results/:driver_id',          adminAuth, racesController.deleteResult('results'));
router.delete('/:race_id/sprint/:driver_id',           adminAuth, racesController.deleteResult('sprint'));
router.delete('/:race_id/qualifying/:driver_id',        adminAuth, racesController.deleteResult('qualifying'));
router.delete('/:race_id/sprint-qualifying/:driver_id', adminAuth, racesController.deleteResult('sprint-qualifying'));
router.delete('/:race_id/practices/:driver_id',         adminAuth, racesController.deleteResult('practices'));

export default router;
