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
            (
                COALESCE((
                    SELECT SUM(r.points)
                    FROM results r
                    JOIN drivers d ON r.driver_id = d.id
                    JOIN races ra ON r.race_id = ra.id
                    WHERE d.constructor_id = c.id 
                    AND ra.date >= $1 AND ra.date < $2
                ), 0)
                +
                COALESCE((
                    SELECT SUM(s.points)
                    FROM sprint_results s
                    JOIN drivers d ON s.driver_id = d.id
                    JOIN races ra ON s.race_id = ra.id
                    WHERE d.constructor_id = c.id 
                    AND ra.date >= $1 AND ra.date < $2
                ), 0)
            ) as points
        FROM constructors c
        WHERE EXISTS (
            SELECT 1 FROM drivers d 
            WHERE d.constructor_id = c.id 
            AND d.active_seasons::text LIKE $3
        )
        ORDER BY points DESC, c.name ASC;
    `;

    const result = await query(sql, [startDate, endDate, `%${year}%`]);
    return result.rows;
};
