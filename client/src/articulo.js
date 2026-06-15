import './scss/styles.scss';
import '@fontsource/barlow-condensed/latin-400.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/barlow-condensed/latin-900.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import { API, resolveImgUrl, escHtml } from './modules/config.js';
import { setPageMeta, createArticleMetaConfig } from './modules/metaTags.js';
import { renderNewsletterForm, NEWSLETTER_STYLES } from './modules/newsletter.js';

const CATEGORIES = {
    noticias: 'Noticias',
    analisis: 'Análisis',
    preview: 'Preview',
    tecnica: 'Técnica',
};

function formatDate(iso) {
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function categoryLabel(val) {
    return CATEGORIES[val] || val;
}


function shareButtonsHTML(article) {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(article.title);
    return `
        <div class="share-buttons">
            <div class="share-buttons__label">Compartir</div>
            <a class="share-btn share-btn--twitter"
               href="https://twitter.com/intent/tweet?text=${text}&url=${url}"
               target="_blank" rel="noopener noreferrer">
                𝕏
            </a>
            <a class="share-btn share-btn--whatsapp"
               href="https://wa.me/?text=${text}%20${url}"
               target="_blank" rel="noopener noreferrer">
                WhatsApp
            </a>
            <button class="share-btn share-btn--copy" id="btnCopyLink">
                🔗 Copiar enlace
            </button>
        </div>
    `;
}

function relatedHTML(related) {
    if (!related || related.length === 0) return '';
    const items = related.map(a => `
        <a class="related-item" href="/articulo/${encodeURIComponent(a.slug)}">
            <span class="related-item__category">${escHtml(categoryLabel(a.category))}</span>
            <span class="related-item__title">${escHtml(a.title)}</span>
            <span class="related-item__date">${formatDate(a.created_at)}</span>
        </a>
    `).join('');
    return `
        <aside class="article-sidebar">
            <div class="related-articles">
                <p class="related-articles__title">Artículos relacionados</p>
                ${items}
            </div>
        </aside>
    `;
}

// Engagement block rendered at the end of an article: a clear "read next" link,
// a topic page link, and a newsletter CTA framed around the article's topic.
function articleEndHTML(article) {
    const related = article.related || [];
    const next = related[0];
    const catLabel = categoryLabel(article.category);

    const nextHTML = next
        ? `<a class="article-end__next" href="/articulo/${encodeURIComponent(next.slug)}">
                <span class="article-end__next-label">Leer siguiente</span>
                <span class="article-end__next-title">${escHtml(next.title)}</span>
           </a>`
        : '';

    return `
        <section class="article-end" aria-label="Seguir leyendo">
            ${nextHTML}
            <a class="article-end__topic" href="/noticias/${encodeURIComponent(article.category)}">
                Más sobre ${escHtml(catLabel)} →
            </a>
            <div class="article-end__newsletter" id="article-newsletter"></div>
        </section>
    `;
}

// Self-contained styles for the engagement block (mirrors the newsletter module's
// approach of shipping its own CSS, so no SCSS rebuild is required).
const ARTICLE_END_STYLES = `
.article-end {
    margin: 40px auto 0;
    max-width: 760px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.article-end__next {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px 20px;
    border: 1px solid rgba(225, 6, 0, 0.25);
    border-left: 3px solid #e10600;
    border-radius: 8px;
    background: rgba(225, 6, 0, 0.05);
    text-decoration: none;
    transition: background 0.2s, transform 0.2s;
}
.article-end__next:hover {
    background: rgba(225, 6, 0, 0.1);
    transform: translateY(-2px);
}
.article-end__next-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #e10600;
    font-weight: 700;
}
.article-end__next-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: #fff;
}
.article-end__topic {
    align-self: flex-start;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #aaa;
    text-decoration: none;
    transition: color 0.2s;
}
.article-end__topic:hover { color: #fff; }
.article-end__newsletter {
    margin-top: 8px;
    display: flex;
    justify-content: center;
}
.article-end__newsletter .newsletter-box {
    width: 100%;
    margin: 0;
}
`;

// Inject the newsletter + engagement-block styles once (the article page does
// not import the home stylesheet for these components).
function injectEngagementStyles() {
    if (document.getElementById('article-engagement-styles')) return;
    const style = document.createElement('style');
    style.id = 'article-engagement-styles';
    style.textContent = NEWSLETTER_STYLES + ARTICLE_END_STYLES;
    document.head.appendChild(style);
}

async function init() {
    injectEngagementStyles();
    const app = document.getElementById('app');
    // Canonical URLs are /articulo/:slug (no query string). Legacy/fallback URLs
    // use /articulo.html?slug=…. Support both so internal links and direct hits
    // to the canonical URL both resolve.
    const pathMatch = window.location.pathname.match(/^\/articulo\/([^/?#]+)/);
    const slug = pathMatch
        ? decodeURIComponent(pathMatch[1])
        : new URLSearchParams(window.location.search).get('slug');

    // Navbar mínimo
    app.insertAdjacentHTML('beforebegin', `
        <nav class="main-navbar" style="justify-content:flex-start; gap:20px;">
            <a href="/" style="color:#e10600; font-weight:900; font-size:1.1rem; text-decoration:none; letter-spacing:1px;">
                ← F1 Grand Prix Hub
            </a>
            <span style="color:#333;">|</span>
            <span style="color:#888; font-size:0.85rem; text-transform:uppercase; letter-spacing:1px;">Noticias</span>
            <a href="/sobre.html" style="color:rgba(255,255,255,0.45); font-size:0.8rem; text-decoration:none; text-transform:uppercase; letter-spacing:1px; margin-left:auto;">Nosotros</a>
        </nav>
    `);

    if (!slug) {
        app.innerHTML = `<div style="text-align:center; padding:80px; color:#888;">Artículo no encontrado.</div>`;
        return;
    }

    app.innerHTML = `<div style="text-align:center; padding:80px; color:#888;">Cargando artículo...</div>`;

    try {
        const res = await fetch(`${API}/articles/${slug}`);
        if (!res.ok) throw new Error('Not found');
        const json = await res.json();
        const article = json.data;

        setPageMeta(createArticleMetaConfig(article));

        const cover = article.cover_image_url
            ? `<img
                  class="article-header__cover"
                  src="${resolveImgUrl(article.cover_image_url)}"
                  alt="${escHtml(article.title)}"
                  loading="lazy"
                  onerror="this.style.display='none';"
              >`
            : '';

        const tagsHTML = article.tags?.length
            ? `<div class="article-tags">${article.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}</div>`
            : '';

        app.innerHTML = `
            <div class="article-page">
                <main class="article-main">
                    <header class="article-header">
                        <span class="article-header__back" id="btnBack">← Volver a noticias</span>
                        <p class="article-header__category">${escHtml(categoryLabel(article.category))}</p>
                        <h1 class="article-header__title">${escHtml(article.title)}</h1>
                        <div class="article-header__meta">
                            <span>Por ${escHtml(article.author)}</span>
                            <span>•</span>
                            <span>${formatDate(article.created_at)}</span>
                            <span class="article-header__ai-badge" title="Este artículo fue generado con asistencia de inteligencia artificial y supervisión editorial">Generado con IA</span>
                        </div>
                        ${cover}
                    </header>

                    ${shareButtonsHTML(article)}

                    <div class="article-content"></div>

                    ${tagsHTML}

                    ${articleEndHTML(article)}
                </main>

                ${relatedHTML(article.related)}
            </div>
        `;

        // Inyectar el contenido del artículo por separado para que cualquier
        // tag de cierre en el HTML (</div>, </main>, etc.) no rompa la estructura
        // del DOM exterior. Esto es especialmente importante con contenido
        // generado por Quill que puede incluir tags inesperados.
        app.querySelector('.article-content').innerHTML = article.content;

        // Render the topic-framed newsletter CTA inside the engagement block.
        renderNewsletterForm('article-newsletter', {
            title: `⚡ Más análisis de ${categoryLabel(article.category)}`,
            subtitle: 'Recibí el resumen F1 semanal: estrategia, predicciones y claves del campeonato.',
            buttonText: 'Suscribirme',
        });

        document.getElementById('btnBack').addEventListener('click', () => {
            history.length > 1 ? history.back() : (window.location.href = '/');
        });

        document.getElementById('btnCopyLink')?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(window.location.href);
                document.getElementById('btnCopyLink').textContent = '✓ Copiado';
                setTimeout(() => { document.getElementById('btnCopyLink').textContent = '🔗 Copiar enlace'; }, 2000);
            } catch {
                // fallback silencioso
            }
        });

    } catch (err) {
        console.error(err);
        app.innerHTML = `<div style="text-align:center; padding:80px; color:#888;">
            <div style="font-size:2rem; margin-bottom:16px;">🏁</div>
            Artículo no encontrado o no disponible.
            <br><br>
            <a href="/" style="color:#e10600;">Volver al inicio</a>
        </div>`;
    }
}

init();
