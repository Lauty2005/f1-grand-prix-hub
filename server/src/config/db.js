import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Listener para errores inesperados en la conexión
pool.on('error', (err) => {
    console.error('Error inesperado en el cliente de PostgreSQL', err);
    process.exit(-1);
});

export const query = (text, params) => pool.query(text, params);