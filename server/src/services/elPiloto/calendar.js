// server/src/services/elPiloto/calendar.js
//
// Calendario de una temporada — 24 circuitos reales (nombre + bandera emoji),
// en el mismo orden siempre, con el `tipo` de pista que ya consume el motor
// (TRACK_PROFILES en attributes.js: altaVelocidad/callejero/tecnica/
// propensaLluvia). Antes esto era procedural con nombres genéricos y 3
// carreras "interactivas" elegidas al azar; se simplificó a un único flujo
// por carrera (tarjeta de circuito → evento aleatorio 30% → minijuego de
// reacción → resolución, ver interactiveMoments.js y el cliente), así que ya
// no hace falta marcar nada como especial acá.
//
// `tipo: 'propensaLluvia'` es uno de los 4 perfiles de pista igual que los
// otros tres — se usa tanto para pesar atributos (attributes.js) como para
// la bandera `propensaLluvia` que sube la chance de lluvia en
// raceSimulator.js. Los 3 circuitos históricamente más mojados del calendario
// real (Silverstone, Spa, Interlagos) llevan ese tipo; el resto reparte entre
// los otros tres perfiles.
const REAL_CIRCUITS = [
    { nombre: 'Baréin', bandera: '🇧🇭', tipo: 'altaVelocidad', propensaLluvia: false },
    { nombre: 'Arabia Saudita', bandera: '🇸🇦', tipo: 'callejero', propensaLluvia: false },
    { nombre: 'Australia', bandera: '🇦🇺', tipo: 'tecnica', propensaLluvia: false },
    { nombre: 'Japón', bandera: '🇯🇵', tipo: 'tecnica', propensaLluvia: false },
    { nombre: 'China', bandera: '🇨🇳', tipo: 'tecnica', propensaLluvia: false },
    { nombre: 'Miami', bandera: '🇺🇸', tipo: 'callejero', propensaLluvia: false },
    { nombre: 'Emilia-Romaña', bandera: '🇮🇹', tipo: 'tecnica', propensaLluvia: false },
    { nombre: 'Mónaco', bandera: '🇲🇨', tipo: 'callejero', propensaLluvia: false },
    { nombre: 'Canadá', bandera: '🇨🇦', tipo: 'tecnica', propensaLluvia: false },
    { nombre: 'España', bandera: '🇪🇸', tipo: 'tecnica', propensaLluvia: false },
    { nombre: 'Austria', bandera: '🇦🇹', tipo: 'altaVelocidad', propensaLluvia: false },
    { nombre: 'Gran Bretaña', bandera: '🇬🇧', tipo: 'propensaLluvia', propensaLluvia: true },
    { nombre: 'Hungría', bandera: '🇭🇺', tipo: 'tecnica', propensaLluvia: false },
    { nombre: 'Bélgica', bandera: '🇧🇪', tipo: 'propensaLluvia', propensaLluvia: true },
    { nombre: 'Países Bajos', bandera: '🇳🇱', tipo: 'tecnica', propensaLluvia: false },
    { nombre: 'Italia', bandera: '🇮🇹', tipo: 'altaVelocidad', propensaLluvia: false },
    { nombre: 'Azerbaiyán', bandera: '🇦🇿', tipo: 'callejero', propensaLluvia: false },
    { nombre: 'Singapur', bandera: '🇸🇬', tipo: 'callejero', propensaLluvia: false },
    { nombre: 'Estados Unidos', bandera: '🇺🇸', tipo: 'tecnica', propensaLluvia: false },
    { nombre: 'México', bandera: '🇲🇽', tipo: 'tecnica', propensaLluvia: false },
    { nombre: 'Brasil', bandera: '🇧🇷', tipo: 'propensaLluvia', propensaLluvia: true },
    { nombre: 'Las Vegas', bandera: '🇺🇸', tipo: 'callejero', propensaLluvia: false },
    { nombre: 'Catar', bandera: '🇶🇦', tipo: 'altaVelocidad', propensaLluvia: false },
    { nombre: 'Abu Dabi', bandera: '🇦🇪', tipo: 'tecnica', propensaLluvia: false },
];

// n: cantidad de carreras de la temporada (24 por defecto, una temporada de
// calendario real completo). Si se pide más de 24 se repite desde el
// principio — caso borde, no se espera que pase en el juego normal.
export const generateSeasonCalendar = (n = 24) => {
    const calendario = [];
    for (let i = 0; i < n; i++) {
        const circuito = REAL_CIRCUITS[i % REAL_CIRCUITS.length];
        calendario.push({ ...circuito, round: i + 1 });
    }
    return calendario;
};
