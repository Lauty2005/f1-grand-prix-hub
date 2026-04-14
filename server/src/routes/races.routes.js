import { Router } from 'express';
import multer from 'multer';
import { adminAuth } from '../middleware/auth.middleware.js';
import { validateResult, validateRace } from '../middleware/validate.middleware.js';
import * as racesController from '../controllers/races.controller.js';
import * as circuitController  from '../controllers/circuit.controller.js';
import * as strategyController from '../controllers/strategy.controller.js';

const router = Router();

const ALLOWED_MIME = ['image/jpeg','image/png','image/webp','image/avif','image/gif'];
const fileFilter = (req, file, cb) => {
    ALLOWED_MIME.includes(file.mimetype) ? cb(null, true) : cb(new Error(`Tipo no permitido: ${file.mimetype}`), false);
};

const uploadFields = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
}).fields([
    { name: 'map_image', maxCount: 1 },
    { name: 'circuit_image', maxCount: 1 }
]);

// 1. LECTURAS BÁSICAS
router.get('/', racesController.getAll);
router.get('/images/list', racesController.getServerImages); // Antes de /:id para evitar choques
router.get('/circuit-winners/all', adminAuth, circuitController.getAllCircuitWinners);
router.get('/:id', racesController.getById);

// 2. DETALLES DE SESIÓN
router.get('/:id/results', racesController.getRaceSession('results'));
router.get('/:id/qualifying', racesController.getRaceSession('qualifying'));
router.get('/:id/practices', racesController.getRaceSession('practices'));
router.get('/:id/sprint', racesController.getRaceSession('sprint'));
router.get('/:id/sprint-qualifying', racesController.getRaceSession('sprint-qualifying'));
router.get('/:id/circuit-analysis', circuitController.getCircuitAnalysis);
router.get('/:id/strategy',         strategyController.getRaceStrategy);

// 3. POSTEO DE DATOS PRINCIPALES
router.post('/', uploadFields, adminAuth, validateRace, racesController.postRace);
router.delete('/:id', adminAuth, racesController.deleteRace);

// CIRCUIT ANALYSIS
router.post('/circuit-winners', adminAuth, circuitController.addCircuitWinner);
router.delete('/circuit-winners/:id', adminAuth, circuitController.deleteCircuitWinner);
router.patch('/:id/circuit-info', adminAuth, circuitController.updateRaceCircuitInfo);

// 4. POSTEO DE RESULTADOS DE SESIÓN
router.post('/results', adminAuth, validateResult, racesController.postResult);
router.post('/sprint', adminAuth, racesController.postSprint);
router.post('/qualifying', adminAuth, racesController.postQualifying);
router.post('/sprint-qualifying', adminAuth, racesController.postSprintQualifying);
router.post('/practices', adminAuth, racesController.postPractices);

// 5. BORRADO INDIVIDUAL
router.delete('/:race_id/results/:driver_id', adminAuth, racesController.deleteResult('results'));
router.delete('/:race_id/sprint/:driver_id', adminAuth, racesController.deleteResult('sprint'));
router.delete('/:race_id/qualifying/:driver_id', adminAuth, racesController.deleteResult('qualifying'));
router.delete('/:race_id/sprint-qualifying/:driver_id', adminAuth, racesController.deleteResult('sprint-qualifying'));
router.delete('/:race_id/practices/:driver_id', adminAuth, racesController.deleteResult('practices'));

export default router;