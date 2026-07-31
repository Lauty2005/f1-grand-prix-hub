// server/src/services/elPiloto/tiers.js
//
// Une lo que significa cada "tier" percibido (figura/sólido/promesa/en
// caída/rookie) para las dos cosas que necesitan saberlo: el rating inicial
// (TIER_SEED_RATING, en rating.js) y los atributos generados
// (generateAttributesFromProfile, en attributes.js). Un solo lugar para
// tocar si algún tier se siente mal calibrado.
//
// Importante: esto es percepción gruesa curada a mano, NO una fórmula
// derivada de stats históricas reales — ver README.md.
//
// TIER_SEED_RATING (el rating inicial por tier) vive en rating.js, no acá,
// para no duplicar el export en el barrel de index.js — importarlo desde ahí.

export const TIER_PROFILES = {
    figura: { potencial: 88, experiencia: 1 },
    solido: { potencial: 76, experiencia: 0.9 },
    promesa: { potencial: 78, experiencia: 0.35 },
    enCaida: { potencial: 70, experiencia: 1 },
    rookie: { potencial: 60, experiencia: 0.1 },
};

// racesCompleted inicial aproximado por tier — solo alimenta el K-factor
// (qué tan volátil es el rating al principio, ver getKFactor en rating.js),
// no el nivel de habilidad del piloto.
export const RACES_COMPLETED_SEED = {
    figura: 80,
    solido: 60,
    promesa: 15,
    enCaida: 150,
    rookie: 0,
};
