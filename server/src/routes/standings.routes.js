import { Router } from 'express';
import { query } from '../config/db.js';

const router = Router();

// ==========================================
// OBTENER CAMPEONATO DE CONSTRUCTORES
// ==========================================
router.get('/', async (req, res) => {
    try {
        const year = req.query.year || '2025';

        // Estrategia: Subconsultas correlacionadas para máxima precisión.
        // Se calculan independientemente los puntos de Carreras y Sprints.
        const sql = `
            SELECT 
                c.id, 
                c.name, 
                c.primary_color, 
                c.logo_url,
                (
                    -- 1. Suma Puntos Carrera
                    COALESCE((
                        SELECT SUM(r.points)
                        FROM results r
                        JOIN drivers d ON r.driver_id = d.id
                        JOIN races ra ON r.race_id = ra.id
                        WHERE d.constructor_id = c.id 
                        AND EXTRACT(YEAR FROM ra.date) = $1::int
                    ), 0)
                    +
                    -- 2. Suma Puntos Sprint
                    COALESCE((
                        SELECT SUM(s.points)
                        FROM sprint_results s
                        JOIN drivers d ON s.driver_id = d.id
                        JOIN races ra ON s.race_id = ra.id
                        WHERE d.constructor_id = c.id 
                        AND EXTRACT(YEAR FROM ra.date) = $1::int
                    ), 0)
                ) as points
            FROM constructors c
            ORDER BY points DESC, c.name ASC;
        `;

        const result = await query(sql, [year]);
        res.json({ success: true, data: result.rows });

    } catch (e) {
        console.error("❌ [Standings] Error SQL:", e.message);
        res.status(500).json({ error: 'Error calculando el campeonato' });
    }
});

export default router;