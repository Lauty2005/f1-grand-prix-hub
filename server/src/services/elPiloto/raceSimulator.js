// server/src/services/elPiloto/raceSimulator.js
//
// El corazón del motor: resuelve un fin de semana de Gran Premio (clasificación
// + carrera + eventos de caos) a partir de atributos + auto + forma + ruido,
// sin mirar nunca stats históricas reales. Ver ATTRIBUTE_KEYS/TRACK_PROFILES
// en attributes.js y el rating dinámico en rating.js (que se actualiza
// DESPUÉS de esto, con el resultado que salga de acá).
//
// Diseño pensado para dejar lugar a "momentos jugables" más adelante (quali,
// largada, estrategia) sin tocar el motor: cada entrant admite
// modificadorQuali / modificadorCarrera, que una decisión del jugador o un
// mini-juego puede setear antes de llamar a simulateGrandPrix.

import { ATTRIBUTE_KEYS, TRACK_PROFILES, normalizeWeights } from './attributes.js';
import { gaussianNoise, rollProbability } from './weightedRandom.js';

// Pesos globales piloto vs. auto. En F1 real el auto pesa más que el piloto
// en la diferencia de resultados — se puede recalibrar acá sin tocar el resto
// del motor.
//
// (2026-07-31) Recalibrado de 0.5/0.5 a 0.35/0.65: con pesos iguales, un
// jugador en el peor auto de la parrilla podía salir campeón en su 2da
// temporada — el auto no pesaba lo suficiente frente al piloto (más el
// stacking de bonos de rol/eventos/minijuegos, ver
// `CAP_MODIFICADOR_TOTAL` en el cliente). Esto solo tiene sentido en
// conjunto con `realGridSeed.js` teniendo una diferencia real de
// `rendimientoAuto` entre equipos — con todos los equipos en el mismo
// valor (como pasaba antes), ningún PESO_AUTO por sí solo alcanza a
// arreglarlo.
const PESO_PILOTO = 0.35;
const PESO_AUTO = 0.65;
const PESO_FORMA = 0.5; // "forma" ya viene en escala -20..20, se usa como modificador directo

const NOISE_STD_QUALI = 6;
const NOISE_STD_CARRERA = 8;

// Probabilidades base de eventos de caos por Gran Premio (se ajustan por
// pista/auto más abajo).
const PROB_LLUVIA_BASE = 0.2;
const PROB_SAFETY_CAR_BASE = 0.35;
const PROB_DNF_MECANICO_BASE = 0.04; // por piloto, antes de ajustar por fiabilidad del auto
const PROB_ERROR_PROPIO_BASE = 0.035; // por piloto, antes de ajustar por consistencia

const attributeScore = (atributos, weights) => {
    const normalized = normalizeWeights(weights);
    return ATTRIBUTE_KEYS.reduce((sum, key) => {
        const w = normalized[key] ?? 0;
        return sum + (atributos[key] ?? 50) * w;
    }, 0);
};

