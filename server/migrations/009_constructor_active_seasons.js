import { pool } from '../src/config/db.js';

const client = await pool.connect();
try {
    await client.query('BEGIN');

    await client.query(`ALTER TABLE constructors ADD COLUMN IF NOT EXISTS active_seasons INT[] DEFAULT '{}'`);

    // Equipos históricos y actuales
    await client.query(`
        UPDATE constructors SET active_seasons = ARRAY[2024,2025,2026]
        WHERE name IN ('Alpine','Aston Martin','Ferrari','Haas','McLaren','Mercedes','Racing Bulls','Red Bull Racing','Williams')
    `);

    // Solo 2026
    await client.query(`
        UPDATE constructors SET active_seasons = ARRAY[2026]
        WHERE name IN ('Audi','Cadillac')
    `);

    // Kick Sauber como escudería separada 2024/2025
    await client.query(`
        INSERT INTO constructors (name, primary_color, logo_url, active_seasons, name_history)
        VALUES ('Kick Sauber', '#52E252', '/images/logo/kickSauberLogo.avif', ARRAY[2024,2025], '{}')
        ON CONFLICT DO NOTHING
    `);

    // Limpiar name_history de Audi (ya no necesario)
    await client.query(`UPDATE constructors SET name_history = '{}' WHERE name = 'Audi'`);

    await client.query('COMMIT');
    console.log('✅ active_seasons agregado a constructors.');
} catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e.message);
} finally {
    client.release();
    process.exit(0);
}
