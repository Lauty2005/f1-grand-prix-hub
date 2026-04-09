// client/src/modules/seoKeywords.js
// ────────────────────────────────────────────────────────────────
// CONFIGURACIÓN SEO: Keywords para cada página
// Esto es la estrategia de crecimiento en forma de código
// ────────────────────────────────────────────────────────────────

export const SEO_CONFIG = {
    // ─── HOME PAGE ───
    home: {
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
        primaryKeyword: 'análisis F1',
        og: {
            title: 'F1 Grand Prix Hub - Análisis profesional de Fórmula 1',
            description: 'Predicciones, estrategia y análisis técnico de F1 en español',
            image: '/og-image-home.jpg'
        }
    },

    // ─── ARTÍCULOS / NOTICIAS ───
    articles: {
        title_template: '{articulo} | F1 Grand Prix Hub',
        description_template: '{excerpt}', // Max 155 chars
        keywords_categories: {
            'noticias': ['noticias F1', 'últimas noticias fórmula 1', 'GP hoy', 'carrera F1'],
            'analisis': ['análisis carrera F1', 'análisis estrategia', 'análisis técnico F1'],
            'preview': ['preview GP', 'predicción carrera', 'análisis previo F1'],
            'tecnica': ['técnica F1', 'aerodinamica F1', 'física fórmula 1']
        },
        minWordCount: 800,
        minHeadings: 3,
        targetReadingTime: '5-8 min'
    },

    // ─── CALENDARIO ───
    calendar: {
        title: 'Calendario F1 2025 | Horarios GP y Sesiones en Vivo',
        description: 'Calendario completo F1 2025 con horarios de entrenamientos, clasificación y carrera. Todas las sesiones en hora de Argentina.',
        keywords: [
            'calendario F1 2025',
            'horarios GP 2025',
            'sesiones F1',
            'clasificación F1',
            'carrera F1 2025'
        ],
        primaryKeyword: 'calendario F1 2025'
    },

    // ─── ANÁLISIS DE ESTRATEGIA (Pillar Page #1) ───
    strategy_pillar: {
        title: 'Estrategia de Neumáticos en F1: Guía Completa 2025',
        description: 'Aprende cómo funcionan los estrategias de neumáticos en F1. Compound, pit stops, undercut, overcut y everything you need to know.',
        keywords: [
            'estrategia neumáticos F1',
            'compound tires F1',
            'pit stop strategy',
            'undercut overcut F1',
            'estrategia de carreras F1'
        ],
        primaryKeyword: 'estrategia neumáticos F1',
        relatedClusters: ['pit_stops', 'tire_compounds', 'race_strategy'],
        internalLinks: 50 // Target: 50 links internos
    },

    // ─── ARTÍCULOS TÉCNICOS ───
    technical: {
        title_template: '{tema} en F1: Guía Técnica Completa',
        description_template: 'Explicación técnica detallada sobre {tema}. Cómo funciona, impacto en carrera y data histórica.',
        topics: [
            { slug: 'drs-f1', title: 'DRS en F1: Cómo Funciona y Por Qué es Importante' },
            { slug: 'downforce-f1', title: 'Downforce en F1: Física y Aerodinamica' },
            { slug: 'kers-ers-f1', title: 'ERS/KERS en F1: Sistema de Energía Explicado' },
            { slug: 'porpoising-f1', title: 'Porpoising en F1: El Efecto Suelo Explicado' },
            { slug: 'deg-neumáticos', title: 'Degradación de Neumáticos: Cómo Afecta la Carrera' }
        ]
    },

    // ─── COMPARATIVAS (Article cluster) ───
    comparisons: {
        templates: [
            { slug: 'hamilton-vs-senna', title: 'Hamilton vs Senna: ¿Quién es el GOAT del F1?' },
            { slug: 'verstappen-era', title: 'Verstappen: La Era de Dominancia más Corta en F1' },
            { slug: 'ferrari-mclaren', title: 'Ferrari vs McLaren: Historia de Rivalidad en F1' }
        ],
        keywords: ['comparación F1', 'mejor piloto', 'equipo más dominante']
    },

    // ─── HISTÓRICO / DATA (Para rankear "long-tail" keywords) ───
    historical: {
        topics: [
            { slug: 'historia-f1', title: 'Historia de la Fórmula 1: Desde 1950 Hasta Hoy' },
            { slug: 'records-f1', title: 'Records de F1: Todos los Marcas Históricos' },
            { slug: 'campeonatos-f1', title: 'Todos los Campeones de F1: Lista Completa' }
        ]
    }
};

