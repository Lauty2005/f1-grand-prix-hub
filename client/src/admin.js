import './scss/admin.scss';
import { checkAuthApi, loginApi, logoutApi } from './admin/api.js';
import { loadRaces, loadRacesForDelete, loadServerImages, handleCreateRace, handleDelete, renderRaceOptions } from './admin/races.js';
import { loadDrivers, loadDriversForDelete, loadTeams, loadCountryOptions, handleCreateDriver, handleDeleteDriver } from './admin/drivers.js';
import { handleSubmit, handleDeleteSpecificResult, updateFormFields } from './admin/results.js';

// ─── Auth ──────────────────────────────────────────────────────────────────

async function checkAuth() {
    try {
        const res = await checkAuthApi();
        const authenticated = res.ok;
        document.getElementById('loginOverlay').style.display = authenticated ? 'none' : 'flex';
        return authenticated;
    } catch {
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
        const res = await loginApi(password);
        if (res.ok) {
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('loginError').style.display = 'none';
            loadInitialData();
        } else {
            document.getElementById('loginError').style.display = 'block';
        }
    } catch {
        alert('Error contactando al servidor');
    } finally {
        btn.innerText = 'INGRESAR';
    }
});

// ─── Boot ──────────────────────────────────────────────────────────────────

function loadInitialData() {
    const year = document.getElementById('seasonSelect').value || 2025;
    loadRaces(year);
    loadRacesForDelete();
    loadDrivers();
    loadDriversForDelete();
    loadTeams();
    loadCountryOptions();
    loadServerImages();
}

// ─── DOMContentLoaded ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const authenticated = await checkAuth();
    if (authenticated) loadInitialData();

    document.getElementById('btnLogout')?.addEventListener('click', async () => {
        try { await logoutApi(); } catch { /* ignore */ }
        finally {
            document.getElementById('loginOverlay').style.display = 'flex';
            document.getElementById('adminPassword').value = '';
            document.getElementById('loginError').style.display = 'none';
        }
    });

    document.getElementById('deleteYearSelect').addEventListener('change', loadRacesForDelete);
    document.getElementById('deleteDriverYearSelect').addEventListener('change', loadDriversForDelete);

    document.getElementById('resultForm').addEventListener('submit', handleSubmit);
    document.getElementById('btnDelete').addEventListener('click', handleDelete);
    document.getElementById('btnDeleteDriver').addEventListener('click', handleDeleteDriver);
    document.getElementById('newRaceForm').addEventListener('submit', handleCreateRace);
    document.getElementById('newDriverForm').addEventListener('submit', handleCreateDriver);
    document.getElementById('btnDeleteResult').addEventListener('click', handleDeleteSpecificResult);

    document.getElementById('seasonSelect').addEventListener('change', (e) => {
        loadRaces(e.target.value);
        loadDrivers();
    });

    document.getElementById('sessionType').addEventListener('change', () => {
        updateFormFields();
        renderRaceOptions();
    });

    updateFormFields();
});
