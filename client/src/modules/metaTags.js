// client/src/modules/metaTags.js
// ────────────────────────────────────────────────────────────────
// META TAGS MANAGER: Gestiona og:, twitter:, schema.json para SEO
// Se integra con el módulo seoKeywords para consistency
// ────────────────────────────────────────────────────────────────

import { optimizeMetaDescription, generateArticleSchema } from './seoKeywords.js';

/**
 * Actualizar dinámicamente todos los meta tags de una página
 * Útil para SPA (Single Page App) como la tuya
 * 
 * @param {object} config - Configuración de meta tags
 * @example
 * setPageMeta({
 *   title: 'Título de la página',
 *   description: 'Meta description',
 *   keywords: ['keyword1', 'keyword2'],
 *   og: {
 *     title: 'OG Title',
 *     description: 'OG Description',
 *     image: 'https://...',
 *     type: 'article'
 *   },
 *   twitter: {
 *     card: 'summary_large_image',
 *     title: 'Twitter Title',
 *     description: 'Twitter Description'
 *   },
 *   article: {
 *     published_time: '2025-01-01T00:00:00Z',
 *     modified_time: '2025-01-02T00:00:00Z',
 *     author: 'Author Name'
 *   }
 * })
 */
export function setPageMeta(config) {
    // 1. TITLE TAG
    if (config.title) {
        document.title = config.title;
    }

    // 2. META DESCRIPTION
    if (config.description) {
        const optimized = optimizeMetaDescription(config.description);
        setMeta('description', optimized);
    }

    // 3. KEYWORDS
    if (config.keywords && Array.isArray(config.keywords)) {
        const keywordString = config.keywords.join(', ');
        setMeta('keywords', keywordString);
    }

    // 4. ROBOTS (Indexing control)
    setMeta('robots', config.robots || 'index, follow');

    // 5. CANONICAL (Evita contenido duplicado)
    if (config.canonical) {
        setCanonical(config.canonical);
    }

    // 6. OPEN GRAPH (Facebook, LinkedIn, etc)
    if (config.og) {
        const og = config.og;
        setMeta('og:title', og.title || config.title, 'property');
        setMeta('og:description', og.description || config.description, 'property');
        setMeta('og:type', og.type || 'website', 'property');
        setMeta('og:url', og.url || window.location.href, 'property');
        
        if (og.image) {
            setMeta('og:image', og.image, 'property');
            setMeta('og:image:width', '1200', 'property');
            setMeta('og:image:height', '630', 'property');
        }
    }

    // 7. TWITTER CARD (Twitter/X)
    if (config.twitter) {
        const tw = config.twitter;
        setMeta('twitter:card', tw.card || 'summary_large_image');
        setMeta('twitter:title', tw.title || config.title);
        setMeta('twitter:description', tw.description || config.description);
        if (tw.image) setMeta('twitter:image', tw.image);
    }

    // 8. ARTICLE META TAGS (Para artículos/noticias)
    if (config.article) {
        const article = config.article;
        if (article.published_time) {
            setMeta('article:published_time', article.published_time, 'property');
        }
        if (article.modified_time) {
            setMeta('article:modified_time', article.modified_time, 'property');
        }
        if (article.author) {
            setMeta('article:author', article.author, 'property');
        }
        if (article.tags && Array.isArray(article.tags)) {
            article.tags.forEach(tag => {
                setMeta('article:tag', tag, 'property');
            });
        }
    }

    // 9. ADDITIONAL META TAGS
    setMeta('viewport', 'width=device-width, initial-scale=1.0');
    setMeta('charset', 'UTF-8');
    setMeta('language', 'Spanish');

    // 10. SCHEMA.JSON (Rich snippets en Google)
    if (config.schema) {
        setSchemaJSON(config.schema);
    }

    // 11. PRELOAD/PREFETCH (Performance)
    if (config.preloadFonts) {
        config.preloadFonts.forEach(font => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = font;
            link.as = 'font';
            link.crossOrigin = 'anonymous';
            document.head.appendChild(link);
        });
    }
}

