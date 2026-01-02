import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { query } from './src/config/db.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const POINTS_SYSTEM = {
    1: 25,
    2: 18,
    3: 15,
    4: 12,
    5: 10,
    6: 8,
    7: 6,
    8: 4,
    9: 2,
    10: 1
    // Del 11 en adelante son 0 puntos automáticamente
};

// Middlewares
app.use(cors()); // Permite conexiones externas
app.use(express.json()); // Permite recibir JSON en POST
app.use('/images', express.static('public/images')); //Esto permite que http://localhost:3000/images/foto.jpg sea accesible

// EN server/server.js

// RUTA: OBTENER PILOTOS (CORREGIDA: CON PODIOS Y AÑO)
app.get('/api/drivers', async (req, res) => {
    try {
        const year = req.query.year || 2025;
        
        const sql = `
            SELECT 
                d.id, d.first_name, d.last_name, d.permanent_number, d.country_code, d.profile_image_url,
                c.name as team_name,
                c.primary_color,
                c.logo_url,
                -- 1. SUMA DE PUNTOS
                COALESCE(SUM(filtered_res.points), 0) as points,
                -- 2. RECUPERAMOS LOS PODIOS: Contamos solo si la posición es 1, 2 o 3
                COUNT(CASE 
                    WHEN filtered_res.position >= 1 AND filtered_res.position <= 3 THEN 1 
                END) as podiums
            FROM drivers d
            JOIN constructors c ON d.constructor_id = c.id
            -- SUBCONSULTA: Traemos puntos Y posición para hacer los cálculos
            LEFT JOIN (
                SELECT r_res.driver_id, r_res.points, r_res.position
                FROM results r_res
                JOIN races r ON r_res.race_id = r.id
                WHERE EXTRACT(YEAR FROM r.date) = $1
            ) filtered_res ON d.id = filtered_res.driver_id
            
            GROUP BY d.id, c.name, c.primary_color, c.logo_url, d.first_name, d.last_name, d.permanent_number, d.country_code, d.profile_image_url
            ORDER BY points DESC;
        `;
        
        const result = await query(sql, [year]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("ERROR SQL DRIVERS:", err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// RUTA CALENDARIO: Ahora acepta ?year=2026
app.get('/api/races', async (req, res) => {
    try {
        // Leemos el año de la URL (ej: /api/races?year=2026)
        // Si no envían año, usamos 2025 por defecto
        const year = req.query.year || '2025';

        const sql = `
            SELECT * FROM races 
            WHERE EXTRACT(YEAR FROM date) = $1 
            ORDER BY date ASC; -- Ordenar por fecha es mejor para calendarios
        `;

        const result = await query(sql, [year]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener el calendario' });
    }
});

// RUTA: RESULTADOS DE UNA CARRERA ESPECÍFICA
app.get('/api/races/:id/results', async (req, res) => {
    try {
        const { id } = req.params;
        const sql = `
            SELECT 
                res.position, 
                res.points,
                res.fastest_lap,
                res.dnf,
                d.first_name, 
                d.last_name, 
                c.name as team_name,
                c.primary_color
            FROM results res
            JOIN drivers d ON res.driver_id = d.id
            JOIN constructors c ON d.constructor_id = c.id
            WHERE res.race_id = $1
            
            -- CAMBIO AQUÍ:
            -- 1. 'res.dnf ASC': Los False (0) van primero, los True (1) van al final.
            -- 2. 'res.position ASC': Dentro de los que terminaron, ordena por puesto.
            ORDER BY (res.dnf OR res.dsq OR res.dns OR res.dnq) ASC, res.position ASC;
        `;
        const result = await query(sql, [id]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error cargando resultados de carrera' });
    }
});

app.get('/api/races/:id/qualifying', async (req, res) => {
    try {
        const { id } = req.params;
        const sql = `
            SELECT 
                q.position,
                q.q1, q.q2, q.q3,
                d.first_name, d.last_name,
                c.name as team_name, c.primary_color
            FROM qualifying q
            JOIN drivers d ON q.driver_id = d.id
            JOIN constructors c ON d.constructor_id = c.id
            WHERE q.race_id = $1
            ORDER BY q.position ASC;
        `;
        const result = await query(sql, [id]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al buscar qualy' });
    }
});

app.get('/api/races/:id/practices', async (req, res) => {
    try {
        const { id } = req.params;
        const sql = `
            SELECT 
                p.p1, p.p2, p.p3,
                d.last_name, 
                c.name as team_name, c.primary_color
            FROM practices p
            JOIN drivers d ON p.driver_id = d.id
            JOIN constructors c ON d.constructor_id = c.id
            WHERE p.race_id = $1
            ORDER BY p.p3 ASC; -- Ordenamos por el tiempo de la última práctica
        `;
        const result = await query(sql, [id]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al buscar prácticas' });
    }
});

app.get('/api/races', async (req, res) => {
    try {
        // Agregamos 'has_sprint' al SELECT
        const result = await query('SELECT * FROM races ORDER BY round ASC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener el calendario' });
    }
});

// NUEVA RUTA: Resultados Sprint
app.get('/api/races/:id/sprint', async (req, res) => {
    try {
        const { id } = req.params;
        const sql = `
            SELECT 
                s.position, s.points, s.time_gap,
                d.last_name, 
                c.name as team_name, c.primary_color
            FROM sprint_results s
            JOIN drivers d ON s.driver_id = d.id
            JOIN constructors c ON d.constructor_id = c.id
            WHERE s.race_id = $1
            ORDER BY s.position ASC;
        `;
        const result = await query(sql, [id]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error buscando sprint' });
    }
});

// NUEVA RUTA: Sprint Qualifying (Shootout)
app.get('/api/races/:id/sprint-qualifying', async (req, res) => {
    try {
        const { id } = req.params;
        const sql = `
            SELECT 
                sq.position, sq.sq1, sq.sq2, sq.sq3,
                d.last_name, 
                c.name as team_name, c.primary_color
            FROM sprint_qualifying sq
            JOIN drivers d ON sq.driver_id = d.id
            JOIN constructors c ON d.constructor_id = c.id
            WHERE sq.race_id = $1
            ORDER BY sq.position ASC;
        `;
        const result = await query(sql, [id]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error en Sprint Qualy' });
    }
});

// NUEVA RUTA: Tabla de Posiciones (Standings)
app.get('/api/standings', async (req, res) => {
    try {
        // SQL MAESTRO:
        // 1. Sumamos puntos de carreras (tabla results)
        // 2. Sumamos puntos de sprints (tabla sprint_results)
        // 3. Sumamos ambos totales
        // COALESCE sirve para convertir "null" en "0" si no tienen puntos.

        const sql = `
            SELECT 
                d.id, 
                d.permanent_number,
                d.first_name, 
                d.last_name, 
                d.country_code,
                c.name as team_name,
                c.primary_color,
                (
                    COALESCE((SELECT SUM(points) FROM results WHERE driver_id = d.id), 0) + 
                    COALESCE((SELECT SUM(points) FROM sprint_results WHERE driver_id = d.id), 0)
                ) as total_points
            FROM drivers d
            JOIN constructors c ON d.constructor_id = c.id
            ORDER BY total_points DESC;
        `;

        const result = await query(sql);
        res.json({ success: true, data: result.rows });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error calculando posiciones' });
    }
});

// NUEVA RUTA: Campeonato de Constructores
app.get('/api/standings/constructors', async (req, res) => {
    try {
        // SQL MAESTRO DE CONSTRUCTORES:
        // 1. Unimos Constructores con Pilotos.
        // 2. Por cada piloto, calculamos sus puntos totales (Carrera + Sprint).
        // 3. SUMAMOS los puntos de todos los pilotos del mismo equipo (GROUP BY).

        const sql = `
            SELECT 
                c.name,
                c.primary_color,
                c.logo_url,
                SUM(
                    COALESCE((SELECT SUM(points) FROM results WHERE driver_id = d.id), 0) + 
                    COALESCE((SELECT SUM(points) FROM sprint_results WHERE driver_id = d.id), 0)
                ) as total_points
            FROM constructors c
            JOIN drivers d ON c.id = d.constructor_id
            GROUP BY c.id, c.name, c.primary_color, c.logo_url
            ORDER BY total_points DESC;
        `;

        const result = await query(sql);
        res.json({ success: true, data: result.rows });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error calculando constructores' });
    }
});


// RUTA: GUARDAR RESULTADO (Con DNF y Puntos Automáticos)
app.post('/api/results', async (req, res) => {
    try {
        const { race_id, driver_id, position, fastest_lap, dnf, dsq, dns, dnq } = req.body; // <--- Agregamos nuevos
        
        // 1. Calcular Puntos Base
        let calculatedPoints = POINTS_SYSTEM[position] || 0;

        // 2. Regla DNF: Si abandonó, los puntos son SIEMPRE 0 (sin importar la posición)
        if (dnf || dsq || dns || dnq) {
            calculatedPoints = 0;
        } else {
            // Solo sumamos vuelta rápida si NO es DNF y está en el Top 10
            if (fastest_lap === true && position <= 10) {
                calculatedPoints += 1;
            }
        }

        // 3. Guardar en BD
        const sql = `
            INSERT INTO results (race_id, driver_id, position, points, fastest_lap, dnf, dsq, dns, dnq)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;

        await query(sql, [race_id, driver_id, position, calculatedPoints, fastest_lap, dnf, dsq, dns, dnq]);

        res.json({ success: true, points: calculatedPoints });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error guardando resultado' });
    }
});

// NUEVA RUTA: Historial de resultados de un piloto
app.get('/api/drivers/:id/results', async (req, res) => {
    try {
        const { id } = req.params;
        const sql = `
            SELECT 
                r.name as race_name, 
                r.round, 
                res.position,
                res.fastest_lap,
                res.dnf
            FROM results res
            JOIN races r ON res.race_id = r.id
            WHERE res.driver_id = $1
            ORDER BY r.round ASC;
        `;
        const result = await query(sql, [id]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err); // <--- Esto muestra el error real en tu terminal negra
        res.status(500).json({ error: 'Error buscando historial' });
    }
});

// RUTA: CAMPEONATO DE CONSTRUCTORES
app.get('/api/constructors-standings', async (req, res) => {
    try {
        const year = req.query.year || 2025;
        
        const sql = `
            SELECT 
                c.id, 
                c.name, 
                c.logo_url, 
                c.primary_color,
                COALESCE(SUM(filtered_res.points), 0) as points
            FROM constructors c
            JOIN drivers d ON c.id = d.constructor_id
            -- Misma lógica de filtrado por año
            LEFT JOIN (
                SELECT r_res.driver_id, r_res.points
                FROM results r_res
                JOIN races r ON r_res.race_id = r.id
                WHERE EXTRACT(YEAR FROM r.date) = $1
            ) filtered_res ON d.id = filtered_res.driver_id
            
            GROUP BY c.id, c.name, c.logo_url, c.primary_color
            ORDER BY points DESC;
        `;
        
        const result = await query(sql, [year]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("ERROR SQL CONSTRUCTORS:", err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Arrancar servidor
app.listen(port, () => {
    console.log(`\n🏎️  Motor arrancado en: http://localhost:${port}`);
    console.log(`📡 Esperando peticiones...\n`);
});