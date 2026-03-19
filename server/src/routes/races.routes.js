import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { adminAuth } from '../middleware/auth.middleware.js';
import { validateResult } from '../middleware/validate.middleware.js';
import * as racesController from '../controllers/races.controller.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let subFolder = file.fieldname === 'circuit_image' ? 'circuits' : 'schedule';
        const uploadPath = path.join(__dirname, '../../public/images', subFolder);
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => cb(null, file.originalname.toLowerCase().replace(/\s+/g, '-'))
});

const uploadFields = multer({ storage }).fields([
    { name: 'map_image', maxCount: 1 },
    { name: 'circuit_image', maxCount: 1 }
]);

// 1. LECTURAS BÁSICAS
router.get('/', racesController.getAll);
router.get('/images/list', racesController.getServerImages); // Antes de /:id para evitar choques
router.get('/:id', racesController.getById);

// 2. DETALLES DE SESIÓN
router.get('/:id/results', racesController.getRaceSession('results'));
router.get('/:id/qualifying', racesController.getRaceSession('qualifying'));
router.get('/:id/practices', racesController.getRaceSession('practices'));
router.get('/:id/sprint', racesController.getRaceSession('sprint'));
router.get('/:id/sprint-qualifying', racesController.getRaceSession('sprint-qualifying'));

// 3. POSTEO DE DATOS PRINCIPALES
router.post('/', uploadFields, adminAuth, validateResult, racesController.postRace);
router.delete('/:id', adminAuth, racesController.deleteRace);

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