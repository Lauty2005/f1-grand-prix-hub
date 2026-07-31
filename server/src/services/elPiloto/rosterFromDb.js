// server/src/services/elPiloto/rosterFromDb.js
//
// Trae el grid REAL de una temporada (drivers + constructors ya cargados en
// la DB del proyecto) y lo arma con la forma que espera el motor de
// simulación. El query reusa el mismo patrón de join que
// drivers.service.js#getDrivers / game.service.js#getStatsPool — la
// diferencia es que acá NO se agregan stats de resultados: el tier/edad de
// cada piloto sale de realGridSeed.js (curado a mano), nunca de sus stats.
//
// Sin sandbox para correr esto contra la DB real en la sesión en la que se
// escribió — el query sigue el patrón ya probado de drivers.service.js, pero
// conviene correr GET /api/el-piloto/roster una vez y confirmar la forma de
// los datos antes de construir algo más arriba de esto.

import { query } from '../../config/db.js';
import { generateAttributesFromProfile } from './attributes.js';
import { TIER_SEED_RATING } from './rating.js';
import { TIER_PROFILES, RACES_COMPLETED_SEED } from './tiers.js';
import {
    REAL_DRIVER_SEEDS,
    DEFAULT_DRIVER_SEED,
    REAL_TEAM_SEEDS,
    DEFAULT_TEAM_SEED,
    teamSeedForName,
} from './realGridSeed.js';

export const getRealGridRows = async (year) => {
    const sql = `
        SELECT
            d.id, d.first_name, d.last_name, d.country_code,
            COALESCE(ds.number, d.permanent_number) AS numero,
            c.id AS constructor_id, c.name AS constructor_name,
            c.primary_color, c.logo_url
        FROM drivers d
        JOIN driver_seasons ds ON ds.driver_id = d.id AND ds.year = $1::int
        JOIN constructors c    ON c.id = ds.constructor_id
        WHERE d.is_practice_only = false
        ORDER BY c.name ASC, d.last_name ASC;
    `;
    const result = await query(sql, [year]);
    return result.rows;
};

// Arma { pilotos, equipos } a partir de las filas del query — separado de
// getRealGrid() para poder testear el armado sin pegarle a la DB.
export const buildRealGrid = (rows) => {
    const equiposPorId = new Map();

    const pilotos = rows.map((row) => {
        const driverSeed = REAL_DRIVER_SEEDS[row.id] ?? DEFAULT_DRIVER_SEED;
        const perfil = TIER_PROFILES[driverSeed.tier] ?? TIER_PROFILES.solido;
        const equipoId = `real-${row.constructor_id}`;

        if (!equiposPorId.has(equipoId)) {
            // Orden de prioridad: ID verificado a mano > tier inferido por
            // nombre de escudería > default neutral. El fallback por nombre
            // es el que evita que todos los equipos terminen con el mismo
            // auto (ver realGridSeed.js — ese bug es lo que hacía posible
            // salir campeón con el peor equipo de la parrilla).
            const teamSeed = REAL_TEAM_SEEDS[row.constructor_id] ?? teamSeedForName(row.constructor_name) ?? DEFAULT_TEAM_SEED;
            equiposPorId.set(equipoId, {
                id: equipoId,
                nombre: row.constructor_name,
                primaryColor: row.primary_color,
                logoUrl: row.logo_url,
                rendimientoAuto: teamSeed.rendimientoAuto,
                fiabilidad: teamSeed.fiabilidad,
            });
        }

        return {
            id: `real-${row.id}`,
            dbId: row.id,
            nombreCompleto: `${row.first_name} ${row.last_name}`,
            numero: row.numero != null ? Number(row.numero) : null,
            nacionalidad: row.country_code,
            edad: driverSeed.edad,
            tier: driverSeed.tier,
            equipoId,
            esFicticio: false,
            atributos: generateAttributesFromProfile({
                potencial: perfil.potencial,
                experiencia: perfil.experiencia,
            }),
            rating: TIER_SEED_RATING[driverSeed.tier] ?? TIER_SEED_RATING.solido,
            racesCompleted: RACES_COMPLETED_SEED[driverSeed.tier] ?? RACES_COMPLETED_SEED.solido,
            forma: 0,
        };
    });

    const equipos = Object.fromEntries(
        Array.from(equiposPorId.values()).map((equipo) => [equipo.id, equipo])
    );

    return { pilotos, equipos };
};

export const getRealGrid = async (year) => {
    const rows = await getRealGridRows(year);
    return buildRealGrid(rows);
};
