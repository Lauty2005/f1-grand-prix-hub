import { Router } from 'express';
import * as standingsController from '../controllers/standings.controller.js';

const router = Router();

router.get('/constructors-standings', standingsController.getConstructors);

export default router;