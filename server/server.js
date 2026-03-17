import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Importamos las nuevas rutas
import driversRoutes from './src/routes/drivers.routes.js';
import racesRoutes from './src/routes/races.routes.js';
import standingsRoutes from './src/routes/standings.routes.js';
import { adminAuth } from './src/middleware/auth.middleware.js';

dotenv.config();

const app = express();
// TIENE que decir process.env.PORT (en mayúsculas)
const port = process.env.PORT || 3000; 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares
app.use('/api/drivers', driversRoutes);          // GET público
app.use('/api/races', racesRoutes);              // GET público

//USO EN LINEA

// Lista de orígenes permitidos (Local + Tu futuro Frontend en Vercel)
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://f1-grand-prix-hub.vercel.app']
    : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`Origen no permitido: ${origin}`));
        }
    }
}));

app.use(express.json());
//app.use('/images', express.static('public/images'));

// Hacer pública la carpeta 'uploads'
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// --- RUTAS PRINCIPALES ---
// Todo lo que empiece por /api/drivers va al archivo drivers.routes.js
app.use('/api/drivers', driversRoutes);

// Todo lo que empiece por /api/races va a races.routes.js (incluye POST results y DELETE)
app.use('/api/races', racesRoutes);

// El POST /api/results ahora está dentro de races.routes.js, pero para mantener compatibilidad
// con tu frontend actual que llama a "/api/results", hacemos un pequeño "puente" o
// mejor aún, actualizamos el frontend admin.js. 
// PERO: En races.routes.js definí "router.post('/results'...)". 
// Así que la ruta quedó como: /api/races/results.
// ESTO ES UN CAMBIO IMPORTANTE. 

// Nota: En standings.routes.js la ruta es '/constructors', 
// así que la URL final será /api/constructors-standings/constructors.
// CORRECCIÓN RÁPIDA:
// Mejor montamos standingsRoutes en /api
app.use('/api', standingsRoutes); 
// Así /api/constructors (que definimos en el archivo) funcionará.
// Pero tu frontend llama a /api/constructors-standings.
// Vamos a ajustar eso en el archivo standings.routes.js (ya te di el código corregido arriba para que coincida).

app.get('/', (req, res) => {
    res.send(`
        <h1 style="font-family: sans-serif;">🏁 F1 API Funcionando</h1>
        <p style="font-family: sans-serif;">Prueba estas rutas:</p>
        <ul style="font-family: sans-serif;">
            <li><a href="/api/drivers">/api/drivers</a> (Pilotos)</li>
            <li><a href="/api/races">/api/races</a> (Carreras)</li>
            <li><a href="/api/constructors-standings">/api/constructors-standings</a></li>
        </ul>
    `);
});

// 👇 AGREGAR '0.0.0.0' AQUÍ ES LA CLAVE
app.listen(port, '0.0.0.0', () => {
    console.log(`\n🏎️  Motor arrancado en puerto: ${port}`);
});