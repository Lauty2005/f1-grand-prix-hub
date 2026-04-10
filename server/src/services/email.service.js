// server/src/services/email.service.js
// ────────────────────────────────────────────────────────────
// EMAIL SERVICE v2: Enviar emails transaccionales via Resend
// Migrado desde Nodemailer + Gmail
// ────────────────────────────────────────────────────────────

import { Resend } from 'resend';
import { query } from '../config/db.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const BASE_URL = 'https://f1-grand-prix-hub.vercel.app';
const API_URL  = 'https://f1-grand-prix-hub.onrender.com';

// ────────────────────────────────────────────────────────────
// FUNCIONES PÚBLICAS
// ────────────────────────────────────────────────────────────

/**
 * Enviar email individual transaccional
 * @param {Object} params - { to, subject, html, plainText }
 */
const emailEnabled = () => process.env.EMAIL_NOTIFICATIONS_ENABLED !== 'false';

export async function sendEmail({ to, subject, html, plainText }) {
    if (!emailEnabled()) {
        console.log(`📧 [EMAIL DESACTIVADO] Se habría enviado a ${to}: "${subject}"`);
        return { success: false, disabled: true };
    }
    try {
        const response = await resend.emails.send({
            from:    'F1 Grand Prix Hub <noreply@f1grandprixhub.com>',
            to,
            subject,
            html,
            text:    plainText,
            replyTo: 'contacto@f1hub.local',
        });

        if (response.error) {
            console.error(`❌ Error enviando email a ${to}:`, response.error);
            return { success: false, error: response.error };
        }

        console.log(`✅ Email enviado a ${to} (ID: ${response.data.id})`);
        return { success: true, id: response.data.id };
    } catch (error) {
        console.error(`❌ Exception enviando email a ${to}:`, error.message);
        throw error;
    }
}

/**
 * NOTIFICACIÓN DE NUEVO ARTÍCULO
 * Envía email a TODOS los suscriptores activos
 *
 * Llamada desde: articles.controller.js
 * Comportamiento: ASYNC, no bloquea HTTP response
 */
export async function notifyNewArticle(article) {
    if (!emailEnabled()) {
        console.log(`📧 [EMAIL DESACTIVADO] No se notificó el artículo: "${article?.title}"`);
        return { sent: 0, failed: 0, total: 0, disabled: true };
    }
    try {
        if (!article || !article.id || !article.title) {
            console.warn('⚠️  notifyNewArticle: artículo inválido', article);
            return { sent: 0, failed: 0, total: 0 };
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log(`📧 INICIANDO NOTIFICACIÓN DE ARTÍCULO`);
        console.log(`📰 Título: "${article.title}"`);
        console.log(`📂 Categoría: ${article.category}`);
        console.log(`${'='.repeat(60)}\n`);

        // 1️⃣ OBTENER SUSCRIPTORES ACTIVOS
        const result = await query(
            `SELECT id, email FROM newsletter_subscribers WHERE is_active = true ORDER BY subscribed_at ASC`
        );
        const subscribers = result.rows;

        if (subscribers.length === 0) {
            console.log('⚠️  Sin suscriptores activos para notificar.');
            return { sent: 0, failed: 0, total: 0 };
        }

        console.log(`👥 Suscriptores encontrados: ${subscribers.length}`);

        // 2️⃣ PREPARAR DATOS DE EMAIL
        const categoryLabels = {
            noticias: '📰 Noticias',
            analisis: '🔍 Análisis',
            preview:  '🏎️ Preview',
            tecnica:  '⚙️ Técnica',
        };
        const categoryLabel = categoryLabels[article.category] || article.category;
        const articleUrl    = `${BASE_URL}/articulo.html?slug=${encodeURIComponent(article.slug)}`;

        // 3️⃣ ENVIAR EN BATCHES
        const batchSize = 50;
        let sent   = 0;
        let failed = 0;
        let batchNum = 0;

        for (let i = 0; i < subscribers.length; i += batchSize) {
            batchNum++;
            const batch    = subscribers.slice(i, i + batchSize);
            const batchEnd = Math.min(i + batchSize, subscribers.length);

            console.log(`\n🔄 Batch ${batchNum}: Enviando ${batch.length} emails (${i + 1}-${batchEnd}/${subscribers.length})`);

            const promises = batch.map(async (subscriber) => {
                try {
                    const unsubscribeUrl = `${API_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(subscriber.email)}`;
                    const htmlContent    = generateArticleEmailHTML(article, categoryLabel, articleUrl, unsubscribeUrl);

                    const response = await resend.emails.send({
                        from:    'F1 Grand Prix Hub <noreply@f1grandprixhub.com>',
                        to:      subscriber.email,
                        subject: `🏎️ ${article.title}`,
                        html:    htmlContent,
                        text:    `${article.title}\n\n${article.excerpt || ''}\n\nLeer: ${articleUrl}\n\nDesuscribirse: ${unsubscribeUrl}`,
                        replyTo: 'contacto@f1hub.local',
                    });

                    if (response.data?.id) {
                        await logEmailSent(subscriber.id, article.id, response.data.id, 'sent');
                        sent++;
                        return { success: true, email: subscriber.email };
                    } else if (response.error) {
                        throw new Error(response.error.message || 'Unknown Resend error');
                    }
                } catch (error) {
                    console.error(`   ❌ Error con ${subscriber.email}: ${error.message}`);
                    await logEmailSent(subscriber.id, article.id, null, 'failed', error.message);
                    failed++;
                    return { success: false, email: subscriber.email, error: error.message };
                }
            });

            const results      = await Promise.allSettled(promises);
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
            const failCount    = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success)).length;

            console.log(`   ✅ Batch ${batchNum}: ${successCount} ok, ${failCount} errores`);

            // Pausa entre batches para no saturar la API
            if (i + batchSize < subscribers.length) {
                await new Promise(r => setTimeout(r, 500));
            }
        }

        // 4️⃣ RESUMEN FINAL
        const total = subscribers.length;
        const rate  = (sent / total * 100).toFixed(1);

        console.log(`\n${'='.repeat(60)}`);
        console.log(`📧 NOTIFICACIÓN COMPLETADA`);
        console.log(`   ✅ Enviados:   ${sent}/${total} (${rate}%)`);
        console.log(`   ❌ Fallidos:   ${failed}/${total}`);
        console.log(`${'='.repeat(60)}\n`);

        return { sent, failed, total };
    } catch (error) {
        console.error('💥 Error crítico en notifyNewArticle:', error);
        return { sent: 0, failed: 0, total: 0 };
    }
}

