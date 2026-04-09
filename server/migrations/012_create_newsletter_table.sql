-- server/migrations/012_create_newsletter_table.sql
-- ────────────────────────────────────────────────────────────────
-- MIGRACIÓN: Crear tabla para subscriptores de newsletter
-- Ejecutar: psql $DATABASE_URL < server/migrations/012_create_newsletter_table.sql
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unsubscribed_at TIMESTAMP WITH TIME ZONE,
    source VARCHAR(100) DEFAULT 'website',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices separados (sintaxis PostgreSQL correcta)
CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers (email);
CREATE INDEX IF NOT EXISTS idx_newsletter_active ON newsletter_subscribers (is_active);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribed_at ON newsletter_subscribers (subscribed_at);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_newsletter_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS newsletter_updated_at ON newsletter_subscribers;
CREATE TRIGGER newsletter_updated_at
    BEFORE UPDATE ON newsletter_subscribers
    FOR EACH ROW
    EXECUTE FUNCTION update_newsletter_timestamp();

COMMENT ON TABLE newsletter_subscribers IS
'Tabla de subscriptores a newsletter. Campo is_active permite soft delete.';

COMMENT ON COLUMN newsletter_subscribers.email IS
'Email del subscriptor (único)';

COMMENT ON COLUMN newsletter_subscribers.is_active IS
'true = suscripto, false = desuscripto (soft delete)';

COMMENT ON COLUMN newsletter_subscribers.source IS
'Origen de la subscripción (website, social media, etc)';
