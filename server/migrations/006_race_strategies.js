import { pool } from '../src/config/db.js';

async function migrateRaceStrategies() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS race_strategies (
                id              SERIAL PRIMARY KEY,
                race_id         INT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
                driver_id       INT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
                stint_number    INT NOT NULL,
                tire_compound   VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
                start_lap       INT NOT NULL,
                end_lap         INT NOT NULL,
                pit_duration    VARCHAR(20),   -- e.g. "2.4s", NULL for last stint (no outgoing stop)
                notes           TEXT,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(race_id, driver_id, stint_number)
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS rs_race_id_idx    ON race_strategies(race_id);
            CREATE INDEX IF NOT EXISTS rs_driver_id_idx  ON race_strategies(driver_id);
            CREATE INDEX IF NOT EXISTS rs_compound_idx   ON race_strategies(tire_compound);
        `);

        await client.query('COMMIT');
        console.log('✅ Migración race_strategies completada');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error en migración race_strategies:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrateRaceStrategies();
