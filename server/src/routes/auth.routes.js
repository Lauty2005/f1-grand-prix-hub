import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout, checkAuth, generateAgentToken } from '../controllers/auth.controller.js';

const router = Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Demasiados intentos de acceso. Esperá 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});

router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/check', checkAuth);
router.get('/agent-token', generateAgentToken);

export default router;
