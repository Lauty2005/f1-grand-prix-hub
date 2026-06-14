// Lógica compartida de horarios de sesión del fin de semana de un GP.
// Única fuente de verdad para: el orden de sesiones, sus duraciones asumidas,
// el estado "en vivo / próxima" y el formateo de horas en la zona del visitante.
// La usan calendar.js (badge + horarios del modal) y main.js (cuenta regresiva).

// Orden cronológico de sesiones por tipo de fin de semana.
// Cada entrada: { key (columna *_time del backend), label (es_AR) }
const NORMAL_SESSIONS = [
    { key: 'fp1_time',   label: 'Práctica 1' },
    { key: 'fp2_time',   label: 'Práctica 2' },
    { key: 'fp3_time',   label: 'Práctica 3' },
    { key: 'qualy_time', label: 'Clasificación' },
    { key: 'race_time',  label: 'Carrera' },
];

const SPRINT_SESSIONS = [
    { key: 'fp1_time',          label: 'Práctica 1' },
    { key: 'sprint_quali_time', label: 'Clasificación Sprint' },
    { key: 'sprint_time',       label: 'Sprint' },
    { key: 'qualy_time',        label: 'Clasificación' },
    { key: 'race_time',         label: 'Carrera' },
];

// Duración asumida (minutos) de cada sesión, para definir la ventana "EN VIVO".
const SESSION_DURATIONS_MIN = {
    fp1_time: 60,
    fp2_time: 60,
    fp3_time: 60,
    sprint_quali_time: 45,
    sprint_time: 60,
    qualy_time: 60,
    race_time: 130,
};

/**
 * Devuelve las sesiones del fin de semana con horarios reales, en orden
 * cronológico, salteando las que no tienen hora cargada.
 * @returns {Array<{ key, label, start: Date, end: Date }>}
 */
export function getSessionSchedule(race) {
    if (!race) return [];
    const defs = race.has_sprint ? SPRINT_SESSIONS : NORMAL_SESSIONS;
    return defs
        .filter(def => race[def.key])
        .map(def => {
            const start = new Date(race[def.key]);
            const end = new Date(start.getTime() + SESSION_DURATIONS_MIN[def.key] * 60000);
            return { key: def.key, label: def.label, start, end };
        })
        .filter(s => !isNaN(s.start.getTime()))
        .sort((a, b) => a.start - b.start);
}

/**
 * Estado de una carrera respecto al momento actual, basado en horarios reales.
 * Si la carrera NO tiene horarios cargados, cae al cálculo histórico por fecha
 * (ventana del fin de semana) para no romper las carreras existentes.
 * @returns {{ status: 'live'|'soon'|'done'|'suspended', liveSession, nextSession }}
 */
export function getRaceLiveState(race, now = new Date()) {
    if (race?.status === 'suspended') {
        return { status: 'suspended', liveSession: null, nextSession: null };
    }

    const schedule = getSessionSchedule(race);

    // Fallback histórico: sin horarios reales → ventana del fin de semana por fecha.
    if (schedule.length === 0) {
        return legacyDateState(race, now);
    }

    const liveSession = schedule.find(s => now >= s.start && now <= s.end) || null;
    if (liveSession) {
        return { status: 'live', liveSession, nextSession: null };
    }

    const nextSession = schedule.find(s => s.start > now) || null;
    if (nextSession) {
        return { status: 'soon', liveSession: null, nextSession };
    }

    return { status: 'done', liveSession: null, nextSession: null };
}

// Lógica previa basada solo en race.date (día), conservada como respaldo.
function legacyDateState(race, now) {
    if (!race?.date) return { status: 'soon', liveSession: null, nextSession: null };
    const dateObj = new Date(race.date);
    const userTimezoneOffset = dateObj.getTimezoneOffset() * 60000;
    const adjustedDate = new Date(dateObj.getTime() + userTimezoneOffset);

    const weekendDaysBack = race.has_sprint ? 3 : 2;
    const weekendStartDay = new Date(adjustedDate);
    weekendStartDay.setDate(weekendStartDay.getDate() - weekendDaysBack);
    weekendStartDay.setHours(0, 0, 0, 0);

    const raceEndDay = new Date(adjustedDate);
    raceEndDay.setHours(23, 59, 59, 999);

    let status;
    if (now > raceEndDay)            status = 'done';
    else if (now >= weekendStartDay) status = 'live';
    else                             status = 'soon';
    return { status, liveSession: null, nextSession: null };
}

/** Formatea la hora de una sesión en la zona horaria local del visitante. */
export function formatSessionTime(date) {
    return date.toLocaleString('es-AR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}
