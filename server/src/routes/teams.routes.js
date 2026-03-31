import { Router } from 'express';
import { query } from '../config/db.js';
import { createUpload } from '../config/upload.js'; // 👇 Usamos tu helper
import { adminAuth } from '../middleware/auth.middleware.js';

const router = Router();
const upload = createUpload('teams'); // Las imágenes irán a public/images/teams

// 1. LISTAR EQUIPOS (Para selectores y gestión)
router.get('/', async (req, res) => {
    try {
        const sql = 'SELECT * FROM constructors ORDER BY name ASC';
        const result = await query(sql);
        res.json({ success: true, data: result.rows });
    } catch (e) {
        console.error("❌ [Teams] Error al listar:", e.message);
        res.status(500).json({ error: 'Error al obtener equipos' });
    }
});

// 2. CREAR EQUIPO
router.post('/', adminAuth, upload.single('logo_image'), async (req, res) => {
    try {
        const { name, primary_color, active_seasons } = req.body;

        let logo_url = null;
        if (req.file) {
            logo_url = `/images/teams/${req.file.filename}`;
        }

        // active_seasons viene como JSON string o array
        let seasons = [];
        if (active_seasons) {
            seasons = typeof active_seasons === 'string' ? JSON.parse(active_seasons) : active_seasons;
        }

        await query(
            `INSERT INTO constructors (name, primary_color, logo_url, active_seasons)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [name, primary_color, logo_url, seasons]
        );
        res.json({ success: true, message: 'Escudería creada exitosamente' });

    } catch (e) {
        console.error("❌ [Teams] Error al crear:", e.message);
        res.status(500).json({ error: 'No se pudo crear la escudería' });
    }
});

// 3. ELIMINAR EQUIPO
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Primero liberamos a los pilotos (set NULL) para no romper integridad
        await query('UPDATE drivers SET constructor_id = NULL WHERE constructor_id = $1', [id]);
        
        // Luego borramos el equipo
        await query('DELETE FROM constructors WHERE id = $1', [id]);
        
        res.json({ success: true, message: 'Escudería eliminada' });
    } catch (e) {
        console.error("❌ [Teams] Error al eliminar:", e.message);
        res.status(500).json({ error: 'No se pudo eliminar la escudería' });
    }
});

export default router;