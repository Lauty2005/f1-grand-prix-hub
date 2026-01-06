import { Router } from 'express';
import { query } from '../config/db.js';

const router = Router();

// CAMPEONATO DE CONSTRUCTORES
router.get('/', async (req, res) => {
    try {
        const year = req.query.year || 2025;
        
        const sql = `
            SELECT 
                c.id, c.name, c.logo_url, c.primary_color,
                COALESCE(SUM(filtered_res.points), 0) as points
            FROM constructors c
            JOIN drivers d ON c.id = d.constructor_id
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

export default router;