import './scss/admin.scss';
import { COUNTRY_NAMES } from './modules/utils.js';
import { API, SERVER_URL } from './modules/config.js'; // Asegúrate de importar API desde config

let allRacesData = [];

// Helper para guardar/obtener token
const getToken = () => localStorage.getItem('admin_token');
const setToken = (t) => localStorage.setItem('admin_token', t);
const clearToken = () => localStorage.removeItem('admin_token');

export const adminFetch = (url, options = {}) => {
    const token = getToken();
    return fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
    });
};

// ==========================================
// 0. AUTH Y LOGIN FLOW
// ==========================================
async function checkAuth() {
    const token = getToken();
    if (!token) {
        document.getElementById('loginOverlay').style.display = 'flex';
        return false;
    }
    try {
        const res = await adminFetch(`${API}/auth/check`);
        if (res.ok) {
            document.getElementById('loginOverlay').style.display = 'none';
            return true;
        } else {
            clearToken();
            document.getElementById('loginOverlay').style.display = 'flex';
            return false;
        }
    } catch (e) {
        document.getElementById('loginOverlay').style.display = 'flex';
        return false;
    }
}

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;
    const btn = e.target.querySelector('button');
    btn.innerText = 'Verificando...';
    try {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });
        if (res.ok) {
            const data = await res.json();
            setToken(data.token); // guardar en localStorage
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('loginError').style.display = 'none';
            loadInitialData();
        } else {
            document.getElementById('loginError').style.display = 'block';
        }
    } catch (err) {
        alert('Error contactando al servidor');
    } finally {
        btn.innerText = 'INGRESAR';
    }
});

function loadInitialData() {
    const year = document.getElementById('seasonSelect').value || 2025;
    loadRaces(year);
    loadRacesForDelete();
    loadDrivers();
    loadDriversForDelete();
    loadTeams();
    loadDriversForAssign();
    loadCountryOptions();
    loadServerImages();
    loadArticlesForDelete();
    loadDraftArticles();
    loadCircuitWinnersForDelete();
    loadRacesForCircuitInfo(document.getElementById('circuitInfoYear').value || 2025);
    loadMomentsForDelete();
    loadRacesForMoment(document.getElementById('momentYear').value || 2025);
    loadRacesForStint('2025');
    loadRacesForStintDelete('2025');
    loadRacesForAI('2025');
}

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
            showError(err.error || 'Error desconocido');
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
                showError('No se pudo eliminar. Intentá de nuevo.');
            }
        } catch (e) { console.error(e); alert('Error de conexión'); }
    }
}

async function loadTeams() {
    try {
        const res = await adminFetch(`${API}/drivers/teams/list`);
        const json = await res.json();
        const opts = json.data.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        const driverTeam = document.getElementById('newDriverTeam');
        if (driverTeam) driverTeam.innerHTML = '<option value="">Elegir Equipo...</option>' + opts;
        const assignTeam = document.getElementById('assignTeamSelect');
        if (assignTeam) assignTeam.innerHTML = '<option value="">Seleccionar equipo...</option>' + opts;
    } catch (e) { console.error(e); }
}

