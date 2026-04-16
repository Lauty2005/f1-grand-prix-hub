import { query, pool } from '../config/db.js';

export const getDrivers = async (year) => {
    const sql = `
        SELECT
            d.id, d.first_name, d.last_name,
            COALESCE(ds.number, d.permanent_number) AS permanent_number,
            d.country_code, d.profile_image_url,
            c.name AS team_name, c.primary_color, c.logo_url,
            (COALESCE(race_stats.total_points, 0) + COALESCE(sprint_stats.total_points, 0)) as points,
            COALESCE(race_stats.podiums, 0) as podiums
        FROM drivers d
        JOIN driver_seasons ds ON ds.driver_id = d.id AND ds.year = $4::int
        JOIN constructors c    ON c.id = ds.constructor_id
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
          AND (d.active = true OR $4::int < EXTRACT(YEAR FROM NOW())::int)
        ORDER BY points DESC, d.last_name ASC;
    `;
    const startDate = `${year}-01-01`;
    const endDate = `${parseInt(year) + 1}-01-01`;
    const result = await query(sql, [startDate, endDate, `%${year}%`, year]);
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

export const compareDrivers = async (ids, year) => {
    const startDate = `${year}-01-01`;
    const endDate   = `${parseInt(year) + 1}-01-01`;

    // 1. Info base de cada piloto + stats agregadas
    const statsSQL = `
        SELECT
            d.id, d.first_name, d.last_name, d.permanent_number, d.country_code, d.profile_image_url,
            c.name  AS team_name,
            c.primary_color,
            c.logo_url,
            (COALESCE(rp.total_points, 0) + COALESCE(sp.total_points, 0))   AS points,
            COALESCE(rp.wins,    0)  AS wins,
            COALESCE(rp.podiums, 0)  AS podiums,
            COALESCE(rp.top5,    0)  AS top5,
            COALESCE(rp.top10,   0)  AS top10,
            COALESCE(rp.dnfs,    0)  AS dnfs,
            COALESCE(rp.fastest_laps, 0) AS fastest_laps,
            COALESCE(rp.races,   0)  AS races
        FROM drivers d
        JOIN driver_seasons ds ON ds.driver_id = d.id AND ds.year = $4::int
        JOIN constructors c    ON c.id = ds.constructor_id
        LEFT JOIN (
            SELECT
                res.driver_id,
                SUM(res.points) AS total_points,
                COUNT(*) FILTER (WHERE res.position = 1 AND NOT res.dnf AND NOT res.dsq AND NOT res.dns) AS wins,
                COUNT(*) FILTER (WHERE res.position <= 3 AND NOT res.dnf AND NOT res.dsq AND NOT res.dns) AS podiums,
                COUNT(*) FILTER (WHERE res.position <= 5 AND NOT res.dnf AND NOT res.dsq AND NOT res.dns) AS top5,
                COUNT(*) FILTER (WHERE res.position <= 10 AND NOT res.dnf AND NOT res.dsq AND NOT res.dns) AS top10,
                COUNT(*) FILTER (WHERE res.dnf) AS dnfs,
                COUNT(*) FILTER (WHERE res.fastest_lap) AS fastest_laps,
                COUNT(*) AS races
            FROM results res
            JOIN races r ON res.race_id = r.id
            WHERE r.date >= $2 AND r.date < $3
            GROUP BY res.driver_id
        ) rp ON d.id = rp.driver_id
        LEFT JOIN (
            SELECT s.driver_id, SUM(s.points) AS total_points
            FROM sprint_results s
            JOIN races r ON s.race_id = r.id
            WHERE r.date >= $2 AND r.date < $3
            GROUP BY s.driver_id
        ) sp ON d.id = sp.driver_id
        WHERE d.id = ANY($1::int[])
        ORDER BY points DESC;
    `;

    const statsResult = await query(statsSQL, [ids, startDate, endDate, parseInt(year)]);

    // 2. Puntos por carrera para cada piloto (para el gráfico acumulado)
    const perRaceSQL = `
        SELECT
            res.driver_id,
            r.round,
            r.name AS race_name,
            res.position,
            (res.points + COALESCE(sp.points, 0)) AS points,
            res.dnf, res.dsq, res.dns
        FROM results res
        JOIN races r ON res.race_id = r.id
        LEFT JOIN sprint_results sp ON (sp.race_id = r.id AND sp.driver_id = res.driver_id)
        WHERE res.driver_id = ANY($1::int[])
          AND r.date >= $2 AND r.date < $3
        ORDER BY r.round ASC;
    `;

    const perRaceResult = await query(perRaceSQL, [ids, startDate, endDate]);

    // 3. Head-to-head: carreras donde ambos pilotos corrieron, comparar posiciones
    // Solo funciona para exactamente 2 pilotos
    let h2h = null;
    if (ids.length === 2) {
        const [idA, idB] = ids;
        const h2hSQL = `
            SELECT
                r.round, r.name AS race_name,
                a.position AS pos_a, b.position AS pos_b,
                a.dnf AS dnf_a, b.dnf AS dnf_b,
                a.driver_id AS id_a, b.driver_id AS id_b
            FROM results a
            JOIN results b ON (a.race_id = b.race_id AND b.driver_id = $2)
            JOIN races r ON a.race_id = r.id
            WHERE a.driver_id = $1
              AND r.date >= $3 AND r.date < $4
            ORDER BY r.round ASC;
        `;
        const h2hResult = await query(h2hSQL, [idA, idB, startDate, endDate]);

        let winsA = 0, winsB = 0;
        h2hResult.rows.forEach(row => {
            const aFinished = !row.dnf_a && row.pos_a;
            const bFinished = !row.dnf_b && row.pos_b;
            if (aFinished && bFinished) {
                if (row.pos_a < row.pos_b) winsA++;
                else winsB++;
            }
        });

        h2h = { races: h2hResult.rows, wins_a: winsA, wins_b: winsB };
    }

    return {
        drivers: statsResult.rows,
        perRace: perRaceResult.rows,
        h2h,
    };
};

export const createDriver = async (data, profileImageUrl) => {
    const { first_name, last_name, number, team_id, country, seasons } = data;

    // Si no se subió imagen, usamos el fallback oficial de F1
    const profile_image_url = profileImageUrl
        ?? 'https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/unknown.jpg.img.jpg';

    const seasonsToSave = seasons
        ? seasons.split(',').map(s => s.trim())
        : ['2026'];

    const driverRes = await query(
        `INSERT INTO drivers (first_name, last_name, permanent_number, constructor_id, country_code, profile_image_url, active_seasons)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [first_name, last_name, number, team_id, country, profile_image_url, seasonsToSave]
    );
    const newDriverId = driverRes.rows[0].id;

    for (const year of seasonsToSave) {
        await query(
            `INSERT INTO driver_seasons (driver_id, constructor_id, year)
             VALUES ($1, $2, $3) ON CONFLICT (driver_id, year) DO NOTHING`,
            [newDriverId, team_id, parseInt(year)]
        );
    }
};

// ── Asignar piloto a temporada/equipo ────────────────────────
export const assignDriverSeason = async ({ driver_id, constructor_id, year, number }) => {
    const yearInt = parseInt(year);
    const numVal  = number ? parseInt(number) : null;

    // 1. Upsert en driver_seasons
    await query(
        `INSERT INTO driver_seasons (driver_id, constructor_id, year, number)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (driver_id, year) DO UPDATE
           SET constructor_id = EXCLUDED.constructor_id,
               number = COALESCE(EXCLUDED.number, driver_seasons.number)`,
        [driver_id, constructor_id, yearInt, numVal]
    );

    // 2. Asegurar que el año está en active_seasons del driver
    const driverRow = await query(`SELECT active_seasons FROM drivers WHERE id = $1`, [driver_id]);
    const rawVal = driverRow.rows[0]?.active_seasons ?? '';
    // pg devuelve TEXT[] como array JS; en Supabase (varchar) llega como string "2025,2026" o "{2026}"
    let seasons;
    if (Array.isArray(rawVal)) {
        seasons = rawVal.map(String).filter(Boolean);
    } else {
        seasons = String(rawVal).replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean);
    }
    if (!seasons.includes(String(yearInt))) {
        seasons.push(String(yearInt));
        seasons.sort();
        // Si el tipo de columna es TEXT[] (local), pasar array JS; si es varchar (Supabase), pasar string
        const newVal = Array.isArray(rawVal) ? seasons : seasons.join(',');
        await query(`UPDATE drivers SET active_seasons = $1 WHERE id = $2`, [newVal, driver_id]);
    }

    // 3. Sync constructor_id si es el año actual
    const currentYear = new Date().getFullYear();
    if (yearInt === currentYear) {
        await query(`UPDATE drivers SET constructor_id = $1 WHERE id = $2`, [constructor_id, driver_id]);
    }
};

export const getDriverSeasons = async () => {
    const result = await query(`
        SELECT ds.id, ds.year, ds.driver_id,
               d.first_name || ' ' || d.last_name AS driver_name,
               c.name AS team_name, c.primary_color
        FROM driver_seasons ds
        JOIN drivers d      ON ds.driver_id = d.id
        JOIN constructors c ON ds.constructor_id = c.id
        ORDER BY ds.year DESC, d.last_name ASC
    `);
    return result.rows;
};