// entrants: [{ pilotoId, atributos, rating, racesCompleted, forma, equipoId,
//              modificadorQuali?, modificadorCarrera? }]
// equipos: { [equipoId]: { rendimientoAuto (0-100), fiabilidad (0-100) } }
// pista: { nombre, tipo: keyof TRACK_PROFILES, propensaLluvia?: boolean }
export const simulateQualifying = (entrants, equipos, pista) => {
    const perfil = TRACK_PROFILES[pista.tipo] ?? TRACK_PROFILES.tecnica;

    const scored = entrants.map((entrant) => {
        const equipo = equipos[entrant.equipoId];
        const skillScore = attributeScore(entrant.atributos, perfil.quali);
        const formaMod = (entrant.forma ?? 0) * PESO_FORMA;
        const noise = gaussianNoise(0, NOISE_STD_QUALI);
        const score =
            skillScore * PESO_PILOTO +
            equipo.rendimientoAuto * PESO_AUTO +
            formaMod +
            (entrant.modificadorQuali ?? 0) +
            noise;
        return { pilotoId: entrant.pilotoId, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s, index) => ({ pilotoId: s.pilotoId, posicion: index + 1 }));
};

// Devuelve el resultado completo de un Gran Premio: clasificación, resultado
// de carrera (con DNFs) y una lista de eventos narrativos (safety car, lluvia,
// abandonos) para que la capa de presentación arme el reveal.
export const simulateGrandPrix = (entrants, equipos, pista) => {
    const eventos = [];
    const perfil = TRACK_PROFILES[pista.tipo] ?? TRACK_PROFILES.tecnica;

    const clasificacion = simulateQualifying(entrants, equipos, pista);
    const posicionSalida = new Map(clasificacion.map((c) => [c.pilotoId, c.posicion]));
    const n = entrants.length;

    // Condiciones de carrera: lluvia y safety car son eventos de pista, no de
    // piloto, y suben la varianza general (menos determinismo cuando pasan).
    const probLluvia = pista.propensaLluvia ? PROB_LLUVIA_BASE * 1.8 : PROB_LLUVIA_BASE;
    const huboLluvia = rollProbability(Math.min(probLluvia, 0.85));
    if (huboLluvia) eventos.push({ tipo: 'lluvia', descripcion: `Lluvia en ${pista.nombre} — se pareja el pelotón.` });

    const probSafetyCar = pista.tipo === 'callejero' ? PROB_SAFETY_CAR_BASE * 1.3 : PROB_SAFETY_CAR_BASE;
    const huboSafetyCar = rollProbability(Math.min(probSafetyCar, 0.85));
    if (huboSafetyCar) eventos.push({ tipo: 'safetyCar', descripcion: 'Safety car en pista — se resetean las diferencias.' });

    const chaosMultiplier = (huboLluvia ? 1.4 : 1) * (huboSafetyCar ? 1.25 : 1);

    // Fase 1: abandonos, antes de calcular el score de carrera de los que siguen.
    // dnfMecanicoIds se separa de los DNF por error propio a propósito: solo la
    // mala suerte mecánica amortigua el impacto en el rating (ver rating.js) —
    // un error propio sí debe pegarle completo, porque refleja al piloto.
    const dnfMecanicoIds = new Set();
    const dnfErrorIds = new Set();
    // Sentinel finito (no -Infinity) para que "score - score" entre dos DNFs
    // nunca dé NaN al ordenar — con -Infinity, comparar dos abandonos entre sí
    // producía -Infinity - (-Infinity) = NaN, orden no especificado.
    const DNF_SCORE = -1_000_000;
    const resultadoParcial = [];

    entrants.forEach((entrant) => {
        const equipo = equipos[entrant.equipoId];

        const probDnfMecanico = PROB_DNF_MECANICO_BASE * ((100 - equipo.fiabilidad) / 50 + 0.3);
        if (rollProbability(Math.min(probDnfMecanico, 0.5))) {
            dnfMecanicoIds.add(entrant.pilotoId);
            eventos.push({
                tipo: 'dnfMecanico',
                pilotoId: entrant.pilotoId,
                descripcion: `Abandono por falla mecánica.`,
            });
            resultadoParcial.push({ pilotoId: entrant.pilotoId, dnf: true, motivoDnf: 'mecanica', score: DNF_SCORE });
            return;
        }

        const probErrorPropio = PROB_ERROR_PROPIO_BASE * ((100 - entrant.atributos.consistencia) / 50 + 0.3);
        if (rollProbability(Math.min(probErrorPropio, 0.4))) {
            dnfErrorIds.add(entrant.pilotoId);
            eventos.push({
                tipo: 'errorPropio',
                pilotoId: entrant.pilotoId,
                descripcion: `Abandono por error propio.`,
            });
            resultadoParcial.push({ pilotoId: entrant.pilotoId, dnf: true, motivoDnf: 'error', score: DNF_SCORE });
            return;
        }

        // Fase 2: score de carrera para quien sigue en pista.
        const skillScore = attributeScore(entrant.atributos, perfil.carrera);
        const formaMod = (entrant.forma ?? 0) * PESO_FORMA;
        const startBonus = (n - posicionSalida.get(entrant.pilotoId)) * 0.4; // salir adelante ayuda, no decide
        const noise = gaussianNoise(0, NOISE_STD_CARRERA * chaosMultiplier);

        const score =
            skillScore * PESO_PILOTO +
            equipo.rendimientoAuto * PESO_AUTO +
            formaMod +
            startBonus +
            (entrant.modificadorCarrera ?? 0) +
            noise;

        resultadoParcial.push({ pilotoId: entrant.pilotoId, dnf: false, motivoDnf: null, score });
    });

    resultadoParcial.sort((a, b) => b.score - a.score); // los DNF_SCORE (abandonos) quedan al final

    const resultado = resultadoParcial.map((r, index) => {
        const salida = posicionSalida.get(r.pilotoId);
        const posicionFinal = r.dnf ? null : index + 1;
        const adelantamientos = r.dnf ? 0 : Math.max(0, salida - posicionFinal);
        if (adelantamientos >= 5) {
            eventos.push({
                tipo: 'remontada',
                pilotoId: r.pilotoId,
                descripcion: `Remontó ${adelantamientos} posiciones.`,
            });
        }
        return {
            pilotoId: r.pilotoId,
            posicionSalida: salida,
            posicionFinal,
            dnf: r.dnf,
            motivoDnf: r.motivoDnf,
            adelantamientos,
        };
    });

    const finishingOrderParaRating = resultado.map((r) => r.pilotoId); // ya viene ordenado, DNFs al final

    return {
        pista: pista.nombre,
        clasificacion,
        resultado,
        finishingOrderParaRating,
        // Pasar SOLO dnfMecanicoIds a updateRatingsAfterRace — ver comentario
        // más arriba sobre por qué el error propio no debe amortiguarse.
        dnfMecanicoIds,
        dnfErrorIds,
        eventos,
    };
};
