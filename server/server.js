import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Importamos las nuevas rutas
import driversRoutes from './src/routes/drivers.routes.js';
import racesRoutes from './src/routes/races.routes.js';
import standingsRoutes from './src/routes/standings.routes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/images', express.static('public/images'));

// Hacer pública la carpeta 'uploads'
app.use('/images', express.static(path.join(__dirname, '../../public/images')));

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

// OPCIÓN A: Mapear la ruta vieja a la nueva lógica
// Para no romper tu admin.js que llama a '/api/results', vamos a dejar este puente aquí:
import { query } from './src/config/db.js';
const POINTS_SYSTEM = { 1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1 };

app.post('/api/results', async (req, res) => {
    // Lógica duplicada temporalmente para no romper admin.js sin editarlo
    try {
        const { race_id, driver_id, position, fastest_lap, dnf, dsq, dns, dnq } = req.body;
        let points = POINTS_SYSTEM[position] || 0;
        if (dnf || dsq || dns || dnq) points = 0;
        else if (fastest_lap && position <= 10) points += 1;

        await query(
            `INSERT INTO results (race_id, driver_id, position, points, fastest_lap, dnf, dsq, dns, dnq) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [race_id, driver_id, position, points, fastest_lap, dnf, dsq, dns, dnq]
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// Rutas de campeonato
app.use('/api/constructors-standings', standingsRoutes);
// Nota: En standings.routes.js la ruta es '/constructors', 
// así que la URL final será /api/constructors-standings/constructors.
// CORRECCIÓN RÁPIDA:
// Mejor montamos standingsRoutes en /api
app.use('/api', standingsRoutes); 
// Así /api/constructors (que definimos en el archivo) funcionará.
// Pero tu frontend llama a /api/constructors-standings.
// Vamos a ajustar eso en el archivo standings.routes.js (ya te di el código corregido arriba para que coincida).

// Arrancar servidor
app.listen(port, () => {
    console.log(`\n🏎️  Motor arrancado en: http://localhost:${port}`);
});