import { Router } from 'express';
import { adminAuth } from '../middleware/auth.middleware.js';
import * as timelineController from '../controllers/timeline.controller.js';

const router = Router();

// Pública
router.get('/',           timelineController.getTimeline);

// Admin
router.get('/admin/all',  adminAuth, timelineController.getAllMomentsAdmin);
router.post('/',          adminAuth, timelineController.addMoment);
router.delete('/:id',     adminAuth, timelineController.deleteMoment);

export default router;
