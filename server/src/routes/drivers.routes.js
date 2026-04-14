// server/src/routes/drivers.routes.js
import { Router } from 'express';
import { createUpload } from '../config/upload.js';
import { adminAuth } from '../middleware/auth.middleware.js';
import * as driversController from '../controllers/drivers.controller.js';

const router = Router();
const upload = createUpload('pilots'); // Imágenes en R2 bajo el prefijo "pilots/"

// ── 1. OBTENER PILOTOS ──────────────────────────────────────────────────────
router.get('/', driversController.getAllDrivers);

// ── 2. RUTAS ESPECIALES (ANTES de /:id para evitar colisiones) ─────────────
router.get('/teams/list',    driversController.listTeams);
router.get('/compare',       driversController.compareDrivers);
router.get('/seasons/list',  adminAuth, driversController.listDriverSeasons);
router.post('/seasons',      adminAuth, driversController.assignDriverSeason);

// ── 3. HISTORIAL DE UN PILOTO ───────────────────────────────────────────────
router.get('/:id/results', driversController.getDriverHistorial);

// ── 4. ELIMINAR PILOTO ──────────────────────────────────────────────────────
router.delete('/:id', adminAuth, driversController.removeDriver);

// ── 5. CREAR NUEVO PILOTO ───────────────────────────────────────────────────
// El middleware de upload sube la imagen a R2 y deja la URL en req.fileUrl
router.post(
    '/',
    adminAuth,
    ...upload.single('profile_image'),
    driversController.addDriver
);

export default router;
