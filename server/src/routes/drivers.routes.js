import { Router } from 'express';
import { query } from '../config/db.js';
import { createUpload } from '../config/upload.js';

const router = Router();
const upload = createUpload('pilots');

// 1. OBTENER PILOTOS (SUMANDO CARRERA + SPRINT)
router.get('/', async (req, res) => {
    try {
        const year = req.query.year || '2025';
        
        // 👇 SQL MEJORADO: Suma puntos de ambas tablas sin duplicar filas
        const sql = `
            SELECT 
                d.id, d.first_name, d.last_name, d.permanent_number, d.country_code, d.profile_image_url,
                c.name as team_name,
                c.primary_color,
                c.logo_url,
                
                -- 👇 AQUÍ ESTÁ LA MAGIA: Sumamos los dos totales pre-calculados
                (COALESCE(race_stats.total_points, 0) + COALESCE(sprint_stats.total_points, 0)) as points,
                
                COALESCE(race_stats.podiums, 0) as podiums

            FROM drivers d
            JOIN constructors c ON d.constructor_id = c.id
            
            -- 1. Subconsulta para PUNTOS DE CARRERA
            LEFT JOIN (
                SELECT 
                    r_res.driver_id, 
                    SUM(r_res.points) as total_points,
                    COUNT(CASE WHEN r_res.position BETWEEN 1 AND 3 THEN 1 END) as podiums
                FROM results r_res
                JOIN races r ON r_res.race_id = r.id
                WHERE EXTRACT(YEAR FROM r.date) = $1
                GROUP BY r_res.driver_id
            ) race_stats ON d.id = race_stats.driver_id

            -- 2. Subconsulta para PUNTOS DE SPRINT
            LEFT JOIN (
                SELECT 
                    s_res.driver_id, 
                    SUM(s_res.points) as total_points
                FROM sprint_results s_res
                JOIN races r ON s_res.race_id = r.id
                WHERE EXTRACT(YEAR FROM r.date) = $1
                GROUP BY s_res.driver_id
            ) sprint_stats ON d.id = sprint_stats.driver_id
            
            WHERE d.active_seasons LIKE $2

            ORDER BY points DESC, d.last_name ASC;
        `;
        
        const result = await query(sql, [year, `%${year}%`]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("ERROR SQL DRIVERS:", err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// 2. HISTORIAL DE UN PILOTO (INCLUYENDO SPRINT) - FILTRADO POR AÑO
router.get('/:id/results', async (req, res) => {
    try {
        const { id } = req.params;
        // 👇 1. Recibimos el año por query (si no viene, usa 2025)
        const year = req.query.year || '2025'; 

        const sql = `
            SELECT 
                r.name as race_name, 
                r.round, 
                r.has_sprint,
                res.position,
                res.fastest_lap,
                res.dnf, res.dsq, res.dns, res.dnq,
                
                (res.points + COALESCE(s.points, 0)) as points,
                
                res.points as race_points,
                COALESCE(s.points, 0) as sprint_points

            FROM results res
            JOIN races r ON res.race_id = r.id
            LEFT JOIN sprint_results s ON (r.id = s.race_id AND res.driver_id = s.driver_id)
            
            WHERE res.driver_id = $1
            AND EXTRACT(YEAR FROM r.date) = $2  -- 👈 2. FILTRO CLAVE: Solo carreras de ese año
            ORDER BY r.round ASC;
        `;
        
        // 👇 3. Pasamos 'year' como segundo parámetro
        const result = await query(sql, [id, year]); 
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error buscando historial' });
    }
});

// 3. ELIMINAR PILOTO (Sigue igual)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM results WHERE driver_id = $1', [id]);
        await query('DELETE FROM sprint_results WHERE driver_id = $1', [id]);
        await query('DELETE FROM qualifying WHERE driver_id = $1', [id]);
        await query('DELETE FROM sprint_qualifying WHERE driver_id = $1', [id]);
        await query('DELETE FROM practices WHERE driver_id = $1', [id]);
        await query('DELETE FROM drivers WHERE id = $1', [id]);
        res.json({ success: true, message: 'Piloto eliminado correctamente' });
    } catch (err) {
        console.error("Error eliminando piloto:", err);
        res.status(500).json({ error: 'No se pudo eliminar al piloto' });
    }
});

// 4. OBTENER EQUIPOS (Sigue igual)
router.get('/teams/list', async (req, res) => {
    try {
        const result = await query('SELECT id, name FROM constructors ORDER BY name ASC');
        res.json({ success: true, data: result.rows });
    } catch (e) { res.status(500).json({ error: 'Error cargando equipos' }); }
});

// 5. CREAR NUEVO PILOTO (ACTUALIZADO CON SEASONS)
router.post('/', upload.single('profile_image'), async (req, res) => {
    try {
        // 👇 Recibimos 'seasons' del formulario
        const { first_name, last_name, number, team_id, country, seasons } = req.body;
        
        let profile_image_url = null;
        if (req.file) {
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            profile_image_url = `${baseUrl}/images/pilots/${req.file.filename}`;
        } else {
            profile_image_url = 'https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/unknown.jpg.img.jpg';
        }

        // Si no mandan temporadas, ponemos las dos por defecto
        const seasonsToSave = seasons || '2025,2026';

        // 👇 Agregamos active_seasons al INSERT
        await query(
            `INSERT INTO drivers (first_name, last_name, permanent_number, constructor_id, country_code, profile_image_url, active_seasons) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [first_name, last_name, number, team_id, country, profile_image_url, seasonsToSave]
        );
        res.json({ success: true, message: 'Piloto creado' });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: 'Error al crear piloto: ' + e.message }); 
    }
});

export default router;