// ────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────

/**
 * Obtener keywords primarias para una página
 * @param {string} section - Sección (home, articles, calendar, etc)
 * @returns {array} Array de keywords
 */
export function getKeywordsForSection(section) {
    const config = SEO_CONFIG[section];
    if (!config) return [];
    return config.keywords || [];
}

/**
 * Optimizar meta description (max 155-160 chars)
 * @param {string} text - Texto a optimizar
 * @returns {string} Texto truncado
 */
export function optimizeMetaDescription(text) {
    const max = 155;
    if (text.length <= max) return text;
    return text.substring(0, max - 3) + '...';
}

/**
 * Generar título SEO optimizado
 * @param {string} articleTitle - Título del artículo
 * @param {string} category - Categoría (noticias, análisis, etc)
 * @returns {string} Título optimizado para meta tag
 */
export function generateSeoTitle(articleTitle, category = 'noticias') {
    const maxLength = 60; // Google mostra ~60 chars en desktop
    const categoryKeyword = SEO_CONFIG.articles.keywords_categories[category]?.[0] || '';
    
    if (articleTitle.length <= maxLength) {
        return `${articleTitle} | F1 Grand Prix Hub`;
    }
    
    return articleTitle.substring(0, maxLength - 13) + '... | F1 Grand Prix Hub';
}

/**
 * Validar que un artículo cumple mínimos SEO
 * @param {object} article - Objeto del artículo {title, content, excerpt}
 * @returns {object} {isValid: bool, issues: array}
 */
export function validateArticleSEO(article) {
    const issues = [];
    const config = SEO_CONFIG.articles;
    
    if (!article.title || article.title.length < 40) {
        issues.push('Título muy corto (mín 40 caracteres)');
    }
    if (article.title.length > 65) {
        issues.push('Título muy largo (máx 65 caracteres)');
    }
    
    if (!article.excerpt || article.excerpt.length < 100) {
        issues.push('Excerpt muy corto (mín 100 caracteres)');
    }
    if (article.excerpt.length > 160) {
        issues.push('Excerpt muy largo (máx 160 caracteres)');
    }
    
    const wordCount = article.content?.split(/\s+/).length || 0;
    if (wordCount < config.minWordCount) {
        issues.push(`Contenido muy corto (mín ${config.minWordCount} palabras, tienes ${wordCount})`);
    }
    
    // Contar h2s
    const h2Count = (article.content?.match(/<h2>/g) || []).length;
    if (h2Count < config.minHeadings) {
        issues.push(`Muy pocas secciones (mín ${config.minHeadings} h2 tags, tienes ${h2Count})`);
    }
    
    return {
        isValid: issues.length === 0,
        issues,
        wordCount,
        headingCount: h2Count
    };
}

/**
 * Generar JSON-LD para Rich Snippets
 * @param {object} article - Artículo
 * @returns {object} JSON-LD structured data
 */
export function generateArticleSchema(article) {
    return {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: article.title,
        description: article.excerpt,
        image: article.cover_image_url || 'https://f1-grand-prix-hub.vercel.app/og-image.jpg',
        datePublished: article.created_at,
        dateModified: article.updated_at,
        author: {
            '@type': 'Person',
            name: article.author || 'F1 Grand Prix Hub'
        },
        publisher: {
            '@type': 'Organization',
            name: 'F1 Grand Prix Hub',
            logo: {
                '@type': 'ImageObject',
                url: 'https://f1-grand-prix-hub.vercel.app/logo.png'
            }
        }
    };
}

export default SEO_CONFIG;
