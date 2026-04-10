-- server/migrations/013_create_email_logs.sql
-- ────────────────────────────────────────────────────────────
-- Tabla de auditoría de emails enviados via Resend
-- Ejecutar: psql $DATABASE_URL < migrations/013_create_email_logs.sql
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_logs (
    id               SERIAL PRIMARY KEY,
    subscriber_id    UUID         REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
    article_id       INT          REFERENCES articles(id) ON DELETE CASCADE,
    resend_email_id  VARCHAR(255),
    status           VARCHAR(20)  CHECK (status IN ('sent', 'failed', 'bounced', 'opened', 'clicked')),
    error_message    TEXT,
    sent_at          TIMESTAMPTZ  DEFAULT NOW()
);

-- Índices para queries rápidas
CREATE INDEX IF NOT EXISTS idx_email_logs_subscriber ON email_logs(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_article    ON email_logs(article_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status     ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at    ON email_logs(sent_at DESC);

COMMENT ON TABLE email_logs IS
    'Auditoría de emails enviados via Resend. Permite trackear delivery y troubleshoot.';
COMMENT ON COLUMN email_logs.resend_email_id IS
    'ID retornado por Resend API para tracking en dashboard';
COMMENT ON COLUMN email_logs.status IS
    'Estado del email: sent, failed, bounced, opened, clicked';
COMMENT ON COLUMN email_logs.error_message IS
    'Mensaje de error si status=failed';
