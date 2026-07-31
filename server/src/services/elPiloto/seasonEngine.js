// server/src/services/elPiloto/seasonEngine.js
//
// Orquesta una temporada carrera a carrera. A propósito NO persiste nada acá
// — son funciones puras que reciben el estado actual (el que el cliente
// guarda en localStorage, ver README.md) y devuelven el siguiente. Quien
// llama (el controller) solo pasa el estado para adelante y para atrás.
//
// Por qué así: siguiendo la convención ya establecida en el proyecto para
// los mini-juegos (streak/score en localStorage, sin cuenta de usuario — ver
// CLAUDE.md), en vez de abrir tablas nuevas en la DB para el estado de una
// partida. El cliente es la fuente de verdad de SU partida; el server solo
// hace el cálculo pesado (simular, generar reemplazos) sin guardar nada.

import { simulateGrandPrix } from './raceSimulator.js';
import { updateRatingsAfterRace, updateForma } from './rating.js';
import { shouldRetire, generateReplacementForRetiredDriver } from './driverGenerator.js';
import { POINTS_SYSTEM } from '../../config/points.js';

// pilotos: [{ id, atributos, rating, racesCompleted, forma, equipoId,
//             esFicticio, esJugador?, edad? }]
// equipos: { [equipoId]: { rendimientoAuto, fiabilidad, ... } }
// calendario: [{ nombre, tipo, propensaLluvia, round }]  (ver calendar.js)
// carreraIndex: qué carrera del calendario toca correr ahora (0-based)
// tablaPuntos: { [pilotoId]: puntosAcumulados } de la temporada en curso
//
// Devuelve el resultado de ESA carrera + el estado ya actualizado para la
// siguiente (o el cierre de temporada, si era la última).
export const simulateNextRace = ({ pilotos, equipos, calendario, carreraIndex, tablaPuntos = {} }) => {
    const pista = calendario[carreraIndex];
    if (!pista) {
        throw new Error(`No hay carrera en el índice ${carreraIndex} del calendario (${calendario.length} carreras cargadas).`);
    }

    const entrants = pilotos.map((p) => ({
        pilotoId: p.id,
        atributos: p.atributos,
        rating: p.rating,
        racesCompleted: p.racesCompleted,
        forma: p.forma,
        equipoId: p.equipoId,
        modificadorQuali: p.modificadorQuali,
        modificadorCarrera: p.modificadorCarrera,
    }));

    const resultadoGP = simulateGrandPrix(entrants, equipos, pista);

    const participantsForRating = pilotos.map((p) => ({
        id: p.id,
        rating: p.rating,
        racesCompleted: p.racesCompleted,
    }));
    const updates = updateRatingsAfterRace(
        participantsForRating,
        resultadoGP.finishingOrderParaRating,
        resultadoGP.dnfMecanicoIds
    );
    const updateById = new Map(updates.map((u) => [u.id, u]));

    const pilotosActualizados = pilotos.map((p) => {
        const u = updateById.get(p.id);
        return {
            ...p,
            rating: u.rating,
            forma: updateForma(p.forma, u.delta),
            racesCompleted: p.racesCompleted + 1,
        };
    });

    const nuevaTabla = { ...tablaPuntos };
    resultadoGP.resultado.forEach((r) => {
        const puntos = r.dnf ? 0 : (POINTS_SYSTEM[r.posicionFinal] ?? 0);
        nuevaTabla[r.pilotoId] = (nuevaTabla[r.pilotoId] ?? 0) + puntos;
    });

    const siguienteIndex = carreraIndex + 1;

    return {
        resultadoGP,
        pilotos: pilotosActualizados,
        tablaPuntos: nuevaTabla,
        carreraIndex: siguienteIndex,
        temporadaTerminada: siguienteIndex >= calendario.length,
    };
};

// Fin de temporada: retiro por edad (ver driverGenerator.js — no mira
// rendimiento deportivo) y generación de reemplazos ficticios. El jugador
// (marcado con esJugador: true en su piloto) nunca se retira por acá —
// decidir el retiro del propio jugador es una decisión narrativa suya, no
// una tirada de dados. Ojo: esto NO excluye a los pilotos ya ficticios — un
// reemplazo generado también tiene que poder retirarse más adelante (si no,
// el grid se congela después de la primera tanda de retiros reales y deja
// de derivar con el tiempo, que era justo el punto del diseño original).
export const cerrarTemporada = ({ pilotos, equipos }) => {
    const retiros = [];

    const pilotosSiguientes = pilotos.map((p) => {
        const puedeRetirarse = !p.esJugador && typeof p.edad === 'number';
        if (puedeRetirarse && shouldRetire(p)) {
            const reemplazo = generateReplacementForRetiredDriver(p);
            reemplazo.equipoId = p.equipoId; // hereda el asiento del retirado
            retiros.push({ retirado: p, reemplazo });
            return reemplazo;
        }
        return { ...p, edad: typeof p.edad === 'number' ? p.edad + 1 : p.edad };
    });

    return { pilotos: pilotosSiguientes, equipos, retiros };
};
