import * as articlesService from '../services/articles.service.js';

export const getArticles = async (req, res) => {
    try {
        const { category, tag, featured, limit = 20, offset = 0 } = req.query;
        const articles = await articlesService.getArticles({
            category,
            tag,
            featured: featured !== undefined ? featured === 'true' : undefined,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        res.json({ success: true, data: articles });
    } catch (err) {
        console.error('ERROR SQL articles:', err.message);
        res.status(500).json({ error: 'Error obteniendo artículos' });
    }
};

export const getArticleBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const article = await articlesService.getArticleBySlug(slug);
        if (!article) return res.status(404).json({ error: 'Artículo no encontrado' });

        const related = await articlesService.getRelatedArticles(article.id, article.category);
        res.json({ success: true, data: { ...article, related } });
    } catch (err) {
        console.error('ERROR SQL article slug:', err.message);
        res.status(500).json({ error: 'Error obteniendo artículo' });
    }
};

export const createArticle = async (req, res) => {
    try {
        const result = await articlesService.createArticle(req.body);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        console.error('ERROR creating article:', err.message);
        res.status(500).json({ error: 'Error creando artículo: ' + err.message });
    }
};

export const updateArticle = async (req, res) => {
    try {
        const { id } = req.params;
        // Partial update: only published/featured flag
        const keys = Object.keys(req.body);
        if (keys.length === 1 && keys[0] === 'published') {
            await articlesService.publishArticle(id, req.body.published);
        } else {
            await articlesService.updateArticle(id, req.body);
        }
        res.json({ success: true, message: 'Artículo actualizado' });
    } catch (err) {
        console.error('ERROR updating article:', err.message);
        res.status(500).json({ error: 'Error actualizando artículo' });
    }
};

export const deleteArticle = async (req, res) => {
    try {
        const { id } = req.params;
        await articlesService.deleteArticle(id);
        res.json({ success: true, message: 'Artículo eliminado' });
    } catch (err) {
        console.error('ERROR deleting article:', err.message);
        res.status(500).json({ error: 'Error eliminando artículo' });
    }
};

export const getAllArticlesAdmin = async (req, res) => {
    try {
        const articles = await articlesService.getAllArticlesAdmin();
        res.json({ success: true, data: articles });
    } catch (err) {
        console.error('ERROR admin articles:', err.message);
        res.status(500).json({ error: 'Error obteniendo artículos' });
    }
};
