import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import driversRoutes from './src/routes/drivers.routes.js';
import racesRoutes from './src/routes/races.routes.js';
import standingsRoutes from './src/routes/standings.routes.js';
import authRoutes from './src/routes/auth.routes.js';
import teamsRoutes from './src/routes/teams.routes.js';
import articlesRoutes from './src/routes/articles.routes.js';
import timelineRoutes  from './src/routes/timeline.routes.js';
import strategyRoutes  from './src/routes/strategy.routes.js';
import sitemapRouter from './src/routes/sitemap.routes.js';
import newsletterRouter from './src/routes/newsletter.routes.js';

dotenv.config();

const REQUIRED_ENV = [
    'JWT_SECRET',
    'CLOUDFLARE_R2_BUCKET',
    'CLOUDFLARE_R2_PUBLIC_URL',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_R2_ACCESS_KEY',
    'CLOUDFLARE_R2_SECRET_KEY',
];
for (const key of REQUIRED_ENV) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

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

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes, intente más tarde.' },
});

// --- MIDDLEWARES (SIEMPRE PRIMERO) ---
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(globalLimiter);
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// --- RUTAS ---
app.use('/api/drivers', driversRoutes);
app.use('/api/races', racesRoutes);
app.use('/api', standingsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/articles', articlesRoutes);
app.use('/api/timeline',  timelineRoutes);
app.use('/api/strategy', strategyRoutes);
app.use('/', sitemapRouter);  // /sitemap.xml — debe estar en la raíz, sin prefijo /api
app.use('/api/newsletter', newsletterRouter);

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