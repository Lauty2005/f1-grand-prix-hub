import { Router } from 'express';
import { createUpload } from '../config/upload.js';
import { adminAuth } from '../middleware/auth.middleware.js';
import * as driversController from '../controllers/drivers.controller.js';

const router = Router();
const upload = createUpload('pilots');

// 1. OBTENER PILOTOS
router.get('/', driversController.getAllDrivers);

// 2. OBTENER EQUIPOS (Debe ir ANTES del delete /:id / results por ruteo seguro)
router.get('/teams/list', driversController.listTeams);

// 3. HISTORIAL DE UN PILOTO
router.get('/:id/results', driversController.getDriverHistorial);

// 4. ELIMINAR PILOTO
router.delete('/:id', adminAuth, driversController.removeDriver);

// 5. CREAR NUEVO PILOTO
router.post('/', adminAuth, upload.single('profile_image'), driversController.addDriver);

export default router;