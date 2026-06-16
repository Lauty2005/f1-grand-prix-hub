#!/usr/bin/env node

/**
 * Script para importar datos de MIAMI en lote
 * Uso: node import-miami-data.js <archivo.json>
 *
 * Ejemplo de JSON:
 * {
 *   "race": "Miami",
 *   "sessions": [
 *     {
 *       "type": "practices",
 *       "data": [
 *         { "driver": "Verstappen", "p1": "1:25.234", "p2": "+0.5s", "p3": "-" },
 *         { "driver": "Leclerc", "p1": "1:25.456", "p2": "+0.7s", "p3": "1:24.890" }
 *       ]
 *     },
 *     {
 *       "type": "qualifying",
 *       "data": [
 *         { "driver": "Verstappen", "q1": "1:25.234", "q2": "1:24.890", "q3": "1:23.456" }
 *       ]
 *     },
 *     {
 *       "type": "race",
 *       "data": [
 *         { "driver": "Verstappen", "position": 1, "points": 25, "fastest_lap": true }
 *       ]
 *     }
 *   ]
 * }
 */

import dotenv from 'dotenv';
import { query } from '../server/src/config/db.js';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '../server/.env' });

const args = process.argv.slice(2);
const filePath = args[0];

if (!filePath) {
    console.error('❌ Uso: node import-miami-data.js <archivo.json>');
    process.exit(1);
}

if (!fs.existsSync(filePath)) {
    console.error(`❌ Archivo no encontrado: ${filePath}`);
    process.exit(1);
}

