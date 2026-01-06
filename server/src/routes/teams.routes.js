import { Router } from 'express';
import { query } from '../config/db.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configuración de Multer (Logos)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(process.cwd(), 'public', 'images', 'teams');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const cleanName = file.originalname.toLowerCase().replace(/\s+/g, '-');
        cb(null, cleanName);
    }
});
const upload = multer({ storage: storage });

// 1. OBTENER EQUIPOS
router.get('/', async (req, res) => {
    try {
        const sql = 'SELECT * FROM constructors ORDER BY name ASC';
        const result = await query(sql);
        res.json({ success: true, data: result.rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener equipos' });
    }
});

// 2. CREAR EQUIPO (SIN PAÍS)
router.post('/', upload.single('logo_image'), async (req, res) => {
    try {
        // 👇 SOLO RECIBIMOS NOMBRE Y COLOR
        const { name, primary_color } = req.body;
        
        let logo_url = null;
        if (req.file) {
            logo_url = `/images/teams/${req.file.filename}`;
        }

        // 👇 SQL SIMPLIFICADO (Sin country_code)
        const sql = `
            INSERT INTO constructors (name, primary_color, logo_url)
            VALUES ($1, $2, $3)
            RETURNING id
        `;
        await query(sql, [name, primary_color, logo_url]);
        
        res.json({ success: true, message: 'Escudería creada' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error creando escudería: ' + e.message });
    }
});

// 3. ELIMINAR EQUIPO
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Primero desvinculamos pilotos
        await query('UPDATE drivers SET constructor_id = NULL WHERE constructor_id = $1', [id]);
        // Luego borramos el equipo
        await query('DELETE FROM constructors WHERE id = $1', [id]);
        
        res.json({ success: true, message: 'Escudería eliminada' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'No se pudo eliminar' });
    }
});

export default router;