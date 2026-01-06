import './scss/styles.scss';
import { API } from './modules/config.js';
import { state } from './modules/state.js';
import { loadDriversView } from './modules/drivers.js';
import { loadCalendarView } from './modules/calendar.js';
import { loadStandingsView } from './modules/standings.js';

// --- VARIABLE GLOBAL ---
let currentRaceId = null;

// --- INIT ---
function init() {
    createModalHTML();

    // Inyectar HTML Base del Navbar
    document.body.insertAdjacentHTML('afterbegin', `
        <div id="countdown-display" style="background: #15151e; padding: 15px; border-bottom: 1px solid #333; min-height: 80px; display: flex; align-items: center; justify-content: center;">
            <span style="color:#666;">Cargando próxima carrera...</span>
        </div>
        <nav class="main-navbar">
            <div class="season-selector-container">
                <label>TEMPORADA</label>
                <select id="globalSeasonSelect" class="f1-select">
                    <option value="2025" selected>2025</option>
                    <option value="2026">2026</option>
                </select>
            </div>
            <div class="nav-buttons-group">
                <button id="btn-drivers" class="nav-btn">PILOTOS</button>
                <button id="btn-calendar" class="nav-btn">CALENDARIO</button>
                <button id="btn-standings" class="nav-btn">CAMPEONATO</button>
            </div>
        </nav>
    `);

    // Listeners del Navbar
    document.getElementById('globalSeasonSelect').addEventListener('change', (e) => {
        state.currentYear = e.target.value;
        refreshActiveView();
        initCountdown(); 
    });

    document.getElementById('btn-drivers').addEventListener('click', () => {
        updateButtons('drivers');
        loadDriversView();
    });

    document.getElementById('btn-calendar').addEventListener('click', () => {
        updateButtons('calendar');
        loadCalendarView();
    });

    document.getElementById('btn-standings').addEventListener('click', () => {
        updateButtons('standings');
        loadStandingsView();
    });

    // Carga inicial
    updateButtons('drivers');
    loadDriversView();
    initCountdown();
}

function refreshActiveView() {
    if (document.getElementById('btn-drivers').classList.contains('active-btn')) loadDriversView();
    if (document.getElementById('btn-calendar').classList.contains('active-btn')) loadCalendarView();
    if (document.getElementById('btn-standings').classList.contains('active-btn')) loadStandingsView();
}

function updateButtons(activeId) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active-btn'));
    const activeBtn = document.getElementById(`btn-${activeId}`);
    if (activeBtn) activeBtn.classList.add('active-btn');
}

