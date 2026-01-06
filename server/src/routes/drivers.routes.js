import { Router } from 'express';
import { query } from '../config/db.js';
import { createUpload } from '../config/upload.js';

const router = Router();
const upload = createUpload('pilots');

// 1. OBTENER PILOTOS (FILTRADOS POR TEMPORADA ACTIVA)
router.get('/', async (req, res) => {
    try {
        const year = req.query.year || '2025';
        
        // 👇 CAMBIO CLAVE: Agregamos el filtro WHERE active_seasons LIKE ...
        const sql = `
            SELECT 
                d.id, d.first_name, d.last_name, d.permanent_number, d.country_code, d.profile_image_url,
                c.name as team_name,
                c.primary_color,
                c.logo_url,
                COALESCE(SUM(filtered_res.points), 0) as points,
                COUNT(CASE 
                    WHEN filtered_res.position >= 1 AND filtered_res.position <= 3 THEN 1 
                END) as podiums
            FROM drivers d
            JOIN constructors c ON d.constructor_id = c.id
            LEFT JOIN (
                SELECT r_res.driver_id, r_res.points, r_res.position
                FROM results r_res
                JOIN races r ON r_res.race_id = r.id
                WHERE EXTRACT(YEAR FROM r.date) = $1
            ) filtered_res ON d.id = filtered_res.driver_id
            
            WHERE d.active_seasons LIKE $2  -- <--- FILTRO DE AÑO ACTIVO

            GROUP BY d.id, c.name, c.primary_color, c.logo_url, d.first_name, d.last_name, d.permanent_number, d.country_code, d.profile_image_url
            ORDER BY points DESC, d.last_name ASC;
        `;
        
        // Pasamos el año exacto para filtrar resultados ($1)
        // Y el año como texto parcial para filtrar actividad ($2) -> ej: "%2025%"
        const result = await query(sql, [year, `%${year}%`]);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("ERROR SQL DRIVERS:", err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// 2. HISTORIAL DE UN PILOTO (Sigue igual)
router.get('/:id/results', async (req, res) => {
    try {
        const { id } = req.params;
        const sql = `
            SELECT 
                r.name as race_name, 
                r.round, 
                res.position,
                res.fastest_lap,
                res.points,
                res.dnf, res.dsq, res.dns, res.dnq
            FROM results res
            JOIN races r ON res.race_id = r.id
            WHERE res.driver_id = $1
            ORDER BY r.round ASC;
        `;
        const result = await query(sql, [id]);
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