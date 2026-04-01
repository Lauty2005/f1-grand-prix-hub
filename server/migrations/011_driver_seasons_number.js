import { pool } from '../src/config/db.js';

const client = await pool.connect();
try {
    await client.query('BEGIN');

    await client.query(`
        ALTER TABLE driver_seasons ADD COLUMN IF NOT EXISTS number INT;
    `);

    // Seed: copiar permanent_number de cada piloto como punto de partida
    await client.query(`
        UPDATE driver_seasons ds
        SET number = d.permanent_number
        FROM drivers d
        WHERE ds.driver_id = d.id
          AND d.permanent_number IS NOT NULL
    `);

    // Verstappen usa el #33 como permanente pero #1 en 2025 (campeón) y #3 en 2026
    await client.query(`
        UPDATE driver_seasons SET number = 1
        WHERE driver_id = (SELECT id FROM drivers WHERE last_name = 'Verstappen') AND year = 2025
    `);
    await client.query(`
        UPDATE driver_seasons SET number = 3
        WHERE driver_id = (SELECT id FROM drivers WHERE last_name = 'Verstappen') AND year = 2026
    `);

    await client.query('COMMIT');
    console.log('✅ driver_seasons.number agregado y poblado correctamente.');
} catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e.message);
} finally {
    client.release();
    process.exit(0);
}
