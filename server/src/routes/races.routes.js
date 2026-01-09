import { Router } from 'express';
import { query } from '../config/db.js';
import multer from 'multer'; // Asegúrate de tener instalado multer (npm i multer)
import path from 'path';
import fs from 'fs'; // 👈 IMPORTANTE: Agrega esto para manejar carpetas

const router = Router();
const POINTS_SYSTEM = { 1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1 };

// --- CONFIGURACIÓN DE MULTER (MEJORADA) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // 1. Definir subcarpeta según el tipo de imagen
        let subFolder = 'schedule';
        if (file.fieldname === 'circuit_image') {
            subFolder = 'circuits';
        }

        // 2. USAR RUTA ABSOLUTA (Esta es la clave)
        // process.cwd() obtiene la carpeta raíz donde corre el servidor
        const uploadPath = path.join(process.cwd(), '../public', 'images', subFolder);
        
        // 3. Imprimir en consola para verificar (MIRA TU TERMINAL AL GUARDAR)
        console.log(`📂 Guardando archivo en: ${uploadPath}`);

        // 4. Crear carpeta si no existe
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

// Configuramos para recibir 2 campos: 'map_image' y 'circuit_image'
const uploadFields = upload.fields([
    { name: 'map_image', maxCount: 1 },
    { name: 'circuit_image', maxCount: 1 }
]);

// 1. OBTENER CALENDARIO
router.get('/', async (req, res) => {
    try {
        const year = req.query.year || '2025';
        const sql = `SELECT * FROM races WHERE EXTRACT(YEAR FROM date) = $1 ORDER BY date ASC;`;
        const result = await query(sql, [year]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener calendario' });
    }
});

// 2. OBTENER UNA CARRERA POR ID (Incluyendo la nueva imagen)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sql = `
            SELECT 
                id, name, round, circuit_name, country_code, date, 
                map_image_url, 
                circuit_image_url, -- <--- AGREGADO
                has_sprint,
                circuit_length, total_laps, race_distance, lap_record 
            FROM races 
            WHERE id = $1
        `;
        const result = await query(sql, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Carrera no encontrada' });
        }
        res.json({ success: true, data: result.rows[0] });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// 2. ELIMINAR CARRERA (¡NUEVO!)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM results WHERE race_id = $1', [id]);
        await query('DELETE FROM qualifying WHERE race_id = $1', [id]);
        await query('DELETE FROM practices WHERE race_id = $1', [id]);
        await query('DELETE FROM sprint_results WHERE race_id = $1', [id]);
        await query('DELETE FROM sprint_qualifying WHERE race_id = $1', [id]);
        await query('DELETE FROM races WHERE id = $1', [id]);
        res.json({ success: true, message: 'Carrera eliminada correctamente' });
    } catch (err) { res.status(500).json({ error: 'No se pudo eliminar' }); }
});

// 3. GUARDAR RESULTADO (POST)
router.post('/results', async (req, res) => {
    try {
        const { race_id, driver_id, position, fastest_lap, dnf, dsq, dns, dnq } = req.body;

        let calculatedPoints = POINTS_SYSTEM[position] || 0;
        if (dnf || dsq || dns || dnq) {
            calculatedPoints = 0;
        } else {
            if (fastest_lap === true && position <= 10) calculatedPoints += 1;
        }

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

// --- SUB-RUTAS DE DETALLES DE CARRERA ---

router.get('/:id/results', async (req, res) => {
    try {
        const sql = `
            SELECT res.*, d.first_name, d.last_name, c.name as team_name, c.primary_color
            FROM results res
            JOIN drivers d ON res.driver_id = d.id
            JOIN constructors c ON d.constructor_id = c.id
            WHERE res.race_id = $1
            ORDER BY (res.dnf OR res.dsq OR res.dns OR res.dnq) ASC, res.position ASC;
        `;
        const result = await query(sql, [req.params.id]);
        res.json({ success: true, data: result.rows });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

router.get('/:id/qualifying', async (req, res) => {
    try {
        const sql = `
            SELECT q.*, d.first_name, d.last_name, c.name as team_name, c.primary_color
            FROM qualifying q
            JOIN drivers d ON q.driver_id = d.id
            JOIN constructors c ON d.constructor_id = c.id
            WHERE q.race_id = $1 ORDER BY q.position ASC;
        `;
        const result = await query(sql, [req.params.id]);
        res.json({ success: true, data: result.rows });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

router.get('/:id/practices', async (req, res) => {
    try {
        const sql = `
            SELECT p.*, d.first_name, d.last_name, c.name as team_name, c.primary_color
            FROM practices p
            JOIN drivers d ON p.driver_id = d.id
            JOIN constructors c ON d.constructor_id = c.id
            WHERE p.race_id = $1
            ORDER BY d.last_name ASC;
        `;
        const result = await query(sql, [req.params.id]);
        res.json({ success: true, data: result.rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error cargando prácticas' });
    }
});

router.get('/:id/sprint', async (req, res) => {
    try {
        const sql = `
            SELECT s.*, d.first_name, d.last_name, c.name as team_name, c.primary_color
            FROM sprint_results s
            JOIN drivers d ON s.driver_id = d.id
            JOIN constructors c ON d.constructor_id = c.id
            WHERE s.race_id = $1
            ORDER BY s.position ASC;
        `;
        const result = await query(sql, [req.params.id]);
        res.json({ success: true, data: result.rows });
    } catch (e) { res.status(500).json({ error: 'Error al cargar Sprint' }); }
});

router.get('/:id/sprint-qualifying', async (req, res) => {
    try {
        const sql = `
            SELECT sq.*, d.first_name, d.last_name, c.name as team_name, c.primary_color
            FROM sprint_qualifying sq
            JOIN drivers d ON sq.driver_id = d.id
            JOIN constructors c ON d.constructor_id = c.id
            WHERE sq.race_id = $1
            ORDER BY sq.position ASC;
        `;
        const result = await query(sql, [req.params.id]);
        res.json({ success: true, data: result.rows });
    } catch (e) { res.status(500).json({ error: 'Error al cargar Sprint Qualy' }); }
});

// --- RUTAS DE CARGA DE DATOS (POST) ---

// 1. GUARDAR SPRINT
router.post('/sprint', async (req, res) => {
    try {
        const { race_id, driver_id, position, dnf, time_gap } = req.body;

        // Sistema de puntos Sprint 2025 (8 para el 1ro, hasta 1 para el 8vo)
        let points = 0;
        if (!dnf && position <= 8) points = 9 - position;

        await query(
            `INSERT INTO sprint_results (race_id, driver_id, position, points, dnf, time_gap) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [race_id, driver_id, position, points, dnf, time_gap]
        );
        res.json({ success: true, points });
    } catch (e) { res.status(500).json({ error: 'Error guardando Sprint' }); }
});

