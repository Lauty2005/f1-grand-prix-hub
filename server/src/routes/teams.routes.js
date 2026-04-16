import { Router } from 'express';
import { createUpload } from '../config/upload.js';
import { adminAuth } from '../middleware/auth.middleware.js';
import * as teamsController from '../controllers/teams.controller.js';

const router = Router();
const upload = createUpload('teams');

router.get('/',       teamsController.listTeams);
router.post('/',      adminAuth, ...upload.single('logo_image'), teamsController.addTeam);
router.delete('/:id', adminAuth, teamsController.removeTeam);

export default router;
