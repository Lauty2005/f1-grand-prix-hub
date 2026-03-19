import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import driversRoutes from './src/routes/drivers.routes.js';
import racesRoutes from './src/routes/races.routes.js';
import standingsRoutes from './src/routes/standings.routes.js';
import authRoutes from './src/routes/auth.routes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- MIDDLEWARES (SIEMPRE PRIMERO) ---
app.use(cors({
    origin: true,
    credentials: true // Permite que las cookies pasen (fundamental para auth frontend)
}));
app.use(express.json());
app.use(cookieParser());
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// --- RUTAS ---
app.use('/api/drivers', driversRoutes);
app.use('/api/races', racesRoutes);
app.use('/api', standingsRoutes);
app.use('/api/auth', authRoutes);

// --- GLOBAL ERROR HANDLER ---
import { errorHandler } from './src/middleware/error.middleware.js';
app.use(errorHandler);

app.get('/', (req, res) => {
    res.send(`
        <h1 style="font-family: sans-serif;">🏁 F1 API Funcionando</h1>
        <ul style="font-family: sans-serif;">
            <li><a href="/api/drivers">/api/drivers</a></li>
            <li><a href="/api/races">/api/races</a></li>
            <li><a href="/api/constructors-standings">/api/constructors-standings</a></li>
        </ul>
    `);
});

app.listen(port, '0.0.0.0', () => {
    console.log(`\n🏎️  Motor arrancado en puerto: ${port}`);
});