async function loadDriversForAssign() {
    try {
        const res = await adminFetch(`${API}/drivers?year=2026`);
        const json = await res.json();
        const all = await adminFetch(`${API}/drivers?year=2025`);
        const all2 = await all.json();
        // Merge both years deduped by id
        const map = {};
        [...(json.data || []), ...(all2.data || [])].forEach(d => { map[d.id] = d; });
        const opts = Object.values(map)
            .sort((a, b) => a.last_name.localeCompare(b.last_name))
            .map(d => `<option value="${d.id}">${d.first_name} ${d.last_name}</option>`).join('');
        const sel = document.getElementById('assignDriverSelect');
        if (sel) sel.innerHTML = '<option value="">Seleccionar piloto...</option>' + opts;
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
            showSuccess('msgRace');
            loadRaces(document.getElementById('seasonSelect').value);
            e.target.reset(); // Limpia todos los inputs, incluidos los nuevos
            document.getElementById('newCountry').value = "";
        } else {
            const data = await res.json();
            showError(data.error || 'Error desconocido', 'errorMsgRace', 'errorTextRace');
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
async function handleAssignDriverSeason(e) {
    e.preventDefault();
    const driver_id = parseInt(document.getElementById('assignDriverSelect').value);
    const year = parseInt(document.getElementById('assignSeasonYear').value);
    const constructor_id = parseInt(document.getElementById('assignTeamSelect').value);
    const numberRaw = document.getElementById('assignDriverNumber').value;
    const number = numberRaw ? parseInt(numberRaw) : undefined;

    if (!driver_id || !year || !constructor_id) {
        showError('Completá todos los campos.', 'errorMsgAssign', 'errorTextAssign');
        return;
    }
    try {
        const res = await adminFetch(`${API}/drivers/seasons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driver_id, constructor_id, year, number }),
        });
        if (res.ok) {
            showSuccess('msgAssign');
            e.target.reset();
            document.getElementById('assignSeasonYear').value = '2026';
            // Recargar listas para reflejar el cambio
            loadDrivers();
            loadDriversForDelete();
            loadDriversForAssign();
        } else {
            const data = await res.json();
            showError(data.error || 'Error desconocido.', 'errorMsgAssign', 'errorTextAssign');
        }
    } catch (err) { console.error(err); alert('Error de conexión.'); }
}

async function handleCreateTeam(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const formData = new FormData();
    formData.append('name', document.getElementById('newTeamName').value.trim());
    formData.append('primary_color', document.getElementById('newTeamColor').value);

    const logoInput = document.getElementById('newTeamLogo');
    if (logoInput.files[0]) formData.append('logo_image', logoInput.files[0]);

    const seasons = ['2024', '2025', '2026']
        .filter(y => document.getElementById(`teamSeason${y}`)?.checked)
        .map(Number);
    formData.append('active_seasons', JSON.stringify(seasons));

    try {
        const res = await adminFetch(`${API}/teams`, { method: 'POST', body: formData });
        if (res.ok) {
            showSuccess('msgTeam');
            loadTeams();
            e.target.reset();
            document.getElementById('newTeamColor').value = '#e10600';
        } else {
            const data = await res.json();
            showError(data.error || 'Error desconocido', 'errorMsgTeam', 'errorTextTeam');
        }
    } catch (err) { console.error(err); alert('Error de conexión.'); }
    finally { btn.disabled = false; btn.innerText = 'AGREGAR ESCUDERÍA'; }
}

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
            showSuccess('msgDriver');
            loadDrivers();
            loadTeams();
            e.target.reset();
            document.getElementById('newDriverCountry').value = "";
            document.getElementById('newDriverTeam').value = "";
        } else {
            const data = await res.json();
            showError(data.error || 'Error desconocido', 'errorMsgDriver', 'errorTextDriver');
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
        } else { showError('No se pudo eliminar. Intentá de nuevo.'); }
    } catch (e) { console.error(e); alert('Error de conexión'); }
}

document.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
        loadInitialData();
    }

    // En el listener del logout:
    document.getElementById('btnLogout')?.addEventListener('click', async () => {
        clearToken();
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('adminPassword').value = '';
        document.getElementById('loginError').style.display = 'none';
    });

    // ── Editor toolbar ──────────────────────────────────────────
    document.querySelectorAll('.editor-toolbar button[data-tag]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.dataset.tag;
            const textarea = document.getElementById('artContent');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selected = textarea.value.slice(start, end);

            let inserted;
            if (tag === 'ul') {
                // wrap each selected line in <li> then wrap all in <ul>
                const items = (selected || 'Ítem').split('\n').map(l => `  <li>${l.trim() || 'Ítem'}</li>`).join('\n');
                inserted = `<ul>\n${items}\n</ul>`;
            } else if (tag === 'li') {
                inserted = `<li>${selected || 'Ítem'}</li>`;
            } else if (tag === 'p') {
                inserted = `<p>${selected || 'Párrafo...'}</p>`;
            } else {
                inserted = `<${tag}>${selected || '...'}</${tag}>`;
            }

            textarea.setRangeText(inserted, start, end, 'end');
            textarea.focus();
        });
    });

    document.getElementById('btnTogglePreview')?.addEventListener('click', () => {
        const preview = document.getElementById('artContentPreview');
        const textarea = document.getElementById('artContent');
        const btn = document.getElementById('btnTogglePreview');
        const showing = preview.style.display !== 'none';
        if (showing) {
            preview.style.display = 'none';
            textarea.style.display = '';
            btn.textContent = '👁 Preview';
        } else {
            preview.innerHTML = textarea.value || '<p style="color:#888">Sin contenido</p>';
            preview.style.display = 'block';
            textarea.style.display = 'none';
            btn.textContent = '✏️ Editar';
        }
    });

    // ── Insert image modal ──────────────────────────────────────
    let _imgTarget = null; // textarea reference when modal opens

    document.getElementById('btnInsertImage')?.addEventListener('click', () => {
        _imgTarget = document.getElementById('artContent');
        document.getElementById('imgModalUrl').value = '';
        document.getElementById('imgModalAlt').value = '';
        document.getElementById('imgModalPreviewWrap').style.display = 'none';
        const modal = document.getElementById('imgModal');
        modal.style.display = 'flex';
        document.getElementById('imgModalUrl').focus();
    });

    document.getElementById('imgModalUrl')?.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        const wrap = document.getElementById('imgModalPreviewWrap');
        const img = document.getElementById('imgModalPreviewImg');
        if (url) {
            img.src = url;
            img.onerror = () => { wrap.style.display = 'none'; };
            img.onload = () => { wrap.style.display = 'block'; };
        } else {
            wrap.style.display = 'none';
        }
    });

    document.getElementById('imgModalCancel')?.addEventListener('click', () => {
        document.getElementById('imgModal').style.display = 'none';
    });

    document.getElementById('imgModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('imgModal'))
            document.getElementById('imgModal').style.display = 'none';
    });

    document.getElementById('imgModalInsert')?.addEventListener('click', () => {
        const url = document.getElementById('imgModalUrl').value.trim();
        if (!url) return alert('Ingresá la URL de la imagen.');
        const alt = document.getElementById('imgModalAlt').value.trim() || '';
        const tag = `<img src="${url}" alt="${alt}" style="max-width:100%; border-radius:6px; margin:12px 0;">`;
        if (_imgTarget) {
            const start = _imgTarget.selectionStart;
            const end = _imgTarget.selectionEnd;
            _imgTarget.setRangeText(tag, start, end, 'end');
            _imgTarget.focus();
        }
        document.getElementById('imgModal').style.display = 'none';
    });

    document.getElementById('deleteYearSelect').addEventListener('change', loadRacesForDelete);
    document.getElementById('btnDeleteArticle')?.addEventListener('click', handleDeleteArticle);
    document.getElementById('btnPublishDraft')?.addEventListener('click', handlePublishDraft);
    document.getElementById('newArticleForm')?.addEventListener('submit', handleCreateArticle);
    document.getElementById('btnDeleteCircuitWinner')?.addEventListener('click', handleDeleteCircuitWinner);
    document.getElementById('circuitInfoForm')?.addEventListener('submit', handleUpdateCircuitInfo);
    document.getElementById('newCircuitWinnerForm')?.addEventListener('submit', handleAddCircuitWinner);
    document.getElementById('circuitInfoYear')?.addEventListener('change', (e) => loadRacesForCircuitInfo(e.target.value));
    document.getElementById('btnDeleteMoment')?.addEventListener('click', handleDeleteMoment);
    document.getElementById('newMomentForm')?.addEventListener('submit', handleAddMoment);
    document.getElementById('momentYear')?.addEventListener('change', (e) => loadRacesForMoment(e.target.value));
    // Strategy
    document.getElementById('newStintForm')?.addEventListener('submit', handleAddStint);
    document.getElementById('btnDeleteStints')?.addEventListener('click', handleDeleteStints);
    document.getElementById('stintYear')?.addEventListener('change', (e) => { loadRacesForStint(e.target.value); loadDriversForStint(); });
    document.getElementById('stintRaceSelect')?.addEventListener('change', loadDriversForStint);
    document.getElementById('deleteStintYearSelect')?.addEventListener('change', (e) => loadRacesForStintDelete(e.target.value));
    document.getElementById('deleteStintRaceSelect')?.addEventListener('change', (e) => loadDriversForStintDelete(e.target.value));
    // AI Generator
    document.getElementById('btnGenerateArticle')?.addEventListener('click', handleGenerateArticle);
    document.getElementById('aiYear')?.addEventListener('change', (e) => loadRacesForAI(e.target.value));
    document.getElementById('resultForm').addEventListener('submit', handleSubmit);
    document.getElementById('btnDelete').addEventListener('click', handleDelete);
    document.getElementById('btnDeleteDriver').addEventListener('click', handleDeleteDriver);
    document.getElementById('newRaceForm').addEventListener('submit', handleCreateRace);
    document.getElementById('assignDriverSeasonForm')?.addEventListener('submit', handleAssignDriverSeason);
    document.getElementById('newTeamForm')?.addEventListener('submit', handleCreateTeam);
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

    // 👇👇👇 AGREGA ESTA LÍNEA AQUÍ AL FINAL 👇👇👇
    // Esto fuerza a que se muestren los campos correctos apenas entras
    updateFormFields();
});

// ==========================================
// ESTRATEGIA DE CARRERA
// ==========================================
async function loadRacesForStint(year) {
    const select = document.getElementById('stintRaceSelect');
    if (!select) return;
    try {
        const res = await adminFetch(`${API}/races?year=${year}`);
        const json = await res.json();
        const races = json.data || [];
        select.innerHTML = '<option value="">Selecciona carrera...</option>' +
            races.map(r => `<option value="${r.id}">R${r.round}: ${r.name}</option>`).join('');
    } catch (e) { console.error(e); }
}

async function loadDriversForStint() {
    const year = document.getElementById('stintYear').value || '2025';
    const select = document.getElementById('stintDriverSelect');
    if (!select) return;
    try {
        const res = await adminFetch(`${API}/drivers?year=${year}`);
        const json = await res.json();
        const drivers = (json.data || []).sort((a, b) => a.last_name.localeCompare(b.last_name));
        select.innerHTML = '<option value="">Selecciona piloto...</option>' +
            drivers.map(d => `<option value="${d.id}">#${d.permanent_number} ${d.last_name}</option>`).join('');
    } catch (e) { console.error(e); }
}

async function loadRacesForStintDelete(year) {
    const select = document.getElementById('deleteStintRaceSelect');
    if (!select) return;
    try {
        const res = await adminFetch(`${API}/races?year=${year}`);
        const json = await res.json();
        const races = json.data || [];
        select.innerHTML = '<option value="">Carrera...</option>' +
            races.map(r => `<option value="${r.id}">R${r.round}: ${r.name}</option>`).join('');
    } catch (e) { console.error(e); }
}

async function loadDriversForStintDelete(raceId) {
    const select = document.getElementById('deleteStintDriverSelect');
    if (!select) return;
    if (!raceId) { select.innerHTML = '<option value="">Piloto...</option>'; return; }
    try {
        const res = await adminFetch(`${API}/strategy/admin/stints?race_id=${raceId}`);
        const json = await res.json();
        const stints = json.data || [];
        // Unique drivers that have stints for this race
        const seen = {};
        stints.forEach(s => {
            if (!seen[s.driver_id || s.first_name]) {
                seen[`${s.first_name} ${s.last_name}`] = true;
            }
        });
        // Reuse stints to build driver options
        const uniqueDrivers = [...new Map(stints.map(s => [s.driver_id, s])).values()];
        if (uniqueDrivers.length === 0) {
            select.innerHTML = '<option value="">Sin datos para esta carrera</option>';
        } else {
            select.innerHTML = '<option value="">Piloto...</option>' +
                uniqueDrivers.map(s => `<option value="${s.driver_id}">${s.last_name}, ${s.first_name}</option>`).join('');
        }
    } catch (e) { console.error(e); }
}

async function handleDeleteStints() {
    const raceId = document.getElementById('deleteStintRaceSelect').value;
    const driverId = document.getElementById('deleteStintDriverSelect').value;
    if (!raceId || !driverId) return alert('Selecciona carrera y piloto.');

    const driverText = document.getElementById('deleteStintDriverSelect').options[document.getElementById('deleteStintDriverSelect').selectedIndex]?.text || '';
    if (!confirm(`¿Eliminar TODOS los stints de ${driverText} en esta carrera?`)) return;

    try {
        const res = await adminFetch(`${API}/strategy/${raceId}/driver/${driverId}`, { method: 'DELETE' });
        if (res.ok) {
            alert('Stints eliminados.');
            loadDriversForStintDelete(raceId);
        } else {
            alert('No se pudo eliminar.');
        }
    } catch (e) { console.error(e); alert('Error de conexión'); }
}

async function handleAddStint(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const body = {
        race_id: document.getElementById('stintRaceSelect').value,
        driver_id: document.getElementById('stintDriverSelect').value,
        stint_number: document.getElementById('stintNumber').value,
        tire_compound: document.getElementById('stintCompound').value,
        start_lap: document.getElementById('stintStartLap').value,
        end_lap: document.getElementById('stintEndLap').value,
        pit_duration: document.getElementById('stintPitDuration').value || null,
        notes: document.getElementById('stintNotes').value || null,
    };

    if (!body.race_id || !body.driver_id) {
        alert('Selecciona carrera y piloto.');
        btn.disabled = false;
        btn.innerText = 'GUARDAR STINT';
        return;
    }

    try {
        const res = await adminFetch(`${API}/strategy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            showSuccess('msgStint');
            // Keep race/driver selected for rapid multi-stint entry; only clear stint fields
            document.getElementById('stintNumber').value = '';
            document.getElementById('stintStartLap').value = '';
            document.getElementById('stintEndLap').value = '';
            document.getElementById('stintPitDuration').value = '';
            document.getElementById('stintNotes').value = '';
        } else {
            const data = await res.json();
            showError(data.error || 'Error desconocido', 'errorMsgStint', 'errorTextStint');
        }
    } catch (err) {
        console.error(err);
        alert('Error de conexión.');
    } finally {
        btn.disabled = false;
        btn.innerText = 'GUARDAR STINT';
    }
}

// ==========================================
// TIMELINE MOMENTS
// ==========================================
async function loadMomentsForDelete() {
    const select = document.getElementById('deleteMomentSelect');
    if (!select) return;
    select.innerHTML = '<option>Cargando...</option>';
    try {
        const res = await adminFetch(`${API}/timeline/admin/all`);
        const json = await res.json();
        const moments = json.data || [];
        if (moments.length === 0) {
            select.innerHTML = '<option value="" disabled>Sin momentos registrados</option>';
        } else {
            select.innerHTML = '<option value="" disabled selected>Selecciona momento...</option>' +
                moments.map(m => {
                    const race = m.race_name ? ` · ${m.race_name}` : '';
                    return `<option value="${m.id}">[${m.year}${race}] ${m.title}</option>`;
                }).join('');
        }
    } catch (e) {
        console.error(e);
        select.innerHTML = '<option>Error</option>';
    }
}

async function handleDeleteMoment() {
    const select = document.getElementById('deleteMomentSelect');
    const id = select.value;
    if (!id) return alert('Selecciona un momento para eliminar.');
    const label = select.options[select.selectedIndex].text;
    if (!confirm(`¿Eliminar momento?\n\n${label}`)) return;
    try {
        const res = await adminFetch(`${API}/timeline/${id}`, { method: 'DELETE' });
        if (res.ok) {
            alert('Momento eliminado.');
            loadMomentsForDelete();
        } else {
            alert('No se pudo eliminar.');
        }
    } catch (e) { console.error(e); alert('Error de conexión'); }
}

async function loadRacesForMoment(year) {
    const select = document.getElementById('momentRaceSelect');
    if (!select) return;
    try {
        const res = await adminFetch(`${API}/races?year=${year}`);
        const json = await res.json();
        const races = json.data || [];
        select.innerHTML = '<option value="">Sin carrera (global)</option>' +
            races.map(r => `<option value="${r.id}">R${r.round}: ${r.name}</option>`).join('');
    } catch (e) { console.error(e); }
}

async function handleAddMoment(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const body = {
        year: document.getElementById('momentYear').value,
        race_id: document.getElementById('momentRaceSelect').value || null,
        type: document.getElementById('momentType').value,
        icon: document.getElementById('momentIcon').value || null,
        title: document.getElementById('momentTitle').value,
        description: document.getElementById('momentDesc').value || null,
        driver_name: document.getElementById('momentDriver').value || null,
        team_name: document.getElementById('momentTeam').value || null,
    };

    try {
        const res = await adminFetch(`${API}/timeline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            showSuccess('msgMoment');
            e.target.reset();
            document.getElementById('momentYear').value = '2025';
            loadRacesForMoment('2025');
            loadMomentsForDelete();
        } else {
            const data = await res.json();
            showError(data.error || 'Error desconocido', 'errorMsgMoment', 'errorTextMoment');
        }
    } catch (err) {
        console.error(err);
        alert('Error de conexión.');
    } finally {
        btn.disabled = false;
        btn.innerText = 'AGREGAR MOMENTO';
    }
}

// ==========================================
// CIRCUITOS
// ==========================================
async function loadCircuitWinnersForDelete() {
    const select = document.getElementById('deleteCircuitWinnerSelect');
    if (!select) return;
    select.innerHTML = '<option>Cargando...</option>';
    try {
        const res = await adminFetch(`${API}/races/circuit-winners/all`);
        const json = await res.json();
        const winners = json.data || [];
        if (winners.length === 0) {
            select.innerHTML = '<option value="" disabled>Sin ganadores registrados</option>';
        } else {
            select.innerHTML = '<option value="" disabled selected>Selecciona ganador...</option>' +
                winners.map(w => `<option value="${w.id}">${w.year} — ${w.circuit_name}: ${w.winner_name}</option>`).join('');
        }
    } catch (e) {
        console.error(e);
        select.innerHTML = '<option>Error</option>';
    }
}

async function handleDeleteCircuitWinner() {
    const select = document.getElementById('deleteCircuitWinnerSelect');
    const id = select.value;
    if (!id) return alert('Selecciona un registro para eliminar.');
    const label = select.options[select.selectedIndex].text;
    if (!confirm(`¿Eliminar registro?\n\n${label}`)) return;
    try {
        const res = await adminFetch(`${API}/races/circuit-winners/${id}`, { method: 'DELETE' });
        if (res.ok) {
            alert('Registro eliminado.');
            loadCircuitWinnersForDelete();
        } else {
            alert('No se pudo eliminar.');
        }
    } catch (e) { console.error(e); alert('Error de conexión'); }
}

async function loadRacesForCircuitInfo(year) {
    const select = document.getElementById('circuitInfoRaceSelect');
    if (!select) return;
    select.innerHTML = '<option>Cargando...</option>';
    try {
        const res = await adminFetch(`${API}/races?year=${year}`);
        const json = await res.json();
        const races = json.data || [];
        if (races.length === 0) {
            select.innerHTML = '<option value="" disabled>Sin carreras</option>';
        } else {
            select.innerHTML = '<option value="" disabled selected>Selecciona carrera...</option>' +
                races.map(r => `<option value="${r.id}">R${r.round}: ${r.name}</option>`).join('');
        }
    } catch (e) {
        console.error(e);
        select.innerHTML = '<option>Error</option>';
    }
}

async function handleUpdateCircuitInfo(e) {
    e.preventDefault();
    const raceId = document.getElementById('circuitInfoRaceSelect').value;
    if (!raceId) return alert('Selecciona una carrera primero.');

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const body = {
        first_gp_year: document.getElementById('circuitFirstGpYear').value || null,
        drs_zones: document.getElementById('circuitDrsZones').value || null,
        circuit_notes: document.getElementById('circuitNotes').value || null,
    };

    try {
        const res = await adminFetch(`${API}/races/${raceId}/circuit-info`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            showSuccess('msgCircuitInfo');
            e.target.reset();
            document.getElementById('circuitInfoYear').value = '2025';
            loadRacesForCircuitInfo('2025');
        } else {
            const data = await res.json();
            alert(data.error || 'Error desconocido');
        }
    } catch (err) {
        console.error(err);
        alert('Error de conexión.');
    } finally {
        btn.disabled = false;
        btn.innerText = 'GUARDAR INFO';
    }
}

async function handleAddCircuitWinner(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const body = {
        circuit_name: document.getElementById('cwCircuitName').value,
        year: document.getElementById('cwYear').value,
        winner_name: document.getElementById('cwWinner').value,
        team_name: document.getElementById('cwTeam').value || null,
        pole_name: document.getElementById('cwPole').value || null,
        fastest_lap: document.getElementById('cwFastestLap').value || null,
        notes: document.getElementById('cwNotes').value || null,
    };

    try {
        const res = await adminFetch(`${API}/races/circuit-winners`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            showSuccess('msgCircuitWinner');
            e.target.reset();
            loadCircuitWinnersForDelete();
        } else {
            const data = await res.json();
            showError(data.error || 'Error desconocido', 'errorMsgCircuitWinner', 'errorTextCircuitWinner');
        }
    } catch (err) {
        console.error(err);
        alert('Error de conexión.');
    } finally {
        btn.disabled = false;
        btn.innerText = 'AGREGAR GANADOR';
    }
}

// ==========================================
// ARTÍCULOS
// ==========================================
async function loadArticlesForDelete() {
    const select = document.getElementById('deleteArticleSelect');
    if (!select) return;
    select.innerHTML = '<option>Cargando...</option>';
    try {
        const res = await adminFetch(`${API}/articles/admin/all`);
        const json = await res.json();
        const articles = json.data || [];
        if (articles.length === 0) {
            select.innerHTML = '<option value="" disabled>Sin artículos</option>';
        } else {
            select.innerHTML = '<option value="" disabled selected>Selecciona artículo...</option>' +
                articles.map(a => `<option value="${a.id}">[${a.published ? '✅' : '⏸'}] ${a.title}</option>`).join('');
        }
    } catch (e) {
        console.error(e);
        select.innerHTML = '<option>Error</option>';
    }
}

async function handleDeleteArticle() {
    const select = document.getElementById('deleteArticleSelect');
    const id = select.value;
    if (!id) return alert('Selecciona un artículo.');
    const title = select.options[select.selectedIndex].text;
    if (!confirm(`¿Eliminar artículo?\n\n${title}`)) return;
    try {
        const res = await adminFetch(`${API}/articles/${id}`, { method: 'DELETE' });
        if (res.ok) {
            alert('Artículo eliminado.');
            loadArticlesForDelete();
        } else {
            alert('No se pudo eliminar.');
        }
    } catch (e) { console.error(e); alert('Error de conexión'); }
}

async function handleCreateArticle(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const tagsRaw = document.getElementById('artTags').value;
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

    const body = {
        title: document.getElementById('artTitle').value,
        excerpt: document.getElementById('artExcerpt').value || null,
        content: document.getElementById('artContent').value,
        author: document.getElementById('artAuthor').value || 'Redacción',
        cover_image_url: document.getElementById('artCover').value || null,
        category: document.getElementById('artCategory').value,
        tags,
        published: document.getElementById('artPublished').checked,
        featured: document.getElementById('artFeatured').checked,
    };

    try {
        const res = await adminFetch(`${API}/articles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            showSuccess('msgArticle');
            e.target.reset();
            document.getElementById('artAuthor').value = 'Redacción';
            loadArticlesForDelete();
        } else {
            const data = await res.json();
            showError(data.error || 'Error desconocido', 'errorMsgArticle', 'errorTextArticle');
        }
    } catch (err) {
        console.error(err);
        alert('Error de conexión.');
    } finally {
        btn.disabled = false;
        btn.innerText = 'PUBLICAR ARTÍCULO';
    }
}

// --- Errores ---

const showError = (text, id = 'errorMsg', errorTextId = 'errorText') => {
    const msg = document.getElementById(id);
    const errorText = document.getElementById(errorTextId);
    errorText.textContent = text;
    msg.classList.add('visible');
    setTimeout(() => msg.classList.remove('visible'), 4000);
};

const showSuccess = (id = 'msg') => {
    const msg = document.getElementById(id);
    msg.classList.add('visible');
    setTimeout(() => msg.classList.remove('visible'), 3000);
};
// ==========================================
// AI ARTICLE GENERATOR
// ==========================================
async function loadRacesForAI(year) {
    const select = document.getElementById('aiRaceSelect');
    if (!select) return;
    try {
        const res = await adminFetch(`${API}/races?year=${year}`);
        const json = await res.json();
        const races = json.data || [];
        select.innerHTML = '<option value="">Seleccionar carrera...</option>' +
            races.map(r => `<option value="${r.id}">R${r.round}: ${r.name}</option>`).join('');
    } catch (e) { console.error(e); }
}

async function handleGenerateArticle() {
    const raceId = document.getElementById('aiRaceSelect').value;
    const type = document.getElementById('aiArticleType').value;
    const status = document.getElementById('aiGenerateStatus');
    const btn = document.getElementById('btnGenerateArticle');

    if (!raceId) return alert('Seleccioná una carrera primero.');

    const typeLabels = {
        race_report: 'Crónica de Carrera',
        strategy: 'Análisis de Estrategia',
        standings: 'Actualización del Campeonato',
    };

    btn.disabled = true;
    btn.innerText = '✨ Generando...';
    status.style.display = 'block';
    status.className = 'ai-status--loading';
    status.innerHTML = `⏳ Generando <strong>${typeLabels[type]}</strong>... esto puede tardar unos segundos.`;

    try {
        const res = await adminFetch(`${API}/articles/admin/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ race_id: raceId, type }),
        });
        const json = await res.json();

        if (res.ok && json.success) {
            status.className = 'ai-status--success';
            status.innerHTML = `
                ✅ <strong>¡Borrador creado!</strong><br>
                ${json.message}<br>
                <span style="font-size:0.75rem; opacity:0.7; margin-top:4px; display:block;">
                    Tokens usados: ${json.tokens_used?.input_tokens ?? '—'} entrada · ${json.tokens_used?.output_tokens ?? '—'} salida
                </span>`;
            // Refresh selectors so the new draft appears
            loadArticlesForDelete();
            loadDraftArticles();
        } else {
            status.className = 'ai-status--error';
            status.innerHTML = `❌ ${json.error || 'Error desconocido. Intentá de nuevo.'}`;
        }
    } catch (e) {
        console.error(e);
        status.className = 'ai-status--error';
        status.innerHTML = '❌ Error de conexión con el servidor.';
    } finally {
        btn.disabled = false;
        btn.innerText = '✨ GENERAR BORRADOR';
    }
}

