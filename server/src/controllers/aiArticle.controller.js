import { generateArticle, generatePostRaceBundle } from '../services/aiArticle.service.js';

const VALID_TYPES = ['race_report', 'strategy', 'standings', 'preview', 'qualifying'];

export const generateArticleHandler = async (req, res) => {
    try {
        const { race_id, type, author } = req.body;

        if (!race_id) {
            return res.status(400).json({ error: 'race_id es requerido.' });
        }

        const articleType = VALID_TYPES.includes(type) ? type : 'race_report';

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

// Genera los 3 artículos post-carrera de un GP en una sola llamada
export const generateBundleHandler = async (req, res) => {
    try {
        const { race_id, author } = req.body;

        if (!race_id) {
            return res.status(400).json({ error: 'race_id es requerido.' });
        }

        const { results, errors } = await generatePostRaceBundle(
            race_id,
            author || 'IA Redacción'
        );

        res.json({
            success:         errors.length === 0,
            generated:       results.length,
            articles:        results.map(r => ({ type: r.type, ...r.article })),
            errors,
            message:         `${results.length} borradores generados. Revisalos y publicá desde artículos.`,
        });
    } catch (e) {
        console.error('[AI Bundle] Error:', e.message);
        res.status(500).json({ error: `Error al generar el bundle: ${e.message}` });
    }
};
