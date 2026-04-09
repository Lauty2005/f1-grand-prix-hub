// Ejecutar desde server/: node migrations/run-migration.js
import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cargar .env desde server/ (un nivel arriba de migrations/)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const connectionConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: false }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT) || 5432,
        ssl: false
    };

const sql = readFileSync(
    path.join(__dirname, '012_create_newsletter_table.sql'),
    'utf8'
);

const client = new pg.Client(connectionConfig);

await client.connect();
console.log('Conectado a la base de datos.');

await client.query(sql);
console.log('✅ Migración 012_create_newsletter_table ejecutada correctamente.');

await client.end();
