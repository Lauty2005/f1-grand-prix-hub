import { API, SERVER_URL } from '../modules/config.js';

// Wraps fetch to always send credentials (HttpOnly cookies).
export const adminFetch = (url, options = {}) =>
    fetch(url, { ...options, credentials: 'include', headers: { ...options.headers } });

// --- Auth ---
export const checkAuthApi    = () => adminFetch(`${API}/auth/check`);
export const loginApi        = (password) => adminFetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
});
export const logoutApi       = () => adminFetch(`${API}/auth/logout`, { method: 'POST' });

// --- Races ---
export const fetchRaces      = (year) => adminFetch(`${API}/races?year=${year}`);
export const createRaceApi   = (formData) => adminFetch(`${API}/races`, { method: 'POST', body: formData });
export const deleteRaceApi   = (id) => adminFetch(`${API}/races/${id}`, { method: 'DELETE' });
export const fetchServerImages = () => adminFetch(`${API}/races/images/list`);

// --- Drivers ---
export const fetchDrivers    = (year) => adminFetch(`${API}/drivers?year=${year}`);
export const createDriverApi = (formData) => adminFetch(`${API}/drivers`, { method: 'POST', body: formData });
export const deleteDriverApi = (id) => adminFetch(`${API}/drivers/${id}`, { method: 'DELETE' });
export const fetchTeams      = () => adminFetch(`${API}/drivers/teams/list`);

// --- Results ---
export const postResultApi   = (endpoint, body) => adminFetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});
export const deleteResultApi = (endpoint) => adminFetch(`${API}${endpoint}`, { method: 'DELETE' });

export { SERVER_URL };