// ────────────────────────────────────────────────────────────
// HELPERS PRIVADOS
// ────────────────────────────────────────────────────────────

function generateArticleEmailHTML(article, categoryLabel, articleUrl, unsubscribeUrl) {
    const coverBlock = article.cover_image_url
        ? `<img src="${article.cover_image_url}" alt="${article.title}"
                 style="width:100%; max-height:280px; object-fit:cover; border-radius:8px; margin-bottom:24px;" />`
        : '';

    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${article.title}</title>
</head>
<body style="margin:0; padding:0; background:#0f0f17; font-family:'Segoe UI', Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f17; padding:40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" style="max-width:600px;">

                    <!-- HEADER -->
                    <tr>
                        <td style="background:#15151e; border-top:4px solid #e10600; border-radius:12px 12px 0 0; padding:24px 32px;">
                            <table width="100%">
                                <tr>
                                    <td>
                                        <span style="color:#e10600; font-weight:900; font-size:18px; letter-spacing:2px; text-transform:uppercase;">
                                            🏁 F1 Grand Prix Hub
                                        </span>
                                    </td>
                                    <td align="right">
                                        <span style="color:#aaa; font-size:13px;">${categoryLabel}</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- BODY -->
                    <tr>
                        <td style="background:#1a1a2e; padding:32px;">
                            ${coverBlock}
                            <h1 style="color:#ffffff; font-size:26px; font-weight:900; line-height:1.3; margin:0 0 16px 0;">
                                ${escapeHTML(article.title)}
                            </h1>
                            ${article.excerpt ? `<p style="color:#aaaaaa; font-size:16px; line-height:1.6; margin:0 0 28px 0;">${escapeHTML(article.excerpt)}</p>` : ''}
                            <table width="100%">
                                <tr>
                                    <td>
                                        <a href="${articleUrl}"
                                           style="display:inline-block; background:#e10600; color:#ffffff; font-weight:700;
                                                  font-size:15px; padding:14px 32px; border-radius:8px; text-decoration:none;
                                                  letter-spacing:0.5px;">
                                            Leer artículo completo →
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                        <td style="background:#111118; border-radius:0 0 12px 12px; padding:20px 32px; border-top:1px solid #222;">
                            <p style="color:#666; font-size:12px; margin:0; line-height:1.6;">
                                Recibís este email porque te suscribiste a F1 Grand Prix Hub.<br>
                                <a href="${unsubscribeUrl}" style="color:#e10600; text-decoration:underline; font-weight:600;">
                                    Desuscribirme
                                </a>
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function escapeHTML(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

async function logEmailSent(subscriberId, articleId, resendEmailId, status, errorMsg = null) {
    try {
        await query(
            `INSERT INTO email_logs (subscriber_id, article_id, resend_email_id, status, error_message, sent_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [subscriberId, articleId, resendEmailId, status, errorMsg]
        );
    } catch (err) {
        console.warn('⚠️  Error logging email:', err.message);
    }
}
