// server/src/services/email.service.js
// ────────────────────────────────────────────────────────────────
// EMAIL SERVICE: Enviar emails transaccionales via Resend
// ────────────────────────────────────────────────────────────────

import { Resend } from 'resend';
import { query } from '../config/db.js';

const FROM_ADDRESS = 'F1 Grand Prix Hub <onboarding@resend.dev>';
const BASE_URL     = 'https://f1-grand-prix-hub.vercel.app';
const API_URL      = 'https://f1-grand-prix-hub.onrender.com';

function getResend() {
    if (!process.env.EMAIL_API_KEY) return null;
    return new Resend(process.env.EMAIL_API_KEY);
}

export async function sendEmail({ to, subject, html, plainText }) {
    const resend = getResend();
    if (!resend) {
        console.log(`📧 [EMAIL STUB] Para: ${to} | Asunto: ${subject}`);
        return;
    }

    await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
        text: plainText
    });
}

// ── Notificación de nuevo artículo a todos los suscriptores ──────
export async function notifyNewArticle(article) {
    const resend = getResend();
    if (!resend) {
        console.log(`📧 [EMAIL STUB] Notificación artículo: "${article.title}"`);
        return { sent: 0, errors: 0 };
    }

    // Obtener suscriptores activos
    const result = await query(
        `SELECT email FROM newsletter_subscribers WHERE is_active = true`
    );
    const subscribers = result.rows.map(r => r.email);

    if (subscribers.length === 0) {
        console.log('📧 Sin suscriptores activos para notificar.');
        return { sent: 0, errors: 0 };
    }

    const categoryLabels = {
        noticias: '📰 Noticias',
        analisis: '🔍 Análisis',
        preview:  '🏎️ Preview',
        tecnica:  '⚙️ Técnica',
    };
    const categoryLabel = categoryLabels[article.category] || article.category;
    const articleUrl    = `${BASE_URL}/articulo.html?slug=${encodeURIComponent(article.slug)}`;

    const coverBlock = article.cover_image_url
        ? `<img src="${article.cover_image_url}" alt="${article.title}"
               style="width:100%; max-height:280px; object-fit:cover; border-radius:8px; margin-bottom:24px;" />`
        : '';

    let sent = 0;
    let errors = 0;

    // Enviar en lotes de 10 para no saturar la API
    for (let i = 0; i < subscribers.length; i += 10) {
        const batch = subscribers.slice(i, i + 10);

        await Promise.allSettled(batch.map(async (email) => {
            const unsubscribeUrl = `${API_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}`;

            const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0; padding:0; background:#0f0f17; font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f17; padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#15151e; border-top:4px solid #e10600; border-radius:12px 12px 0 0; padding:24px 32px;">
            <span style="color:#e10600; font-weight:900; font-size:18px; letter-spacing:2px; text-transform:uppercase;">
              F1 Grand Prix Hub
            </span>
            <span style="color:#444; margin:0 10px;">|</span>
            <span style="color:#666; font-size:13px; text-transform:uppercase; letter-spacing:1px;">${categoryLabel}</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#1a1a2e; padding:32px;">
            ${coverBlock}
            <h1 style="color:#ffffff; font-size:26px; font-weight:900; line-height:1.2; margin:0 0 16px 0;">
              ${article.title}
            </h1>
            ${article.excerpt ? `<p style="color:#aaaaaa; font-size:16px; line-height:1.6; margin:0 0 28px 0;">${article.excerpt}</p>` : ''}
            <a href="${articleUrl}"
               style="display:inline-block; background:#e10600; color:#ffffff; font-weight:700;
                      font-size:15px; padding:14px 32px; border-radius:8px; text-decoration:none;
                      letter-spacing:0.5px;">
              Leer artículo completo →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#111118; border-radius:0 0 12px 12px; padding:20px 32px; border-top:1px solid #222;">
            <p style="color:#444; font-size:12px; margin:0; line-height:1.6;">
              Recibís este email porque te suscribiste a F1 Grand Prix Hub.<br>
              <a href="${unsubscribeUrl}" style="color:#666; text-decoration:underline;">Desuscribirme</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

            try {
                await resend.emails.send({
                    from:    FROM_ADDRESS,
                    to:      email,
                    subject: `🏎️ ${article.title}`,
                    html,
                    text: `${article.title}\n\n${article.excerpt || ''}\n\nLeer: ${articleUrl}\n\nDesuscribirse: ${unsubscribeUrl}`,
                });
                sent++;
            } catch (err) {
                console.error(`📧 Error enviando a ${email}:`, err.message);
                errors++;
            }
        }));
    }

    console.log(`📧 Notificación enviada: ${sent} ok, ${errors} errores`);
    return { sent, errors };
}
