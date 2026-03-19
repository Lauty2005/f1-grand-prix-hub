import { query, pool } from '../config/db.js';

export const getDrivers = async (year) => {
    const sql = `
        SELECT 
            d.id, d.first_name, d.last_name, d.permanent_number, d.country_code, d.profile_image_url,
            c.name as team_name, c.primary_color, c.logo_url,
            (COALESCE(race_stats.total_points, 0) + COALESCE(sprint_stats.total_points, 0)) as points,
            COALESCE(race_stats.podiums, 0) as podiums
        FROM drivers d
        JOIN constructors c ON d.constructor_id = c.id
        LEFT JOIN (
            SELECT r_res.driver_id, SUM(r_res.points) as total_points, COUNT(CASE WHEN r_res.position BETWEEN 1 AND 3 THEN 1 END) as podiums
            FROM results r_res JOIN races r ON r_res.race_id = r.id
            WHERE r.date >= $1 AND r.date < $2
            GROUP BY r_res.driver_id
        ) race_stats ON d.id = race_stats.driver_id
        LEFT JOIN (
            SELECT s_res.driver_id, SUM(s_res.points) as total_points
            FROM sprint_results s_res JOIN races r ON s_res.race_id = r.id
            WHERE r.date >= $1 AND r.date < $2
            GROUP BY s_res.driver_id
        ) sprint_stats ON d.id = sprint_stats.driver_id
        WHERE d.active_seasons::text LIKE $3
        ORDER BY points DESC, d.last_name ASC;
    `;
    const startDate = `${year}-01-01`;
    const endDate = `${parseInt(year) + 1}-01-01`;
    const result = await query(sql, [startDate, endDate, '%' + year + '%']);
    return result.rows;
};

export const getDriverResults = async (id, year) => {
    const sql = `
        SELECT 
            r.name as race_name, r.round, r.has_sprint, res.position, res.fastest_lap,
            res.dnf, res.dsq, res.dns, res.dnq,
            (res.points + COALESCE(s.points, 0)) as points,
            res.points as race_points, COALESCE(s.points, 0) as sprint_points
        FROM results res
        JOIN races r ON res.race_id = r.id
        LEFT JOIN sprint_results s ON (r.id = s.race_id AND res.driver_id = s.driver_id)
        WHERE res.driver_id = $1 AND r.date >= $2 AND r.date < $3
        ORDER BY r.round ASC;
    `;
    const startDate = `${year}-01-01`;
    const endDate = `${parseInt(year) + 1}-01-01`;
    const result = await query(sql, [id, startDate, endDate]); 
    return result.rows;
};

export const deleteDriver = async (id) => {
    // La BD usa ON DELETE CASCADE por lo que esto borrará resultados asociados automáticamente
    await query('DELETE FROM drivers WHERE id = $1', [id]);
};

export const getTeams = async () => {
    const result = await query('SELECT id, name FROM constructors ORDER BY name ASC');
    return result.rows;
};

export const createDriver = async (data, fileData) => {
    const { first_name, last_name, number, team_id, country, seasons } = data;
    
    let profile_image_url;
    if (fileData) {
        const { protocol, host, filename } = fileData;
        profile_image_url = `${protocol}://${host}/images/pilots/${filename}`;
    } else {
        profile_image_url = 'https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/unknown.jpg.img.jpg';
    }

    const seasonsToSave = seasons ? seasons.split(',') : ['2025', '2026'];

    await query(
        `INSERT INTO drivers (first_name, last_name, permanent_number, constructor_id, country_code, profile_image_url, active_seasons) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [first_name, last_name, number, team_id, country, profile_image_url, seasonsToSave]
    );
};
