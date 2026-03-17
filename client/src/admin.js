import './scss/admin.scss';
import { COUNTRY_NAMES } from './modules/utils.js';
import { API, SERVER_URL } from './modules/config.js'; // Asegúrate de importar API desde config

let allRacesData = [];

const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN;

export const adminFetch = (url, options = {}) => {
    return Fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'x-admin-token': ADMIN_TOKEN
        }
    });
};

// ==========================================
// 1. CARGA PARA EL PANEL SUPERIOR (Control)
// ==========================================
async function loadRaces(year) {
    // 👇 Solo tocamos el selector de arriba
    const raceSelect = document.getElementById('raceSelect');
    raceSelect.innerHTML = '<option>Cargando...</option>';

    try {
        const res = await adminFetch(`${API}/races?year=${year}`);
        const json = await res.json();

        allRacesData = json.data;

        renderRaceOptions(); // Esto llena el select de arriba

    } catch (e) { console.error(e); }
}

// ==========================================
// 2. CARGA PARA LA ZONA DE PELIGRO (Borrar)
// ==========================================
async function loadRacesForDelete() {
    // 👇 Leemos el año del selector ROJO
    const year = document.getElementById('deleteYearSelect').value;
    const select = document.getElementById('deleteRaceSelect');

    select.innerHTML = '<option>Cargando...</option>';

    try {
        const res = await adminFetch(`${API}/races?year=${year}`);
        const json = await res.json();

        if (json.data.length === 0) {
            select.innerHTML = '<option value="" disabled>Sin carreras</option>';
        } else {
            select.innerHTML = '<option value="" disabled selected>Selecciona carrera a borrar...</option>' +
                json.data.map(r => `<option value="${r.id}">Round ${r.round}: ${r.name}</option>`).join('');
        }
    } catch (e) {
        console.error(e);
        select.innerHTML = '<option>Error</option>';
    }
}

async function loadServerImages() {
    try {
        const res = await adminFetch(`${API}/races/images/list`);
        const json = await res.json();

        if (json.success) {
            const { maps, circuits } = json.data;

            // Llenar Select de Mapas
            const mapSelect = document.getElementById('existingMapSelect');
            mapSelect.innerHTML = '<option value="">-- Seleccionar existente --</option>' +
                maps.map(img => `<option value="${img.url}">${img.name}</option>`).join('');

            // Llenar Select de Circuitos
            const circuitSelect = document.getElementById('existingCircuitSelect');
            circuitSelect.innerHTML = '<option value="">-- Seleccionar existente --</option>' +
                circuits.map(img => `<option value="${img.url}">${img.name}</option>`).join('');

            // Eventos para previsualizar al seleccionar
            mapSelect.addEventListener('change', (e) => {
                const img = document.getElementById('previewMap');
                if (e.target.value) { img.src = `${SERVER_URL}${e.target.value}`; img.style.display = 'block'; }
                else { img.style.display = 'none'; }
            });

            circuitSelect.addEventListener('change', (e) => {
                const img = document.getElementById('previewCircuit');
                if (e.target.value) { img.src = `${SERVER_URL}${e.target.value}`; img.style.display = 'block'; }
                else { img.style.display = 'none'; }
            });
        }
    } catch (e) { console.error("Error cargando imágenes:", e); }
}

function renderRaceOptions() {
    const sessionType = document.getElementById('sessionType').value;
    const raceSelect = document.getElementById('raceSelect');

    const isSprintSession = (sessionType === 'sprint' || sessionType === 'sprint-qualy');

    let filteredRaces = allRacesData;

    if (isSprintSession) {
        filteredRaces = allRacesData.filter(race => race.has_sprint);
    }

    if (filteredRaces.length === 0) {
        raceSelect.innerHTML = '<option value="" disabled selected>No hay Sprints esta temporada</option>';
    } else {
        raceSelect.innerHTML = '<option value="" disabled selected>Selecciona una carrera...</option>' +
            filteredRaces.map(r => {
                const sprintIcon = r.has_sprint ? '⚡ ' : '';
                return `<option value="${r.id}">${sprintIcon}Round ${r.round}: ${r.name}</option>`;
            }).join('');
    }
}

