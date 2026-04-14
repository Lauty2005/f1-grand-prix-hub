export const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const API = `${SERVER_URL}/api`;

/**
 * Normaliza una URL de imagen al dominio actual.
 * Maneja: rutas relativas (/images/...), URLs de localhost (datos viejos) y URLs absolutas.
 */
export function resolveImgUrl(url) {
    if (!url) return null;
    if (url.startsWith('/')) return `${SERVER_URL}${url}`;
    if (url.includes('localhost')) {
        try { return `${SERVER_URL}${new URL(url).pathname}`; } catch { /* noop */ }
    }
    return url;
}