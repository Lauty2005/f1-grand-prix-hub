import { Router } from 'express';
import { adminAuth } from '../middleware/auth.middleware.js';
import * as strategyController from '../controllers/strategy.controller.js';

const router = Router();

// Public
router.get('/team-history',       strategyController.getTeamStrategyHistory);

// Admin CRUD
router.get('/admin/stints',       adminAuth, strategyController.getStintsForAdmin);
router.post('/',                  adminAuth, strategyController.addStint);
router.delete('/:id',             adminAuth, strategyController.deleteStint);
router.delete('/:raceId/driver/:driverId', adminAuth, strategyController.deleteDriverStints);

export default router;
