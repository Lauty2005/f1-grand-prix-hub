import { pool } from '../src/config/db.js';

const client = await pool.connect();
try {
    await client.query('BEGIN');
    await client.query(`
        ALTER TABLE drivers ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
    `);
    // Tsunoda inactivo en dev
    await client.query(`UPDATE drivers SET active = false WHERE last_name = 'Tsunoda';`);
    await client.query('COMMIT');
    console.log('✅ Columna active agregada a drivers. Tsunoda marcado como inactivo.');
} catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e.message);
} finally {
    client.release();
    process.exit(0);
}
