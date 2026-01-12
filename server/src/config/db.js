import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Si el Host NO es localhost, estamos en la nube -> Activamos SSL
const isProduction = process.env.DB_HOST && process.env.DB_HOST !== 'localhost';

const pool = new pg.Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
    console.error('❌ Error inesperado en PostgreSQL', err);
    process.exit(-1);
});

export const query = (text, params) => pool.query(text, params);