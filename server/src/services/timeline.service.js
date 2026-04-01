import { query } from '../config/db.js';

// ──────────────────────────────────────────────────────────────
//  EVOLUCIÓN DEL CAMPEONATO
//  Devuelve { races: [{round, name}], drivers: [{id, name, ...points[]}] }
// ──────────────────────────────────────────────────────────────
export const getStandingsEvolution = async (year) => {
    const startDate = `${year}-01-01`;
    const endDate   = `${parseInt(year) + 1}-01-01`;

    // 1. Carreras con al menos un resultado (en orden)
    const racesRes = await query(`
        SELECT r.id, r.round, r.name
        FROM races r
        WHERE r.date >= $1 AND r.date < $2
          AND EXISTS (SELECT 1 FROM results res WHERE res.race_id = r.id)
        ORDER BY r.round ASC
    `, [startDate, endDate]);

    if (racesRes.rows.length === 0) return { races: [], drivers: [] };

    // 2. Puntos acumulados por piloto por vuelta
    const pointsRes = await query(`
        WITH race_pts AS (
            SELECT
                r.round,
                r.name      AS race_name,
                res.driver_id,
                (COALESCE(res.points, 0) + COALESCE(sp.points, 0)) AS pts
            FROM races r
            JOIN results res ON res.race_id = r.id
            LEFT JOIN sprint_results sp ON (sp.race_id = r.id AND sp.driver_id = res.driver_id)
            WHERE r.date >= $1 AND r.date < $2
        ),
        cum AS (
            SELECT
                rp.round,
                rp.race_name,
                rp.driver_id,
                SUM(rp.pts) OVER (
                    PARTITION BY rp.driver_id
                    ORDER BY rp.round
                    ROWS UNBOUNDED PRECEDING
                ) AS cumulative
            FROM race_pts rp
        )
        SELECT
            c.round,
            c.cumulative,
            c.driver_id,
            d.first_name,
            d.last_name,
            d.permanent_number,
            con.primary_color,
            con.name AS team_name
        FROM cum c
        JOIN drivers d         ON c.driver_id = d.id
        JOIN driver_seasons ds ON ds.driver_id = d.id AND ds.year = $3::int
        JOIN constructors con  ON con.id = ds.constructor_id
        ORDER BY c.round ASC, c.cumulative DESC
    `, [startDate, endDate, parseInt(year)]);

    // 3. Reshape para Chart.js
    const raceRounds = racesRes.rows.map(r => ({ round: r.round, name: r.name }));
    const driverMap  = {};

    for (const row of pointsRes.rows) {
        if (!driverMap[row.driver_id]) {
            driverMap[row.driver_id] = {
                id:        row.driver_id,
                name:      `${row.first_name} ${row.last_name}`,
                shortName: row.last_name.toUpperCase(),
                number:    row.permanent_number,
                color:     row.primary_color,
                team:      row.team_name,
                points:    new Array(raceRounds.length).fill(null),
            };
        }
        const idx = raceRounds.findIndex(r => r.round === row.round);
        if (idx !== -1) driverMap[row.driver_id].points[idx] = Number(row.cumulative);
    }

    // Propagar hacia adelante si un piloto no corrió una ronda
    const drivers = Object.values(driverMap);
    for (const d of drivers) {
        let last = 0;
        d.points = d.points.map(p => {
            if (p !== null) { last = p; return p; }
            return last;
        });
    }

    // Ordenar por puntos finales desc
    drivers.sort((a, b) => {
        const pA = a.points[a.points.length - 1] ?? 0;
        const pB = b.points[b.points.length - 1] ?? 0;
        return pB - pA;
    });

    return { races: raceRounds, drivers };
};

// ──────────────────────────────────────────────────────────────
//  MOMENTOS CLAVE
// ──────────────────────────────────────────────────────────────
export const getMoments = async (year) => {
    const res = await query(`
        SELECT tm.id, tm.year, tm.race_id,
               r.round, r.name AS race_name,
               tm.type, tm.title, tm.description,
               tm.driver_name, tm.team_name, tm.icon
        FROM timeline_moments tm
        LEFT JOIN races r ON tm.race_id = r.id
        WHERE tm.year = $1
        ORDER BY r.round ASC NULLS LAST, tm.id ASC
    `, [year]);
    return res.rows;
};

export const getAllMomentsAdmin = async () => {
    const res = await query(`
        SELECT tm.id, tm.year, tm.type, tm.title,
               r.name AS race_name
        FROM timeline_moments tm
        LEFT JOIN races r ON tm.race_id = r.id
        ORDER BY tm.year DESC, r.round ASC NULLS LAST, tm.id ASC
    `);
    return res.rows;
};

export const addMoment = async (data) => {
    const { year, race_id, type, title, description, driver_name, team_name, icon } = data;
    await query(`
        INSERT INTO timeline_moments
            (year, race_id, type, title, description, driver_name, team_name, icon)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
        year,
        race_id  || null,
        type     || 'milestone',
        title,
        description  || null,
        driver_name  || null,
        team_name    || null,
        icon         || null,
    ]);
};

export const deleteMoment = async (id) => {
    await query('DELETE FROM timeline_moments WHERE id = $1', [id]);
};
