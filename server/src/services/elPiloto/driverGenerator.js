// server/src/services/elPiloto/driverGenerator.js
//
// Dos responsabilidades que van juntas: decidir cuándo se retira un piloto
// real (por edad, sin mirar su forma deportiva) y generar el piloto ficticio
// que lo reemplaza. Es la pieza que hace que el grid derive de real a
// mayormente ficticio en una partida larga (15-20 temporadas), como se
// definió en el brainstorm.
//
// El banco de nombres/nacionalidades de acá abajo es un punto de partida
// chico a propósito — ampliarlo (más países, más nombres por país) es
// contenido, no arquitectura, y puede crecer después sin tocar la lógica.

import { generateAttributesFromProfile, clampAttribute } from './attributes.js';
import { weightedPick, gaussianNoise } from './weightedRandom.js';
import { TIER_SEED_RATING } from './rating.js';
import { TIER_PROFILES } from './tiers.js';

// ─── Retiro de pilotos reales ───────────────────────────────────────────────
// Curva simple por edad: casi nula hasta los 32, sube fuerte después de los
// 36. No usa resultados deportivos a propósito — un piloto real se puede ir
// en su mejor momento, tal como pasa en la vida real.
export const retirementProbability = (edad) => {
    if (edad < 32) return 0.01;
    if (edad < 35) return 0.06;
    if (edad < 37) return 0.18;
    if (edad < 39) return 0.35;
    return 0.6;
};

export const shouldRetire = (piloto) => Math.random() < retirementProbability(piloto.edad);

// ─── Banco de nacionalidades/nombres para pilotos ficticios ────────────────
// peso: pondera países con más tradición/cantera de automovilismo, sin
// excluir al resto. Ampliable sin tocar generateFictionalDriver().
const NATIONALITY_POOL = [
    {
        pais: 'Argentina', codigo: 'ARG', peso: 12,
        nombres: ['Franco', 'Bruno', 'Ignacio', 'Tomás', 'Santiago', 'Mateo'],
        apellidos: ['Aguirre', 'Ledesma', 'Roldán', 'Cabrera', 'Funes', 'Quiroga'],
    },
    {
        pais: 'Brasil', codigo: 'BRA', peso: 10,
        nombres: ['Gustavo', 'Rafael', 'Bruno', 'Caio', 'Enzo', 'Thiago'],
        apellidos: ['Moraes', 'Barbosa', 'Cardoso', 'Nogueira', 'Teixeira', 'Farias'],
    },
    {
        pais: 'Reino Unido', codigo: 'GBR', peso: 14,
        nombres: ['Oliver', 'Jack', 'Harry', 'Charlie', 'Freddie', 'Archie'],
        apellidos: ['Whitfield', 'Bennett', 'Marlowe', 'Hargreaves', 'Osborne', 'Pryce'],
    },
    {
        pais: 'Países Bajos', codigo: 'NLD', peso: 9,
        nombres: ['Daan', 'Sem', 'Bram', 'Luuk', 'Thijs', 'Ruben'],
        apellidos: ['Dekker', 'Bakker', 'Visser', 'Smeets', 'Mulder', 'Hendriks'],
    },
    {
        pais: 'Italia', codigo: 'ITA', peso: 10,
        nombres: ['Matteo', 'Leonardo', 'Riccardo', 'Federico', 'Gabriele', 'Andrea'],
        apellidos: ['Bellini', 'Ferrante', 'Colombo', 'Marchetti', 'Greco', 'Sartori'],
    },
    {
        pais: 'Alemania', codigo: 'DEU', peso: 10,
        nombres: ['Finn', 'Jonas', 'Lukas', 'Elias', 'Moritz', 'Paul'],
        apellidos: ['Brandt', 'Krüger', 'Hoffmann', 'Lehmann', 'Vogel', 'Richter'],
    },
    {
        pais: 'España', codigo: 'ESP', peso: 11,
        nombres: ['Álvaro', 'Marc', 'Iker', 'Pol', 'Nico', 'Hugo'],
        apellidos: ['Reyes', 'Bautista', 'Cortés', 'Serra', 'Peláez', 'Iglesias'],
    },
    {
        pais: 'México', codigo: 'MEX', peso: 8,
        nombres: ['Emiliano', 'Diego', 'Rodrigo', 'Santiago', 'Alejandro', 'Iván'],
        apellidos: ['Villanueva', 'Reyes', 'Castañeda', 'Solano', 'Miranda', 'Ochoa'],
    },
];

const pickName = (namePool) => namePool[Math.floor(Math.random() * namePool.length)];

// contexto: 'inferior' (rival eterno / grid de juniors, arranca ~15-17 años)
// o 'reemplazoF1' (entra directo a reemplazar a un piloto real retirado,
// típicamente ya viene de las inferiores del propio juego).
export const generateFictionalDriver = ({ contexto = 'inferior', id } = {}) => {
    const nacionalidad = weightedPick(
        NATIONALITY_POOL.map((n) => ({ value: n, weight: n.peso }))
    );

    // Potencial con algo de variación alrededor del perfil "rookie" (ver
    // tiers.js) — un debutante de verdad puede salir mediocre o crack, no
    // todos entran iguales.
    const potencial = Math.round(clampAttribute(gaussianNoise(TIER_PROFILES.rookie.potencial, 15)));
    const edad = contexto === 'inferior' ? 15 + Math.floor(Math.random() * 3) : 20 + Math.floor(Math.random() * 4);

    return {
        id: id ?? `ficticio-${Math.random().toString(36).slice(2, 10)}`,
        nombre: pickName(nacionalidad.nombres),
        apellido: pickName(nacionalidad.apellidos),
        nacionalidad: nacionalidad.codigo,
        edad,
        esFicticio: true,
        atributos: generateAttributesFromProfile({ potencial, experiencia: TIER_PROFILES.rookie.experiencia }),
        rating: TIER_SEED_RATING.rookie + Math.round(gaussianNoise(0, 40)),
        racesCompleted: 0,
        forma: 0,
    };
};

// Genera el reemplazo directo de un piloto real que se retira — mismo
// generador, contexto distinto para que arranque con algo más de rodaje que
// un debutante absoluto de karting. retiredDriver no se usa todavía: queda
// como parámetro a propósito para cuando tenga sentido heredar algo del
// piloto saliente (ej. nacionalidad del equipo, "escuela" de pilotos).
export const generateReplacementForRetiredDriver = (retiredDriver) =>
    generateFictionalDriver({ contexto: 'reemplazoF1' });
