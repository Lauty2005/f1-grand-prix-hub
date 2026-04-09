// server/src/routes/sitemap.routes.js
// ────────────────────────────────────────────────────────────────
// SITEMAP DINÁMICO: Genera sitemap.xml para mejorar indexación SEO
// Incluye: home, artículos, carreras, calendario
// ────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { query } from '../config/db.js';

const router = Router();

router.get('/sitemap.xml', async (req, res) => {
    try {
        const baseURL = 'https://f1-grand-prix-hub.vercel.app';
        const currentYear = new Date().getFullYear();

        // 1. Obtener artículos (con prioridad alta)
        const articlesRes = await query(
            `SELECT slug, created_at, updated_at
             FROM articles
             ORDER BY updated_at DESC
             LIMIT 500`
        );

        // 2. Obtener carreras (temporada actual + próximas)
        const racesRes = await query(
            `SELECT id, date
             FROM races
             WHERE year >= $1
             ORDER BY date DESC
             LIMIT 50`,
            [currentYear - 1]
        );

        // 3. Construir URLs
        const urls = [
            {
                loc: baseURL,
                lastmod: new Date().toISOString().split('T')[0],
                priority: '1.0',
                changefreq: 'daily'
            },
            {
                loc: `${baseURL}/calendario.html`,
                lastmod: new Date().toISOString().split('T')[0],
                priority: '0.9',
                changefreq: 'weekly'
            },
            {
                loc: `${baseURL}/noticias.html`,
                lastmod: new Date().toISOString().split('T')[0],
                priority: '0.85',
                changefreq: 'daily'
            }
        ];

        // Agregar artículos
        articlesRes.rows.forEach(article => {
            urls.push({
                loc: `${baseURL}/articulo.html?slug=${encodeURIComponent(article.slug)}`,
                lastmod: new Date(article.updated_at).toISOString().split('T')[0],
                priority: '0.8',
                changefreq: 'monthly'
            });
        });

        // Agregar carreras
        racesRes.rows.forEach(race => {
            urls.push({
                loc: `${baseURL}/carrera.html?id=${race.id}`,
                lastmod: new Date(race.date).toISOString().split('T')[0],
                priority: '0.7',
                changefreq: 'daily'
            });
        });

        // 4. Generar XML
        const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
        const xmlNamespace = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

        const xmlUrls = urls.map(url => `
  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>
        `).join('');

        const xmlClosing = '</urlset>';
        const xmlContent = xmlHeader + xmlNamespace + xmlUrls + xmlClosing;

        // 5. Enviar respuesta
        res.setHeader('Content-Type', 'application/xml; charset=UTF-8');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24 horas
        res.send(xmlContent);

    } catch (error) {
        console.error('Error generando sitemap:', error);
        res.status(500).send('Error al generar sitemap');
    }
});

// Función para escapar caracteres XML
function escapeXml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

export default router;