async function loadDrivers() {
    const selectedYear = document.getElementById('seasonSelect').value;

    try {
        const res = await adminFetch(`${API}/drivers?year=${selectedYear}`);
        const json = await res.json();
        const drivers = json.data;

        drivers.sort((a, b) => a.last_name.localeCompare(b.last_name));

        const options = '<option value="" disabled selected>Selecciona un piloto...</option>' +
            drivers.map(d => `<option value="${d.id}">#${d.permanent_number} - ${d.last_name}</option>`).join('');

        // 👇 SOLO actualizamos el select de arriba
        document.getElementById('driverSelect').innerHTML = options;

        // (Nota: Ya NO actualizamos deleteDriverSelect aquí)

    } catch (e) { console.error(e); }
}

async function loadDriversForDelete() {
    // 👇 Leemos el año del NUEVO selector de la zona de peligro
    const year = document.getElementById('deleteDriverYearSelect').value;
    const select = document.getElementById('deleteDriverSelect');

    select.innerHTML = '<option>Cargando...</option>';

    try {
        const res = await adminFetch(`${API}/drivers?year=${year}`);
        const json = await res.json();
        const drivers = json.data;

        drivers.sort((a, b) => a.last_name.localeCompare(b.last_name));

        if (drivers.length === 0) {
            select.innerHTML = '<option value="" disabled>Sin pilotos activos este año</option>';
        } else {
            select.innerHTML = '<option value="" disabled selected>Selecciona piloto a borrar...</option>' +
                drivers.map(d => `<option value="${d.id}">#${d.permanent_number} - ${d.last_name}</option>`).join('');
        }

    } catch (e) { console.error(e); select.innerHTML = '<option>Error</option>'; }
}

// --- VISIBILIDAD DINÁMICA ---
function updateFormFields() {
    const type = document.getElementById('sessionType').value;

    const posGroup = document.getElementById('posGroup');
    const gapGroup = document.getElementById('gapGroup');
    const raceExtras = document.getElementById('raceExtras');
    const vrGroup = document.getElementById('vrGroup');
    const timeInputs = document.getElementById('timeInputs');

    const t1 = document.getElementById('time1');
    const t2 = document.getElementById('time2');
    const t3 = document.getElementById('time3');

    posGroup.style.display = 'none';
    gapGroup.style.display = 'none';
    raceExtras.style.display = 'none';
    vrGroup.style.display = 'none';
    timeInputs.style.display = 'none';

    switch (type) {
        case 'race':
            posGroup.style.display = 'block';
            raceExtras.style.display = 'flex';
            vrGroup.style.display = 'flex';
            break;

        case 'sprint':
            posGroup.style.display = 'block';
            raceExtras.style.display = 'flex';
            gapGroup.style.display = 'block';
            break;

        case 'qualy':
        case 'sprint-qualy':
            posGroup.style.display = 'block';
            timeInputs.style.display = 'flex';
            if (type === 'qualy') { t1.placeholder = 'Q1'; t2.placeholder = 'Q2'; t3.placeholder = 'Q3'; }
            else { t1.placeholder = 'SQ1'; t2.placeholder = 'SQ2'; t3.placeholder = 'SQ3'; }
            break;

        case 'practices':
            timeInputs.style.display = 'flex';
            t1.placeholder = 'FP1'; t2.placeholder = 'FP2'; t3.placeholder = 'FP3';
            break;
    }
}

