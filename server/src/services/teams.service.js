import { query } from '../config/db.js';

export const getAllTeams = async () => {
    const result = await query('SELECT * FROM constructors ORDER BY name ASC');
    return result.rows;
};

export const createTeam = async ({ name, primary_color, logo_url, active_seasons }) => {
    await query(
        `INSERT INTO constructors (name, primary_color, logo_url, active_seasons)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [name, primary_color, logo_url, active_seasons]
    );
};

export const deleteTeam = async (id) => {
    await query('UPDATE drivers SET constructor_id = NULL WHERE constructor_id = $1', [id]);
    await query('DELETE FROM constructors WHERE id = $1', [id]);
};
