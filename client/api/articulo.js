// Vercel Serverless Function — SSR for article pages
// Intercepts /articulo/:slug and /articulo.html?slug=... requests,
// fetches article data from the Render API, and returns pre-rendered HTML
// with article-specific meta, JSON-LD, H1, and excerpt visible to crawlers
// before the JS bundle executes.

const API_BASE = 'https://f1-grand-prix-hub.onrender.com';
const SITE_BASE = 'https://f1grandprixhub.com';

const CATEGORY_LABELS = {
    noticias: 'Noticias',
    analisis: 'Análisis',
    preview: 'Preview',
    tecnica: 'Técnica',
};

export default async function handler(req, res) {
    const slug = req.query.slug;

    if (!slug) {
        res.redirect(302, '/');
        return;
    }

    let article;
    try {
        const apiRes = await fetch(`${API_BASE}/articles/${encodeURIComponent(slug)}`);
        if (!apiRes.ok) throw new Error(`API ${apiRes.status}`);
        const json = await apiRes.json();
        article = json.data;
    } catch {
        // Graceful degradation: serve the plain SPA shell
        res.redirect(307, `/articulo.html?slug=${encodeURIComponent(slug)}`);
        return;
    }

    const canonicalUrl = `${SITE_BASE}/articulo.html?slug=${encodeURIComponent(article.slug)}`;
    const imageUrl = article.cover_image_url || `${SITE_BASE}/og-image-home.jpg`;
    const excerpt = (article.excerpt || '').slice(0, 200);
    const section = CATEGORY_LABELS[article.category] || article.category || 'Noticias';

    // Fix 1 (HIGH): strip all HTML from article.content before injecting into the
    // pre-render block. The block is hidden from users and only exists for crawler
    // text extraction, so plain text is sufficient and eliminates the XSS surface.
    const contentText = stripHtml(article.content || '');

    // Fix 2 (MEDIUM): escape sequences that could break out of a <script> block.
    // JSON.stringify values may contain </script>, <!-- or Unicode line terminators.
    const safeSchema = JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'NewsArticle',
                '@id': `${canonicalUrl}#article`,
                headline: article.title,
                description: article.excerpt || '',
                url: canonicalUrl,
                mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
                image: { '@type': 'ImageObject', url: imageUrl, width: 1200, height: 630 },
                datePublished: article.created_at,
                dateModified: article.updated_at || article.created_at,
                inLanguage: 'es-AR',
                articleSection: section,
                keywords: Array.isArray(article.tags) ? article.tags.join(', ') : '',
                author: {
                    '@type': 'Organization',
                    '@id': `${SITE_BASE}/#organization`,
                    name: 'F1 Grand Prix Hub',
                },
                publisher: {
                    '@type': 'Organization',
                    '@id': `${SITE_BASE}/#organization`,
                    name: 'F1 Grand Prix Hub',
                    logo: { '@type': 'ImageObject', url: `${SITE_BASE}/logo.png` },
                },
            },
            {
                '@type': 'BreadcrumbList',
                '@id': `${canonicalUrl}#breadcrumb`,
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_BASE },
                    { '@type': 'ListItem', position: 2, name: 'Noticias', item: `${SITE_BASE}/#noticias` },
                    { '@type': 'ListItem', position: 3, name: article.title, item: canonicalUrl },
                ],
            },
        ],
    })
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/-->/g, '--\\u003e')
        .replace(/ /g, '\\u2028')
        .replace(/ /g, '\\u2029');

    // Visually hidden pre-render block — crawlers read it, users see the JS-rendered version.
    // article.content is stripped to plain text (contentText) to eliminate the XSS surface.
    const prerender = `
<div id="ssr-prerender" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;" aria-hidden="true">
  <h1>${esc(article.title)}</h1>
  ${article.cover_image_url ? `<img src="${esc(article.cover_image_url)}" alt="${esc(article.title)}" width="1200" height="630" />` : ''}
  <p>${esc(article.excerpt || '')}</p>
  <span>Por ${esc(article.author || 'F1 Grand Prix Hub')}</span>
  <time datetime="${esc(article.created_at)}">${new Date(article.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
  <p>${esc(contentText)}</p>
</div>`.trim();

    const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(article.title)} | F1 Grand Prix Hub</title>
    <meta name="description" content="${esc(excerpt)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${canonicalUrl}" />

    <meta property="og:type" content="article" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:title" content="${esc(article.title)}" />
    <meta property="og:description" content="${esc(excerpt)}" />
    <meta property="og:image" content="${esc(imageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(article.title)}" />
    <meta property="og:locale" content="es_AR" />
    <meta property="og:site_name" content="F1 Grand Prix Hub" />
    <meta property="article:published_time" content="${esc(article.created_at)}" />
    <meta property="article:modified_time" content="${esc(article.updated_at || article.created_at)}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@f1grandprixhub" />
    <meta name="twitter:title" content="${esc(article.title)}" />
    <meta name="twitter:description" content="${esc(excerpt)}" />
    <meta name="twitter:image" content="${esc(imageUrl)}" />

    <link rel="icon" type="image/png" href="/logo.png" />

    <script type="application/ld+json">${safeSchema}</script>

    <link rel="modulepreload" href="/assets/articulo.js" />
    <link rel="preload" href="/assets/metaTags.css" as="style" onload="this.onload=null;this.rel='stylesheet'" />
    <noscript><link rel="stylesheet" href="/assets/metaTags.css" /></noscript>
  </head>
  <body>
    ${prerender}
    <main id="app"></main>
    <script type="module" src="/assets/articulo.js"></script>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.send(html);
}

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Strip all HTML tags, leaving only plain text — used for the crawler pre-render
// block so article.content never touches the DOM as raw HTML server-side.
function stripHtml(html) {
    return html
        .replace(/<[^>]+>/g, ' ')   // remove tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ')    // collapse whitespace
        .trim();
}
