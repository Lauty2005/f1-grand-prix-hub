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
        const baseURL = 'https://f1grandprixhub.com';

        // 1. Obtener artículos (con prioridad alta)
        //    Usar las mismas reglas de visibilidad que el endpoint público de artículos
        //    (articles.service.js filtra `published = true`). De lo contrario el sitemap
        //    incluye URLs que la API responde con 404 y Vercel sirve un fallback 307.
        //    Además se excluyen artículos sin slug/título para no emitir URLs inválidas.
        const articlesRes = await query(
            `SELECT slug, title, created_at, updated_at
             FROM articles
             WHERE published = true
               AND slug IS NOT NULL AND slug <> ''
               AND title IS NOT NULL AND title <> ''
             ORDER BY updated_at DESC
             LIMIT 500`
        );

        // 3. Construir URLs — solo páginas que realmente existen y devuelven 200
        const latestMod = articlesRes.rows[0]?.updated_at
            ? new Date(articlesRes.rows[0].updated_at).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];
        const urls = [
            {
                loc: `${baseURL}/`,
                lastmod: latestMod,
                priority: '1.0',
                changefreq: 'daily'
            }
        ];

        // Páginas de tema/categoría (landing pages indexables /noticias/:topic).
        // Editoriales (category) + temas frecuentes (tags) con búsqueda long-tail.
        const topicPages = ['noticias', 'analisis', 'preview', 'tecnica', 'ferrari', 'red-bull', 'mclaren', 'mercedes', 'colapinto', 'estrategia', 'f1-2026'];
        topicPages.forEach(topic => {
            urls.push({
                loc: `${baseURL}/noticias/${encodeURIComponent(topic)}`,
                lastmod: latestMod,
                priority: '0.6',
                changefreq: 'weekly'
            });
        });

        // Agregar artículos (única sub-ruta real del frontend)
        articlesRes.rows.forEach(article => {
            urls.push({
                loc: `${baseURL}/articulo/${encodeURIComponent(article.slug)}`,
                lastmod: new Date(article.updated_at).toISOString().split('T')[0],
                priority: '0.8',
                changefreq: 'monthly'
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

// ────────────────────────────────────────────────────────────────
// NEWS SITEMAP: Google News sitemap para descubrimiento rápido de
// artículos recientes. Solo incluye artículos publicados de las
// últimas 48 horas (ventana recomendada por Google News).
// ────────────────────────────────────────────────────────────────
router.get('/sitemap-news.xml', async (req, res) => {
    try {
        const baseURL = 'https://f1grandprixhub.com';
        const publicationName = 'F1 Grand Prix Hub';

        const articlesRes = await query(
            `SELECT slug, title, created_at
             FROM articles
             WHERE published = true
               AND slug IS NOT NULL AND slug <> ''
               AND title IS NOT NULL AND title <> ''
               AND created_at >= NOW() - INTERVAL '48 hours'
             ORDER BY created_at DESC
             LIMIT 1000`
        );

        const xmlUrls = articlesRes.rows.map(article => `
  <url>
    <loc>${escapeXml(`${baseURL}/articulo/${encodeURIComponent(article.slug)}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(publicationName)}</news:name>
        <news:language>es</news:language>
      </news:publication>
      <news:publication_date>${new Date(article.created_at).toISOString()}</news:publication_date>
      <news:title>${escapeXml(article.title)}</news:title>
    </news:news>
  </url>`).join('');

        const xmlContent =
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
            'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">' +
            xmlUrls +
            '\n</urlset>';

        res.setHeader('Content-Type', 'application/xml; charset=UTF-8');
        // Ventana corta: las noticias caducan rápido, revalidar cada 15 min.
        res.setHeader('Cache-Control', 'public, max-age=900');
        res.send(xmlContent);
    } catch (error) {
        console.error('Error generando sitemap-news:', error);
        res.status(500).send('Error al generar sitemap de noticias');
    }
});

router.get('/llms.txt', async (req, res) => {
    try {
        const baseURL = 'https://f1grandprixhub.com';
        const articlesRes = await query(
            `SELECT title, slug FROM articles WHERE published = true ORDER BY created_at DESC LIMIT 150`
        );

        const lines = [
            '# F1 Grand Prix Hub',
            '> Análisis rioplatense de estrategia F1, predicciones de carreras y datos en vivo en español (Argentina).',
            '',
            '## Artículos',
            ...articlesRes.rows.map(a =>
                `- ${baseURL}/articulo/${encodeURIComponent(a.slug)}: ${a.title}`
            )
        ];

        res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(lines.join('\n'));
    } catch (error) {
        console.error('Error generando llms.txt:', error);
        res.status(500).send('Error al generar llms.txt');
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
