// server/src/services/elPiloto/careerSetup.js
//
// Arranque MÍNIMO de una partida — a propósito una simplificación grande:
// no hay categorías inferiores ni draft, el jugador y su rival eterno entran
// directo a F1 reemplazando a los dos titulares reales del equipo elegido
// (que "se van a otro lado", sin simularse). Es lo mínimo para poder probar
// el loop de temporada de punta a punta; la versión con arco narrativo desde
// karting sigue siendo la idea pendiente del brainstorm, no esto.

import { generateAttributesFromProfile, ATTRIBUTE_KEYS, clampAttribute } from './attributes.js';
import { TIER_SEED_RATING } from './rating.js';
import { TIER_PROFILES } from './tiers.js';
import { generateFictionalDriver } from './driverGenerator.js';
import { generateSeasonCalendar } from './calendar.js';

// Valor de mercado inicial según el tier cosmético de la escudería elegida
// (ver tierDeEquipo() en el cliente) — puramente de sabor, crece con la
// carrera (victorias/podios/puntos), nunca se usa como input del motor.
const VALOR_MERCADO_INICIAL = { top: 800000, mid: 500000, backmarker: 300000, otro: 400000 };

const NUMERO_MIN = 1;
const NUMERO_MAX = 99;

const pickAvailableNumber = (usados) => {
    // Loop simple con tope de intentos — el rango 1-99 casi nunca va a estar
    // lleno con ~20 pilotos, así que esto converge rápido en la práctica.
    for (let intento = 0; intento < 200; intento++) {
        const candidato = NUMERO_MIN + Math.floor(Math.random() * (NUMERO_MAX - NUMERO_MIN + 1));
        if (!usados.has(candidato)) return candidato;
    }
    throw new Error('No quedan números disponibles en el rango 1-99.');
};

const ROLES_VALIDOS = ['lider', 'competitivo'];

// El jugador arranca con un potencial bien por debajo del perfil "rookie"
// compartido (TIER_PROFILES.rookie.potencial = 60) — a pedido del usuario,
// para que el arranque se sienta como un piloto verde de verdad y el
// progreso vía arquetipo + dado de mejoras en cada pretemporada se note. No
// se toca TIER_PROFILES.rookie porque ese perfil también alimenta a los
// pilotos de IA que reemplazan retiros (driverGenerator.js) — debilitarlo
// ahí no tiene sentido, esto es específico del arranque del jugador.
// `TOPE_ATRIBUTO_ROOKIE_JUGADOR` es un tope duro además del potencial bajo:
// el ruido gaussiano no tiene límite superior natural, así que sin este
// clamp una tirada rara igual podría pasar de 60.
const POTENCIAL_ROOKIE_JUGADOR = 40;
const TOPE_ATRIBUTO_ROOKIE_JUGADOR = 59;

// Tira atributos de piloto rookie SIN crear ninguna carrera — usado por
// GET /atributos-rookie para que el cliente pueda mostrar "tus atributos de
// base" en las pantallas de creación de personaje (dado de arquetipo,
// backstory de F2), ANTES de que exista un save. Se manda de vuelta al
// servidor tal cual en POST /nueva-carrera (`atributosBase`) para que
// iniciarCarrera use estos mismos números en vez de tirar otros — así lo
// que el jugador vio en la preview es exactamente lo que termina teniendo.
export const generarAtributosRookie = () => {
    const atributos = generateAttributesFromProfile({
        potencial: POTENCIAL_ROOKIE_JUGADOR,
        experiencia: TIER_PROFILES.rookie.experiencia,
    });
    ATTRIBUTE_KEYS.forEach((key) => {
        atributos[key] = Math.min(atributos[key], TOPE_ATRIBUTO_ROOKIE_JUGADOR);
    });
    return atributos;
};

// Ventana de retiro del jugador — sorteada UNA vez al arrancar la carrera
// (28 a 32 años, 5 a 8 temporadas si arrancó a los 21 y corre una temporada
// por año). Los pilotos reales/ficticios se rigen por `driverGenerator.js`
// (curva de probabilidad); el jugador tiene una ventana fija para que el
// final de carrera sea un evento narrativo previsible, no una tirada de
// dados año a año.
const EDAD_RETIRO_MIN = 28;
const EDAD_RETIRO_MAX = 32;
const rollEdadRetiro = () => EDAD_RETIRO_MIN + Math.floor(Math.random() * (EDAD_RETIRO_MAX - EDAD_RETIRO_MIN + 1));

