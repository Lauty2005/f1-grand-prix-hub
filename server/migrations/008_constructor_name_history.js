import { pool } from '../src/config/db.js';

const client = await pool.connect();
try {
    await client.query('BEGIN');
    await client.query(`ALTER TABLE constructors ADD COLUMN IF NOT EXISTS name_history JSONB DEFAULT '{}'`);
    await client.query(`
        UPDATE constructors
        SET name_history = '{"2024": "Kick Sauber", "2025": "Kick Sauber"}'
        WHERE name = 'Audi'
    `);
    await client.query('COMMIT');
    console.log('✅ name_history agregado. Audi tendrá nombre histórico "Kick Sauber" en 2024/2025.');
} catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e.message);
} finally {
    client.release();
    process.exit(0);
}
