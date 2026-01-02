// Importamos los estilos directamente aquí para que Vite los procese
import './scss/admin.scss';

const API = 'http://localhost:3000/api';

// --- FUNCIONES ---
async function loadRaces(year) {
    const raceSelect = document.getElementById('raceSelect');
    const deleteRaceSelect = document.getElementById('deleteRaceSelect');

    // Poner estado de carga
    raceSelect.innerHTML = '<option>Cargando carreras...</option>';
    deleteRaceSelect.innerHTML = '<option>Cargando carreras...</option>';

    try {
        // AQUI ESTÁ LA CLAVE: Enviamos ?year=2026 al backend
        const res = await fetch(`${API}/races?year=${year}`);
        const json = await res.json();
        const races = json.data;

        const optionsHTML = '<option value="" disabled selected>Selecciona una carrera...</option>' +
            races.map(r => `<option value="${r.id}">Round ${r.round}: ${r.name}</option>`).join('');

        // Actualizamos AMBOS selectores (Carga y Borrado)
        raceSelect.innerHTML = optionsHTML;
        deleteRaceSelect.innerHTML = optionsHTML;

    } catch (error) {
        console.error('Error cargando carreras:', error);
        raceSelect.innerHTML = '<option>Error al cargar</option>';
    }
}

async function loadDrivers() {
    try {
        const res = await fetch(`${API}/drivers`);
        const drivers = (await res.json()).data;

        const driverSelect = document.getElementById('driverSelect');
        driverSelect.innerHTML = '<option value="" disabled selected>Selecciona un piloto...</option>' +
            drivers.map(d => `<option value="${d.id}">#${d.permanent_number} - ${d.last_name}</option>`).join('');
    } catch (error) {
        console.error('Error cargando pilotos:', error);
    }
}

async function handleSubmit(e) {
    e.preventDefault();

    const submitBtn = document.querySelector('.btn-submit');
    const msg = document.getElementById('msg');

    submitBtn.disabled = true;
    submitBtn.innerText = 'Guardando...';

    const data = {
        race_id: document.getElementById('raceSelect').value,
        driver_id: document.getElementById('driverSelect').value,
        position: document.getElementById('dnfInput').checked ? 0 : document.getElementById('posInput').value,
        // AGREGAR ESTA LÍNEA:
        fastest_lap: document.getElementById('fastestLapInput').checked,
        dnf: document.getElementById('dnfInput').checked,
        dsq: document.getElementById('dsqInput').checked,
        dns: document.getElementById('dnsInput').checked,
        dnq: document.getElementById('dnqInput').checked
    };

    try {
        const res = await fetch(`${API}/results`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            msg.classList.add('visible');
            setTimeout(() => msg.classList.remove('visible'), 3000);

            document.getElementById('posInput').value = '';
            document.getElementById('fastestLapInput').checked = false;
            document.getElementById('driverSelect').focus();
            document.getElementById('posInput').focus();
            document.getElementById('dnfInput').checked = false;
        } else {
            alert('Error al guardar.');
        }
    } catch (err) {
        console.error(err);
        alert('Error de conexión');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'GUARDAR RESULTADO';
    }
}

async function handleDelete() {
    const select = document.getElementById('deleteRaceSelect');
    const raceId = select.value;
    if (!raceId) return alert('Selecciona una carrera para eliminar.');

    if (confirm('¿ESTÁS SEGURO? \n\nSe borrará la carrera y todos sus resultados.')) {
        try {
            const res = await fetch(`${API}/races/${raceId}`, { method: 'DELETE' });
            if (res.ok) {
                alert('Carrera eliminada.');
                // Recargamos la lista usando el año actual seleccionado
                const currentYear = document.getElementById('seasonSelect').value;
                loadRaces(currentYear);
            } else {
                alert('Error al eliminar.');
            }
        } catch (e) { console.error(e); }
    }
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Cargar datos iniciales (Año 2025 por defecto)
    loadRaces(2025);
    loadDrivers();

    // 2. Escuchar cambios en el selector de temporada
    document.getElementById('seasonSelect').addEventListener('change', (e) => {
        const selectedYear = e.target.value;
        loadRaces(selectedYear); // Recargar lista de carreras
    });

    // 3. Listeners de formularios
    document.getElementById('resultForm').addEventListener('submit', handleSubmit);
    document.getElementById('btnDelete').addEventListener('click', handleDelete);

    // LÓGICA INTELIGENTE PARA DNF
    const statusChecks = document.querySelectorAll('.status-check');
    const posInput = document.getElementById('posInput');

    statusChecks.forEach(check => {
        check.addEventListener('change', (e) => {
            // Si marcas uno, desmarca los otros (no puedes ser DNF y DNS a la vez)
            if (e.target.checked) {
                statusChecks.forEach(c => { if (c !== e.target) c.checked = false; });

                // Bloquear posición
                posInput.value = '';
                posInput.placeholder = '---';
                posInput.disabled = true;
                posInput.required = false;
            } else {
                // Si desmarcas todo, habilitar posición
                const anyChecked = Array.from(statusChecks).some(c => c.checked);
                if (!anyChecked) {
                    posInput.placeholder = 'Ej: 1';
                    posInput.disabled = false;
                    posInput.required = true;
                }
            }
        });
    });
});