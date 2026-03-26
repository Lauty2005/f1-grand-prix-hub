import { postResultApi, deleteResultApi } from './api.js';
import { showSuccess, showError } from './ui.js';
import { renderRaceOptions } from './races.js';

// Maps frontend session keys → API endpoint paths.
const SESSION_ENDPOINTS = {
    race:         '/races/results',
    sprint:       '/races/sprint',
    qualy:        '/races/qualifying',
    'sprint-qualy': '/races/sprint-qualifying',
    practices:    '/races/practices',
};

// Maps frontend session keys → DELETE endpoint templates.
const DELETE_ENDPOINTS = {
    race:         (raceId, driverId) => `/races/${raceId}/results/${driverId}`,
    sprint:       (raceId, driverId) => `/races/${raceId}/sprint/${driverId}`,
    qualy:        (raceId, driverId) => `/races/${raceId}/qualifying/${driverId}`,
    'sprint-qualy': (raceId, driverId) => `/races/${raceId}/sprint-qualifying/${driverId}`,
    practices:    (raceId, driverId) => `/races/${raceId}/practices/${driverId}`,
};

const SESSION_LABELS = {
    race: 'Carrera Principal', sprint: 'Sprint',
    qualy: 'Clasificación', 'sprint-qualy': 'Shootout', practices: 'Prácticas',
};

// Returns the value of a session time field: uses status dropdown if set, otherwise the time input.
const getTimeOrStatus = (timeId, statusId) => {
    const status = document.getElementById(statusId).value;
    return status || document.getElementById(timeId).value;
};

export function updateFormFields() {
    const type = document.getElementById('sessionType').value;

    const posGroup   = document.getElementById('posGroup');
    const gapGroup   = document.getElementById('gapGroup');
    const raceExtras = document.getElementById('raceExtras');
    const vrGroup    = document.getElementById('vrGroup');
    const timeInputs = document.getElementById('timeInputs');
    const [t1, t2, t3] = ['time1', 'time2', 'time3'].map(id => document.getElementById(id));

    posGroup.style.display   = 'none';
    gapGroup.style.display   = 'none';
    raceExtras.style.display = 'none';
    vrGroup.style.display    = 'none';
    timeInputs.style.display = 'none';

    switch (type) {
        case 'race':
            posGroup.style.display   = 'block';
            raceExtras.style.display = 'flex';
            vrGroup.style.display    = 'flex';
            break;
        case 'sprint':
            posGroup.style.display   = 'block';
            raceExtras.style.display = 'flex';
            gapGroup.style.display   = 'block';
            break;
        case 'qualy':
        case 'sprint-qualy':
            posGroup.style.display   = 'block';
            timeInputs.style.display = 'flex';
            if (type === 'qualy') { t1.placeholder = 'Q1'; t2.placeholder = 'Q2'; t3.placeholder = 'Q3'; }
            else                  { t1.placeholder = 'SQ1'; t2.placeholder = 'SQ2'; t3.placeholder = 'SQ3'; }
            break;
        case 'practices':
            timeInputs.style.display = 'flex';
            t1.placeholder = 'FP1'; t2.placeholder = 'FP2'; t3.placeholder = 'FP3';
            break;
    }
}

export async function handleSubmit(e) {
    e.preventDefault();
    const btn = document.querySelector('.btn-submit');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const sessionType = document.getElementById('sessionType').value;
    const commonData = {
        race_id:   document.getElementById('raceSelect').value,
        driver_id: document.getElementById('driverSelect').value,
    };
    const mainStatus = document.getElementById('mainStatus').value;
    const statusData = {
        dnf: mainStatus === 'dnf', dsq: mainStatus === 'dsq',
        dns: mainStatus === 'dns', dnq: mainStatus === 'dnq',
    };

    const endpoint = SESSION_ENDPOINTS[sessionType];

    const bodyMap = {
        race: () => ({
            ...commonData,
            position:    document.getElementById('posInput').value,
            fastest_lap: document.getElementById('fastestLapInput').checked,
            ...statusData,
        }),
        sprint: () => ({
            ...commonData,
            position: document.getElementById('posInput').value,
            ...statusData,
            time_gap: document.getElementById('gapInput').value,
        }),
        qualy: () => ({
            ...commonData,
            position: document.getElementById('posInput').value,
            q1: getTimeOrStatus('time1', 'status1'),
            q2: getTimeOrStatus('time2', 'status2'),
            q3: getTimeOrStatus('time3', 'status3'),
        }),
        'sprint-qualy': () => ({
            ...commonData,
            position: document.getElementById('posInput').value,
            sq1: getTimeOrStatus('time1', 'status1'),
            sq2: getTimeOrStatus('time2', 'status2'),
            sq3: getTimeOrStatus('time3', 'status3'),
        }),
        practices: () => ({
            ...commonData,
            p1: getTimeOrStatus('time1', 'status1'),
            p2: getTimeOrStatus('time2', 'status2'),
            p3: getTimeOrStatus('time3', 'status3'),
        }),
    };

    try {
        const res = await postResultApi(endpoint, bodyMap[sessionType]());
        if (res.ok) {
            showSuccess('msg');
            document.getElementById('posInput').value = '';
            document.getElementById('gapInput').value = '';
            ['time1', 'time2', 'time3'].forEach(id => document.getElementById(id).value = '');
            ['status1', 'status2', 'status3'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('mainStatus').value = 'finished';
            document.getElementById('fastestLapInput').checked = false;
            document.getElementById('driverSelect').focus();
        } else {
            const err = await res.json();
            showError(err.error || 'Error desconocido');
        }
    } catch (err) {
        console.error(err);
        alert('Error de conexión');
    } finally {
        btn.disabled = false;
        btn.innerText = 'GUARDAR RESULTADO';
    }
}

export async function handleDeleteSpecificResult() {
    const raceId      = document.getElementById('raceSelect').value;
    const driverId    = document.getElementById('driverSelect').value;
    const sessionType = document.getElementById('sessionType').value;

    if (!raceId || !driverId) return alert('Selecciona carrera y piloto primero.');
    if (!confirm(`⚠️ ¿Borrar los datos de este piloto en: ${SESSION_LABELS[sessionType]}?`)) return;

    const endpointFn = DELETE_ENDPOINTS[sessionType];

    try {
        const res = await deleteResultApi(endpointFn(raceId, driverId));
        if (res.ok) {
            alert('🗑️ Datos eliminados.');
            document.getElementById('posInput').value = '';
            ['time1', 'time2', 'time3'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('mainStatus').value = 'finished';
        } else {
            showError('No se pudo eliminar. Intentá de nuevo.');
        }
    } catch (e) {
        console.error(e);
        alert('Error de conexión');
    }
}
