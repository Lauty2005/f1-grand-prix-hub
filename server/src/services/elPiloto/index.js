// server/src/services/elPiloto/index.js
// Barrel export del motor de simulación de "El Piloto" y su integración con
// la DB real (rosterFromDb.js, expuesto en GET /api/el-piloto/roster). Ver
// README.md para el estado completo y lo que falta.

export * from './attributes.js';
export * from './weightedRandom.js';
export * from './rating.js';
export * from './tiers.js';
export * from './raceSimulator.js';
export * from './driverGenerator.js';
export * from './realGridSeed.js';
export * from './rosterFromDb.js';
export * from './calendar.js';
export * from './seasonEngine.js';
export * from './careerSetup.js';
export * from './interactiveMoments.js';
