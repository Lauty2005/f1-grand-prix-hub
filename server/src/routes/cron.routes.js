// server/src/routes/cron.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// CRON ENDPOINTS — Solo para llamadas internas (GitHub Actions)
//
//   POST /api/cron/weekly-preview    → lunes, preview 7 días antes del GP
//   POST /api/cron/qualy-article     → sábado, análisis de clasificación
//   POST /api/cron/weekly-standings  → lunes, standings post-carrera
//   GET  /api/cron/status            → admin dashboard
// ─────────────────────────────────────────────────────────────────────────────

import { Router }   from 'express';
import { adminAuth } from '../middleware/auth.middleware.js';
import { query }    from '../config/db.js';
import {
    checkAndGenerateWeeklyPreview,
    checkAndGenerateQualyArticle,
    checkAndGenerateWeeklyStandings,
} from '../services/scheduler.service.js';

const router = Router();

// ── Auth para GitHub Actions ──────────────────────────────────────────────────
function cronAuth(req, res, next) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        return res.status(503).json({ error: 'CRON_SECRET no configurado.' });
    }
    const token = (req.headers['authorization'] || '').replace('Bearer ', '');
    if (token !== secret) {
        console.warn(`[Cron] Acceso no autorizado desde IP: ${req.ip}`);
        return res.status(401).json({ error: 'No autorizado.' });
    }
    next();
}

// ── Handler genérico para evitar repetición ───────────────────────────────────
function makeCronHandler(label, fn) {
    return async (req, res) => {
        const startTime = Date.now();
        console.log(`[Cron] /${label} iniciado: ${new Date().toISOString()}`);
        try {
            const result   = await fn();
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`[Cron] /${label} completado en ${duration}s. Triggered: ${result.triggered}`);
            return res.json({ success: true, duration_seconds: parseFloat(duration), ...result });
        } catch (err) {
            console.error(`[Cron] /${label} error:`, err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/weekly-preview
// GitHub Actions: lunes 09:00 UTC — 7 días antes del GP
// ─────────────────────────────────────────────────────────────────────────────
router.post('/weekly-preview', cronAuth, makeCronHandler('weekly-preview', checkAndGenerateWeeklyPreview));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/qualy-article
// GitHub Actions: sábado 18:00 UTC — tras la clasificación
// ─────────────────────────────────────────────────────────────────────────────
router.post('/qualy-article', cronAuth, makeCronHandler('qualy-article', checkAndGenerateQualyArticle));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/weekly-standings
// GitHub Actions: lunes 10:00 UTC — día después de la carrera
// ─────────────────────────────────────────────────────────────────────────────
router.post('/weekly-standings', cronAuth, makeCronHandler('weekly-standings', checkAndGenerateWeeklyStandings));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/status
// Admin dashboard — protegido con adminAuth
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', adminAuth, async (req, res) => {
    try {
        const cronConfigured = !!process.env.CRON_SECRET;
        const telegramConfigured = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

        // Próximos GPs (14 días)
        const { rows: upcomingRaces } = await query(`
            SELECT id, name, round, date,
                   (date::date - CURRENT_DATE) AS days_until
            FROM races
            WHERE date::date >= CURRENT_DATE
              AND date::date <= CURRENT_DATE + INTERVAL '14 days'
            ORDER BY date ASC LIMIT 3
        `);

        // GP en exactamente 7 días (dispararía el preview hoy si fuera lunes)
        const { rows: triggerPreview } = await query(`
            SELECT id, name, date, (date::date - CURRENT_DATE) AS days_until
            FROM races WHERE date::date = CURRENT_DATE + INTERVAL '7 days' LIMIT 1
        `);

        // GP este fin de semana (dispararía qualy si fuera sábado)
        const { rows: triggerQualy } = await query(`
            SELECT r.id, r.name, r.date,
                   (SELECT COUNT(*) FROM qualifying q WHERE q.race_id = r.id) AS qualy_rows
            FROM races r
            WHERE r.date::date BETWEEN CURRENT_DATE + INTERVAL '1 day'
                                   AND CURRENT_DATE + INTERVAL '2 days'
            LIMIT 1
        `);

        // Carrera reciente (dispararía standings hoy si fuera lunes)
        const { rows: triggerStandings } = await query(`
            SELECT r.id, r.name, r.date,
                   (SELECT COUNT(*) FROM results res WHERE res.race_id = r.id) AS result_rows
            FROM races r
            WHERE r.date::date BETWEEN CURRENT_DATE - INTERVAL '2 days'
                                   AND CURRENT_DATE - INTERVAL '1 day'
            ORDER BY r.date DESC LIMIT 1
        `);

        // Últimos artículos generados por el scheduler (últimos 30 días)
        const { rows: recentArticles } = await query(`
            SELECT id, title, slug, published, category, created_at
            FROM articles
            WHERE category IN ('preview', 'noticias')
              AND author = 'IA Redacción'
              AND created_at >= NOW() - INTERVAL '30 days'
            ORDER BY created_at DESC LIMIT 8
        `);

        // Stats históricas por tipo
        const { rows: stats } = await query(`
            SELECT
                COUNT(*)                                                    AS total,
                COUNT(*) FILTER (WHERE published = true)                    AS published,
                COUNT(*) FILTER (WHERE published = false)                   AS drafts,
                COUNT(*) FILTER (WHERE category = 'preview')                AS previews,
                COUNT(*) FILTER (WHERE category = 'noticias')               AS noticias,
                MAX(created_at)                                              AS last_generated_at
            FROM articles
            WHERE author = 'IA Redacción'
        `);

        return res.json({
            success: true,
            config: {
                cron_secret:  cronConfigured,
                telegram:     telegramConfigured,
            },
            triggers: {
                preview:   { would_fire: triggerPreview.length > 0,  race: triggerPreview[0]  || null },
                qualy:     { would_fire: triggerQualy.length > 0,    race: triggerQualy[0]    || null },
                standings: { would_fire: triggerStandings.length > 0, race: triggerStandings[0] || null },
            },
            upcoming_races:   upcomingRaces,
            recent_articles:  recentArticles,
            stats: {
                total:            parseInt(stats[0]?.total           || 0),
                published:        parseInt(stats[0]?.published       || 0),
                drafts:           parseInt(stats[0]?.drafts          || 0),
                previews:         parseInt(stats[0]?.previews        || 0),
                noticias:         parseInt(stats[0]?.noticias        || 0),
                last_generated_at: stats[0]?.last_generated_at       || null,
            },
        });

    } catch (err) {
        console.error('[Cron Status] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
