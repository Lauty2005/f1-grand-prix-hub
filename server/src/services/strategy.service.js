import { query } from '../config/db.js';

// ──────────────────────────────────────────────
//  GET FULL RACE STRATEGY
//  Returns drivers sorted by final position,
//  each with their ordered stints.
// ──────────────────────────────────────────────
export const getRaceStrategy = async (raceId) => {
    // Race meta (need total_laps for Gantt proportions)
    const raceRes = await query(`
        SELECT id, name, circuit_name, total_laps, country_code
        FROM races WHERE id = $1
    `, [raceId]);

    if (raceRes.rows.length === 0) return null;
    const race = raceRes.rows[0];

    // All stints for this race, joined with driver/team and final position
    const stintsRes = await query(`
        SELECT
            rs.id,
            rs.driver_id,
            rs.stint_number,
            rs.tire_compound,
            rs.start_lap,
            rs.end_lap,
            rs.pit_duration,
            rs.notes,
            (rs.end_lap - rs.start_lap + 1)   AS laps_in_stint,
            d.first_name,
            d.last_name,
            d.permanent_number,
            c.name          AS team_name,
            c.primary_color,
            res.position    AS final_position
        FROM race_strategies rs
        JOIN drivers d      ON rs.driver_id = d.id
        JOIN constructors c ON d.constructor_id = c.id
        LEFT JOIN results res ON (res.race_id = rs.race_id AND res.driver_id = rs.driver_id)
        WHERE rs.race_id = $1
        ORDER BY res.position ASC NULLS LAST, rs.driver_id, rs.stint_number ASC
    `, [raceId]);

    if (stintsRes.rows.length === 0) return { race, drivers: [] };

    // Group stints by driver
    const driverMap = {};
    for (const row of stintsRes.rows) {
        if (!driverMap[row.driver_id]) {
            driverMap[row.driver_id] = {
                driver_id:      row.driver_id,
                name:           `${row.first_name} ${row.last_name}`,
                shortName:      row.last_name.toUpperCase(),
                number:         row.permanent_number,
                team_name:      row.team_name,
                primary_color:  row.primary_color,
                final_position: row.final_position,
                stints: [],
            };
        }
        driverMap[row.driver_id].stints.push({
            id:            row.id,
            stint_number:  row.stint_number,
            tire_compound: row.tire_compound.toUpperCase(),
            start_lap:     row.start_lap,
            end_lap:       row.end_lap,
            laps:          Number(row.laps_in_stint),
            pit_duration:  row.pit_duration,
            notes:         row.notes,
        });
    }

    // Compute per-driver aggregates
    const drivers = Object.values(driverMap).map(d => {
        const stops = d.stints.length - 1;                         // stints - 1 = stops
        const pitTimes = d.stints
            .map(s => s.pit_duration)
            .filter(Boolean)
            .map(t => parseFloat(t));                              // strip "s" suffix if present
        const totalPitTime = pitTimes.reduce((a, b) => a + b, 0);
        const fastestPit = pitTimes.length ? Math.min(...pitTimes) : null;
        const compounds  = d.stints.map(s => s.tire_compound);
        return { ...d, stops, totalPitTime: +totalPitTime.toFixed(1), fastestPit, compounds };
    });

    // Race-level stats
    const allPits = drivers
        .flatMap(d => d.stints.map(s => ({ driver: d.shortName, time: s.pit_duration })))
        .filter(p => p.time)
        .map(p => ({ driver: p.driver, time: parseFloat(p.time) }));

    const fastestPitStop = allPits.length
        ? allPits.reduce((best, cur) => cur.time < best.time ? cur : best)
        : null;

    const stopCounts = {};
    drivers.forEach(d => {
        stopCounts[d.stops] = (stopCounts[d.stops] || 0) + 1;
    });

    return { race, drivers, stats: { fastestPitStop, stopCounts } };
};

// ──────────────────────────────────────────────
//  TEAM STRATEGY HISTORY (season-level)
// ──────────────────────────────────────────────
export const getTeamStrategyHistory = async (year) => {
    const startDate = `${year}-01-01`;
    const endDate   = `${parseInt(year) + 1}-01-01`;

    const res = await query(`
        SELECT
            c.id            AS team_id,
            c.name          AS team_name,
            c.primary_color,
            r.id            AS race_id,
            r.name          AS race_name,
            r.round,
            rs.driver_id,
            d.last_name,
            COUNT(rs.id)    AS total_stints,
            (COUNT(rs.id) - 1) AS stops,
            STRING_AGG(rs.tire_compound ORDER BY rs.stint_number, '→') AS strategy_string
        FROM race_strategies rs
        JOIN drivers d      ON rs.driver_id = d.id
        JOIN constructors c ON d.constructor_id = c.id
        JOIN races r        ON rs.race_id = r.id
        WHERE r.date >= $1 AND r.date < $2
        GROUP BY c.id, c.name, c.primary_color, r.id, r.name, r.round, rs.driver_id, d.last_name
        ORDER BY c.name, r.round, d.last_name
    `, [startDate, endDate]);

    // Group by team
    const teamMap = {};
    for (const row of res.rows) {
        if (!teamMap[row.team_id]) {
            teamMap[row.team_id] = {
                team_id:     row.team_id,
                team_name:   row.team_name,
                primary_color: row.primary_color,
                races: [],
            };
        }
        teamMap[row.team_id].races.push({
            race_id:         row.race_id,
            race_name:       row.race_name,
            round:           row.round,
            driver:          row.last_name,
            stops:           Number(row.stops),
            strategy_string: row.strategy_string,
        });
    }

    return Object.values(teamMap);
};

// ──────────────────────────────────────────────
//  ADMIN CRUD
// ──────────────────────────────────────────────
export const addStint = async (data) => {
    const { race_id, driver_id, stint_number, tire_compound, start_lap, end_lap, pit_duration, notes } = data;
    const res = await query(`
        INSERT INTO race_strategies
            (race_id, driver_id, stint_number, tire_compound, start_lap, end_lap, pit_duration, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (race_id, driver_id, stint_number)
        DO UPDATE SET
            tire_compound = EXCLUDED.tire_compound,
            start_lap     = EXCLUDED.start_lap,
            end_lap       = EXCLUDED.end_lap,
            pit_duration  = EXCLUDED.pit_duration,
            notes         = EXCLUDED.notes
        RETURNING id
    `, [race_id, driver_id, stint_number, tire_compound.toUpperCase(), start_lap, end_lap, pit_duration || null, notes || null]);
    return res.rows[0];
};

export const deleteStint = async (id) => {
    await query('DELETE FROM race_strategies WHERE id = $1', [id]);
};

export const deleteDriverStints = async (raceId, driverId) => {
    await query('DELETE FROM race_strategies WHERE race_id = $1 AND driver_id = $2', [raceId, driverId]);
};

export const getStintsForAdmin = async (raceId) => {
    const res = await query(`
        SELECT rs.id, rs.stint_number, rs.tire_compound, rs.start_lap, rs.end_lap, rs.pit_duration,
               d.first_name, d.last_name
        FROM race_strategies rs
        JOIN drivers d ON rs.driver_id = d.id
        WHERE rs.race_id = $1
        ORDER BY d.last_name, rs.stint_number
    `, [raceId]);
    return res.rows;
};
