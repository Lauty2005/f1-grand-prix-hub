// server/src/services/elPiloto/rating.js
//
// Rating dinámico tipo Elo, multi-piloto. A diferencia del diseño descartado
// para Arma tu Grid (rating derivado de puntos/carrera + %victorias +
// %podios reales), acá el rating de CUALQUIER piloto — real, rival eterno o
// ficticio recién generado — nace de una semilla razonable y después sólo se
// mueve por lo que pasa DENTRO de las carreras simuladas. No vuelve a mirar
// el historial real en ningún momento.
//
// Variante multi-jugador del Elo clásico de ajedrez: en vez de comparar de a
// pares por separado, cada carrera se trata como (n-1) duelos implícitos —
// uno contra cada rival del grid — y el rating se ajusta según cuántos de
// esos duelos "ganó" (terminó adelante) contra cuántos se esperaba que ganara
// dados los ratings previos.

const ELO_SCALE = 400;

// Probabilidad esperada de que el piloto A termine adelante del piloto B,
// dado sus ratings actuales. Fórmula estándar de Elo.
const expectedHeadToHead = (ratingA, ratingB) =>
    1 / (1 + Math.pow(10, (ratingB - ratingA) / ELO_SCALE));

// K-factor por piloto: alto en las primeras carreras (el rating todavía no
// encontró su nivel real, como un jugador nuevo de ajedrez), y se va
// achicando a medida que acumula carreras — así un piloto asentado no se
// desestabiliza por un resultado puntual, pero un rookie sí puede pegar un
// salto grande si arranca mostrando más de lo esperado.
export const getKFactor = (racesCompleted) => {
    if (racesCompleted < 5) return 48;
    if (racesCompleted < 15) return 32;
    if (racesCompleted < 40) return 20;
    return 12;
};

// Rating inicial sugerido según "tier" percibido — para pilotos reales esto
// se alimenta de una percepción gruesa (figura/sólido/promesa/en caída), NO
// de stats históricas puntuales. Para pilotos ficticios rookies, ver
// driverGenerator.js (arrancan más abajo y con más incertidumbre).
export const TIER_SEED_RATING = {
    figura: 1650,
    solido: 1550,
    promesa: 1480,
    enCaida: 1500,
    rookie: 1420,
};

// participants: [{ id, rating, racesCompleted }]
// finishingOrder: [id, id, ...] de 1° a último, DNFs incluidos al final.
// dnfIds: Set opcional de ids cuyo abandono fue por falla mecánica (no error
//         propio) — se amortigua el impacto negativo en su rating porque no
//         refleja su nivel real, solo mala suerte.
//
// Devuelve un array [{ id, rating, delta }] con el rating ya actualizado.
export const updateRatingsAfterRace = (participants, finishingOrder, dnfIds = new Set()) => {
    const byId = new Map(participants.map((p) => [p.id, p]));
    const n = finishingOrder.length;

    return finishingOrder.map((id, position) => {
        const driver = byId.get(id);
        if (!driver) {
            throw new Error(`updateRatingsAfterRace: piloto ${id} no está en participants`);
        }

        let scoreSum = 0; // suma de (actual - esperado) contra cada rival
        finishingOrder.forEach((rivalId, rivalPosition) => {
            if (rivalId === id) return;
            const rival = byId.get(rivalId);
            const actual = position < rivalPosition ? 1 : 0; // terminó adelante = 1
            const expected = expectedHeadToHead(driver.rating, rival.rating);
            scoreSum += actual - expected;
        });

        const opponents = n - 1;
        const normalizedDelta = opponents > 0 ? scoreSum / opponents : 0;

        let k = getKFactor(driver.racesCompleted ?? 0);
        if (dnfIds.has(id)) k *= 0.3; // mala suerte mecánica pesa menos que un mal fin de semana genuino

        const delta = Math.round(k * normalizedDelta);

        return { id, rating: driver.rating + delta, delta };
    });
};

// La "forma" es un momentum de corto plazo (-20..20) que el simulador suma
// como modificador directo en cada carrera (ver raceSimulator.js). Se
// actualiza después de cada Gran Premio: decae hacia 0 (no se acumula para
// siempre) y se empuja un poco en la dirección del último resultado.
const FORMA_DECAY = 0.65;
const FORMA_SENSIBILIDAD = 0.6;
const FORMA_LIMITE = 20;

export const updateForma = (formaActual, ratingDelta) => {
    const empuje = ratingDelta * FORMA_SENSIBILIDAD;
    const nuevaForma = formaActual * FORMA_DECAY + empuje;
    return Math.max(-FORMA_LIMITE, Math.min(FORMA_LIMITE, Math.round(nuevaForma)));
};
