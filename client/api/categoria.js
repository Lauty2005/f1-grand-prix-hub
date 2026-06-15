// Vercel Serverless Function — SSR for topic/category landing pages
// Serves /noticias/:topic. Known editorial categories (noticias, analisis,
// preview, tecnica) are filtered by the `category` column; any other topic is
// treated as a `tag`. Renders a visible, indexable article list with canonical
// meta, CollectionPage + ItemList + BreadcrumbList JSON-LD.

const API_BASE = 'https://f1-grand-prix-hub.onrender.com';
const SITE_BASE = 'https://f1grandprixhub.com';

const CATEGORY_LABELS = {
    noticias: 'Noticias',
    analisis: 'Análisis',
    preview: 'Preview',
    tecnica: 'Técnica',
};

// Topics that look better with a curated label than naive title-casing.
const TOPIC_LABELS = {
    'red-bull': 'Red Bull',
    ferrari: 'Ferrari',
    mclaren: 'McLaren',
    mercedes: 'Mercedes',
    colapinto: 'Colapinto',
    estrategia: 'Estrategia',
    'f1-2026': 'F1 2026',
};

export default async function handler(req, res) {
    const topic = (req.query.topic || '').toLowerCase().trim();

    if (!topic || !/^[a-z0-9-]+$/.test(topic)) {
        res.redirect(302, '/');
        return;
    }

    const isCategory = Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, topic);
    const label = CATEGORY_LABELS[topic] || TOPIC_LABELS[topic] || titleCase(topic);
    const filterParam = isCategory ? `category=${encodeURIComponent(topic)}` : `tag=${encodeURIComponent(topic)}`;

    let articles = [];
    try {
        const apiRes = await fetch(`${API_BASE}/api/articles?${filterParam}&limit=30&offset=0`);
        if (apiRes.ok) {
            const json = await apiRes.json();
            articles = json.data || [];
        }
    } catch {
        // Graceful degradation — render the shell with an empty state.
    }

    const canonicalUrl = `${SITE_BASE}/noticias/${encodeURIComponent(topic)}`;
    const hasArticles = articles.length > 0;
    // Avoid indexing thin/empty topic pages.
    const robots = hasArticles ? 'index, follow' : 'noindex, follow';
    const description = `Todos los artículos sobre ${label}: análisis, estrategia y noticias de Fórmula 1 en español rioplatense.`;

    const cardsHtml = hasArticles
        ? articles.map(a => {
            const url = `${SITE_BASE}/articulo/${encodeURIComponent(a.slug)}`;
            const date = a.created_at
                ? new Date(a.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
                : '';
            const cat = CATEGORY_LABELS[a.category] || a.category || '';
            const cover = a.cover_image_url
                ? `<img class="cat-card__cover" src="${esc(a.cover_image_url)}" alt="${esc(a.title)}" loading="lazy" width="400" height="225" />`
                : '';
            return `<li class="cat-card-item"><a class="cat-card" href="${url}">
                ${cover}
                <div class="cat-card__body">
                  <span class="cat-card__cat">${esc(cat)}</span>
                  <h2 class="cat-card__title">${esc(a.title)}</h2>
                  ${a.excerpt ? `<p class="cat-card__excerpt">${esc(a.excerpt)}</p>` : ''}
                  <span class="cat-card__date">${esc(date)}</span>
                </div>
              </a></li>`;
        }).join('\n')
        : '<li class="cat-empty">Todavía no hay artículos sobre este tema. <a href="/">Volver al inicio</a>.</li>';

    const schema = JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'CollectionPage',
                '@id': `${canonicalUrl}#page`,
                url: canonicalUrl,
                name: `${label} | F1 Grand Prix Hub`,
                description,
                inLanguage: 'es-AR',
                isPartOf: { '@id': `${SITE_BASE}/#website` },
                mainEntity: {
                    '@type': 'ItemList',
                    itemListElement: articles.map((a, i) => ({
                        '@type': 'ListItem',
                        position: i + 1,
                        url: `${SITE_BASE}/articulo/${encodeURIComponent(a.slug)}`,
                        name: a.title,
                    })),
                },
            },
            {
                '@type': 'BreadcrumbList',
                '@id': `${canonicalUrl}#breadcrumb`,
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_BASE },
                    { '@type': 'ListItem', position: 2, name: 'Noticias', item: `${SITE_BASE}/#noticias` },
                    { '@type': 'ListItem', position: 3, name: label, item: canonicalUrl },
                ],
            },
        ],
    })
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/-->/g, '--\\u003e')
        .split(String.fromCharCode(0x2028)).join(String.fromCharCode(92) + 'u2028')
        .split(String.fromCharCode(0x2029)).join(String.fromCharCode(92) + 'u2029');

    const html = `<!doctype html>
<html lang="es">
  <head>
    <meta name="google-site-verification" content="2NEyBZVpbufoM86aOSQedpasODb3lphxr3f5NfQS8h4" />
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(label)} | F1 Grand Prix Hub</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="${robots}" />
    <link rel="canonical" href="${canonicalUrl}" />

    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:title" content="${esc(label)} | F1 Grand Prix Hub" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${SITE_BASE}/og-image-home.jpg" />
    <meta property="og:locale" content="es_AR" />
    <meta property="og:site_name" content="F1 Grand Prix Hub" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@f1grandprixhub" />
    <meta name="twitter:title" content="${esc(label)} | F1 Grand Prix Hub" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${SITE_BASE}/og-image-home.jpg" />

    <link rel="icon" type="image/png" href="/logo.png" />

    <!-- GA4 deferred to idle — keeps it off the critical rendering path -->
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      const loadGA = () => {
        const s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=G-K7NYQYQ04P';
        document.head.appendChild(s);
        gtag('config', 'G-K7NYQYQ04P');
      };
      if ('requestIdleCallback' in window) {
        requestIdleCallback(loadGA, { timeout: 4000 });
      } else {
        window.addEventListener('load', loadGA);
      }
    </script>

    <script type="application/ld+json">${schema}</script>

    <style>
      :root{color-scheme:dark}
      *{box-sizing:border-box}
      body{margin:0;background:#0a0a0a;color:#fff;font-family:'Barlow Condensed',system-ui,Arial,sans-serif}
      .cat-topbar{display:flex;align-items:center;gap:16px;padding:16px 20px;border-bottom:1px solid #1d1d1d}
      .cat-topbar a{color:#e10600;font-weight:900;text-decoration:none;letter-spacing:1px}
      .cat-wrap{max-width:1080px;margin:0 auto;padding:32px 20px 64px}
      .cat-head h1{font-size:clamp(2rem,6vw,3rem);font-weight:900;text-transform:uppercase;margin:0 0 8px}
      .cat-head p{color:#aaa;margin:0 0 32px;max-width:640px;line-height:1.5}
      .cat-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}
      .cat-card{display:flex;flex-direction:column;background:#141414;border:1px solid #222;border-radius:10px;overflow:hidden;text-decoration:none;color:#fff;transition:transform .2s,border-color .2s}
      .cat-card:hover{transform:translateY(-3px);border-color:#e10600}
      .cat-card__cover{width:100%;height:160px;object-fit:cover;display:block}
      .cat-card__body{padding:16px;display:flex;flex-direction:column;gap:6px}
      .cat-card__cat{font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:#e10600;font-weight:700}
      .cat-card__title{font-size:1.15rem;font-weight:700;margin:0}
      .cat-card__excerpt{font-size:.9rem;color:#aaa;line-height:1.4;margin:0}
      .cat-card__date{font-size:.78rem;color:#777;margin-top:4px}
      .cat-empty{color:#aaa;list-style:none}
      .cat-empty a{color:#e10600}
    </style>
  </head>
  <body>
    <nav class="cat-topbar">
      <a href="/">← F1 Grand Prix Hub</a>
      <span style="color:#444;">|</span>
      <span style="color:#888;text-transform:uppercase;letter-spacing:1px;font-size:.85rem;">${esc(label)}</span>
    </nav>
    <div class="cat-wrap">
      <header class="cat-head">
        <h1>${esc(label)}</h1>
        <p>${esc(description)}</p>
      </header>
      <ul class="cat-grid">
        ${cardsHtml}
      </ul>
    </div>
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

function titleCase(slug) {
    return slug
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
