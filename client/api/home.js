// Vercel Serverless Function — SSR for homepage
// Pre-renders H1, recent article links with dates, and canonical meta
// so Googlebot and AI crawlers see content on first byte.
// JS bundle hydrates the full interactive SPA after load.

const API_BASE = 'https://f1-grand-prix-hub.onrender.com';
const SITE_BASE = 'https://f1grandprixhub.com';

const CATEGORY_LABELS = {
    noticias: 'Noticias',
    analisis: 'Análisis',
    preview: 'Preview',
    tecnica: 'Técnica',
};

export default async function handler(req, res) {
    let articles = [];
    try {
        const apiRes = await fetch(`${API_BASE}/api/articles?limit=12&offset=0`);
        if (apiRes.ok) {
            const json = await apiRes.json();
            articles = json.data || [];
        }
    } catch {
        // Graceful degradation — render shell without article list
    }

    const articleListHtml = articles.length
        ? articles.map(a => {
            const url = `${SITE_BASE}/articulo/${encodeURIComponent(a.slug)}`;
            const date = a.created_at
                ? new Date(a.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
                : '';
            const cat = CATEGORY_LABELS[a.category] || a.category || '';
            return `<li><a href="${url}"><span>${esc(cat)}</span> <strong>${esc(a.title)}</strong> <time datetime="${esc(a.created_at)}">${date}</time></a></li>`;
        }).join('\n')
        : '';

    const schema = JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Organization',
                '@id': `${SITE_BASE}/#organization`,
                name: 'F1 Grand Prix Hub',
                url: SITE_BASE,
                logo: { '@type': 'ImageObject', url: `${SITE_BASE}/logo.png` },
                description: 'Análisis rioplatense de estrategia F1, predicciones de carreras y datos en vivo.',
                inLanguage: 'es-AR',
                sameAs: ['https://x.com/f1grandprixhub'],
            },
            {
                '@type': 'WebSite',
                '@id': `${SITE_BASE}/#website`,
                url: SITE_BASE,
                name: 'F1 Grand Prix Hub',
                publisher: { '@id': `${SITE_BASE}/#organization` },
                inLanguage: 'es-AR',
            },
        ],
    })
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/-->/g, '--\\u003e')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

    const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>F1 Grand Prix Hub | Análisis y Predicciones de Fórmula 1 en Español</title>
    <meta name="description" content="Análisis rioplatense de estrategia F1, predicciones de carreras y datos en vivo. Calendario, campeonato, comparativa de pilotos y crónicas de cada Gran Premio." />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${SITE_BASE}/" />

    <meta property="og:type" content="website" />
    <meta property="og:url" content="${SITE_BASE}/" />
    <meta property="og:title" content="F1 Grand Prix Hub | Análisis de Fórmula 1 en Español" />
    <meta property="og:description" content="Análisis rioplatense de estrategia F1, predicciones de carreras y datos en vivo. El hub de F1 en español." />
    <meta property="og:image" content="${SITE_BASE}/og-image-home.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="F1 Grand Prix Hub — Análisis y Predicciones de Fórmula 1 en Español" />
    <meta property="og:locale" content="es_AR" />
    <meta property="og:site_name" content="F1 Grand Prix Hub" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@f1grandprixhub" />
    <meta name="twitter:title" content="F1 Grand Prix Hub | Análisis de Fórmula 1" />
    <meta name="twitter:description" content="Análisis rioplatense de estrategia F1, predicciones de carreras y datos en vivo." />
    <meta name="twitter:image" content="${SITE_BASE}/og-image-home.jpg" />

    <link rel="icon" type="image/png" href="/logo.png" />

    ${articles[0]?.cover_image_url
        ? `<link rel="preload" as="image" href="${esc(articles[0].cover_image_url)}" fetchpriority="high" />`
        : '<link rel="preload" as="image" href="/logo.png" fetchpriority="high" />'
    }

    <script type="application/ld+json">${schema}</script>

    <link rel="modulepreload" href="/assets/main.js" />
    <link rel="preload" href="/assets/main.css" as="style" onload="this.onload=null;this.rel='stylesheet'" />
    <noscript><link rel="stylesheet" href="/assets/main.css" /></noscript>
  </head>
  <body>
    <!-- Pre-rendered shell for crawlers — JS hydrates the full SPA after load -->
    <div id="ssr-home" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);" aria-hidden="true">
      <h1>Análisis y Predicciones de Fórmula 1 en Español</h1>
      <p>Análisis rioplatense de estrategia F1, predicciones de carreras y datos en vivo. Calendario, campeonato, comparativa de pilotos y crónicas de cada Gran Premio.</p>
      ${articleListHtml ? `<nav aria-label="Últimas noticias"><ul>${articleListHtml}</ul></nav>` : ''}
      <nav aria-label="Secciones">
        <a href="${SITE_BASE}/#noticias">Noticias F1</a>
        <a href="${SITE_BASE}/#pilotos">Pilotos</a>
        <a href="${SITE_BASE}/#campeonato">Campeonato</a>
        <a href="${SITE_BASE}/sobre.html">Sobre nosotros</a>
      </nav>
    </div>
    <main id="app"></main>
    <div id="newsletter-container"></div>
    <script type="module" src="/assets/main.js"></script>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
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
