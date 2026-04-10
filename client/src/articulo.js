import './scss/styles.scss';
import { API } from './modules/config.js';
import { setPageMeta, createArticleMetaConfig } from './modules/metaTags.js';

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
                𝕏 Twitter
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
        <div class="related-item" data-href="/articulo.html?slug=${a.slug}">
            <span class="related-item__category">${categoryLabel(a.category)}</span>
            <span class="related-item__title">${a.title}</span>
            <span class="related-item__date">${formatDate(a.created_at)}</span>
        </div>
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

async function init() {
    const app = document.getElementById('app');
    const slug = new URLSearchParams(window.location.search).get('slug');

    // Navbar mínimo
    app.insertAdjacentHTML('beforebegin', `
        <nav class="main-navbar" style="justify-content:flex-start; gap:20px;">
            <a href="/" style="color:#e10600; font-weight:900; font-size:1.1rem; text-decoration:none; letter-spacing:1px;">
                ← F1 Grand Prix Hub
            </a>
            <span style="color:#333;">|</span>
            <span style="color:#888; font-size:0.85rem; text-transform:uppercase; letter-spacing:1px;">Noticias</span>
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
                  src="${article.cover_image_url}"
                  alt="${article.title}"
                  loading="lazy"
                  onerror="this.style.display='none';"
              >`
            : '';

        const tagsHTML = article.tags?.length
            ? `<div class="article-tags">${article.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>`
            : '';

        app.innerHTML = `
            <div class="article-page">
                <main class="article-main">
                    <header class="article-header">
                        <span class="article-header__back" id="btnBack">← Volver a noticias</span>
                        <p class="article-header__category">${categoryLabel(article.category)}</p>
                        <h1 class="article-header__title">${article.title}</h1>
                        <div class="article-header__meta">
                            <span>Por ${article.author}</span>
                            <span>•</span>
                            <span>${formatDate(article.created_at)}</span>
                        </div>
                        ${cover}
                    </header>

                    ${shareButtonsHTML(article)}

                    <div class="article-content"></div>

                    ${tagsHTML}
                </main>

                ${relatedHTML(article.related)}
            </div>
        `;

        // Inyectar el contenido del artículo por separado para que cualquier
        // tag de cierre en el HTML (</div>, </main>, etc.) no rompa la estructura
        // del DOM exterior. Esto es especialmente importante con contenido
        // generado por Quill que puede incluir tags inesperados.
        app.querySelector('.article-content').innerHTML = article.content;

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

        document.querySelectorAll('.related-item[data-href]').forEach(el => {
            el.addEventListener('click', () => { window.location.href = el.dataset.href; });
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
