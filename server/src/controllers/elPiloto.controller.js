// server/src/controllers/elPiloto.controller.js
import { getRealGrid } from '../services/elPiloto/rosterFromDb.js';
import { generateSeasonCalendar } from '../services/elPiloto/calendar.js';
import { simulateNextRace, cerrarTemporada } from '../services/elPiloto/seasonEngine.js';
import { iniciarCarrera, generarAtributosRookie } from '../services/elPiloto/careerSetup.js';
import {
    elegirEventoAleatorio, evaluarEventoAleatorio,
    repartirArquetipos, repartirMejoras, elegirContextoMinijuego,
    elegirDecisionMuroBoxes, evaluarDecisionMuroBoxes,
    elegirTriviaF1, elegirPaddockPairs, repartirCascos,
} from '../services/elPiloto/interactiveMoments.js';

// GET /api/el-piloto/roster?year=2026
// Devuelve el grid real (pilotos + equipos) ya formateado para el motor de
// simulación. El tier/edad de cada piloto sale de realGridSeed.js, curado a
// mano — mientras ese archivo esté vacío, todos caen en el default neutral.
export const getRoster = async (req, res) => {
    try {
        const year = req.query.year || String(new Date().getFullYear());
        const grid = await getRealGrid(year);
        res.json({ success: true, data: grid });
    } catch (err) {
        console.error('ERROR el-piloto roster:', err.message);
        res.status(500).json({ error: 'Error cargando el grid real de El Piloto' });
    }
};

// GET /api/el-piloto/atributos-rookie
// Tira un set de atributos de piloto rookie SIN crear ninguna carrera — el
// cliente lo llama una vez al entrar a la creación de personaje y lo
// muestra en el dado de arquetipo/backstory de F2 (todavía no hay save en
// ese punto del flujo). Se manda de vuelta tal cual en `atributosBase` al
// llamar a POST /nueva-carrera, para que la carrera arranque con los mismos
// números que ya se mostraron en la preview.
export const getAtributosRookie = (req, res) => {
    try {
        res.json({ success: true, data: generarAtributosRookie() });
    } catch (err) {
        console.error('ERROR el-piloto atributos-rookie:', err.message);
        res.status(500).json({ error: 'Error generando los atributos de base' });
    }
};

// POST /api/el-piloto/nueva-carrera
// Body: { year, equipoId, nombreJugador?, numeroJugador, rol, arquetipo?, tierEquipo?, atributosBase? }
// Trae el grid real y arranca una partida: el jugador y su rival eterno
// reemplazan a los dos titulares reales del equipo elegido (ver
// careerSetup.js — simplificación v1, sin categorías inferiores). `arquetipo`
// es la carta que el jugador eligió del dado inicial (ver GET
// /cartas-arquetipo) — se manda completa porque el server es stateless y no
// tiene forma de "recordar" qué 3 cartas se repartieron. `atributosBase` es
// opcional — si el cliente ya mostró una preview con GET /atributos-rookie,
// la manda de vuelta acá para que la carrera use esos mismos números.
export const nuevaCarrera = async (req, res) => {
    try {
        const { year, equipoId, nombreJugador, numeroJugador, rol, arquetipo, tierEquipo, atributosBase } = req.body;
        if (!equipoId) return res.status(400).json({ error: 'Falta equipoId' });

        const grid = await getRealGrid(year || String(new Date().getFullYear()));
        const estado = iniciarCarrera({ grid, equipoId, nombreJugador, numeroJugador, rol, arquetipo, tierEquipo, atributosBase });
        res.json({ success: true, data: estado });
    } catch (err) {
        console.error('ERROR el-piloto nueva-carrera:', err.message);
        res.status(400).json({ error: err.message || 'Error iniciando la carrera' });
    }
};

// GET /api/el-piloto/cartas-arquetipo
// 3 cartas al azar del dado inicial (ver ARCHETYPE_CARDS) — el jugador elige
// una y la manda completa a POST /nueva-carrera.
export const getCartasArquetipo = (req, res) => {
    try {
        res.json({ success: true, data: repartirArquetipos() });
    } catch (err) {
        console.error('ERROR el-piloto cartas-arquetipo:', err.message);
        res.status(500).json({ error: 'Error repartiendo las cartas de arquetipo' });
    }
};

