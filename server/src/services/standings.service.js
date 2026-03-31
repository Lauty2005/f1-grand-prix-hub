import { query } from '../config/db.js';

export const getConstructorsStandings = async (year) => {
    const startDate = `${year}-01-01`;
    const endDate = `${parseInt(year) + 1}-01-01`;
    const sql = `
        SELECT
            c.id,
            COALESCE(c.name_history->>$4::text, c.name) AS name,
            c.primary_color,
            c.logo_url,
            COALESCE(SUM(r.points), 0) + COALESCE(SUM(s.points), 0) AS points
        FROM constructors c
        JOIN drivers d ON d.constructor_id = c.id
        AND d.active_seasons::text LIKE $3
        LEFT JOIN results r ON r.driver_id = d.id
            AND r.race_id IN (
                SELECT id FROM races WHERE date >= $1 AND date < $2
            )
        LEFT JOIN sprint_results s ON s.driver_id = d.id
            AND s.race_id IN (
                SELECT id FROM races WHERE date >= $1 AND date < $2
            )
        GROUP BY c.id, c.name, c.name_history, c.primary_color, c.logo_url
        ORDER BY points DESC, c.name ASC;
    `;
    const result = await query(sql, [startDate, endDate, `%${year}%`, year]);
    return result.rows;
};
