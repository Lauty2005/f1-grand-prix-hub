import { pool } from './src/config/db.js';

async function migrateFKs() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Drop existing constraints safely
        await client.query(`ALTER TABLE results DROP CONSTRAINT IF EXISTS results_driver_id_fkey;`);
        await client.query(`ALTER TABLE qualifying DROP CONSTRAINT IF EXISTS qualifying_driver_id_fkey;`);
        await client.query(`ALTER TABLE practices DROP CONSTRAINT IF EXISTS practices_driver_id_fkey;`);
        await client.query(`ALTER TABLE sprint_results DROP CONSTRAINT IF EXISTS sprint_results_driver_id_fkey;`);
        await client.query(`ALTER TABLE sprint_qualifying DROP CONSTRAINT IF EXISTS sprint_qualifying_driver_id_fkey;`);

        // Add constraints with explicitly ON DELETE CASCADE
        await client.query(`ALTER TABLE results ADD CONSTRAINT results_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;`);
        await client.query(`ALTER TABLE qualifying ADD CONSTRAINT qualifying_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;`);
        await client.query(`ALTER TABLE practices ADD CONSTRAINT practices_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;`);
        await client.query(`ALTER TABLE sprint_results ADD CONSTRAINT sprint_results_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;`);
        await client.query(`ALTER TABLE sprint_qualifying ADD CONSTRAINT sprint_qualifying_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;`);

        await client.query('COMMIT');
        console.log("✅ Foreign Keys successfully mutated to ON DELETE CASCADE");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error migrating FKs:", err);
    } finally {
        client.release();
        process.exit(0);
    }
}
migrateFKs();
