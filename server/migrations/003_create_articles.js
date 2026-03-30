import { pool } from '../src/config/db.js';

async function createArticlesTable() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS articles (
                id          SERIAL PRIMARY KEY,
                title       VARCHAR(255) NOT NULL,
                slug        VARCHAR(255) UNIQUE NOT NULL,
                excerpt     TEXT,
                content     TEXT NOT NULL,
                author      VARCHAR(100) NOT NULL DEFAULT 'Redacción',
                cover_image_url TEXT,
                category    VARCHAR(50) NOT NULL DEFAULT 'noticias',
                tags        TEXT[] DEFAULT '{}',
                published   BOOLEAN NOT NULL DEFAULT false,
                featured    BOOLEAN NOT NULL DEFAULT false,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS articles_slug_idx       ON articles(slug);
            CREATE INDEX IF NOT EXISTS articles_category_idx   ON articles(category);
            CREATE INDEX IF NOT EXISTS articles_published_idx  ON articles(published);
            CREATE INDEX IF NOT EXISTS articles_created_at_idx ON articles(created_at DESC);
        `);

        await client.query('COMMIT');
        console.log('✅ Tabla articles creada correctamente');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error creando tabla articles:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

createArticlesTable();
