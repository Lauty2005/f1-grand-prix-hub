// server/src/services/elPiloto/attributes.js
//
// Atributos base de un piloto en "El Piloto" y los pesos con los que cada uno
// entra en la clasificación y la carrera según el perfil de la pista. Esto
// reemplaza al diseño descartado (rating derivado de stats históricas reales
// de puntos/victorias/podios): acá el "talento" es una escala 0-100 por
// atributo, editable en pretemporada y que el motor combina en tiempo real
// carrera a carrera. Ver server/src/services/elPiloto/README.md.

import { gaussianNoise } from './weightedRandom.js';

// Un piloto (real, rival eterno o rival de temporada) se representa con estos
// seis atributos, todos en escala 0-100:
export const ATTRIBUTE_KEYS = [
    'ritmoQuali',        // pace en una vuelta rápida, define el punto de partida en la grilla
    'ritmoCarrera',      // pace sostenido a lo largo del stint
    'agresividad',       // capacidad de adelantar; sube el techo, también el riesgo de incidente
    'consistencia',      // inverso de la tasa de error propio (trompos, choques evitables)
    'gestionNeumaticos', // qué tan bien administra la degradación en stints largos
    'feedbackTecnico',   // calidad del feedback para el desarrollo del auto (no afecta la carrera en sí)
];

// Perfil de una pista: cuánto pesa cada atributo en clasificación y en carrera.
// Los perfiles no necesitan sumar 1 exacto — se normalizan en tiempo de uso.
export const TRACK_PROFILES = {
    // Pistas de alta velocidad (Monza, Spa): el motor/auto y el ritmo puro pesan
    // más que la agresividad para adelantar, porque hay menos frenadas fuertes.
    altaVelocidad: {
        quali: { ritmoQuali: 0.7, gestionNeumaticos: 0.1, consistencia: 0.2 },
        carrera: { ritmoCarrera: 0.5, gestionNeumaticos: 0.2, agresividad: 0.2, consistencia: 0.1 },
    },
    // Callejeros (Mónaco, Bakú): clasificar bien importa muchísimo porque
    // adelantar es difícil y el error se paga carísimo.
    callejero: {
        quali: { ritmoQuali: 0.55, consistencia: 0.45 },
        carrera: { ritmoCarrera: 0.3, consistencia: 0.4, gestionNeumaticos: 0.1, agresividad: 0.2 },
    },
    // Técnicas (Suzuka, Barcelona): equilibrio, con algo más de peso en
    // consistencia y gestión de neumáticos por las curvas de carga sostenida.
    tecnica: {
        quali: { ritmoQuali: 0.6, consistencia: 0.4 },
        carrera: { ritmoCarrera: 0.35, gestionNeumaticos: 0.3, consistencia: 0.2, agresividad: 0.15 },
    },
    // Propensas a lluvia (Spa, Interlagos, Silverstone): la consistencia pesa
    // mucho más — el "chaos engine" además sube la varianza general acá
    // (ver raceSimulator.js), así que estos perfiles ya vienen sesgados.
    propensaLluvia: {
        quali: { ritmoQuali: 0.5, consistencia: 0.5 },
        carrera: { ritmoCarrera: 0.25, consistencia: 0.45, gestionNeumaticos: 0.2, agresividad: 0.1 },
    },
};

// Normaliza un objeto de pesos para que sumen 1, sin importar cómo se hayan
// definido arriba (evita tener que ajustar decimales a mano cada vez que se
// agrega o saca un atributo de un perfil).
export const normalizeWeights = (weights) => {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    if (total === 0) return weights;
    return Object.fromEntries(
        Object.entries(weights).map(([key, w]) => [key, w / total])
    );
};

// Genera atributos "en blanco" (todos en un valor medio) — útil como punto de
// partida antes de aplicar una curva de talento (rookie, veterano, etc.) en
// driverGenerator.js.
export const emptyAttributes = (base = 50) =>
    Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, base]));

// Clampea un valor de atributo al rango válido 0-100.
export const clampAttribute = (value) => Math.max(0, Math.min(100, value));

// Genera un set de atributos a partir de dos parámetros: potencial (0-100,
// el "techo" del piloto) y experiencia (0-1, qué tan curtido está). Cuanta
// menos experiencia, más penalizados quedan consistencia y gestión de
// neumáticos frente al resto — el clásico perfil de rookie rápido pero
// errático. Con experiencia=1 no hay penalización (un veterano asentado).
//
// Compartido por driverGenerator.js (pilotos ficticios, experiencia baja) y
// rosterFromDb.js (grid real, experiencia según el tier curado a mano).
export const generateAttributesFromProfile = ({ potencial, experiencia = 1, ruido = 8 }) => {
    const atributos = emptyAttributes();
    ATTRIBUTE_KEYS.forEach((key) => {
        const esExperiencia = key === 'consistencia' || key === 'gestionNeumaticos';
        const penalizacion = esExperiencia ? 12 * (1 - experiencia) : 0;
        const valor = potencial - penalizacion + gaussianNoise(0, ruido);
        atributos[key] = Math.round(clampAttribute(valor));
    });
    return atributos;
};
