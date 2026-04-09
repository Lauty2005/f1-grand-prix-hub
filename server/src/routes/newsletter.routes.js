// server/src/routes/newsletter.routes.js
// ────────────────────────────────────────────────────────────────
// NEWSLETTER ROUTES: Gestionar subscripciones de usuarios
// POST /newsletter/subscribe - Suscribir usuario
// POST /newsletter/unsubscribe - Desuscribir usuario
// GET  /newsletter/stats      - Stats de subscriptores (solo admin)
// ────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { query } from '../config/db.js';
import { sendEmail } from '../services/email.service.js';

const router = Router();

/**
 * POST /newsletter/subscribe
 * Suscribir un usuario a la newsletter
 */
router.post('/subscribe', async (req, res) => {
    try {
        const { email } = req.body;

        // 1. VALIDACIÓN
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ success: false, message: 'Email inválido' });
        }

        const trimmedEmail = email.toLowerCase().trim();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmedEmail)) {
            return res.status(400).json({ success: false, message: 'Formato de email inválido' });
        }

        // 2. VERIFICAR DUPLICADOS
        const existingRes = await query(
            `SELECT id FROM newsletter_subscribers WHERE email = $1 AND is_active = true`,
            [trimmedEmail]
        );

        if (existingRes.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Ya estás suscripto a nuestro newsletter'
            });
        }

        // 3. GUARDAR EN DB
        const subscribeRes = await query(
            `INSERT INTO newsletter_subscribers (email, subscribed_at, is_active, source)
             VALUES ($1, NOW(), true, $2)
             ON CONFLICT (email) DO UPDATE SET
                is_active = true,
                subscribed_at = NOW()
             RETURNING id, email, subscribed_at`,
            [trimmedEmail, (req.headers['user-agent'] || 'unknown').substring(0, 100)]
        );

        const subscriber = subscribeRes.rows[0];

        // 4. ENVIAR EMAIL DE BIENVENIDA (async, no esperar)
        sendWelcomeEmail(trimmedEmail).catch(err => {
            console.error('Error enviando email de bienvenida:', err);
        });

        console.log(`📧 Nueva suscripción: ${trimmedEmail}`);

        return res.status(201).json({
            success: true,
            message: '✅ ¡Bienvenido! Revisa tu email para confirmar',
            data: { id: subscriber.id, email: subscriber.email }
        });

    } catch (error) {
        console.error('Newsletter subscribe error:', error);
        return res.status(500).json({ success: false, message: 'Error al suscribirse. Intenta más tarde.' });
    }
});

/**
 * GET /newsletter/unsubscribe?email=...
 * Para links desde emails
 */
router.get('/unsubscribe', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).send('Email requerido');

        await query(
            `UPDATE newsletter_subscribers SET is_active = false, unsubscribed_at = NOW() WHERE email = $1`,
            [email.toLowerCase().trim()]
        );

        return res.send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
                <h2>✅ Te desuscribiste correctamente</h2>
                <p style="color:#666;">Ya no recibirás emails de F1 Grand Prix Hub.</p>
                <a href="https://f1-grand-prix-hub.vercel.app" style="color:#e10600;">Volver al sitio</a>
            </body></html>
        `);
    } catch (error) {
        console.error('Unsubscribe GET error:', error);
        return res.status(500).send('Error al desuscribirse');
    }
});

/**
 * POST /newsletter/unsubscribe
 */
router.post('/unsubscribe', async (req, res) => {
    try {
        const { email, token } = req.body;

        if (!email && !token) {
            return res.status(400).json({ success: false, message: 'Email o token requerido' });
        }

        const trimmedEmail = email?.toLowerCase().trim();

        const result = await query(
            `UPDATE newsletter_subscribers
             SET is_active = false, unsubscribed_at = NOW()
             WHERE (email = $1 OR id::text = $2) AND is_active = true
             RETURNING email`,
            [trimmedEmail || null, token || null]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado o ya está desuscripto' });
        }

        return res.json({ success: true, message: 'Te desuscribiste del newsletter' });

    } catch (error) {
        console.error('Newsletter unsubscribe error:', error);
        return res.status(500).json({ success: false, message: 'Error al desuscribirse' });
    }
});

/**
 * GET /newsletter/stats (solo admin)
 */
router.get('/stats', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !isValidAdminToken(authHeader)) {
            return res.status(401).json({ success: false, message: 'No autorizado' });
        }

        const statsRes = await query(
            `SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_active = true) as active,
                COUNT(*) FILTER (WHERE is_active = false) as inactive,
                COUNT(*) FILTER (WHERE DATE(subscribed_at) = CURRENT_DATE) as today
             FROM newsletter_subscribers`
        );

        const stats = statsRes.rows[0];

        return res.json({
            success: true,
            data: {
                totalSubscribers: parseInt(stats.total),
                activeSubscribers: parseInt(stats.active),
                inactiveSubscribers: parseInt(stats.inactive),
                newToday: parseInt(stats.today)
            }
        });

    } catch (error) {
        console.error('Newsletter stats error:', error);
        return res.status(500).json({ success: false, message: 'Error obteniendo stats' });
    }
});

// ────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────

async function sendWelcomeEmail(email) {
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; color: #333;">
            <h1 style="color: #e10600; margin-bottom: 20px;">¡Bienvenido a F1 Grand Prix Hub!</h1>
            <p>¡Gracias por suscribirte a nuestro análisis semanal de Fórmula 1!</p>
            <p>Cada semana recibirás:</p>
            <ul style="line-height: 1.8;">
                <li>📊 Análisis técnico de cada GP</li>
                <li>🎯 Predicciones de carreras</li>
                <li>⚡ Datos estratégicos de neumáticos y pit stops</li>
                <li>🏆 Actualizaciones del campeonato</li>
            </ul>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="font-size: 0.85rem; color: #666;">
                Si no deseas recibir más emails, puedes
                <a href="https://f1-grand-prix-hub.onrender.com/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}" style="color: #e10600;">
                    desuscribirte aquí
                </a>
            </p>
        </div>
    `;

    await sendEmail({
        to: email,
        subject: '¡Bienvenido a F1 Grand Prix Hub!',
        html: htmlContent,
        plainText: 'Bienvenido a F1 Grand Prix Hub. Recibirás análisis semanal de F1.'
    });
}

function isValidAdminToken(authHeader) {
    const token = authHeader.replace('Bearer ', '');
    return token === process.env.ADMIN_API_TOKEN;
}

export default router;
