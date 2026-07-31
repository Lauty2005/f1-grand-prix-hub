// server/src/services/elPiloto/demo.js
//
// Script de prueba manual — no es un test automatizado (el proyecto no tiene
// framework de tests configurado), es para correrlo y "sentir" el motor como
// pidió Lautaro. No depende de la DB: arma un grid a mano, corre 3 carreras
// de una temporada de ejemplo y muestra cómo se mueve el rating/forma de
// cada piloto sin tocar ningún dato histórico real.
//
// Cómo correrlo:
//   cd server
//   node src/services/elPiloto/demo.js

import {
    TIER_SEED_RATING,
    simulateGrandPrix,
    updateRatingsAfterRace,
    updateForma,
    generateFictionalDriver,
    shouldRetire,
    generateReplacementForRetiredDriver,
} from './index.js';

const equipos = {
    halcon: { nombre: 'Halcón Racing', rendimientoAuto: 88, fiabilidad: 82 },
    tridente: { nombre: 'Tridente GP', rendimientoAuto: 80, fiabilidad: 90 },
    forja: { nombre: 'Forja Motorsport', rendimientoAuto: 70, fiabilidad: 75 },
    austral: { nombre: 'Austral F1 Team', rendimientoAuto: 60, fiabilidad: 85 },
};

// Grid de ejemplo: una figura consagrada, un sólido, la promesa que hace de
// "rival eterno", un veterano en caída (para ver el retiro en acción) y "vos"
// como jugador rookie. Se completa con dos pilotos ficticios generados por el
// motor, como si ya vinieran de las categorías inferiores.
const pilotosManual = [
    {
        id: 'ferraro', nombreCompleto: 'D. Ferraro', edad: 29, equipoId: 'halcon',
        atributos: { ritmoQuali: 92, ritmoCarrera: 90, agresividad: 78, consistencia: 85, gestionNeumaticos: 82, feedbackTecnico: 80 },
        rating: TIER_SEED_RATING.figura, racesCompleted: 140, forma: 0,
    },
    {
        id: 'bianchi', nombreCompleto: 'L. Bianchi', edad: 26, equipoId: 'tridente',
        atributos: { ritmoQuali: 85, ritmoCarrera: 86, agresividad: 82, consistencia: 80, gestionNeumaticos: 79, feedbackTecnico: 75 },
        rating: TIER_SEED_RATING.solido, racesCompleted: 90, forma: 0,
    },
    {
        id: 'aguirre', nombreCompleto: 'T. Aguirre (rival eterno)', edad: 24, equipoId: 'forja',
        atributos: { ritmoQuali: 88, ritmoCarrera: 83, agresividad: 90, consistencia: 68, gestionNeumaticos: 70, feedbackTecnico: 72 },
        rating: TIER_SEED_RATING.promesa, racesCompleted: 40, forma: 0,
    },
    {
        id: 'volkov', nombreCompleto: 'H. Volkov', edad: 38, equipoId: 'halcon',
        atributos: { ritmoQuali: 75, ritmoCarrera: 80, agresividad: 60, consistencia: 88, gestionNeumaticos: 85, feedbackTecnico: 90 },
        rating: TIER_SEED_RATING.enCaida, racesCompleted: 260, forma: 0,
    },
    {
        id: 'jugador', nombreCompleto: 'Vos', edad: 19, equipoId: 'austral',
        atributos: { ritmoQuali: 78, ritmoCarrera: 74, agresividad: 70, consistencia: 60, gestionNeumaticos: 58, feedbackTecnico: 65 },
        rating: TIER_SEED_RATING.rookie, racesCompleted: 3, forma: 0,
    },
];

const rivalDeTemporada = generateFictionalDriver({ contexto: 'reemplazoF1', id: 'rival-temporada' });
rivalDeTemporada.equipoId = 'tridente'; // compañero de Bianchi

const relleno = generateFictionalDriver({ contexto: 'inferior', id: 'relleno-1' });
relleno.equipoId = 'forja';

const pilotos = [...pilotosManual, rivalDeTemporada, relleno];

const displayName = (p) => p.nombreCompleto ?? `${p.nombre} ${p.apellido}`;

const calendario = [
    { nombre: 'GP Norte', tipo: 'altaVelocidad' },
    { nombre: 'GP Bahía', tipo: 'callejero' },
    { nombre: 'GP Serrano', tipo: 'tecnica', propensaLluvia: true },
];

console.log('=== "El Piloto" — demo del motor de simulación ===\n');
console.log('Grid inicial:');
pilotos.forEach((p) => console.log(`  ${displayName(p).padEnd(28)} rating=${p.rating}  equipo=${equipos[p.equipoId].nombre}`));
console.log('');

calendario.forEach((pista) => {
    const entrants = pilotos.map((p) => ({
        pilotoId: p.id,
        atributos: p.atributos,
        rating: p.rating,
        racesCompleted: p.racesCompleted,
        forma: p.forma,
        equipoId: p.equipoId,
    }));

    const resultadoGP = simulateGrandPrix(entrants, equipos, pista);

    console.log(`--- ${pista.nombre} (${pista.tipo}) ---`);
    if (resultadoGP.eventos.length > 0) {
        resultadoGP.eventos.forEach((ev) => console.log(`  [evento] ${ev.descripcion}`));
    }
    resultadoGP.resultado.forEach((r) => {
        const piloto = pilotos.find((p) => p.id === r.pilotoId);
        const pos = r.dnf ? `DNF(${r.motivoDnf})` : String(r.posicionFinal).padStart(2, '0');
        const remontada = r.adelantamientos > 0 ? ` (+${r.adelantamientos})` : '';
        console.log(`  ${pos}  ${displayName(piloto)}${remontada}`);
    });

    const participantsForRating = pilotos.map((p) => ({ id: p.id, rating: p.rating, racesCompleted: p.racesCompleted }));
    const updates = updateRatingsAfterRace(participantsForRating, resultadoGP.finishingOrderParaRating, resultadoGP.dnfMecanicoIds);

    updates.forEach((u) => {
        const piloto = pilotos.find((p) => p.id === u.id);
        piloto.forma = updateForma(piloto.forma, u.delta);
        piloto.rating = u.rating;
        piloto.racesCompleted += 1;
    });

    console.log('');
});

console.log('=== Ratings finales (ordenados) ===');
[...pilotos]
    .sort((a, b) => b.rating - a.rating)
    .forEach((p) => console.log(`  ${displayName(p).padEnd(28)} rating=${p.rating}  forma=${p.forma}`));

console.log('\n=== Chequeo de retiro fin de temporada (solo pilotos reales) ===');
pilotos
    .filter((p) => !p.esFicticio)
    .forEach((p) => {
        if (shouldRetire(p)) {
            const reemplazo = generateReplacementForRetiredDriver(p);
            console.log(`  ${displayName(p)} (${p.edad} años) se retira. Entra: ${displayName(reemplazo)} (${reemplazo.nacionalidad}, ${reemplazo.edad} años).`);
        } else {
            console.log(`  ${displayName(p)} (${p.edad} años) sigue en el grid.`);
        }
    });
