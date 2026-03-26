import { query } from '../config/db.js';

export const getAllTeams = async () => {
    const result = await query('SELECT * FROM constructors ORDER BY name ASC');
    return result.rows;
};

export const createTeam = async ({ name, primary_color, logo_url }) => {
    const result = await query(
        `INSERT INTO constructors (name, primary_color, logo_url)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [name, primary_color, logo_url]
    );
    return result.rows[0];
};

export const deleteTeam = async (id) => {
    // Unlink drivers first to avoid FK violations (drivers.constructor_id → constructors.id).
    await query('UPDATE drivers SET constructor_id = NULL WHERE constructor_id = $1', [id]);
    await query('DELETE FROM constructors WHERE id = $1', [id]);
};
