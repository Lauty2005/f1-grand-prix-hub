// Detecta si estamos en local o en producción automáticamente
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const SERVER_URL = isLocal 
    ? 'http://localhost:3000' 
    : 'https://TU-BACKEND-EN-RAILWAY.up.railway.app'; // 👈 Esto lo actualizaremos luego

export const API = `${SERVER_URL}/api`;