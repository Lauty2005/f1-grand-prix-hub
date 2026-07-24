// server/src/services/game.service.js
// Datos para los mini-juegos del hub. "Mayor o Menor" reutiliza el mismo patrón
// de agregación de estadísticas que drivers.service.js#compareDrivers, pero sin
// filtrar por IDs: devuelve el pool completo de pilotos con carreras corridas
// en la temporada para que el juego elija pares al azar del lado del cliente.
import { query } from '../config/db.js';

export const getStatsPool = async (year) => {
    const sql = `
        SELECT
            d.id, d.first_name, d.last_name,
            COALESCE(ds.number, d.permanent_number) AS permanent_number,
            d.country_code, d.profile_image_url,
            c.name AS team_name, c.primary_color, c.logo_url,
            (COALESCE(rp.total_points, 0) + COALESCE(sp.total_points, 0)) AS points,
            COALESCE(rp.wins,          0) AS wins,
            COALESCE(rp.podiums,       0) AS podiums,
            COALESCE(rp.top5,          0) AS top5,
            COALESCE(rp.top10,         0) AS top10,
            COALESCE(rp.fastest_laps,  0) AS fastest_laps,
            COALESCE(rp.races,         0) AS races
        FROM drivers d
        JOIN driver_seasons ds ON ds.driver_id = d.id AND ds.year = $4::int
        JOIN constructors c    ON c.id = ds.constructor_id
        LEFT JOIN (
            SELECT
                res.driver_id,
                SUM(res.points) AS total_points,
                COUNT(*) FILTER (WHERE res.position = 1  AND NOT res.dnf AND NOT res.dsq AND NOT res.dns) AS wins,
                COUNT(*) FILTER (WHERE res.position <= 3 AND NOT res.dnf AND NOT res.dsq AND NOT res.dns) AS podiums,
                COUNT(*) FILTER (WHERE res.position <= 5 AND NOT res.dnf AND NOT res.dsq AND NOT res.dns) AS top5,
                COUNT(*) FILTER (WHERE res.position <= 10 AND NOT res.dnf AND NOT res.dsq AND NOT res.dns) AS top10,
                COUNT(*) FILTER (WHERE res.fastest_lap) AS fastest_laps,
                COUNT(*) AS races
            FROM results res
            JOIN races r ON res.race_id = r.id
            WHERE r.date >= $1 AND r.date < $2
            GROUP BY res.driver_id
        ) rp ON d.id = rp.driver_id
        LEFT JOIN (
            SELECT s.driver_id, SUM(s.points) AS total_points
            FROM sprint_results s
            JOIN races r ON s.race_id = r.id
            WHERE r.date >= $1 AND r.date < $2
            GROUP BY s.driver_id
        ) sp ON d.id = sp.driver_id
        WHERE d.active_seasons::text LIKE $3
          AND d.is_practice_only = false
          AND rp.races > 0
        ORDER BY points DESC;
    `;
    const startDate = `${year}-01-01`;
    const endDate = `${parseInt(year) + 1}-01-01`;
    const result = await query(sql, [startDate, endDate, `%${year}%`, year]);
    return result.rows;
};

// ─── "Adivina el Piloto" ────────────────────────────────────────────────────
// Pool de identidad: todos los pilotos con al menos una temporada cargada
// (titulares y reservas, sin filtrar por carreras corridas), con su equipo
// más reciente y el año de debut calculado sobre todas sus temporadas.
export const getGuessPool = async () => {
    const sql = `
        SELECT DISTINCT ON (d.id)
            d.id, d.first_name, d.last_name, d.country_code, d.profile_image_url,
            d.is_practice_only,
            COALESCE(ds.number, d.permanent_number) AS number,
            c.name AS team_name, c.primary_color, c.logo_url,
            debut.debut_year
        FROM drivers d
        JOIN driver_seasons ds ON ds.driver_id = d.id
        JOIN constructors c    ON c.id = ds.constructor_id
        JOIN (
            SELECT driver_id, MIN(year) AS debut_year
            FROM driver_seasons
            GROUP BY driver_id
        ) debut ON debut.driver_id = d.id
        ORDER BY d.id, ds.year DESC;
    `;
    const result = await query(sql);
    return result.rows;
};

// ─── "Silueta del Circuito" ─────────────────────────────────────────────────
// Un registro por circuito (deduplicado por circuit_name, quedándose con la
// carrera más reciente que tenga imagen cargada) para evitar mostrar el mismo
// trazado dos veces como opciones distintas cuando se repite entre temporadas.
export const getCircuitPool = async () => {
    const sql = `
        SELECT DISTINCT ON (circuit_name)
            id, name AS race_name, circuit_name, country_code, map_image_url
        FROM races
        WHERE map_image_url IS NOT NULL AND map_image_url <> ''
        ORDER BY circuit_name, date DESC;
    `;
    const result = await query(sql);
    return result.rows;
};

