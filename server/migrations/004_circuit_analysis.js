import { pool } from '../src/config/db.js';

async function migrateCircuitAnalysis() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Nuevas columnas en races
        await client.query(`
            ALTER TABLE races
                ADD COLUMN IF NOT EXISTS first_gp_year  INT,
                ADD COLUMN IF NOT EXISTS drs_zones       INT,
                ADD COLUMN IF NOT EXISTS circuit_notes   TEXT;
        `);

        // 2. Tabla de ganadores históricos por circuito
        await client.query(`
            CREATE TABLE IF NOT EXISTS circuit_winners (
                id              SERIAL PRIMARY KEY,
                circuit_name    VARCHAR(255) NOT NULL,
                year            INT          NOT NULL,
                winner_name     VARCHAR(150) NOT NULL,
                team_name       VARCHAR(150),
                pole_name       VARCHAR(150),
                fastest_lap     VARCHAR(50),
                notes           TEXT,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS cw_circuit_name_idx ON circuit_winners(circuit_name);
            CREATE INDEX IF NOT EXISTS cw_year_idx         ON circuit_winners(year DESC);
        `);

        await client.query('COMMIT');
        console.log('✅ Migración circuit_analysis completada');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error en migración circuit_analysis:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrateCircuitAnalysis();