/**
 * Setear un meta tag (o crearlo si no existe)
 * @param {string} name - Nombre del atributo
 * @param {string} content - Contenido
 * @param {string} attr - Atributo a usar ('name' o 'property')
 */
function setMeta(name, content, attr = 'name') {
    if (!name || !content) return;

    let element = document.querySelector(`meta[${attr}="${name}"]`);
    
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, name);
        document.head.appendChild(element);
    }
    
    element.setAttribute('content', content);
}

/**
 * Setear canonical URL (evita duplicate content)
 * @param {string} url - URL canónica
 */
function setCanonical(url) {
    let canonical = document.querySelector('link[rel="canonical"]');
    
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
    }
    
    canonical.href = url;
}

/**
 * Inyectar JSON-LD Schema para Rich Snippets
 * @param {object} schema - Objeto schema
 */
function setSchemaJSON(schema) {
    let script = document.querySelector('script[type="application/ld+json"]');
    
    if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        document.head.appendChild(script);
    }
    
    script.textContent = JSON.stringify(schema);
}

/**
 * Helper: Generar config completa para un artículo
 * @param {object} article - Objeto del artículo
 * @returns {object} Config para setPageMeta()
 */
export function createArticleMetaConfig(article) {
    const baseURL = 'https://f1-grand-prix-hub.vercel.app';
    const articleURL = `${baseURL}/articulo.html?slug=${encodeURIComponent(article.slug)}`;

    return {
        title: `${article.title} | F1 Grand Prix Hub`,
        description: article.excerpt,
        keywords: article.tags,
        canonical: articleURL,
        robots: 'index, follow',
        og: {
            title: article.title,
            description: article.excerpt,
            type: 'article',
            url: articleURL,
            image: article.cover_image_url || `${baseURL}/og-image-default.jpg`
        },
        twitter: {
            card: 'summary_large_image',
            title: article.title,
            description: article.excerpt,
            image: article.cover_image_url
        },
        article: {
            published_time: article.created_at,
            modified_time: article.updated_at,
            author: article.author || 'F1 Grand Prix Hub',
            tags: article.tags
        },
        schema: generateArticleSchema(article)
    };
}

/**
 * Helper: Generar config para home page
 * @returns {object} Config para setPageMeta()
 */
export function createHomeMetaConfig() {
    return {
        title: 'F1 Grand Prix Hub | Análisis y Predicciones de Fórmula 1 en Español',
        description: 'Análisis rioplatense de estrategia F1, predicciones de carreras y datos en vivo. Seguimiento de campeonato, neumáticos y pit stops.',
        keywords: [
            'análisis F1',
            'predicciones fórmula 1',
            'estrategia F1',
            'noticias fórmula 1',
            'resultados GP',
            'campeonato F1'
        ],
        canonical: 'https://f1-grand-prix-hub.vercel.app/',
        robots: 'index, follow',
        og: {
            title: 'F1 Grand Prix Hub - Análisis profesional de Fórmula 1',
            description: 'Predicciones, estrategia y análisis técnico de F1 en español',
            type: 'website',
            url: 'https://f1-grand-prix-hub.vercel.app/',
            image: 'https://f1-grand-prix-hub.vercel.app/og-image-home.jpg'
        },
        twitter: {
            card: 'summary_large_image',
            title: 'F1 Grand Prix Hub',
            description: 'Análisis y predicciones de Fórmula 1'
        },
        schema: {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'F1 Grand Prix Hub',
            url: 'https://f1-grand-prix-hub.vercel.app/',
            description: 'Análisis rioplatense de estrategia F1 y predicciones de carreras',
            image: 'https://f1-grand-prix-hub.vercel.app/logo.png'
        }
    };
}

export default {
    setPageMeta,
    createArticleMetaConfig,
    createHomeMetaConfig
};