// ─── "Grid Inmaculado" ──────────────────────────────────────────────────────
// Por piloto: todos los equipos por los que pasó (con cantidad de carreras
// por equipo, para categorías tipo "corrió más de N carreras para X"), países
// donde ganó (para categorías tipo "ganó en Australia"), temporadas corridas,
// y logros agregados sobre todos los resultados cargados (sin acotar por año,
// dado que solo hay 2025-2026 por ahora). El armado de la grilla — mezclar
// categorías de cualquier tipo en filas/columnas y validar que cada celda
// tenga respuesta — se hace del lado del cliente sobre este pool completo.
export const getGridPool = async () => {
    const sql = `
        WITH per_race AS (
            SELECT
                res.driver_id, res.position, res.dnf, res.dsq, res.dns, res.fastest_lap,
                r.country_code,
                c.id AS constructor_id, c.name AS team_name, c.primary_color, c.logo_url
            FROM results res
            JOIN races r           ON r.id = res.race_id
            JOIN driver_seasons ds ON ds.driver_id = res.driver_id AND ds.year = EXTRACT(YEAR FROM r.date)::int
            JOIN constructors c    ON c.id = ds.constructor_id
        ),
        driver_teams AS (
            SELECT DISTINCT ds.driver_id, c.name AS team_name, c.primary_color, c.logo_url
            FROM driver_seasons ds
            JOIN constructors c ON c.id = ds.constructor_id
        ),
        driver_seasons_years AS (
            SELECT driver_id, ARRAY_AGG(DISTINCT year) AS seasons
            FROM driver_seasons
            GROUP BY driver_id
        ),
        team_races AS (
            SELECT driver_id, jsonb_agg(jsonb_build_object('team_name', team_name, 'races', races)) AS team_races
            FROM (
                SELECT driver_id, team_name, COUNT(*) AS races
                FROM per_race
                GROUP BY driver_id, team_name
            ) t
            GROUP BY driver_id
        ),
        win_countries AS (
            SELECT driver_id, array_agg(DISTINCT country_code::text) AS win_countries
            FROM per_race
            WHERE position = 1 AND NOT dnf AND NOT dsq AND NOT dns
            GROUP BY driver_id
        ),
        driver_stats AS (
            SELECT
                driver_id,
                COUNT(*) FILTER (WHERE position = 1  AND NOT dnf AND NOT dsq AND NOT dns) AS wins,
                COUNT(*) FILTER (WHERE position <= 3 AND NOT dnf AND NOT dsq AND NOT dns) AS podiums,
                COUNT(*) FILTER (WHERE position <= 10 AND NOT dnf AND NOT dsq AND NOT dns) AS top10,
                COUNT(*) FILTER (WHERE fastest_lap) AS fastest_laps
            FROM results
            GROUP BY driver_id
        )
        SELECT
            d.id, d.first_name, d.last_name, d.country_code, d.profile_image_url, d.is_practice_only,
            jsonb_agg(DISTINCT jsonb_build_object('name', dt.team_name, 'primary_color', dt.primary_color, 'logo_url', dt.logo_url)) AS teams,
            dsy.seasons,
            COALESCE(tr.team_races, '[]'::jsonb)         AS team_races,
            COALESCE(wc.win_countries, ARRAY[]::text[])  AS win_countries,
            COALESCE(ds_stats.wins,         0) AS wins,
            COALESCE(ds_stats.podiums,      0) AS podiums,
            COALESCE(ds_stats.top10,        0) AS top10,
            COALESCE(ds_stats.fastest_laps, 0) AS fastest_laps
        FROM drivers d
        JOIN driver_teams dt              ON dt.driver_id = d.id
        JOIN driver_seasons_years dsy     ON dsy.driver_id = d.id
        LEFT JOIN driver_stats ds_stats   ON ds_stats.driver_id = d.id
        LEFT JOIN team_races tr           ON tr.driver_id = d.id
        LEFT JOIN win_countries wc        ON wc.driver_id = d.id
        GROUP BY d.id, dsy.seasons, ds_stats.wins, ds_stats.podiums, ds_stats.top10, ds_stats.fastest_laps,
                 tr.team_races, wc.win_countries
        ORDER BY d.last_name;
    `;
    const result = await query(sql);
    return result.rows;
};
