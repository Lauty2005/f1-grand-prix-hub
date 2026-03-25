import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Prioridad: Si existe DATABASE_URL (Render), la usa. Si no, usa las variables sueltas.
const connectionConfig = process.env.DATABASE_URL 
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        ssl: false
      };

const pool = new pg.Pool({
    ...connectionConfig,
    max: parseInt(process.env.PG_POOL_MAX) || 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
    allowExitOnIdle: true
});

pool.on('error', (err) => {
    console.error(`[DB Pool] Error inesperado en cliente idle: ${err.message}`);
});

pool.on('connect', () => {
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[DB Pool] Nueva conexión. Total activas: ~${pool.totalCount}`);
    }
});

export const query = (text, params) => pool.query(text, params);
export { pool };