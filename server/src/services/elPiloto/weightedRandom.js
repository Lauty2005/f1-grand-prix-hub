// server/src/services/elPiloto/weightedRandom.js
//
// Utilidades de azar reutilizables por el simulador. Dos piezas:
//
// 1) gaussianNoise(): ruido con forma de campana en vez de uniforme, para que
//    la mayoría de las carreras salgan "esperables" y las sorpresas grandes
//    sean raras en vez de constantes.
// 2) weightedShuffle(): sorteo ponderado sin reemplazo vía Efraimidis–Spirakis
//    (a cada ítem se le asigna key = random()^(1/peso) y se ordena por key
//    descendente). Es el mismo algoritmo que se había pensado para el modo
//    simulación de Arma tu Grid — acá se reutiliza para resolver duelos
//    puntuales (adelantamientos, quién gana un mano a mano) sin tener que
//    recalcular todo el ranking de la carrera con un solo número.

// Ruido gaussiano vía Box-Muller. mean/stdDev en las mismas unidades que los
// scores de clasificación/carrera (ver raceSimulator.js).
export const gaussianNoise = (mean = 0, stdDev = 1) => {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random(); // evita log(0)
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + z * stdDev;
};

// items: array de { id, weight } (weight > 0). Devuelve los ids ordenados de
// forma aleatoria, con más probabilidad de quedar primero cuanto mayor el
// peso — pero sin garantía, que es justamente el punto (upsets posibles).
export const weightedShuffle = (items) => {
    return items
        .map((item) => {
            const weight = Math.max(item.weight, 0.0001); // evita división por cero
            const key = Math.pow(Math.random(), 1 / weight);
            return { ...item, _key: key };
        })
        .sort((a, b) => b._key - a._key)
        .map(({ _key, ...rest }) => rest);
};

// Elige un solo ganador ponderado entre dos contendientes (duelo 1 a 1) — pensado
// para resolver un adelantamiento puntual sin recalcular todo el grid.
export const weightedDuel = (weightA, weightB) => {
    const [winner] = weightedShuffle([
        { id: 'a', weight: weightA },
        { id: 'b', weight: weightB },
    ]);
    return winner.id;
};

// Tirada de probabilidad simple, para eventos binarios (falla mecánica, error
// propio, etc.). probability entre 0 y 1.
export const rollProbability = (probability) => Math.random() < probability;

// Elige UN elemento al azar de una lista ponderada (distribución acumulada
// clásica) — para cosas como "qué nacionalidad le toca a este piloto
// ficticio", donde solo hace falta un resultado, no un orden completo.
// items: [{ value, weight }]
export const weightedPick = (items) => {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of items) {
        roll -= item.weight;
        if (roll <= 0) return item.value;
    }
    return items[items.length - 1].value; // fallback por redondeo de punto flotante
};
