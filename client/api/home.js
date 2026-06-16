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
    <meta name="google-site-verification" content="2NEyBZVpbufoM86aOSQedpasODb3lphxr3f5NfQS8h4" />
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>F1 Grand Prix Hub | Análisis F1 en Español</title>
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

    ${articles[0]?.cover_image_url
        ? `<link rel="preload" as="image" href="${esc(articles[0].cover_image_url)}" fetchpriority="high" />`
        : '<link rel="preload" as="image" href="/logo.png" fetchpriority="high" />'
    }

    <!-- Critical inline CSS for the above-fold hero so it renders on first paint,
         before the async main stylesheet loads. -->
    <style id="ssr-hero-css">
      .home-hero{position:relative;padding:72px 20px 56px;text-align:center;color:#fff;font-family:'Barlow Condensed',system-ui,sans-serif;background-image:linear-gradient(180deg,rgba(21,21,30,.60) 0%,rgba(21,21,30,.86) 100%),linear-gradient(135deg,rgba(225,6,0,.42) 0%,#15151e 70%),url('/hero-home.jpg');background-size:cover;background-position:center}
      .home-hero__inner{max-width:880px;margin:0 auto}
      .home-hero h1{font-size:clamp(2rem,6vw,3.4rem);font-weight:900;line-height:1.05;margin:0 0 16px;text-transform:uppercase;letter-spacing:-.5px;text-shadow:0 2px 12px rgba(0,0,0,.55)}
      .home-hero h1 span{color:#e10600}
      .home-hero__lead{font-size:clamp(1rem,2.5vw,1.2rem);color:#cfcfcf;line-height:1.5;margin:0 auto 12px;max-width:640px}
      .home-hero__trust{font-size:.85rem;color:#888;margin:0 auto 28px;max-width:560px}
      .home-hero__cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
      .home-hero__btn{display:inline-flex;align-items:center;padding:12px 24px;border-radius:8px;font-weight:700;font-size:.95rem;text-decoration:none;transition:transform .2s,background .2s}
      .home-hero__btn--primary{background:#e10600;color:#fff}
      .home-hero__btn--primary:hover{background:#c50500;transform:translateY(-2px)}
      .home-hero__btn--ghost{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.25)}
      .home-hero__btn--ghost:hover{border-color:#e10600;transform:translateY(-2px)}
      .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
      @media (max-width:640px){.home-hero{padding:48px 16px 36px}}
    </style>

    <script type="application/ld+json">${schema}</script>

    <link rel="modulepreload" href="/assets/main.js" />
    <link rel="preload" href="/assets/metaTags.css" as="style" onload="this.onload=null;this.rel='stylesheet'" />
    <noscript><link rel="stylesheet" href="/assets/metaTags.css" /></noscript>
  </head>
  <body>
    <!-- Visible above-fold hero, server-rendered so users AND crawlers see content
         on first byte. The SPA renders the interactive feed into #app below. -->
    <header class="home-hero">
      <div class="home-hero__inner">
        <h1>Análisis y Predicciones de <span>Fórmula 1</span> en Español</h1>
        <p class="home-hero__lead">Análisis F1 en español rioplatense, con estrategia, predicciones y lectura crítica de cada Gran Premio.</p>
        <p class="home-hero__trust">Escrito por Lautaro Iezzi. Análisis independiente de Fórmula 1 desde Argentina, con foco en estrategia, técnica y campeonato.</p>
        <nav class="home-hero__cta" aria-label="Acciones principales">
          <a class="home-hero__btn home-hero__btn--primary" href="#app">Ver últimas noticias</a>
          <a class="home-hero__btn home-hero__btn--ghost" href="#newsletter-container">Recibir resumen semanal</a>
        </nav>
      </div>
      <!-- Crawler-facing links: visually hidden to avoid duplicating the dynamic
           feed the SPA renders into #app, while preserving internal-link signals. -->
      ${articleListHtml ? `<nav class="sr-only" aria-label="Últimas noticias"><ul>${articleListHtml}</ul></nav>` : ''}
      <nav class="sr-only" aria-label="Secciones">
        <a href="${SITE_BASE}/#noticias">Noticias F1</a>
        <a href="${SITE_BASE}/#pilotos">Pilotos</a>
        <a href="${SITE_BASE}/#campeonato">Campeonato</a>
        <a href="${SITE_BASE}/sobre.html">Sobre nosotros</a>
      </nav>
    </header>
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