// --- ENVÍO DE DATOS DE RESULTADOS ---
async function handleSubmit(e) {
    e.preventDefault();
    const btn = document.querySelector('.btn-submit');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const sessionType = document.getElementById('sessionType').value;
    const commonData = {
        race_id: document.getElementById('raceSelect').value,
        driver_id: document.getElementById('driverSelect').value
    };

    const mainStatus = document.getElementById('mainStatus').value;
    const statusData = {
        dnf: mainStatus === 'dnf', dsq: mainStatus === 'dsq', dns: mainStatus === 'dns', dnq: mainStatus === 'dnq'
    };

    const getVal = (timeId, statusId) => {
        const status = document.getElementById(statusId).value;
        const time = document.getElementById(timeId).value;
        return status ? status : time;
    };

    let endpoint = '';
    let bodyData = {};

    switch (sessionType) {
        case 'race':
            endpoint = '/races/results';
            bodyData = {
                ...commonData,
                position: document.getElementById('posInput').value,
                fastest_lap: document.getElementById('fastestLapInput').checked,
                ...statusData
            };
            break;

        case 'sprint':
            endpoint = '/races/sprint';
            bodyData = {
                ...commonData,
                position: document.getElementById('posInput').value,
                ...statusData,
                time_gap: document.getElementById('gapInput').value
            };
            break;

        case 'qualy':
            endpoint = '/races/qualifying';
            bodyData = {
                ...commonData,
                position: document.getElementById('posInput').value,
                q1: getVal('time1', 'status1'),
                q2: getVal('time2', 'status2'),
                q3: getVal('time3', 'status3')
            };
            break;

        case 'sprint-qualy':
            endpoint = '/races/sprint-qualifying';
            bodyData = {
                ...commonData,
                position: document.getElementById('posInput').value,
                sq1: getVal('time1', 'status1'),
                sq2: getVal('time2', 'status2'),
                sq3: getVal('time3', 'status3')
            };
            break;

        case 'practices':
            endpoint = '/races/practices';
            bodyData = {
                ...commonData,
                p1: getVal('time1', 'status1'),
                p2: getVal('time2', 'status2'),
                p3: getVal('time3', 'status3')
            };
            break;
    }

    try {
        const res = await adminFetch(`${API}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });

        if (res.ok) {
            const msg = document.getElementById('msg');
            msg.classList.add('visible');
            setTimeout(() => msg.classList.remove('visible'), 3000);

            // Limpieza
            document.getElementById('posInput').value = '';
            document.getElementById('gapInput').value = '';
            document.getElementById('driverSelect').focus();

            ['time1', 'time2', 'time3'].forEach(id => document.getElementById(id).value = '');
            ['status1', 'status2', 'status3'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('mainStatus').value = 'finished';
            document.getElementById('fastestLapInput').checked = false;

        } else {
            const err = await res.json();
            alert('❌ Error: ' + (err.error || 'Desconocido'));
        }
    } catch (err) { console.error(err); alert('Error de conexión'); }
    finally { btn.disabled = false; btn.innerText = 'GUARDAR RESULTADO'; }
}

// FUNCIÓN DE BORRADO DE CARRERA (Actualizada para recargar la lista correcta)
async function handleDelete() {
    const select = document.getElementById('deleteRaceSelect');
    const raceId = select.value;
    if (!raceId) return alert('Selecciona una carrera.');

    // Obtenemos el texto para confirmar (ej: "Round 1: Australia")
    const raceText = select.options[select.selectedIndex].text;

    if (confirm(`¿Estás seguro de eliminar: ${raceText}?\n\nSe borrarán todos los resultados asociados.`)) {
        try {
            await adminFetch(`${API}/races/${raceId}`, { method: 'DELETE' });
            alert('Eliminada.');

            // Recargamos AMBAS listas por si acaso
            loadRaces(document.getElementById('seasonSelect').value);
            loadRacesForDelete();

        } catch (e) { console.error(e); }
    }
}

async function handleDeleteDriver() {
    const select = document.getElementById('deleteDriverSelect');
    const driverId = select.value;

    if (!driverId) return alert('Selecciona un piloto para eliminar.');

    if (confirm('⚠️ ¿ESTÁS SEGURO?\n\nSe borrará al piloto Y TODOS SUS RESULTADOS históricos.\nEsta acción no se puede deshacer.')) {
        try {
            const res = await adminFetch(`${API}/drivers/${driverId}`, { method: 'DELETE' });
            if (res.ok) {
                alert('✅ Piloto eliminado.');
                loadDrivers();
            } else {
                alert('❌ Error al eliminar.');
            }
        } catch (e) { console.error(e); alert('Error de conexión'); }
    }
}

async function loadTeams() {
    try {
        const res = await adminFetch(`${API}/drivers/teams/list`);
        const json = await res.json();
        const select = document.getElementById('newDriverTeam');
        select.innerHTML = '<option value="">Elegir Equipo...</option>' +
            json.data.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    } catch (e) { console.error(e); }
}

function loadCountryOptions() {
    const sortedEntries = Object.entries(COUNTRY_NAMES).sort((a, b) => a[1].localeCompare(b[1]));
    const optionsHTML = '<option value="" disabled selected>Selecciona...</option>' +
        sortedEntries.map(([code, name]) => `<option value="${code}">${name} (${code})</option>`).join('');

    const raceSelect = document.getElementById('newCountry');
    if (raceSelect) raceSelect.innerHTML = optionsHTML;

    const driverSelect = document.getElementById('newDriverCountry');
    if (driverSelect) driverSelect.innerHTML = optionsHTML;
}

// ==================================================================================
// --- CREAR CARRERA (COMPLETO: 2 IMÁGENES + DATOS TÉCNICOS) ---
// ==================================================================================
async function handleCreateRace(e) {
    e.preventDefault();
    if (!confirm("¿Crear nueva carrera?")) return;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = 'Subiendo...';

    const formData = new FormData();
    // 1. Datos Básicos
    formData.append('round', document.getElementById('newRaceRound').value);
    formData.append('country_code', document.getElementById('newCountry').value);
    formData.append('name', document.getElementById('newRaceName').value);
    formData.append('circuit_name', document.getElementById('newCircuit').value);
    formData.append('date', document.getElementById('newDate').value);
    formData.append('sprint', document.getElementById('newHasSprint').checked);

    // 2. Datos Técnicos (NUEVO)
    // Usamos el operador || '' para evitar enviar "undefined" si el campo está vacío
    formData.append('circuit_length', document.getElementById('newLength').value || '');
    formData.append('total_laps', document.getElementById('newLaps').value || 0);
    formData.append('race_distance', document.getElementById('newDistance').value || '');
    formData.append('lap_record', document.getElementById('newRecord').value || '');

    // ENVIAR SELECCIÓN EXISTENTE (Si el usuario eligió algo de la lista)
    const existingMap = document.getElementById('existingMapSelect').value;
    if (existingMap) formData.append('existing_map_image', existingMap);

    const existingCircuit = document.getElementById('existingCircuitSelect').value;
    if (existingCircuit) formData.append('existing_circuit_image', existingCircuit);

    // 3. Imagen PREVIEW (Silueta)
    const fileInputMap = document.getElementById('newMapFile');
    if (fileInputMap && fileInputMap.files[0]) {
        formData.append('map_image', fileInputMap.files[0]);
    }

    // 4. Imagen DETALLADA (Color)
    const fileInputCircuit = document.getElementById('newCircuitImageFile');
    if (fileInputCircuit && fileInputCircuit.files[0]) {
        formData.append('circuit_image', fileInputCircuit.files[0]);
    }

    try {
        const res = await adminFetch(`${API}/races`, {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            alert('✅ Carrera creada con todos los datos.');
            loadRaces(document.getElementById('seasonSelect').value);
            e.target.reset(); // Limpia todos los inputs, incluidos los nuevos
            document.getElementById('newCountry').value = "";
        } else {
            const data = await res.json();
            alert('❌ Error: ' + (data.error || 'Desconocido'));
        }
    } catch (err) {
        console.error(err);
        alert('Error de conexión.');
    } finally {
        btn.disabled = false;
        btn.innerText = 'AGREGAR GP';
    }
}

// --- CREAR PILOTO ---
async function handleCreateDriver(e) {
    e.preventDefault();
    if (!confirm("¿Crear nuevo piloto?")) return;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = 'Subiendo...';

    const formData = new FormData();
    formData.append('first_name', document.getElementById('newDriverName').value);
    formData.append('last_name', document.getElementById('newDriverLastname').value);
    formData.append('number', document.getElementById('newDriverNum').value);
    formData.append('country', document.getElementById('newDriverCountry').value);
    formData.append('team_id', document.getElementById('newDriverTeam').value);

    const fileInput = document.getElementById('newDriverFile');
    if (fileInput.files[0]) {
        formData.append('profile_image', fileInput.files[0]);
    }

    // 👇 RECOLECTAR AÑOS SELECCIONADOS
    let activeSeasons = [];
    if (document.getElementById('season2025').checked) activeSeasons.push('2025');
    if (document.getElementById('season2026').checked) activeSeasons.push('2026');

    // Lo enviamos como texto separado por comas (ej: "2025" o "2025,2026")
    formData.append('seasons', activeSeasons.join(','));

    try {
        const res = await adminFetch(`${API}/drivers`, { method: 'POST', body: formData });
        if (res.ok) {
            alert('✅ Piloto creado.');
            loadDrivers();
            loadTeams();
            e.target.reset();
            document.getElementById('newDriverCountry').value = "";
            document.getElementById('newDriverTeam').value = "";
        } else {
            const data = await res.json();
            alert('❌ Error: ' + (data.error || 'Desconocido'));
        }
    } catch (err) { console.error(err); alert('Error de conexión.'); }
    finally { btn.disabled = false; btn.innerText = 'AGREGAR PILOTO'; }
}

async function handleDeleteSpecificResult() {
    const raceId = document.getElementById('raceSelect').value;
    const driverId = document.getElementById('driverSelect').value;
    const sessionType = document.getElementById('sessionType').value;

    if (!raceId || !driverId) return alert('Selecciona carrera y piloto primero.');

    const sessionNames = {
        'race': 'Carrera Principal', 'sprint': 'Sprint', 'qualy': 'Clasificación', 'sprint-qualy': 'Shootout', 'practices': 'Prácticas'
    };

    if (!confirm(`⚠️ ¿Borrar los datos de este piloto en: ${sessionNames[sessionType]}?`)) return;

    let endpoint = '';
    switch (sessionType) {
        case 'race': endpoint = `/races/${raceId}/results/${driverId}`; break;
        case 'sprint': endpoint = `/races/${raceId}/sprint/${driverId}`; break;
        case 'qualy': endpoint = `/races/${raceId}/qualifying/${driverId}`; break;
        case 'sprint-qualy': endpoint = `/races/${raceId}/sprint-qualifying/${driverId}`; break;
        case 'practices': endpoint = `/races/${raceId}/practices/${driverId}`; break;
    }

    try {
        const res = await adminFetch(`${API}${endpoint}`, { method: 'DELETE' });
        if (res.ok) {
            alert('🗑️ Datos eliminados.');
            document.getElementById('posInput').value = '';
            ['time1', 'time2', 'time3'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('mainStatus').value = 'finished';
        } else { alert('❌ Error al eliminar.'); }
    } catch (e) { console.error(e); alert('Error de conexión'); }
}

document.addEventListener('DOMContentLoaded', () => {
    loadRaces(2025);
    loadRacesForDelete();
    loadDrivers();
    loadDriversForDelete();
    loadTeams();
    loadCountryOptions();
    loadServerImages();

    document.getElementById('deleteYearSelect').addEventListener('change', loadRacesForDelete); document.getElementById('resultForm').addEventListener('submit', handleSubmit);
    document.getElementById('btnDelete').addEventListener('click', handleDelete);
    document.getElementById('btnDeleteDriver').addEventListener('click', handleDeleteDriver);
    document.getElementById('newRaceForm').addEventListener('submit', handleCreateRace);
    document.getElementById('newDriverForm').addEventListener('submit', handleCreateDriver);
    document.getElementById('btnDeleteResult').addEventListener('click', handleDeleteSpecificResult);
    document.getElementById('deleteDriverYearSelect').addEventListener('change', loadDriversForDelete);

    // 👇 IMPORTANTE: Cuando cambias el año (2025 <-> 2026), recargar pilotos
    document.getElementById('seasonSelect').addEventListener('change', (e) => {
        const year = e.target.value;
        loadRaces(year);   // Cargar carreras de ese año
        loadDrivers();     // Cargar pilotos DE ESE AÑO
    });

    document.getElementById('sessionType').addEventListener('change', () => {
        updateFormFields();
        renderRaceOptions();
    });

    // 3. LISTENERS NUEVOS DE EQUIPOS (Si los tienes)
    const formTeam = document.getElementById('newTeamForm');
    if (formTeam) formTeam.addEventListener('submit', handleCreateTeam);
    const btnDelTeam = document.getElementById('btnDeleteTeam');
    if (btnDelTeam) btnDelTeam.addEventListener('click', handleDeleteTeam);

    // 👇👇👇 AGREGA ESTA LÍNEA AQUÍ AL FINAL 👇👇👇
    // Esto fuerza a que se muestren los campos correctos apenas entras
    updateFormFields();
});