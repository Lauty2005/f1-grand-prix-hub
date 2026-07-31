// server/src/routes/elPiloto.routes.js
//
// Rutas propias para "El Piloto", separadas de game.routes.js a propósito:
// ese archivo sigue el patrón de un único service/controller/routes para
// TODOS los mini-juegos de 30 segundos (ver CLAUDE.md). El Piloto no es un
// mini-juego de ese tipo — es un subsistema más grande con su propia carpeta
// (server/src/services/elPiloto/) — así que se le da su propio archivo de
// rutas en vez de forzarlo dentro de game.routes.js.
import { Router } from 'express';
import * as elPilotoController from '../controllers/elPiloto.controller.js';

const router = Router();

// GET /api/el-piloto/roster?year=2026
router.get('/roster', elPilotoController.getRoster);

// GET /api/el-piloto/calendario?carreras=24
router.get('/calendario', elPilotoController.getCalendario);

// POST /api/el-piloto/nueva-carrera — body: { year, equipoId, nombreJugador?, numeroJugador, rol, arquetipo?, tierEquipo?, atributosBase? }
router.post('/nueva-carrera', elPilotoController.nuevaCarrera);

// GET /api/el-piloto/atributos-rookie
router.get('/atributos-rookie', elPilotoController.getAtributosRookie);

// GET /api/el-piloto/cartas-arquetipo
router.get('/cartas-arquetipo', elPilotoController.getCartasArquetipo);

// GET /api/el-piloto/cartas-mejora
router.get('/cartas-mejora', elPilotoController.getCartasMejora);

// GET /api/el-piloto/cartas-casco
router.get('/cartas-casco', elPilotoController.getCartasCasco);

// GET /api/el-piloto/contexto-minijuego
router.get('/contexto-minijuego', elPilotoController.getContextoMinijuego);

// GET /api/el-piloto/decision-muro-boxes
router.get('/decision-muro-boxes', elPilotoController.getDecisionMuroBoxes);

// POST /api/el-piloto/resolver-decision-muro-boxes — body: { decisionId, opcionId }
router.post('/resolver-decision-muro-boxes', elPilotoController.resolverDecisionMuroBoxes);

// GET /api/el-piloto/trivia-f1?cantidad=9
router.get('/trivia-f1', elPilotoController.getTriviaF1);

// GET /api/el-piloto/paddock-pairs?cantidad=8
router.get('/paddock-pairs', elPilotoController.getPaddockPairs);

// POST /api/el-piloto/simular-carrera — body: { pilotos, equipos, calendario, carreraIndex, tablaPuntos }
router.post('/simular-carrera', elPilotoController.simularCarrera);

// POST /api/el-piloto/cerrar-temporada — body: { pilotos, equipos }
router.post('/cerrar-temporada', elPilotoController.cerrarTemporadaHandler);

// GET /api/el-piloto/evento-aleatorio?categoria=equipo|prensa
router.get('/evento-aleatorio', elPilotoController.getEventoAleatorio);

// POST /api/el-piloto/resolver-evento — body: { eventoId, opcionId }
router.post('/resolver-evento', elPilotoController.resolverEvento);

export default router;
