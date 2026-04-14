// server/src/routes/teams.routes.js
import { Router } from 'express';
import { query } from '../config/db.js';
import { createUpload } from '../config/upload.js';
import { adminAuth } from '../middleware/auth.middleware.js';

const router = Router();
const upload = createUpload('teams'); // Imágenes en R2 bajo el prefijo "teams/"

// ── 1. LISTAR EQUIPOS ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT * FROM constructors ORDER BY name ASC');
        res.json({ success: true, data: result.rows });
    } catch (e) {
        console.error('❌ [Teams] Error al listar:', e.message);
        res.status(500).json({ error: 'Error al obtener equipos' });
    }
});

// ── 2. CREAR EQUIPO ─────────────────────────────────────────────────────────
router.post(
    '/',
    adminAuth,
    ...upload.single('logo_image'),
    async (req, res) => {
        try {
            const { name, primary_color, active_seasons } = req.body;

            // req.fileUrl es la URL absoluta de R2 (o undefined si no se subió imagen)
            const logo_url = req.fileUrl ?? null;

            const seasons = active_seasons
                ? (typeof active_seasons === 'string' ? JSON.parse(active_seasons) : active_seasons)
                : [];

            await query(
                `INSERT INTO constructors (name, primary_color, logo_url, active_seasons)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [name, primary_color, logo_url, seasons]
            );

            res.json({ success: true, message: 'Escudería creada exitosamente' });
        } catch (e) {
            console.error('❌ [Teams] Error al crear:', e.message);
            res.status(500).json({ error: 'No se pudo crear la escudería' });
        }
    }
);

// ── 3. ELIMINAR EQUIPO ──────────────────────────────────────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        // Liberar pilotos antes de borrar el equipo (integridad referencial)
        await query('UPDATE drivers SET constructor_id = NULL WHERE constructor_id = $1', [id]);
        await query('DELETE FROM constructors WHERE id = $1', [id]);
        res.json({ success: true, message: 'Escudería eliminada' });
    } catch (e) {
        console.error('❌ [Teams] Error al eliminar:', e.message);
        res.status(500).json({ error: 'No se pudo eliminar la escudería' });
    }
});

export default router;
