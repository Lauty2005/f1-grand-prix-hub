// server/src/routes/cron.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// CRON ENDPOINT — Solo para llamadas internas (GitHub Actions / Vercel Cron)
// Autenticado con CRON_SECRET para evitar ejecuciones no autorizadas.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { checkAndGenerateWeeklyPreview } from '../services/scheduler.service.js';

const router = Router();

/**
 * Middleware: valida que el request venga con el CRON_SECRET correcto.
 * GitHub Actions lo envía en el header Authorization: Bearer <secret>
 */
function cronAuth(req, res, next) {
    const secret = process.env.CRON_SECRET;

    if (!secret) {
        console.error('[Cron] CRON_SECRET no está configurado en el servidor.');
        return res.status(503).json({ error: 'CRON_SECRET no configurado en el servidor.' });
    }

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (token !== secret) {
        console.warn(`[Cron] Intento de acceso no autorizado desde IP: ${req.ip}`);
        return res.status(401).json({ error: 'No autorizado.' });
    }

    next();
}

/**
 * POST /api/cron/weekly-preview
 * 
 * GitHub Actions llama a este endpoint cada lunes a las 9am UTC.
 * Verifica si hay un GP en 7 días y, si lo hay, genera un preview
 * del año anterior como borrador en la sección de artículos.
 * 
 * Response exitosa:
 * {
 *   success: true,
 *   triggered: true | false,
 *   message: "...",
 *   article?: { id, slug }
 * }
 */
router.post('/weekly-preview', cronAuth, async (req, res) => {
    const startTime = Date.now();
    console.log(`[Cron] /weekly-preview iniciado a las ${new Date().toISOString()}`);

    try {
        const result = await checkAndGenerateWeeklyPreview();

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[Cron] Completado en ${duration}s. Triggered: ${result.triggered}`);

        return res.json({
            success: true,
            duration_seconds: parseFloat(duration),
            ...result,
        });

    } catch (err) {
        console.error('[Cron] Error en weekly-preview:', err.message);

        return res.status(500).json({
            success: false,
            error: err.message,
        });
    }
});

export default router;
