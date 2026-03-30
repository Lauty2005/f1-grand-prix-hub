import { pool } from '../src/config/db.js';

async function migrateTimeline() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS timeline_moments (
                id          SERIAL PRIMARY KEY,
                year        INT          NOT NULL,
                race_id     INT          REFERENCES races(id) ON DELETE SET NULL,
                type        VARCHAR(50)  NOT NULL DEFAULT 'milestone',
                title       VARCHAR(255) NOT NULL,
                description TEXT,
                driver_name VARCHAR(150),
                team_name   VARCHAR(150),
                icon        VARCHAR(20),
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS tm_year_idx    ON timeline_moments(year);
            CREATE INDEX IF NOT EXISTS tm_race_id_idx ON timeline_moments(race_id);
            CREATE INDEX IF NOT EXISTS tm_type_idx    ON timeline_moments(type);
        `);

        await client.query('COMMIT');
        console.log('✅ Migración timeline_moments completada');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error en migración timeline_moments:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrateTimeline();
