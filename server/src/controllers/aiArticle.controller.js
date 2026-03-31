import { generateArticle } from '../services/aiArticle.service.js';

export const generateArticleHandler = async (req, res) => {
    try {
        const { race_id, type, author } = req.body;

        if (!race_id) {
            return res.status(400).json({ error: 'race_id es requerido.' });
        }

        const validTypes = ['race_report', 'strategy', 'standings'];
        const articleType = validTypes.includes(type) ? type : 'race_report';

        const result = await generateArticle(
            race_id,
            articleType,
            author || 'IA Redacción'
        );

        res.json({
            success:     true,
            message:     `Borrador generado para "${result.race_name}". Publicalo desde la sección de artículos.`,
            article:     result.article,
            tokens_used: result.usage,
            provider:    result.provider,
        });
    } catch (e) {
        console.error('[AI Article] Error:', e.message);

        if (e.message.includes('API_KEY')) {
            return res.status(503).json({ error: e.message });
        }
        if (e.message.includes('No hay suficientes datos')) {
            return res.status(422).json({ error: e.message });
        }

        res.status(500).json({ error: `Error al generar el artículo: ${e.message}` });
    }
};
