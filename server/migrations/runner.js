/**
 * Migration runner.
 *
 * Maintains a `schema_migrations` table to track which migrations have been
 * applied. Runs pending migrations in filename order and records each one.
 *
 * Usage:
 *   node migrations/runner.js
 *
 * To add a new migration:
 *   1. Create a file in this folder: NNN_description.js
 *   2. Export `up(client)` (and optionally `down(client)`) functions.
 *   3. Run `npm run migrate`.
 */

import { pool } from '../src/config/db.js';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureMigrationsTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name       TEXT        PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function getAppliedMigrations(client) {
    const result = await client.query('SELECT name FROM schema_migrations ORDER BY name ASC');
    return new Set(result.rows.map(r => r.name));
}

async function loadMigrations() {
    const files = fs.readdirSync(__dirname)
        .filter(f => /^\d+.*\.js$/.test(f))
        .sort();
    return files;
}

async function run() {
    const client = await pool.connect();
    try {
        await ensureMigrationsTable(client);
        const applied = await getAppliedMigrations(client);
        const files = await loadMigrations();

        const pending = files.filter(f => !applied.has(f));

        if (pending.length === 0) {
            console.log('✅ No hay migraciones pendientes.');
            return;
        }

        console.log(`🔄 Aplicando ${pending.length} migración(es)...`);

        for (const file of pending) {
            const modulePath = pathToFileURL(path.join(__dirname, file)).href;
            const migration = await import(modulePath);

            if (typeof migration.up !== 'function') {
                console.warn(`⚠️  ${file}: no exporta función up(). Saltando.`);
                continue;
            }

            console.log(`  → ${file}`);
            await client.query('BEGIN');
            try {
                await migration.up(client);
                await client.query(
                    'INSERT INTO schema_migrations (name) VALUES ($1)',
                    [file]
                );
                await client.query('COMMIT');
                console.log(`  ✅ ${file} aplicada.`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`  ❌ ${file} falló:`, err.message);
                process.exit(1);
            }
        }

        console.log('🏁 Migraciones completadas.');
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(err => {
    console.error('Error inesperado en el runner:', err);
    process.exit(1);
});
