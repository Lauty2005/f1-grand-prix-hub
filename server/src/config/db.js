import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Detectamos si hay un puerto definido (típico de la nube) para activar SSL
const isProduction = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';

const pool = new pg.Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    // 👇 ESTA ES LA CLAVE: SSL activado para Railway, desactivado para Localhost
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

// Listener para errores inesperados en la conexión
pool.on('error', (err) => {
    console.error('Error inesperado en el cliente de PostgreSQL', err);
    process.exit(-1);
});

export const query = (text, params) => pool.query(text, params);