// server/src/controllers/game.controller.js
import * as gameService from '../services/game.service.js';

export const getMayorMenorPool = async (req, res) => {
    try {
        const year = req.query.year || String(new Date().getFullYear());
        const pool = await gameService.getStatsPool(year);
        res.json({ success: true, data: pool });
    } catch (err) {
        console.error('ERROR mayor-menor pool:', err.message);
        res.status(500).json({ error: 'Error cargando datos del juego' });
    }
};

export const getAdivinaPilotoPool = async (req, res) => {
    try {
        const pool = await gameService.getGuessPool();
        res.json({ success: true, data: pool });
    } catch (err) {
        console.error('ERROR adivina-piloto pool:', err.message);
        res.status(500).json({ error: 'Error cargando datos del juego' });
    }
};

export const getSiluetaCircuitoPool = async (req, res) => {
    try {
        const pool = await gameService.getCircuitPool();
        res.json({ success: true, data: pool });
    } catch (err) {
        console.error('ERROR silueta-circuito pool:', err.message);
        res.status(500).json({ error: 'Error cargando datos del juego' });
    }
};

// "Arma tu Grid" reutiliza el mismo pool de estadísticas por temporada que
// Mayor o Menor (puntos/victorias/podios ya calculados) — el costo de cada
// piloto se deriva en el cliente a partir de los puntos.
export const getArmaGridPool = async (req, res) => {
    try {
        const year = req.query.year || String(new Date().getFullYear());
        const pool = await gameService.getStatsPool(year);
        res.json({ success: true, data: pool });
    } catch (err) {
        console.error('ERROR arma-grid pool:', err.message);
        res.status(500).json({ error: 'Error cargando datos del juego' });
    }
};
