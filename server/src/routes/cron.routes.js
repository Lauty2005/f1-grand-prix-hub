// server/src/routes/cron.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// CRON ENDPOINTS
//   POST /api/cron/weekly-preview  → GitHub Actions trigger (CRON_SECRET)
//   GET  /api/cron/status          → Admin dashboard (adminAuth)
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { adminAuth } from '../middleware/auth.middleware.js';
import { query } from '../config/db.js';
import { checkAndGenerateWeeklyPreview } from '../services/scheduler.service.js';

const router = Router();

// ── Auth para GitHub Actions ──────────────────────────────────────────────────
function cronAuth(req, res, next) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        return res.status(503).json({ error: 'CRON_SECRET no configurado en el servidor.' });
    }
    const token = (req.headers['authorization'] || '').replace('Bearer ', '');
    if (token !== secret) {
        console.warn(`[Cron] Acceso no autorizado desde IP: ${req.ip}`);
        return res.status(401).json({ error: 'No autorizado.' });
    }
    next();
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/weekly-preview
// Llamado por GitHub Actions todos los lunes a las 9am UTC
// ─────────────────────────────────────────────────────────────────────────────
router.post('/weekly-preview', cronAuth, async (req, res) => {
    const startTime = Date.now();
    console.log(`[Cron] /weekly-preview iniciado: ${new Date().toISOString()}`);

    try {
        const result = await checkAndGenerateWeeklyPreview();
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[Cron] Completado en ${duration}s. Triggered: ${result.triggered}`);

        return res.json({ success: true, duration_seconds: parseFloat(duration), ...result });
    } catch (err) {
        console.error('[Cron] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/status
// Protegido con adminAuth — para el panel de administración
// Devuelve:
//   - si CRON_SECRET está configurado
//   - próximos GPs en los próximos 14 días
//   - si el cron hubiera disparado hoy (GP en 7 días)
//   - últimos 5 previews generados en los últimos 30 días
//   - estadísticas históricas de previews
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', adminAuth, async (req, res) => {
    try {
        const cronConfigured = !!process.env.CRON_SECRET;

        // Próximos GPs en los próximos 14 días
        const { rows: upcomingRaces } = await query(`
            SELECT id, name, round, date,
                   (date::date - CURRENT_DATE) AS days_until
            FROM races
            WHERE date::date >= CURRENT_DATE
              AND date::date <= CURRENT_DATE + INTERVAL '14 days'
            ORDER BY date ASC
            LIMIT 3
        `);

        // GP en exactamente 7 días (el que dispararía el cron si fuera hoy lunes)
        const { rows: triggerRace } = await query(`
            SELECT id, name, date,
                   (date::date - CURRENT_DATE) AS days_until
            FROM races
            WHERE date::date = CURRENT_DATE + INTERVAL '7 days'
            LIMIT 1
        `);

        // Últimos previews generados en los últimos 30 días
        const { rows: recentPreviews } = await query(`
            SELECT id, title, slug, published, created_at, author
            FROM articles
            WHERE category = 'preview'
              AND created_at >= NOW() - INTERVAL '30 days'
            ORDER BY created_at DESC
            LIMIT 5
        `);

        // Estadísticas históricas totales
        const { rows: stats } = await query(`
            SELECT
                COUNT(*)                                         AS total_previews,
                COUNT(*) FILTER (WHERE published = true)        AS published_count,
                COUNT(*) FILTER (WHERE published = false)       AS draft_count,
                MAX(created_at)                                  AS last_generated_at
            FROM articles
            WHERE category = 'preview'
        `);

        return res.json({
            success: true,
            scheduler: {
                configured:          cronConfigured,
                would_trigger_today: triggerRace.length > 0,
                trigger_race:        triggerRace[0] || null,
            },
            upcoming_races:  upcomingRaces,
            recent_previews: recentPreviews,
            stats: {
                total_previews:    parseInt(stats[0]?.total_previews   || 0),
                published_count:   parseInt(stats[0]?.published_count  || 0),
                draft_count:       parseInt(stats[0]?.draft_count      || 0),
                last_generated_at: stats[0]?.last_generated_at || null,
            },
        });

    } catch (err) {
        console.error('[Cron Status] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
