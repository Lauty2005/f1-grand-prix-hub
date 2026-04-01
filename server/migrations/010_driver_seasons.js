import { pool } from '../src/config/db.js';

const client = await pool.connect();
try {
    await client.query('BEGIN');

    // 1. Crear tabla
    await client.query(`
        CREATE TABLE IF NOT EXISTS driver_seasons (
            id             SERIAL PRIMARY KEY,
            driver_id      INT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
            constructor_id INT NOT NULL REFERENCES constructors(id),
            year           INT NOT NULL,
            UNIQUE(driver_id, year)
        );
        CREATE INDEX IF NOT EXISTS ds_driver_id_idx      ON driver_seasons(driver_id);
        CREATE INDEX IF NOT EXISTS ds_constructor_id_idx ON driver_seasons(constructor_id);
        CREATE INDEX IF NOT EXISTS ds_year_idx           ON driver_seasons(year);
    `);

    // 2. Seed desde constructor_id actual × active_seasons
    await client.query(`
        INSERT INTO driver_seasons (driver_id, constructor_id, year)
        SELECT d.id, d.constructor_id, unnest(d.active_seasons)::int
        FROM drivers d
        WHERE d.constructor_id IS NOT NULL
        ON CONFLICT (driver_id, year) DO NOTHING
    `);

    // 3. Correcciones conocidas
    // Hadjar: Racing Bulls en 2025, Red Bull en 2026
    await client.query(`
        UPDATE driver_seasons SET constructor_id = (SELECT id FROM constructors WHERE name = 'Racing Bulls')
        WHERE driver_id = (SELECT id FROM drivers WHERE last_name = 'Hadjar') AND year = 2025
    `);
    await client.query(`
        UPDATE driver_seasons SET constructor_id = (SELECT id FROM constructors WHERE name = 'Red Bull Racing')
        WHERE driver_id = (SELECT id FROM drivers WHERE last_name = 'Hadjar') AND year = 2026
    `);

    // Bottas: Kick Sauber en 2025, Cadillac en 2026
    await client.query(`
        UPDATE driver_seasons SET constructor_id = (SELECT id FROM constructors WHERE name = 'Kick Sauber')
        WHERE driver_id = (SELECT id FROM drivers WHERE last_name = 'Bottas') AND year = 2025
    `);

    // Tsunoda: Red Bull en 2025 (constructor_id was changed to Cadillac as placeholder)
    await client.query(`
        UPDATE driver_seasons SET constructor_id = (SELECT id FROM constructors WHERE name = 'Red Bull Racing')
        WHERE driver_id = (SELECT id FROM drivers WHERE last_name = 'Tsunoda') AND year = 2025
    `);
    // Tsunoda no está en 2026
    await client.query(`
        DELETE FROM driver_seasons
        WHERE driver_id = (SELECT id FROM drivers WHERE last_name = 'Tsunoda') AND year = 2026
    `);

    await client.query('COMMIT');
    console.log('✅ driver_seasons creada y poblada correctamente.');
} catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e.message);
} finally {
    client.release();
    process.exit(0);
}