// GET /api/el-piloto/cartas-mejora
// 3 cartas al azar del dado de pretemporada (ver UPGRADE_CARDS) — el cliente
// puede llamarlo varias veces en la misma pretemporada (una por tirada
// disponible) y aplica la carta elegida directamente sobre su estado.
export const getCartasMejora = (req, res) => {
    try {
        res.json({ success: true, data: repartirMejoras() });
    } catch (err) {
        console.error('ERROR el-piloto cartas-mejora:', err.message);
        res.status(500).json({ error: 'Error repartiendo las cartas de mejora' });
    }
};

// GET /api/el-piloto/cartas-casco
// 3 diseños de casco al azar (ver CASCO_DESIGNS) — puramente cosmético, se
// compra en pretemporada y se guarda en jugador.cascoDiseno. Mismo patrón
// que cartas-arquetipo/cartas-mejora, sin campo/bonus porque no toca el motor.
export const getCartasCasco = (req, res) => {
    try {
        res.json({ success: true, data: repartirCascos() });
    } catch (err) {
        console.error('ERROR el-piloto cartas-casco:', err.message);
        res.status(500).json({ error: 'Error repartiendo los diseños de casco' });
    }
};

// GET /api/el-piloto/contexto-minijuego
// Sortea uno de los 3 contextos narrativos del minijuego "La Frenada"
// (adelantamiento/defensa/clasificación, ver MINIGAME_CONTEXTS) — el cliente
// ya sabe qué atributo agranda la zona de acierto y a qué modificador
// (quali o carrera) aplica el resultado.
export const getContextoMinijuego = (req, res) => {
    try {
        res.json({ success: true, data: elegirContextoMinijuego() });
    } catch (err) {
        console.error('ERROR el-piloto contexto-minijuego:', err.message);
        res.status(500).json({ error: 'Error eligiendo el contexto del minijuego' });
    }
};

// GET /api/el-piloto/decision-muro-boxes
// Escena de 2 opciones para el minijuego narrativo "Muro de Boxes" (ver
// WALL_DECISIONS) — sin revelar idolatriaDelta/economiaDelta todavía, eso
// vuelve en POST /resolver-decision-muro-boxes.
export const getDecisionMuroBoxes = (req, res) => {
    try {
        const decision = elegirDecisionMuroBoxes();
        res.json({
            success: true,
            data: {
                id: decision.id,
                escenario: decision.escenario,
                opciones: decision.opciones.map((o) => ({ id: o.id, texto: o.texto })),
            },
        });
    } catch (err) {
        console.error('ERROR el-piloto decision-muro-boxes:', err.message);
        res.status(500).json({ error: 'Error eligiendo la decisión de Muro de Boxes' });
    }
};

// POST /api/el-piloto/resolver-decision-muro-boxes — body: { decisionId, opcionId }
export const resolverDecisionMuroBoxes = (req, res) => {
    try {
        const { decisionId, opcionId } = req.body;
        const opcion = evaluarDecisionMuroBoxes(decisionId, opcionId);
        res.json({
            success: true,
            data: { idolatriaDelta: opcion.idolatriaDelta ?? 0, economiaDelta: opcion.economiaDelta ?? 0, mensaje: opcion.mensaje },
        });
    } catch (err) {
        console.error('ERROR el-piloto resolver-decision-muro-boxes:', err.message);
        res.status(400).json({ error: err.message || 'Error procesando la decisión de Muro de Boxes' });
    }
};

// GET /api/el-piloto/trivia-f1?cantidad=9
// Preguntas reales de Fórmula 1 (reglas/formato/historia general del
// deporte) para el minijuego "Ta-Te-Ti", variante Grid Trivia.
export const getTriviaF1 = (req, res) => {
    try {
        const cantidad = parseInt(req.query.cantidad, 10) || 9;
        res.json({ success: true, data: elegirTriviaF1(cantidad) });
    } catch (err) {
        console.error('ERROR el-piloto trivia-f1:', err.message);
        res.status(500).json({ error: 'Error eligiendo trivia de Fórmula 1' });
    }
};

