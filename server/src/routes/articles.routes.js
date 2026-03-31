import { Router } from 'express';
import { adminAuth } from '../middleware/auth.middleware.js';
import * as articlesController from '../controllers/articles.controller.js';
import { generateArticleHandler } from '../controllers/aiArticle.controller.js';

const router = Router();

// Rutas públicas
router.get('/', articlesController.getArticles);
router.get('/:slug', articlesController.getArticleBySlug);

// Rutas admin
router.get('/admin/all', adminAuth, articlesController.getAllArticlesAdmin);
router.post('/admin/generate', adminAuth, generateArticleHandler);   // ← AI generator
router.post('/', adminAuth, articlesController.createArticle);
router.put('/:id', adminAuth, articlesController.updateArticle);
router.delete('/:id', adminAuth, articlesController.deleteArticle);

export default router;
