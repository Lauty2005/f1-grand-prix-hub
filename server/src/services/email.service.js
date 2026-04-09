// server/src/services/email.service.js
// ────────────────────────────────────────────────────────────────
// EMAIL SERVICE: Enviar emails transaccionales
// Configurar con un provider real (Resend, SendGrid, Nodemailer)
// ────────────────────────────────────────────────────────────────

import { Resend } from 'resend';

export async function sendEmail({ to, subject, html, plainText }) {
    if (!process.env.EMAIL_API_KEY) {
        console.log(`📧 [EMAIL STUB] Para: ${to} | Asunto: ${subject}`);
        return;
    }

    const resend = new Resend(process.env.EMAIL_API_KEY);
    await resend.emails.send({
        from: 'F1 Analytics <onboarding@resend.dev>',
        to,
        subject,
        html,
        text: plainText
    });
}
