import { fetchRaces, createRaceApi, deleteRaceApi, fetchServerImages, SERVER_URL } from './api.js';
import { showError, showSuccess } from './ui.js';

// Module-level cache of race data for the active season.
let allRacesData = [];

export const getAllRacesData = () => allRacesData;

export async function loadRaces(year) {
    const raceSelect = document.getElementById('raceSelect');
    raceSelect.innerHTML = '<option>Cargando...</option>';
    try {
        const res = await fetchRaces(year);
        const json = await res.json();
        allRacesData = json.data;
        renderRaceOptions();
    } catch (e) {
        console.error(e);
    }
}

export async function loadRacesForDelete() {
    const year = document.getElementById('deleteYearSelect').value;
    const select = document.getElementById('deleteRaceSelect');
    select.innerHTML = '<option>Cargando...</option>';
    try {
        const res = await fetchRaces(year);
        const json = await res.json();
        if (json.data.length === 0) {
            select.innerHTML = '<option value="" disabled>Sin carreras</option>';
        } else {
            select.innerHTML =
                '<option value="" disabled selected>Selecciona carrera a borrar...</option>' +
                json.data.map(r => `<option value="${r.id}">Round ${r.round}: ${r.name}</option>`).join('');
        }
    } catch (e) {
        console.error(e);
        select.innerHTML = '<option>Error</option>';
    }
}

export function renderRaceOptions() {
    const sessionType = document.getElementById('sessionType').value;
    const raceSelect = document.getElementById('raceSelect');
    const isSprintSession = sessionType === 'sprint' || sessionType === 'sprint-qualy';
    const filtered = isSprintSession ? allRacesData.filter(r => r.has_sprint) : allRacesData;

    if (filtered.length === 0) {
        raceSelect.innerHTML = '<option value="" disabled selected>No hay Sprints esta temporada</option>';
    } else {
        raceSelect.innerHTML =
            '<option value="" disabled selected>Selecciona una carrera...</option>' +
            filtered.map(r => {
                const icon = r.has_sprint ? '⚡ ' : '';
                return `<option value="${r.id}">${icon}Round ${r.round}: ${r.name}</option>`;
            }).join('');
    }
}

export async function loadServerImages() {
    try {
        const res = await fetchServerImages();
        const json = await res.json();
        if (!json.success) return;

        const { maps, circuits } = json.data;

        const mapSelect = document.getElementById('existingMapSelect');
        mapSelect.innerHTML =
            '<option value="">-- Seleccionar existente --</option>' +
            maps.map(img => `<option value="${img.url}">${img.name}</option>`).join('');

        const circuitSelect = document.getElementById('existingCircuitSelect');
        circuitSelect.innerHTML =
            '<option value="">-- Seleccionar existente --</option>' +
            circuits.map(img => `<option value="${img.url}">${img.name}</option>`).join('');

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
    } catch (e) {
        console.error('Error cargando imágenes:', e);
    }
}

export async function handleCreateRace(e) {
    e.preventDefault();
    if (!confirm('¿Crear nueva carrera?')) return;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = 'Subiendo...';

    const formData = new FormData();
    formData.append('round',         document.getElementById('newRaceRound').value);
    formData.append('country_code',  document.getElementById('newCountry').value);
    formData.append('name',          document.getElementById('newRaceName').value);
    formData.append('circuit_name',  document.getElementById('newCircuit').value);
    formData.append('date',          document.getElementById('newDate').value);
    formData.append('sprint',        document.getElementById('newHasSprint').checked);
    formData.append('circuit_length', document.getElementById('newLength').value || '');
    formData.append('total_laps',    document.getElementById('newLaps').value || 0);
    formData.append('race_distance', document.getElementById('newDistance').value || '');
    formData.append('lap_record',    document.getElementById('newRecord').value || '');

    const existingMap = document.getElementById('existingMapSelect').value;
    if (existingMap) formData.append('existing_map_image', existingMap);

    const existingCircuit = document.getElementById('existingCircuitSelect').value;
    if (existingCircuit) formData.append('existing_circuit_image', existingCircuit);

    const mapFile = document.getElementById('newMapFile');
    if (mapFile?.files[0]) formData.append('map_image', mapFile.files[0]);

    const circuitFile = document.getElementById('newCircuitImageFile');
    if (circuitFile?.files[0]) formData.append('circuit_image', circuitFile.files[0]);

    try {
        const res = await createRaceApi(formData);
        if (res.ok) {
            showSuccess('msgRace');
            loadRaces(document.getElementById('seasonSelect').value);
            e.target.reset();
            document.getElementById('newCountry').value = '';
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

export async function handleDelete() {
    const select = document.getElementById('deleteRaceSelect');
    const raceId = select.value;
    if (!raceId) return alert('Selecciona una carrera.');

    const raceText = select.options[select.selectedIndex].text;
    if (!confirm(`¿Estás seguro de eliminar: ${raceText}?\n\nSe borrarán todos los resultados asociados.`)) return;

    try {
        await deleteRaceApi(raceId);
        alert('Eliminada.');
        loadRaces(document.getElementById('seasonSelect').value);
        loadRacesForDelete();
    } catch (e) {
        console.error(e);
    }
}