// 1. MODIFICAMOS EL ANCHO DEL MODAL PARA QUE QUEPAN LAS DOS COLUMNAS
function createModalHTML() {
    if (document.getElementById('driverModal')) return;
    const modalHTML = `
        <div id="driverModal" class="modal-overlay">
            <div class="modal-content" style="background-color: inherit; max-width: 900px; width: 95%;">
                <button class="modal-close">&times;</button>
                <div class="modal-body"></div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('driverModal');
    modal.querySelector('.modal-close').addEventListener('click', () => modal.classList.remove('is-visible'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('is-visible'); });
}

async function initCountdown() {
    const container = document.getElementById('countdown-display');
    try {
        const currentYear = new Date().getFullYear();
        const res = await fetch(`${API}/races?year=${currentYear}`);
        const json = await res.json();
        
        const now = new Date();
        const nextRace = json.data.find(race => new Date(race.date) > now);

        if (!nextRace) {
            container.innerHTML = '<span style="color:#aaa;">No hay más carreras esta temporada.</span>';
            return;
        }

        const updateTimer = () => {
            const diff = new Date(nextRace.date) - new Date();
            if (diff <= 0) { container.innerHTML = '¡ES HOY! 🏁'; return; }
            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            container.innerHTML = `
                <div style="text-align:center;">
                    <span style="display:block; font-size: 0.8rem; color: #e10600; font-weight: bold; letter-spacing: 2px;">PRÓXIMA CARRERA: ${nextRace.country_code}</span>
                    <span style="font-size: 1.5rem; font-weight: bold; color: white;">${d}d ${h}h ${m}m</span>
                    <span style="display:block; font-size: 0.8rem; color: #666;">${nextRace.name}</span>
                </div>`;
        };
        updateTimer();
        setInterval(updateTimer, 60000); 
    } catch (error) { console.error("Error countdown:", error); }
}

// ==================================================================================
// --- DISEÑO DE DOS COLUMNAS (IMAGEN IZQ / INFO DER) ---
// ==================================================================================

async function openRaceModal(raceId) {
    currentRaceId = raceId;
    const modal = document.getElementById('driverModal');
    const modalBody = modal.querySelector('.modal-body');

    modalBody.innerHTML = '<div style="padding:50px; text-align:center; color:white;">Cargando circuito...</div>';
    modal.classList.add('is-visible');

    try {
        const res = await fetch(`${API}/races/${raceId}`);
        const json = await res.json();
        const race = json.data;

        // Estilos para los bloques de datos (Columna Derecha)
        const statBoxStyle = `
            background: rgba(255,255,255,0.05); 
            border: 1px solid rgba(255,255,255,0.1); 
            border-radius: 8px; 
            padding: 12px 15px;
            display: flex;
            flex-direction: column;
        `;
        const labelStyle = "font-size: 0.7rem; color: #aaa; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; margin-bottom: 4px;";
        const valueStyle = "font-size: 1.2rem; font-weight: 800; color: #fff;";

        modalBody.innerHTML = `
            <div style="text-align:center; margin-bottom: 25px; border-bottom: 1px solid #333; padding-bottom: 15px;">
                <h2 style="color:#e10600; text-transform:uppercase; font-size: 1.8rem; margin: 0;">${race.name}</h2>
                <span style="color:#888; font-size: 0.9rem;">Round ${race.round} • ${race.circuit_name}</span>
            </div>

            <div style="display: flex; gap: 25px; align-items: stretch; margin-bottom: 30px; flex-wrap: wrap;">
                
                <div style="flex: 3; min-width: 300px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); border-radius: 12px; padding: 10px;">
                    <img src="${race.map_image_url}" alt="Circuit Map" style="width: 100%; height: auto; filter: drop-shadow(0 0 8px rgba(255,255,255,0.1));">
                </div>

                <div style="flex: 2; min-width: 200px; display: flex; flex-direction: column; gap: 10px; justify-content: center;">
                    
                    <div style="${statBoxStyle}">
                        <span style="${labelStyle}">Longitud</span>
                        <span style="${valueStyle}">${race.circuit_length || '-'}</span>
                    </div>

                    <div style="${statBoxStyle}">
                        <span style="${labelStyle}">Vueltas</span>
                        <span style="${valueStyle}">${race.total_laps || '-'}</span>
                    </div>

                    <div style="${statBoxStyle}">
                        <span style="${labelStyle}">Distancia</span>
                        <span style="${valueStyle}">${race.race_distance || '-'}</span>
                    </div>

                    <div style="${statBoxStyle}">
                        <span style="${labelStyle}">Récord</span>
                        <span style="${valueStyle} font-size: 1rem;">${race.lap_record || '-'}</span>
                    </div>

                </div>
            </div>

            <div class="tabs-container" style="text-align:center; border-top: 1px solid #333; padding-top: 20px;">
                <div style="margin-bottom: 15px;">
                    <button id="btnRace" class="nav-btn active-btn" onclick="loadSession('race')">CARRERA</button>
                    <button id="btnQualy" class="nav-btn" onclick="loadSession('qualifying')">CLASIFICACIÓN</button>
                </div>
                
                <div id="resultsTableContainer">
                    <p style="text-align:center; color:#666;">Cargando resultados...</p>
                </div>
            </div>
        `;

        loadSession('race');

    } catch (e) {
        console.error(e);
        modalBody.innerHTML = '<p style="color:red; text-align:center;">Error cargando datos.</p>';
    }
}

// 2. FUNCIÓN DE TABLA (Sigue igual que antes)
async function loadSession(type) {
    const container = document.getElementById('resultsTableContainer');
    
    document.querySelectorAll('.tabs-container .nav-btn').forEach(b => b.classList.remove('active-btn'));
    if(type === 'race') document.getElementById('btnRace').classList.add('active-btn');
    if(type === 'qualifying') document.getElementById('btnQualy').classList.add('active-btn');

    container.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">Cargando...</div>';

    try {
        const endpoint = type === 'race' ? 'results' : 'qualifying';
        const res = await fetch(`${API}/races/${currentRaceId}/${endpoint}`);
        const json = await res.json();
        const data = json.data || [];

        if (data.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:30px; color:#666;">⏳ No hay datos de ${type === 'race' ? 'Carrera' : 'Clasificación'}.</div>`;
            return;
        }

        let html = `
            <table style="width:100%; border-collapse: collapse; font-size: 0.9rem;">
                <thead>
                    <tr style="border-bottom: 2px solid #333; color: #666; font-size: 0.75rem; text-transform:uppercase;">
                        <th style="padding:10px; text-align:center;">Pos</th>
                        <th style="padding:10px; text-align:left;">Piloto</th>
                        ${type === 'race' ? '<th style="padding:10px; text-align:center;">Pts</th>' : ''}
                    </tr>
                </thead>
                <tbody>
        `;

        data.forEach(r => {
            const teamColor = r.primary_color || '#fff';
            html += `
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding:12px; text-align:center; font-weight:bold;">${r.position}</td>
                    <td style="padding:12px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:3px; height:20px; background:${teamColor};"></div>
                            <div>
                                <span style="display:block; font-weight:bold; color:#fff;">${r.first_name} ${r.last_name}</span>
                                <span style="font-size:0.75rem; color:#888;">${r.team_name}</span>
                            </div>
                        </div>
                    </td>
                    ${type === 'race' ? `<td style="padding:12px; text-align:center; font-weight:bold; color:#00ff88;">+${r.points}</td>` : ''}
                </tr>
            `;
        });
        html += `</tbody></table>`;
        container.innerHTML = html;

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar la tabla.</p>';
    }
}

// EXPORTAR GLOBALES
window.openRaceModal = openRaceModal;
window.loadSession = loadSession;

init();