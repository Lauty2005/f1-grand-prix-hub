import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Configuración del Pool de conexiones
const pool = new pg.Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    // 👇 ESTO ES LO QUE FALTA:
    // Si existe la variable RAILWAY_ENVIRONMENT, activamos SSL. Si no, lo dejamos apagado (local).
    ssl: process.env.RAILWAY_ENVIRONMENT ? { rejectUnauthorized: false } : false
});

// Listener para errores de conexión
pool.on('error', (err) => {
    console.error('❌ Error inesperado en PostgreSQL', err);
    process.exit(-1);
});

// Función query exportada
export const query = (text, params) => pool.query(text, params);