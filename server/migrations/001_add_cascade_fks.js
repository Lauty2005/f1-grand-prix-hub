/**
 * Migration 001: Add ON DELETE CASCADE to all driver FK constraints.
 * Ensures deleting a driver cascades to all their session results.
 */

export async function up(client) {
    const tables = ['results', 'qualifying', 'practices', 'sprint_results', 'sprint_qualifying'];

    for (const table of tables) {
        const constraint = `${table}_driver_id_fkey`;
        await client.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
        await client.query(
            `ALTER TABLE ${table} ADD CONSTRAINT ${constraint}
             FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE`
        );
    }
}
