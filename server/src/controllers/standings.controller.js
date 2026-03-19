import * as standingsService from '../services/standings.service.js';

export const getConstructors = async (req, res) => {
    try {
        const year = req.query.year || '2025';
        const standings = await standingsService.getConstructorsStandings(year);
        res.json({ success: true, data: standings });
    } catch (e) {
        console.error("❌ [Standings] Error SQL:", e.message);
        res.status(500).json({ error: 'Error calculando el campeonato' });
    }
};
