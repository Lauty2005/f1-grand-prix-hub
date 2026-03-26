import { fetchDrivers, createDriverApi, deleteDriverApi, fetchTeams } from './api.js';
import { COUNTRY_NAMES } from '../modules/utils.js';
import { showError, showSuccess } from './ui.js';

export async function loadDrivers() {
    const year = document.getElementById('seasonSelect').value;
    try {
        const res = await fetchDrivers(year);
        const json = await res.json();
        const drivers = [...json.data].sort((a, b) => a.last_name.localeCompare(b.last_name));

        const options =
            '<option value="" disabled selected>Selecciona un piloto...</option>' +
            drivers.map(d => `<option value="${d.id}">#${d.permanent_number} - ${d.last_name}</option>`).join('');

        document.getElementById('driverSelect').innerHTML = options;
    } catch (e) {
        console.error(e);
    }
}

export async function loadDriversForDelete() {
    const year = document.getElementById('deleteDriverYearSelect').value;
    const select = document.getElementById('deleteDriverSelect');
    select.innerHTML = '<option>Cargando...</option>';
    try {
        const res = await fetchDrivers(year);
        const json = await res.json();
        const drivers = [...json.data].sort((a, b) => a.last_name.localeCompare(b.last_name));

        if (drivers.length === 0) {
            select.innerHTML = '<option value="" disabled>Sin pilotos activos este año</option>';
        } else {
            select.innerHTML =
                '<option value="" disabled selected>Selecciona piloto a borrar...</option>' +
                drivers.map(d => `<option value="${d.id}">#${d.permanent_number} - ${d.last_name}</option>`).join('');
        }
    } catch (e) {
        console.error(e);
        select.innerHTML = '<option>Error</option>';
    }
}

export async function loadTeams() {
    try {
        const res = await fetchTeams();
        const json = await res.json();
        const select = document.getElementById('newDriverTeam');
        select.innerHTML =
            '<option value="">Elegir Equipo...</option>' +
            json.data.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    } catch (e) {
        console.error(e);
    }
}

export function loadCountryOptions() {
    const sorted = Object.entries(COUNTRY_NAMES).sort((a, b) => a[1].localeCompare(b[1]));
    const optionsHTML =
        '<option value="" disabled selected>Selecciona...</option>' +
        sorted.map(([code, name]) => `<option value="${code}">${name} (${code})</option>`).join('');

    const raceSelect = document.getElementById('newCountry');
    if (raceSelect) raceSelect.innerHTML = optionsHTML;

    const driverSelect = document.getElementById('newDriverCountry');
    if (driverSelect) driverSelect.innerHTML = optionsHTML;
}

export async function handleCreateDriver(e) {
    e.preventDefault();
    if (!confirm('¿Crear nuevo piloto?')) return;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = 'Subiendo...';

    const formData = new FormData();
    formData.append('first_name', document.getElementById('newDriverName').value);
    formData.append('last_name',  document.getElementById('newDriverLastname').value);
    formData.append('number',     document.getElementById('newDriverNum').value);
    formData.append('country',    document.getElementById('newDriverCountry').value);
    formData.append('team_id',    document.getElementById('newDriverTeam').value);

    const fileInput = document.getElementById('newDriverFile');
    if (fileInput.files[0]) formData.append('profile_image', fileInput.files[0]);

    const activeSeasons = [];
    if (document.getElementById('season2025').checked) activeSeasons.push('2025');
    if (document.getElementById('season2026').checked) activeSeasons.push('2026');
    formData.append('seasons', activeSeasons.join(','));

    try {
        const res = await createDriverApi(formData);
        if (res.ok) {
            showSuccess('msgDriver');
            loadDrivers();
            loadTeams();
            e.target.reset();
            document.getElementById('newDriverCountry').value = '';
            document.getElementById('newDriverTeam').value = '';
        } else {
            const data = await res.json();
            showError(data.error || 'Error desconocido', 'errorMsgDriver', 'errorTextDriver');
        }
    } catch (err) {
        console.error(err);
        alert('Error de conexión.');
    } finally {
        btn.disabled = false;
        btn.innerText = 'AGREGAR PILOTO';
    }
}

export async function handleDeleteDriver() {
    const select = document.getElementById('deleteDriverSelect');
    const driverId = select.value;
    if (!driverId) return alert('Selecciona un piloto para eliminar.');

    if (!confirm('⚠️ ¿ESTÁS SEGURO?\n\nSe borrará al piloto Y TODOS SUS RESULTADOS históricos.\nEsta acción no se puede deshacer.')) return;

    try {
        const res = await deleteDriverApi(driverId);
        if (res.ok) {
            alert('✅ Piloto eliminado.');
            loadDrivers();
        } else {
            showError('No se pudo eliminar. Intentá de nuevo.');
        }
    } catch (e) {
        console.error(e);
        alert('Error de conexión');
    }
}
