import { Router } from 'express';
import { adminAuth } from '../middleware/auth.middleware.js';
import * as articlesController from '../controllers/articles.controller.js';
import { generateArticleHandler } from '../controllers/aiArticle.controller.js';
import { createUpload } from '../config/upload.js';

const router = Router();

const upload = createUpload('articles');

// Upload de imagen de portada — DEBE ir antes de /:slug
router.post('/admin/upload-cover', adminAuth, upload.single('cover'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen.' });
    const url = `/images/articles/${req.file.filename}`;
    res.json({ success: true, url });
});

// Upload de imagen inline para el editor
router.post('/admin/upload-image', adminAuth, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen.' });
    const url = `/images/articles/${req.file.filename}`;
    res.json({ success: true, url });
});

// Rutas públicas
router.get('/', articlesController.getArticles);
router.get('/:slug', articlesController.getArticleBySlug);

// Rutas admin
router.get('/admin/all', adminAuth, articlesController.getAllArticlesAdmin);
router.get('/admin/:id', adminAuth, articlesController.getArticleByIdAdmin);
router.post('/admin/generate', adminAuth, generateArticleHandler);   // ← AI generator
router.post('/', adminAuth, articlesController.createArticle);
router.put('/:id', adminAuth, articlesController.updateArticle);
router.delete('/:id', adminAuth, articlesController.deleteArticle);

export default router;
