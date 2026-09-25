import { Router } from 'express';
import { adminAuth } from '../middleware/auth.middleware.js';
import * as syncController from '../controllers/sync.controller.js';

// Montado en /api/admin/sync. Todo requiere JWT de admin (el agente usa el
// mismo token que obtiene de GET /api/auth/agent-token).
const router = Router();
router.use(adminAuth);

router.get('/pending', syncController.getPending);
router.put('/races/:raceId', syncController.putRaceData);

export default router;
