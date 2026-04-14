import { API, SERVER_URL, resolveImgUrl } from './config.js';

const CATEGORIES = [
    { value: '', label: 'Todo' },
    { value: 'noticias', label: 'Noticias' },
    { value: 'analisis', label: 'Análisis' },
    { value: 'preview', label: 'Preview' },
    { value: 'tecnica', label: 'Técnica' },
];

let state = {
    category: '',
    offset: 0,
    limit: 9,
    loading: false,
    allLoaded: false,
};

let _abortController = null;

function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function categoryLabel(val) {
    return CATEGORIES.find(c => c.value === val)?.label || val;
}

function skeletonHTML() {
    const skeletonCard = `
        <div class="article-card" style="pointer-events:none;">
            <div style="height:180px; background: linear-gradient(90deg, #1a1a2e 25%, #252540 50%, #1a1a2e 75%);
                background-size:200% 100%; animation: f1-shimmer 1.4s infinite; border-radius:8px 8px 0 0;"></div>
            <div class="article-card__body">
                <div style="height:12px; width:45%; border-radius:4px; margin-bottom:10px;
                    background: linear-gradient(90deg, #1a1a2e 25%, #252540 50%, #1a1a2e 75%);
                    background-size:200% 100%; animation: f1-shimmer 1.4s infinite;"></div>
                <div style="height:16px; width:90%; border-radius:4px; margin-bottom:6px;
                    background: linear-gradient(90deg, #1a1a2e 25%, #252540 50%, #1a1a2e 75%);
                    background-size:200% 100%; animation: f1-shimmer 1.4s infinite;"></div>
                <div style="height:16px; width:70%; border-radius:4px; margin-bottom:14px;
                    background: linear-gradient(90deg, #1a1a2e 25%, #252540 50%, #1a1a2e 75%);
                    background-size:200% 100%; animation: f1-shimmer 1.4s infinite;"></div>
            </div>
        </div>`;

    return `
        <style>
            @keyframes f1-shimmer {
                0%   { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
        </style>
        <div style="height:380px; border-radius:12px; margin-bottom:24px;
            background: linear-gradient(90deg, #1a1a2e 25%, #252540 50%, #1a1a2e 75%);
            background-size:200% 100%; animation: f1-shimmer 1.4s infinite;"></div>
        <div class="news-grid">${skeletonCard.repeat(6)}</div>
    `;
}

function coverHTML(article, cls) {
    const icons = { noticias: '📰', analisis: '🔍', preview: '🏎️', tecnica: '⚙️' };
    const fallback = icons[article.category] || '📄';

    if (article.cover_image_url) {
        return `<img
            class="${cls}"
            src="${resolveImgUrl(article.cover_image_url)}"
            alt="${article.title}"
            loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
        ><div class="${cls}-placeholder" style="display:none;">${fallback}</div>`;
    }
    return `<div class="${cls}-placeholder">${fallback}</div>`;
}

function articleCardHTML(article) {
    return `
        <div class="article-card" data-slug="${article.slug}">
            ${coverHTML(article, 'article-card__cover')}
            <div class="article-card__body">
                <span class="article-card__category">${categoryLabel(article.category)}</span>
                <h3 class="article-card__title">${article.title}</h3>
                ${article.excerpt ? `<p class="article-card__excerpt">${article.excerpt}</p>` : ''}
                <div class="article-card__footer">
                    <span class="article-card__author">${article.author}</span>
                    <span class="article-card__date">${formatDate(article.created_at)}</span>
                </div>
            </div>
        </div>
    `;
}

function heroHTML(article) {
    const cover = article.cover_image_url
        ? `<img class="news-hero__cover" src="${resolveImgUrl(article.cover_image_url)}" alt="${article.title}">`
        : '';
    return `
        <div class="news-hero" data-slug="${article.slug}">
            ${cover}
            <div class="news-hero__overlay"></div>
            <div class="news-hero__content">
                <span class="news-hero__badge">${categoryLabel(article.category)}</span>
                <h2 class="news-hero__title">${article.title}</h2>
                <div class="news-hero__meta">
                    <span>${article.author}</span>
                    <span>•</span>
                    <span>${formatDate(article.created_at)}</span>
                </div>
            </div>
        </div>
    `;
}

export async function loadNoticiasView() {
    const app = document.getElementById('app');
    state = { category: '', offset: 0, limit: 9, loading: false, allLoaded: false };

    app.innerHTML = `
        <div class="news-section">
            <div class="news-filters" id="newsFilters">
                ${CATEGORIES.map(c => `
                    <button class="filter-btn${c.value === '' ? ' active' : ''}" data-cat="${c.value}">
                        ${c.label}
                    </button>
                `).join('')}
            </div>
            <div id="newsFeed">
                <div class="news-loading">Cargando noticias...</div>
            </div>
            <div class="news-load-more" id="newsLoadMore" style="display:none;">
                <button id="btnLoadMore">Cargar más</button>
            </div>
        </div>
    `;

    document.getElementById('newsFilters').addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.category = btn.dataset.cat;
        state.offset = 0;
        state.allLoaded = false;
        fetchAndRender(true);
    });

    document.getElementById('btnLoadMore').addEventListener('click', () => {
        state.offset += state.limit;
        fetchAndRender(false);
    });

    await fetchAndRender(true);
}

async function fetchAndRender(reset) {
    // Cancelar request anterior si existe
    if (_abortController) _abortController.abort();
    _abortController = new AbortController();
    state.loading = true;

    const feed = document.getElementById('newsFeed');
    const loadMoreEl = document.getElementById('newsLoadMore');

    if (reset) {
        feed.innerHTML = skeletonHTML();
    }

    try {
        const params = new URLSearchParams({ limit: state.limit, offset: state.offset });
        if (state.category) params.set('category', state.category);

        const res = await fetch(`${API}/articles?${params}`, {
            signal: _abortController.signal
        });
        const json = await res.json();
        const articles = json.data || [];

        if (reset) {
            if (articles.length === 0) {
                feed.innerHTML = `
                    <div class="news-empty">
                        <span class="news-empty__icon">🏁</span>
                        No hay artículos en esta categoría aún.
                    </div>`;
                loadMoreEl.style.display = 'none';
                return;
            }

            // Separar featured/hero del resto
            const featured = articles.find(a => a.featured);
            const rest = featured ? articles.filter(a => a.id !== featured.id) : articles;

            let html = '';
            if (featured) html += heroHTML(featured);
            if (rest.length) html += `<div class="news-grid">${rest.map(articleCardHTML).join('')}</div>`;
            feed.innerHTML = html;
        } else {
            // Append mode: buscar o crear grid
            let grid = feed.querySelector('.news-grid');
            if (!grid) {
                grid = document.createElement('div');
                grid.className = 'news-grid';
                feed.appendChild(grid);
            }
            grid.insertAdjacentHTML('beforeend', articles.map(articleCardHTML).join(''));
        }

        if (articles.length < state.limit) {
            state.allLoaded = true;
            loadMoreEl.style.display = 'none';
        } else {
            loadMoreEl.style.display = 'block';
        }

        // Listener de click en cards y hero
        feed.querySelectorAll('[data-slug]').forEach(el => {
            el.addEventListener('click', () => {
                const slug = el.dataset.slug;
                window.location.href = `/articulo.html?slug=${slug}`;
            });
        });

    } catch (err) {
        if (err.name === 'AbortError') {
            state.loading = false;
            return;
        }
        console.error('Error cargando noticias:', err);
        if (reset) feed.innerHTML = '<div class="news-empty">Error cargando las noticias.</div>';
    } finally {
        state.loading = false;
    }
}
