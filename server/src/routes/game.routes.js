// server/src/routes/game.routes.js
import { Router } from 'express';
import * as gameController from '../controllers/game.controller.js';

const router = Router();

// GET /api/game/mayor-menor/pool?year=2026
router.get('/mayor-menor/pool', gameController.getMayorMenorPool);

export default router;
