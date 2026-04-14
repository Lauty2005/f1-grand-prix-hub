import { Router } from 'express';
import { adminAuth } from '../middleware/auth.middleware.js';
import * as articlesController from '../controllers/articles.controller.js';
import { generateArticleHandler, generateBundleHandler } from '../controllers/aiArticle.controller.js';
import { createUpload, uploadToSupabase } from '../config/upload.js';

const router = Router();

const upload = createUpload('articles');

// Upload de imagen de portada — DEBE ir antes de /:slug
router.post('/admin/upload-cover', adminAuth, upload.single('cover'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen.' });
    try {
        const url = await uploadToSupabase(req.file.buffer, req.file.originalname, 'articles');
        res.json({ success: true, url });
    } catch (err) {
        console.error('[upload-cover]', err.message);
        res.status(500).json({ error: 'Error al subir imagen.' });
    }
});

// Upload de imagen inline para el editor
router.post('/admin/upload-image', adminAuth, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen.' });
    try {
        const url = await uploadToSupabase(req.file.buffer, req.file.originalname, 'articles');
        res.json({ success: true, url });
    } catch (err) {
        console.error('[upload-image]', err.message);
        res.status(500).json({ error: 'Error al subir imagen.' });
    }
});

// Rutas públicas
router.get('/', articlesController.getArticles);
router.get('/:slug', articlesController.getArticleBySlug);

// Rutas admin
router.get('/admin/all', adminAuth, articlesController.getAllArticlesAdmin);
router.get('/admin/:id', adminAuth, articlesController.getArticleByIdAdmin);
router.post('/admin/generate', adminAuth, generateArticleHandler);        // Un artículo por tipo
router.post('/admin/generate-bundle', adminAuth, generateBundleHandler);  // 3 artículos post-carrera de una vez
router.post('/', adminAuth, articlesController.createArticle);
router.put('/:id', adminAuth, articlesController.updateArticle);
router.delete('/:id', adminAuth, articlesController.deleteArticle);

export default router;
