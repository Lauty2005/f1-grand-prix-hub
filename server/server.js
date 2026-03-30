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
import teamsRoutes from './src/routes/teams.routes.js';
import articlesRoutes from './src/routes/articles.routes.js';
import timelineRoutes from './src/routes/timeline.routes.js';

dotenv.config();

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
: ['http://localhost:5173'];

const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// --- MIDDLEWARES (SIEMPRE PRIMERO) ---
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS bloqueado: ${origin}`));
        }
    },
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const ONE_WEEK = 7 * 24 * 60 * 60;
const ONE_MONTH = 30 * 24 * 60 * 60;

app.use('/images/circuits', express.static(
    path.join(__dirname, 'public/images/circuits'),
    {
        maxAge: ONE_MONTH * 1000,
        etag: true,
        lastModified: true,
        immutable: true
    }
));

app.use('/images', express.static(
    path.join(__dirname, 'public/images'),
    {
        maxAge: ONE_WEEK * 1000,
        etag: true,
        lastModified: true
    }
));

// --- RUTAS ---
app.use('/api/drivers', driversRoutes);
app.use('/api/races', racesRoutes);
app.use('/api', standingsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/articles', articlesRoutes);
app.use('/api/timeline', timelineRoutes);

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