// 2. GUARDAR CLASIFICACIÓN
router.post('/qualifying', async (req, res) => {
    try {
        const { race_id, driver_id, position, q1, q2, q3 } = req.body;
        await query(
            `INSERT INTO qualifying (race_id, driver_id, position, q1, q2, q3) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [race_id, driver_id, position, q1, q2, q3]
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error guardando Qualy' }); }
});

// 3. GUARDAR SPRINT SHOOTOUT
router.post('/sprint-qualifying', async (req, res) => {
    try {
        const { race_id, driver_id, position, sq1, sq2, sq3 } = req.body;
        await query(
            `INSERT INTO sprint_qualifying (race_id, driver_id, position, sq1, sq2, sq3) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [race_id, driver_id, position, sq1, sq2, sq3]
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error guardando Shootout' }); }
});

// 4. GUARDAR PRÁCTICAS
router.post('/practices', async (req, res) => {
    try {
        const { race_id, driver_id, p1, p2, p3 } = req.body;
        await query(
            `INSERT INTO practices (race_id, driver_id, p1, p2, p3) 
             VALUES ($1, $2, $3, $4, $5)`,
            [race_id, driver_id, p1, p2, p3]
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error guardando Prácticas' }); }
});

// --- RUTA POST MEJORADA (ADMITE ARCHIVO O SELECCIÓN) ---
router.post('/', uploadFields, async (req, res) => {
    try {
        const {
            name, round, circuit_name, country_code, date, sprint,
            circuit_length, total_laps, race_distance, lap_record,
            existing_map_image,      // <--- RECIBIMOS ESTO DEL FRONT
            existing_circuit_image   // <--- Y ESTO
        } = req.body;

        // 1. LÓGICA MAPA (PREVIEW)
        let map_image_url = null;
        if (req.files && req.files['map_image']) {
            // Caso A: Se subió un archivo nuevo
            map_image_url = `/images/schedule/${req.files['map_image'][0].filename}`;
        } else if (existing_map_image) {
            // Caso B: Se seleccionó uno existente
            map_image_url = existing_map_image;
        } else {
            map_image_url = '/images/schedule/default.png';
        }

        // 2. LÓGICA CIRCUITO (MODAL)
        let circuit_image_url = null;
        if (req.files && req.files['circuit_image']) {
            // Caso A: Archivo nuevo
            circuit_image_url = `/images/circuits/${req.files['circuit_image'][0].filename}`;
        } else if (existing_circuit_image) {
            // Caso B: Existente
            circuit_image_url = existing_circuit_image;
        }

        const hasSprint = sprint === 'true';
        const lapsInt = total_laps ? parseInt(total_laps) : 0;

        // 3. INSERT (Igual que antes)
        await query(
            `INSERT INTO races (
                name, round, circuit_name, country_code, date, 
                map_image_url, circuit_image_url, has_sprint,
                circuit_length, total_laps, race_distance, lap_record
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                name, round, circuit_name, country_code, date,
                map_image_url, circuit_image_url, hasSprint,
                circuit_length, lapsInt, race_distance, lap_record
            ]
        );
        res.json({ success: true, message: 'Carrera creada correctamente' });

    } catch (e) {
        console.error("ERROR:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- RUTAS DE ELIMINACIÓN DE RESULTADOS INDIVIDUALES (DELETE) ---

// 1. BORRAR RESULTADO DE CARRERA DE UN PILOTO
router.delete('/:race_id/results/:driver_id', async (req, res) => {
    try {
        const { race_id, driver_id } = req.params;
        await query('DELETE FROM results WHERE race_id = $1 AND driver_id = $2', [race_id, driver_id]);
        res.json({ success: true, message: 'Resultado eliminado' });
    } catch (e) { res.status(500).json({ error: 'Error al eliminar' }); }
});

// 2. BORRAR SPRINT DE UN PILOTO
router.delete('/:race_id/sprint/:driver_id', async (req, res) => {
    try {
        const { race_id, driver_id } = req.params;
        await query('DELETE FROM sprint_results WHERE race_id = $1 AND driver_id = $2', [race_id, driver_id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error al eliminar sprint' }); }
});

// 3. BORRAR QUALY DE UN PILOTO
router.delete('/:race_id/qualifying/:driver_id', async (req, res) => {
    try {
        const { race_id, driver_id } = req.params;
        await query('DELETE FROM qualifying WHERE race_id = $1 AND driver_id = $2', [race_id, driver_id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error al eliminar qualy' }); }
});

// 4. BORRAR SPRINT SHOOTOUT
router.delete('/:race_id/sprint-qualifying/:driver_id', async (req, res) => {
    try {
        const { race_id, driver_id } = req.params;
        await query('DELETE FROM sprint_qualifying WHERE race_id = $1 AND driver_id = $2', [race_id, driver_id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error al eliminar shootout' }); }
});

// 5. BORRAR PRÁCTICAS
router.delete('/:race_id/practices/:driver_id', async (req, res) => {
    try {
        const { race_id, driver_id } = req.params;
        await query('DELETE FROM practices WHERE race_id = $1 AND driver_id = $2', [race_id, driver_id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error al eliminar prácticas' }); }
});

// --- NUEVA RUTA: LISTAR IMÁGENES DEL SERVIDOR ---
router.get('/images/list', (req, res) => {
    try {
        const schedulePath = path.join(process.cwd(), 'public/images/schedule');
        const circuitsPath = path.join(process.cwd(), 'public/images/circuits');

        // Función auxiliar para leer carpeta
        const getFiles = (dir, urlPrefix) => {
            if (!fs.existsSync(dir)) return [];
            return fs.readdirSync(dir)
                .filter(file => /\.(jpg|jpeg|png|webp|avif)$/i.test(file)) // Solo imágenes
                .map(file => ({
                    name: file,
                    url: `${urlPrefix}/${file}` // Genera la URL relativa correcta
                }));
        };

        const maps = getFiles(schedulePath, '/images/schedule');
        const circuits = getFiles(circuitsPath, '/images/circuits');

        res.json({ success: true, data: { maps, circuits } });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error leyendo imágenes' });
    }
});

export default router;