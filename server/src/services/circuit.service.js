import { query } from '../config/db.js';

export const getCircuitAnalysis = async (raceId) => {
    const raceRes = await query(`
        SELECT id, name, circuit_name, country_code,
               circuit_length, total_laps, race_distance, lap_record,
               first_gp_year, drs_zones, circuit_notes,
               circuit_image_url, map_image_url
        FROM races
        WHERE id = $1
    `, [raceId]);

    if (raceRes.rows.length === 0) return null;
    const race = raceRes.rows[0];

    const winnersRes = await query(`
        SELECT id, year, winner_name, team_name, pole_name, fastest_lap, notes
        FROM circuit_winners
        WHERE circuit_name = $1
        ORDER BY year DESC
    `, [race.circuit_name]);

    return { race, winners: winnersRes.rows };
};

export const getAllCircuitWinners = async () => {
    const res = await query(`
        SELECT id, year, circuit_name, winner_name, team_name
        FROM circuit_winners
        ORDER BY circuit_name ASC, year DESC
    `);
    return res.rows;
};

export const addCircuitWinner = async (data) => {
    const { circuit_name, year, winner_name, team_name, pole_name, fastest_lap, notes } = data;
    await query(`
        INSERT INTO circuit_winners (circuit_name, year, winner_name, team_name, pole_name, fastest_lap, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [circuit_name, year, winner_name, team_name || null, pole_name || null, fastest_lap || null, notes || null]);
};

export const deleteCircuitWinner = async (id) => {
    await query('DELETE FROM circuit_winners WHERE id = $1', [id]);
};

export const updateRaceCircuitInfo = async (raceId, data) => {
    const { first_gp_year, drs_zones, circuit_notes } = data;
    await query(`
        UPDATE races
        SET first_gp_year = $1,
            drs_zones     = $2,
            circuit_notes = $3
        WHERE id = $4
    `, [first_gp_year || null, drs_zones || null, circuit_notes || null, raceId]);
};