// GET /api/el-piloto/paddock-pairs?cantidad=8
// Parejas conceptuales genéricas de F1 (compuestos, procedimientos) para el
// minijuego de memoria "Paddock Match".
export const getPaddockPairs = (req, res) => {
    try {
        const cantidad = parseInt(req.query.cantidad, 10) || 8;
        res.json({ success: true, data: elegirPaddockPairs(cantidad) });
    } catch (err) {
        console.error('ERROR el-piloto paddock-pairs:', err.message);
        res.status(500).json({ error: 'Error eligiendo las parejas de Paddock Match' });
    }
};

// GET /api/el-piloto/calendario?carreras=24
export const getCalendario = (req, res) => {
    try {
        const n = parseInt(req.query.carreras, 10) || 24;
        res.json({ success: true, data: generateSeasonCalendar(n) });
    } catch (err) {
        console.error('ERROR el-piloto calendario:', err.message);
        res.status(500).json({ error: 'Error generando el calendario' });
    }
};

// POST /api/el-piloto/simular-carrera
// Body: { pilotos, equipos, calendario, carreraIndex, tablaPuntos }
// Sin persistencia propia — el cliente manda su estado guardado y recibe el
// siguiente (ver README.md, sección "Contrato de estado"). El cliente ya
// arma modificadorQuali/modificadorCarrera del jugador (rol + resultado del
// minijuego "La Frenada" + bonus de evento pendiente + lluvia) ANTES de
// llamar acá, y los limpia del estado guardado después de leer la
// respuesta — este endpoint no necesita saber nada de esas reglas, solo
// corre el motor.
export const simularCarrera = (req, res) => {
    try {
        const resultado = simulateNextRace(req.body);
        res.json({ success: true, data: resultado });
    } catch (err) {
        console.error('ERROR el-piloto simular-carrera:', err.message);
        res.status(400).json({ error: err.message || 'Error simulando la carrera' });
    }
};

// POST /api/el-piloto/cerrar-temporada
// Body: { pilotos, equipos }
export const cerrarTemporadaHandler = (req, res) => {
    try {
        const resultado = cerrarTemporada(req.body);
        res.json({ success: true, data: resultado });
    } catch (err) {
        console.error('ERROR el-piloto cerrar-temporada:', err.message);
        res.status(400).json({ error: err.message || 'Error cerrando la temporada' });
    }
};

// GET /api/el-piloto/evento-aleatorio?categoria=equipo|prensa
// Devuelve uno de los eventos aleatorios (ver RANDOM_EVENTS en
// interactiveMoments.js) con sus 3 opciones — sin revelar
// idolatriaDelta/bonusCarrera todavía, eso vuelve en POST /resolver-evento.
// `categoria` es opcional: si no se manda, sortea entre TODOS los eventos.
export const getEventoAleatorio = (req, res) => {
    try {
        const evento = elegirEventoAleatorio(req.query.categoria);
        res.json({
            success: true,
            data: {
                id: evento.id,
                categoria: evento.categoria,
                pregunta: evento.pregunta,
                opciones: evento.opciones.map((o) => ({ id: o.id, texto: o.texto })),
            },
        });
    } catch (err) {
        console.error('ERROR el-piloto evento-aleatorio:', err.message);
        res.status(500).json({ error: 'Error eligiendo el evento aleatorio' });
    }
};

// POST /api/el-piloto/resolver-evento
// Body: { eventoId, opcionId } — devuelve { idolatriaDelta, bonusCarrera,
// mensaje }. Stateless: el cliente aplica el idolatriaDelta al jugador y
// guarda el bonusCarrera para inyectarlo en la próxima carrera.
export const resolverEvento = (req, res) => {
    try {
        const { eventoId, opcionId } = req.body;
        const opcion = evaluarEventoAleatorio(eventoId, opcionId);
        res.json({
            success: true,
            data: { idolatriaDelta: opcion.idolatriaDelta ?? 0, bonusCarrera: opcion.bonusCarrera ?? 0, mensaje: opcion.mensaje },
        });
    } catch (err) {
        console.error('ERROR el-piloto resolver-evento:', err.message);
        res.status(400).json({ error: err.message || 'Error procesando el evento aleatorio' });
    }
};