// ── Publicar borrador IA ──────────────────────────────────────
async function loadDraftArticles() {
    const select = document.getElementById('draftArticleSelect');
    if (!select) return;
    select.innerHTML = '<option>Cargando...</option>';
    try {
        const res = await adminFetch(`${API}/articles/admin/all`);
        const json = await res.json();
        const drafts = (json.data || []).filter(a => !a.published);
        if (!drafts.length) {
            select.innerHTML = '<option value="" disabled>Sin borradores</option>';
        } else {
            select.innerHTML = '<option value="" disabled selected>Seleccionar borrador...</option>' +
                drafts.map(a => `<option value="${a.id}">${a.title}</option>`).join('');
        }
    } catch (e) {
        console.error(e);
        select.innerHTML = '<option>Error</option>';
    }
}

async function handlePublishDraft() {
    const select = document.getElementById('draftArticleSelect');
    const msg = document.getElementById('msgPublishDraft');
    const id = select.value;
    if (!id) return alert('Seleccioná un borrador.');

    try {
        const res = await adminFetch(`${API}/articles/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ published: true }),
        });
        if (res.ok) {
            msg.style.display = 'block';
            msg.textContent = '✅ Artículo publicado correctamente.';
            loadDraftArticles();
            loadArticlesForDelete();
            setTimeout(() => { msg.style.display = 'none'; }, 4000);
        } else {
            const json = await res.json();
            alert(json.error || 'No se pudo publicar.');
        }
    } catch (e) { console.error(e); alert('Error de conexión.'); }
}
