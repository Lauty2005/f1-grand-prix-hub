// server/src/services/elPiloto/realGridSeed.js
//
// Curaduría a mano de cómo entran los pilotos/equipos REALES del proyecto al
// motor de "El Piloto". A propósito NO se deriva de las stats reales en la
// DB (ver la decisión central en README.md) — así que esto tiene que
// completarse a mano, mirando el grid actual.
//
// Por qué está vacío: no tengo forma de verificar edad/percepción de forma
// confiable para pilotos reales desde acá, y la tabla `drivers` del proyecto
// no tiene columna de fecha de nacimiento (ver drivers.service.js/
// game.service.js — no la seleccionan en ningún query). Completarlo con
// datos inventados sobre personas reales sería peor que dejarlo con
// defaults neutrales hasta que se cargue a mano.
//
// Cómo completarlo: la clave es el `id` numérico de la tabla `drivers` (se
// puede ver en GET /api/drivers o en el panel admin). Tiers disponibles:
// 'figura' | 'solido' | 'promesa' | 'enCaida' | 'rookie' (ver tiers.js).

export const REAL_DRIVER_SEEDS = {
    // Ejemplo — completar con los pilotos reales del grid vigente:
    // 12: { tier: 'figura', edad: 27 },
    // 8:  { tier: 'promesa', edad: 21 },
};

export const DEFAULT_DRIVER_SEED = { tier: 'solido', edad: 27 };

// Igual que arriba pero para constructors — rendimientoAuto/fiabilidad
// (0-100) también curados a mano, no derivados de resultados reales.
//
// Clave: el `id` numérico de `constructors` en la DB. Quedó vacío por la
// misma razón que REAL_DRIVER_SEEDS — no hay forma de verificar esos IDs
// desde acá sin pegarle a la DB. PERO dejar todos los equipos en
// DEFAULT_TEAM_SEED (mismo auto para todos) es un bug de realismo, no solo
// una simplificación: hacía posible ser campeón con el peor equipo de la
// parrilla, porque no existía NINGUNA diferencia mecánica de auto entre
// equipos (ver el fix de PESO_AUTO en raceSimulator.js, que por sí solo no
// alcanza si el valor de rendimientoAuto es idéntico para todos).
//
// Solución sin depender de IDs de la DB: TEAM_TIER_BY_NAME clasifica por
// nombre de escudería (mismo criterio que tierDeEquipo() en
// client/src/modules/elPiloto.js — TOP_TEAMS/MID_TEAMS/BACKMARKER_TEAMS,
// mantener ambas listas sincronizadas si cambia una) y le da un
// rendimientoAuto/fiabilidad reales por tier. buildRealGrid() en
// rosterFromDb.js prueba REAL_TEAM_SEEDS[constructor_id] primero (por si en
// algún momento se cargan IDs verificados a mano) y si no hay nada, cae acá
// antes de tocar el default neutral.
export const REAL_TEAM_SEEDS = {
    // 4: { rendimientoAuto: 88, fiabilidad: 85 },
};

const TOP_TEAMS = ['red bull', 'ferrari', 'mercedes', 'mclaren'];
const MID_TEAMS = ['aston martin', 'alpine'];
const BACKMARKER_TEAMS = ['racing bulls', 'haas'];

const TEAM_PERFORMANCE_BY_TIER = {
    top: { rendimientoAuto: 88, fiabilidad: 88 },
    mid: { rendimientoAuto: 76, fiabilidad: 82 },
    backmarker: { rendimientoAuto: 61, fiabilidad: 75 },
    // Resto de la parrilla real (ej. Williams, Sauber/Audi) que no cae en
    // ninguna de las 3 listas de arriba — a mitad de tabla, ni tope ni fondo.
    otro: { rendimientoAuto: 68, fiabilidad: 78 },
};

export const teamSeedForName = (nombreEquipo) => {
    const n = (nombreEquipo || '').toLowerCase();
    let tier = 'otro';
    if (TOP_TEAMS.some((t) => n.includes(t))) tier = 'top';
    else if (MID_TEAMS.some((t) => n.includes(t))) tier = 'mid';
    else if (BACKMARKER_TEAMS.some((t) => n.includes(t))) tier = 'backmarker';
    return TEAM_PERFORMANCE_BY_TIER[tier];
};

export const DEFAULT_TEAM_SEED = { rendimientoAuto: 70, fiabilidad: 80 };
