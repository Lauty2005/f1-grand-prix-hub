import { query, pool } from '../config/db.js';
import { POINTS_SYSTEM, SPRINT_POINTS_SYSTEM } from '../config/points.js';

export const getCalendar = async (year) => {
    const startDate = `${year}-01-01`;
    const endDate = `${parseInt(year) + 1}-01-01`;
    const sql = `SELECT * FROM races WHERE date >= $1 AND date < $2 ORDER BY date ASC;`;
    const result = await query(sql, [startDate, endDate]);
    return result.rows;
};

export const getRaceById = async (id) => {
    const sql = `
        SELECT 
            id, name, round, circuit_name, country_code, date, 
            map_image_url, circuit_image_url, has_sprint,
            circuit_length, total_laps, race_distance, lap_record 
        FROM races 
        WHERE id = $1
    `;
    const result = await query(sql, [id]);
    return result.rows[0];
};

export const deleteRaceTransaction = async (id) => {
    // ON DELETE CASCADE en PostgreSQL limpia todas las tablas de resultados de esta carrera
    await query('DELETE FROM races WHERE id = $1', [id]);
};

export const insertRaceResult = async (data) => {
    const { race_id, driver_id, position, fastest_lap, dnf, dsq, dns, dnq } = data;

    let calculatedPoints = POINTS_SYSTEM[position] || 0;
    if (dnf || dsq || dns || dnq) {
        calculatedPoints = 0;
    } else {
        if (fastest_lap === true && position <= 10) calculatedPoints += 1;
    }

    const sql = `
        INSERT INTO results (race_id, driver_id, position, points, fastest_lap, dnf, dsq, dns, dnq)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (race_id, driver_id) DO UPDATE SET
            position    = EXCLUDED.position,
            points      = EXCLUDED.points,
            fastest_lap = EXCLUDED.fastest_lap,
            dnf         = EXCLUDED.dnf,
            dsq         = EXCLUDED.dsq,
            dns         = EXCLUDED.dns,
            dnq         = EXCLUDED.dnq
    `;
    await query(sql, [race_id, driver_id, position, calculatedPoints, fastest_lap, dnf, dsq, dns, dnq]);
    return calculatedPoints;
};

export const getSessionResults = async (raceId, sessionType) => {
    const config = {
        'results': { table: 'results res', select: 'res.*', cond: 'res.race_id', order: '(res.dnf OR res.dsq OR res.dns OR res.dnq) ASC, res.position ASC' },
        'qualifying': { table: 'qualifying q', select: 'q.*', cond: 'q.race_id', order: 'q.position ASC' },
        'practices': { table: 'practices p', select: 'p.*', cond: 'p.race_id', order: 'd.last_name ASC' },
        'sprint': { table: 'sprint_results s', select: 's.*', cond: 's.race_id', order: 's.position ASC' },
        'sprint-qualifying': { table: 'sprint_qualifying sq', select: 'sq.*', cond: 'sq.race_id', order: 'sq.position ASC' }
    };
    const cfg = config[sessionType];
    const alias = cfg.select.split('.')[0];
    const sql = `
        SELECT ${cfg.select}, d.first_name, d.last_name,
               COALESCE(c.name_history->>(EXTRACT(YEAR FROM r.date)::text), c.name) AS team_name,
               c.primary_color
        FROM ${cfg.table}
        JOIN drivers d ON ${alias}.driver_id = d.id
        JOIN constructors c ON d.constructor_id = c.id
        JOIN races r ON ${cfg.cond} = r.id
        WHERE ${cfg.cond} = $1
        ORDER BY ${cfg.order};
    `;
    const result = await query(sql, [raceId]);
    return result.rows;
};

export const insertSprintResult = async (data) => {
    const { race_id, driver_id, position, dnf, time_gap } = data;
    let points = 0;
    if (!dnf && position <= 8) points = SPRINT_POINTS_SYSTEM[position] || 0;

    await query(
        `INSERT INTO sprint_results (race_id, driver_id, position, points, dnf, time_gap) 
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (race_id, driver_id) DO UPDATE SET
            position = EXCLUDED.position, points = EXCLUDED.points,
            dnf = EXCLUDED.dnf, time_gap = EXCLUDED.time_gap
        `,
        [race_id, driver_id, position, points, dnf, time_gap]
    );
    return points;
};

export const insertQualifying = async (data) => {
    const { race_id, driver_id, position, q1, q2, q3 } = data;
    await query(`
        INSERT INTO qualifying (race_id, driver_id, position, q1, q2, q3) 
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (race_id, driver_id) DO UPDATE SET
            position = EXCLUDED.position, q1 = EXCLUDED.q1, q2 = EXCLUDED.q2, q3 = EXCLUDED.q3
        `, 
        [race_id, driver_id, position, q1, q2, q3]);
};

export const insertSprintQualifying = async (data) => {
    const { race_id, driver_id, position, sq1, sq2, sq3 } = data;
    await query(`INSERT INTO sprint_qualifying (race_id, driver_id, position, sq1, sq2, sq3) VALUES ($1, $2, $3, $4, $5, $6)`, [race_id, driver_id, position, sq1, sq2, sq3]);
};

export const insertPractices = async (data) => {
    const { race_id, driver_id, p1, p2, p3 } = data;
    await query(`
        INSERT INTO practices (race_id, driver_id, p1, p2, p3) 
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (race_id, driver_id) DO UPDATE SET
            p1 = EXCLUDED.p1, p2 = EXCLUDED.p2, p3 = EXCLUDED.p3
        `, 
        [race_id, driver_id, p1, p2, p3]);
};

export const insertRace = async (data) => {
    const {
        name, round, circuit_name, country_code, date, 
        map_image_url, circuit_image_url, hasSprint, 
        circuit_length, lapsInt, race_distance, lap_record
    } = data;
    await query(
        `INSERT INTO races (
            name, round, circuit_name, country_code, date, 
            map_image_url, circuit_image_url, has_sprint,
            circuit_length, total_laps, race_distance, lap_record
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [name, round, circuit_name, country_code, date, map_image_url, circuit_image_url, hasSprint, circuit_length, lapsInt, race_distance, lap_record]
    );
};

export const deleteResultEntry = async (table, race_id, driver_id) => {
    const tableMap = {
        'results': 'results',
        'sprint': 'sprint_results',
        'qualifying': 'qualifying',
        'sprint-qualifying': 'sprint_qualifying',
        'practices': 'practices'
    };
    const tableName = tableMap[table];
    await query(`DELETE FROM ${tableName} WHERE race_id = $1 AND driver_id = $2`, [race_id, driver_id]);
};