// grid: { pilotos, equipos } — típicamente el resultado de getRealGrid(year)
// equipoId: a qué escudería se suma el jugador (ej. "real-4")
// numeroJugador: el jugador lo elige — tiene que estar libre entre los
// pilotos que SIGUEN en el grid (los dos titulares del equipo elegido salen,
// así que sus números quedan libres para tomar).
// rol: 'lider' (el equipo prioriza tu estrategia) o 'competitivo' (más
// margen para jugarte adelantamientos) — puramente un modificador de carrera
// aplicado del lado del cliente, ver client/src/modules/elPiloto.js.
// arquetipo: la carta elegida del dado inicial (ver ARCHETYPE_CARDS en
// interactiveMoments.js) — { atributo, bonus, atributoSecundario?,
// bonusSecundario? }. `atributo: 'parejo'` es un caso especial: el bonus se
// aplica a los 6 atributos por igual en vez de a uno solo.
// tierEquipo: 'top' | 'mid' | 'backmarker' | 'otro' — solo define el valor de
// mercado inicial (cosmético), la clasificación real vive en el cliente.
// atributosBase: opcional — el resultado de un GET /atributos-rookie previo,
// para que la carrera arranque con los MISMOS números que el cliente ya
// mostró en la preview (dado de arquetipo, backstory de F2) en vez de tirar
// un rookie nuevo acá. Si no viene, se genera acá como antes.
export const iniciarCarrera = ({
    grid, equipoId, nombreJugador = 'Vos', numeroJugador, rol = 'competitivo',
    carrerasPorTemporada = 24, arquetipo = null, tierEquipo = 'otro', atributosBase = null,
}) => {
    const { pilotos, equipos } = grid;

    if (!equipos[equipoId]) {
        throw new Error(`El equipo ${equipoId} no existe en este grid.`);
    }
    if (!ROLES_VALIDOS.includes(rol)) {
        throw new Error(`Rol inválido: ${rol}.`);
    }

    // Simplificación v1: los dos titulares reales de ese equipo quedan afuera
    // de esta partida (no se retiran ni se simulan en otro lado, solo no
    // corren) — el jugador y el rival eterno ocupan su lugar.
    const pilotosSinEseEquipo = pilotos.filter((p) => p.equipoId !== equipoId);
    const numerosUsados = new Set(
        pilotosSinEseEquipo.map((p) => p.numero).filter((n) => n != null)
    );

    const numero = Number(numeroJugador);
    if (!Number.isInteger(numero) || numero < NUMERO_MIN || numero > NUMERO_MAX) {
        throw new Error(`El número tiene que ser un entero entre ${NUMERO_MIN} y ${NUMERO_MAX}.`);
    }
    if (numerosUsados.has(numero)) {
        throw new Error(`El número ${numero} ya lo usa otro piloto del grid.`);
    }

    const atributosValidos = atributosBase && ATTRIBUTE_KEYS.every((key) => typeof atributosBase[key] === 'number');
    const atributos = atributosValidos ? { ...atributosBase } : generarAtributosRookie();

    // Aplicar la carta de arquetipo elegida en el dado inicial (si vino una).
    if (arquetipo?.atributo === 'parejo') {
        ATTRIBUTE_KEYS.forEach((key) => { atributos[key] = clampAttribute(atributos[key] + arquetipo.bonus); });
    } else if (arquetipo?.atributo && ATTRIBUTE_KEYS.includes(arquetipo.atributo)) {
        atributos[arquetipo.atributo] = clampAttribute(atributos[arquetipo.atributo] + arquetipo.bonus);
        if (arquetipo.atributoSecundario && ATTRIBUTE_KEYS.includes(arquetipo.atributoSecundario)) {
            atributos[arquetipo.atributoSecundario] = clampAttribute(atributos[arquetipo.atributoSecundario] + (arquetipo.bonusSecundario ?? 0));
        }
    }

    const jugador = {
        id: 'jugador',
        nombreCompleto: nombreJugador,
        numero,
        edad: 21,
        edadRetiro: rollEdadRetiro(),
        nacionalidad: null,
        equipoId,
        esFicticio: false,
        esJugador: true,
        rol,
        // Idolatría (0-100, con hitos con nombre en el cliente — Uno más,
        // Prometedor, Ídolo de casa, Referente, Leyenda). Antes se llamaba
        // "prestigio"; se renombró para calzar con el vocabulario de El Ídolo.
        idolatria: 50,
        // Economía puramente de sabor + un uso funcional: dineroGanado es el
        // total acumulado (nunca baja); saldoDisponible SÍ se gasta en
        // pretemporada (tiradas extra del dado de mejoras) — ver
        // client/src/modules/elPiloto.js.
        valorDeMercado: VALOR_MERCADO_INICIAL[tierEquipo] ?? VALOR_MERCADO_INICIAL.otro,
        dineroGanado: 0,
        saldoDisponible: 0,
        atributos,
        rating: TIER_SEED_RATING.rookie,
        racesCompleted: 0,
        forma: 0,
        // Contadores de carrera deportiva completa (nunca se resetean entre
        // temporadas) — alimentan el HUD y la pantalla final de retiro.
        victoriasCareer: 0,
        polesCareer: 0,
        podiosCareer: 0,
        titulosCareer: 0,
        puntosCareerTotal: 0,
    };

    const rivalEterno = generateFictionalDriver({ contexto: 'inferior', id: 'rival-eterno' });
    rivalEterno.equipoId = equipoId;
    rivalEterno.esRivalEterno = true;
    rivalEterno.numero = pickAvailableNumber(new Set([...numerosUsados, numero]));
    // El rival permanente también acumula victorias de carrera para la
    // tarjeta comparativa que se muestra cada 3 Grandes Premios.
    rivalEterno.victoriasCareer = 0;

    return {
        pilotos: [...pilotosSinEseEquipo, jugador, rivalEterno],
        equipos,
        calendario: generateSeasonCalendar(carrerasPorTemporada),
        carreraIndex: 0,
        tablaPuntos: {},
        jugadorId: jugador.id,
        rivalEternoId: rivalEterno.id,
        // Se puede pedir una vez en TODA la carrera (no por temporada) — ver
        // el mercado de pases en el cliente.
        llamadaRepresentanteUsada: false,
    };
};
