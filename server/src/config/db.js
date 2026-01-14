import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Prioridad: Si existe DATABASE_URL (Render), la usa. Si no, usa las variables sueltas.
const connectionConfig = process.env.DATABASE_URL 
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        ssl: false
      };

const pool = new pg.Pool(connectionConfig);

pool.on('error', (err) => {
    console.error('❌ Error inesperado en PostgreSQL', err);
    process.exit(-1);
});

export const query = (text, params) => pool.query(text, params);