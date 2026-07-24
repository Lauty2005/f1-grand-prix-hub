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

// ─── "Estratega de Boxes" ───────────────────────────────────────────────────
// Por carrera con datos de pit stops cargados (race_strategies): la secuencia
// real de compuestos que usó el ganador, en orden de stint. El jugador arma
// su propia estrategia (cantidad de paradas + compuestos) antes de ver esto,
// y se compara del lado del cliente.
export const getStrategyPool = async () => {
    const sql = `
        SELECT
            r.id, r.name AS race_name, r.circuit_name, r.country_code, r.total_laps,
            array_agg(rs.tire_compound ORDER BY rs.stint_number) AS actual_compounds
        FROM races r
        JOIN results res         ON res.race_id = r.id AND res.position = 1
                                     AND NOT res.dnf AND NOT res.dsq AND NOT res.dns
        JOIN race_strategies rs  ON rs.race_id = r.id AND rs.driver_id = res.driver_id
        GROUP BY r.id, r.name, r.circuit_name, r.country_code, r.total_laps
        ORDER BY r.date DESC;
    `;
    const result = await query(sql);
    return result.rows;
};