async function importData() {
    try {
        console.log('📂 Leyendo archivo...');
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // 1. Buscar la carrera MIAMI
        console.log('🔍 Buscando carrera MIAMI...');
        const raceRes = await query(
            'SELECT id FROM races WHERE name ILIKE $1 OR circuit_name ILIKE $1',
            ['%MIAMI%']
        );

        if (raceRes.rows.length === 0) {
            console.error('❌ Carrera MIAMI no encontrada en BD');
            process.exit(1);
        }

        const raceId = raceRes.rows[0].id;
        console.log(`✅ Carrera encontrada (ID: ${raceId})`);

        // 2. Procesar cada sesión
        for (const session of data.sessions || []) {
            console.log(`\n📊 Procesando ${session.type}...`);
            await processSession(raceId, session.type, session.data);
        }

        console.log('\n✅ ¡Importación completada!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

async function processSession(raceId, sessionType, dataRows) {
    let processed = 0;
    let skipped = 0;

    for (const row of dataRows || []) {
        try {
            // Buscar el driver
            const driverRes = await query(
                'SELECT id FROM drivers WHERE first_name ILIKE $1 OR last_name ILIKE $1 ORDER BY last_name LIMIT 1',
                [`%${row.driver}%`]
            );

            if (driverRes.rows.length === 0) {
                console.warn(`  ⚠️  Piloto no encontrado: ${row.driver}`);
                skipped++;
                continue;
            }

            const driverId = driverRes.rows[0].id;

            switch (sessionType) {
                case 'practices':
                    await savePractices(raceId, driverId, row);
                    break;
                case 'qualifying':
                    await saveQualifying(raceId, driverId, row);
                    break;
                case 'sprint-qualifying':
                    await saveSprintQualifying(raceId, driverId, row);
                    break;
                case 'sprint':
                    await saveSprint(raceId, driverId, row);
                    break;
                case 'race':
                    await saveRaceResult(raceId, driverId, row);
                    break;
                case 'strategy':
                    await saveStrategy(raceId, driverId, row);
                    break;
                default:
                    console.warn(`  ⚠️  Tipo de sesión desconocido: ${sessionType}`);
                    skipped++;
                    continue;
            }

            processed++;
            console.log(`  ✅ ${row.driver}`);
        } catch (err) {
            console.error(`  ❌ ${row.driver}: ${err.message}`);
            skipped++;
        }
    }

    console.log(`   Resultado: ${processed} guardado${processed !== 1 ? 's' : ''}, ${skipped} omitido${skipped !== 1 ? 's' : ''}`);
}

async function savePractices(raceId, driverId, row) {
    const p1 = row.p1 || '-';
    const p2 = row.p2 || '-';
    const p3 = row.p3 || '-';

    await query(
        `INSERT INTO practices (race_id, driver_id, p1, p2, p3)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (race_id, driver_id) DO UPDATE SET
            p1 = EXCLUDED.p1, p2 = EXCLUDED.p2, p3 = EXCLUDED.p3`,
        [raceId, driverId, p1, p2, p3]
    );
}

async function saveQualifying(raceId, driverId, row) {
    const position = row.position || null;
    const q1 = row.q1 || '-';
    const q2 = row.q2 || '-';
    const q3 = row.q3 || '-';

    await query(
        `INSERT INTO qualifying (race_id, driver_id, position, q1, q2, q3)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (race_id, driver_id) DO UPDATE SET
            position = EXCLUDED.position, q1 = EXCLUDED.q1,
            q2 = EXCLUDED.q2, q3 = EXCLUDED.q3`,
        [raceId, driverId, position, q1, q2, q3]
    );
}

async function saveSprintQualifying(raceId, driverId, row) {
    const position = row.position || null;
    const sq1 = row.sq1 || '-';
    const sq2 = row.sq2 || '-';
    const sq3 = row.sq3 || '-';

    await query(
        `INSERT INTO sprint_qualifying (race_id, driver_id, position, sq1, sq2, sq3)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (race_id, driver_id) DO UPDATE SET
            position = EXCLUDED.position, sq1 = EXCLUDED.sq1,
            sq2 = EXCLUDED.sq2, sq3 = EXCLUDED.sq3`,
        [raceId, driverId, position, sq1, sq2, sq3]
    );
}

async function saveSprint(raceId, driverId, row) {
    const position = row.position || null;
    const points = row.points || 0;
    const dnf = row.dnf || false;
    const timeGap = row.time_gap || null;

    await query(
        `INSERT INTO sprint_results (race_id, driver_id, position, points, dnf, time_gap)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (race_id, driver_id) DO UPDATE SET
            position = EXCLUDED.position, points = EXCLUDED.points,
            dnf = EXCLUDED.dnf, time_gap = EXCLUDED.time_gap`,
        [raceId, driverId, position, points, dnf, timeGap]
    );
}

async function saveRaceResult(raceId, driverId, row) {
    const position = row.position || null;
    const points = row.points || 0;
    const fastestLap = row.fastest_lap || false;
    const dnf = row.dnf || false;
    const dsq = row.dsq || false;
    const dns = row.dns || false;
    const dnq = row.dnq || false;

    await query(
        `INSERT INTO results (race_id, driver_id, position, points, fastest_lap, dnf, dsq, dns, dnq)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (race_id, driver_id) DO UPDATE SET
            position = EXCLUDED.position, points = EXCLUDED.points,
            fastest_lap = EXCLUDED.fastest_lap, dnf = EXCLUDED.dnf,
            dsq = EXCLUDED.dsq, dns = EXCLUDED.dns, dnq = EXCLUDED.dnq`,
        [raceId, driverId, position, points, fastestLap, dnf, dsq, dns, dnq]
    );
}

async function saveStrategy(raceId, driverId, row) {
    const finalPosition = row.final_position || null;
    const stops = row.stops || 0;
    const compounds = JSON.stringify(row.compounds || []);
    const totalPitTime = row.total_pit_time || 0;

    await query(
        `INSERT INTO strategy (race_id, driver_id, final_position, stops, compounds, total_pit_time)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (race_id, driver_id) DO UPDATE SET
            final_position = EXCLUDED.final_position, stops = EXCLUDED.stops,
            compounds = EXCLUDED.compounds, total_pit_time = EXCLUDED.total_pit_time`,
        [raceId, driverId, finalPosition, stops, compounds, totalPitTime]
    );
}

importData();
