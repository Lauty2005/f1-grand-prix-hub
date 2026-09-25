import { query } from '../config/db.js';

/**
 * Campeonato de constructores: suma los puntos de cada resultado para el equipo
 * con el que se corrió ESA carrera (results/sprint_results.constructor_id).
 * Así cuenta bien los cambios de equipo a mitad de temporada (p. ej. Lawson y
 * Tsunoda en 2025 R1-2 y en 2026 desde R12), que driver_seasons —un equipo por
 * piloto y año— no puede representar.
 */
export const getConstructorsStandings = async (year) => {
    const startDate = `${year}-01-01`;
    const endDate = `${parseInt(year) + 1}-01-01`;
    const sql = `
        WITH pts AS (
            SELECT r.constructor_id, r.points
              FROM results r JOIN races ra ON ra.id = r.race_id
             WHERE ra.date >= $1 AND ra.date < $2
            UNION ALL
            SELECT s.constructor_id, s.points
              FROM sprint_results s JOIN races ra ON ra.id = s.race_id
             WHERE ra.date >= $1 AND ra.date < $2
        )
        SELECT
            c.id,
            c.name,
            c.primary_color,
            c.logo_url,
            COALESCE(SUM(pts.points), 0) AS points
        FROM constructors c
        LEFT JOIN pts ON pts.constructor_id = c.id
        WHERE $3::int = ANY(c.active_seasons)
        GROUP BY c.id, c.name, c.primary_color, c.logo_url
        ORDER BY points DESC, c.name ASC;
    `;
    const result = await query(sql, [startDate, endDate, year]);
    return result.rows;
};
