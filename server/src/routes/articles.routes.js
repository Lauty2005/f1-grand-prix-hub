// server/src/routes/articles.routes.js
import { Router } from 'express';
import { adminAuth } from '../middleware/auth.middleware.js';
import * as articlesController from '../controllers/articles.controller.js';
import { generateArticleHandler, generateBundleHandler } from '../controllers/aiArticle.controller.js';
import { createUpload } from '../config/upload.js';

const router = Router();
const upload = createUpload('articles');

// ── Upload de imagen de portada ─────────────────────────────────────────────
// DEBE ir antes de /:slug para evitar colisiones de ruteo
router.post(
    '/admin/upload-cover',
    adminAuth,
    ...upload.single('cover'),
    (req, res) => {
        // req.fileUrl es la URL absoluta de R2 (ej: https://pub-xxx.r2.dev/articles/abc.jpg)
        if (!req.fileUrl) return res.status(400).json({ error: 'No se subió ninguna imagen.' });
        res.json({ success: true, url: req.fileUrl });
    }
);

// ── Upload de imagen inline (editor Quill) ──────────────────────────────────
router.post(
    '/admin/upload-image',
    adminAuth,
    ...upload.single('image'),
    (req, res) => {
        if (!req.fileUrl) return res.status(400).json({ error: 'No se subió ninguna imagen.' });
        res.json({ success: true, url: req.fileUrl });
    }
);

// ── Rutas públicas ──────────────────────────────────────────────────────────
router.get('/',      articlesController.getArticles);
router.get('/:slug', articlesController.getArticleBySlug);

// ── Rutas admin ─────────────────────────────────────────────────────────────
router.get('/admin/all',  adminAuth, articlesController.getAllArticlesAdmin);
router.get('/admin/:id',  adminAuth, articlesController.getArticleByIdAdmin);

router.post('/admin/generate',        adminAuth, generateArticleHandler);   // 1 artículo por tipo
router.post('/admin/generate-bundle', adminAuth, generateBundleHandler);    // 3 artículos post-carrera

router.post('/',    adminAuth, articlesController.createArticle);
router.put('/:id',  adminAuth, articlesController.updateArticle);
router.delete('/:id', adminAuth, articlesController.deleteArticle);

export default router;
