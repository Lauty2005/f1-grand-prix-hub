import { query } from '../config/db.js';

export const getConstructorsStandings = async (year) => {
    const startDate = `${year}-01-01`;
    const endDate = `${parseInt(year) + 1}-01-01`;
    const sql = `
        SELECT
            c.id,
            c.name,
            c.primary_color,
            c.logo_url,
            COALESCE(SUM(rp.race_pts), 0) + COALESCE(SUM(sp.sprint_pts), 0) AS points
        FROM constructors c
        JOIN driver_seasons ds ON ds.constructor_id = c.id AND ds.year = $4::int
        JOIN drivers d         ON d.id = ds.driver_id
            AND d.active_seasons::text LIKE $3
        LEFT JOIN (
            SELECT driver_id, SUM(points) AS race_pts
            FROM results
            WHERE race_id IN (SELECT id FROM races WHERE date >= $1 AND date < $2)
            GROUP BY driver_id
        ) rp ON rp.driver_id = d.id
        LEFT JOIN (
            SELECT driver_id, SUM(points) AS sprint_pts
            FROM sprint_results
            WHERE race_id IN (SELECT id FROM races WHERE date >= $1 AND date < $2)
            GROUP BY driver_id
        ) sp ON sp.driver_id = d.id
        WHERE $4 = ANY(c.active_seasons)
        GROUP BY c.id, c.name, c.primary_color, c.logo_url
        HAVING $4::int = ANY(c.active_seasons)
        ORDER BY points DESC, c.name ASC;
    `;
    const result = await query(sql, [startDate, endDate, `%${year}%`, year]);
    return result.rows;
};
