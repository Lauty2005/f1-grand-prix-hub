import './scss/styles.scss';

// --- CONFIGURACIÓN ---
const API = 'http://localhost:3000/api';
const app = document.querySelector('#app');

let driversList = [];
let currentYear = 2025;
let currentStandingsTab = 'drivers';

// Diccionario de banderas (reutilizamos esto)
const countryCodes = { 
    'NED': 'nl', 
    'MEX': 'mx', 
    'MON': 'mc', 
    'GBR': 'gb', 
    'ESP': 'es', 
    'AUS': 'au', 
    'JPN': 'jp', 
    'BHR': 'bh', 
    'SAU': 'sa', 
    'CHN': 'cn',
    'USA': 'us',
    'ITA': 'it',
    'ABU': 'ae',
    'CAN': 'ca',
    'ATN': 'at',
    'BEL': 'be',
    'HUN': 'hu',
    'AZB': 'az',
    'SIN': 'sg',
    'BRZ': 'br',
    'QAT': 'qa',
    'TAI': 'th',
    'NZE': 'nz',
    'FRA': 'fr',
    'GER': 'de',
    'ARG': 'ar'
};

function getFlagEmoji(code) {
    const cc = countryCodes[code];
    return cc ? `<img src="https://flagcdn.com/w40/${cc}.png" class="flag-icon" style="width:25px; display:inline-block;">` : '';
}

// Helper para decidir qué mostrar en la posición
function getPositionBadge(r, color) {
    // CAMBIO AQUÍ: Ahora dice 'DQ' en lugar de 'DSQ'
    if (r.dsq) return '<span style="background:black; color:white; padding:4px 8px; border-radius:4px; font-weight:bold; border:1px solid white; font-size:0.9rem;">DQ</span>';
    
    if (r.dns) return '<span style="background:#333; color:white; padding:4px 8px; border-radius:4px; font-weight:bold; border:1px solid #666; font-size:0.9rem;">DNS</span>';
    if (r.dnq) return '<span style="background:#333; color:white; padding:4px 8px; border-radius:4px; font-weight:bold; border:1px solid #666; font-size:0.9rem;">DNQ</span>';
    if (r.dnf) return '<span style="background:rgba(255,0,0,0.2); color:#ff4444; padding:4px 8px; border-radius:4px; font-weight:bold; border:1px solid #ff4444; font-size:0.9rem;">NC</span>';

    // Si es una posición normal:
    return `<span style="
        background: ${r.position == 1 ? '#FFD700' : (r.position <= 3 ? '#C0C0C0' : 'rgba(255,255,255,0.1)')}; 
        color: ${r.position <= 3 ? 'black' : 'white'}; 
        padding: 4px 12px; 
        border-radius: 4px; 
        font-weight: bold;
        border: ${r.position > 3 ? `1px solid ${color}` : 'none'};
    ">P${r.position}</span>`;
}

// --- INIT ---

function init() {
    createModalHTML();

    // INYECTAMOS LA BARRA DE NAVEGACIÓN (NAVBAR)
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

    // --- LÓGICA DE EVENTOS ---

    // 1. Cuando cambian el año en el select
    document.getElementById('globalSeasonSelect').addEventListener('change', (e) => {
        currentYear = e.target.value; // Actualizamos la variable global
        
        // Recargamos la vista que esté activa en ese momento
        if (document.getElementById('btn-drivers').classList.contains('active-btn')) loadDriversView();
        if (document.getElementById('btn-calendar').classList.contains('active-btn')) loadCalendarView();
        if (document.getElementById('btn-standings').classList.contains('active-btn')) loadStandingsView();
        
        // También actualizamos el contador
        initCountdown(); 
    });

    // 2. Botones del menú
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

// --- VISTA: PILOTOS (Tu código anterior, resumido) ---
async function loadDriversView() {
    updateButtons('drivers');
    app.innerHTML = '<h2 style="text-align:center; color:white;">Cargando parrilla...</h2>';

    try {
        const res = await fetch(`${API}/drivers?year=${currentYear}`);
        const result = await res.json();

        // VALIDACIÓN DE SEGURIDAD
        if (!result.success || !result.data) {
            console.error('Error del servidor:', result);
            app.innerHTML = '<h3 style="color:red; text-align:center; margin-top:50px;">Error al cargar los datos del servidor. Revisa la terminal.</h3>';
            return; // Detenemos aquí para que no intente hacer .map()
        }

        // 1. Guardamos los datos en la variable global para usarlos en el modal
        driversList = result.data;

        // 2. Renderizamos las tarjetas
        const html = result.data.map(d => `
            <article class="driver-card" data-id="${d.id}" style="border-top: 4px solid ${d.primary_color}; cursor: pointer;">
                <div class="driver-card__image-container">
                        <img src="${d.profile_image_url}" class="driver-card__image" alt="${d.last_name}">
                </div>

                <div class="driver-card__info" style="position: relative;">

                    <h3>${d.first_name} ${d.last_name}</h3>

                    <div style="display: flex; justify-content: space-between;">
                        <p style="color:${d.primary_color}; display: flex; align-items: center; gap: 8px;">
                            <span class="teamLogo" style="background-color: ${d.primary_color};">
                                <img src="${d.logo_url}" alt="${d.team_name}" role="presentation">
                            </span>
                            ${d.team_name}
                        </p>
                        <span style="font-size: 2.5rem; font-weight: 900; color: ${d.primary_color}; line-height: 1;">
                                ${d.permanent_number}
                        </span>
                    </div>
                </div>
            </article>
        `).join('');

        app.innerHTML = `<div class="driver-grid">${html}</div>`;

        // 3. Reactivamos los clicks
        document.querySelectorAll('.driver-card').forEach(card => {
            card.addEventListener('click', () => {
                openDriverModal(card.dataset.id); // Llamamos a la función específica de pilotos
            });
        });

    } catch (e) {
        console.error(e);
        app.innerHTML = '<h3 style="color:red; text-align:center">Error cargando pilotos</h3>';
    }
}

async function openDriverModal(id) {
    const driver = driversList.find(d => d.id == id);
    if (!driver) return;

    const modal = document.getElementById('driverModal');
    const modalBody = modal.querySelector('.modal-body');
    modal.classList.add('is-visible');

    // 1. Obtener historial desde el Backend
    let historyRows = '<p style="text-align:center; color:#666;">Cargando historial...</p>';

    try {
        const res = await fetch(`http://localhost:3000/api/drivers/${id}/results`);
        const json = await res.json();
        const history = json.data;
        
        if (history.length > 0) {
            // Generamos la lista de carreras
            historyRows = `
                <div style="max-height: 200px; overflow-y: auto; padding-right: 5px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        ${history.map(r => `
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                <td style="padding: 12px 0; color: #aaa; font-size: 0.9rem;">R${r.round}</td>
                                <td style="padding: 12px 10px; color: white; font-weight: bold;">${r.race_name}</td>
                                <td style="text-align: right;">
                                    <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                                        
                                        ${getPositionBadge(r, driver.primary_color)}

                                        ${r.fastest_lap && !r.dnf ? `
                                            <span title="Vuelta Rápida" style="
                                                background: #3b0a4a; 
                                                color: #d4a5ff; 
                                                border: 1px solid #a01dd6;
                                                border-radius: 50%; 
                                                width: 24px; 
                                                height: 24px; 
                                                display: flex; 
                                                align-items: center; 
                                                justify-content: center;
                                                font-size: 0.8rem;
                                            ">⏱️</span>
                                        ` : ''}

                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            `;
        } else {
            historyRows = '<p style="text-align:center; color:#666; margin-top: 20px;">Aún no ha corrido esta temporada.</p>';
        }

    } catch (e) {
        console.error("Error cargando historial", e);
        historyRows = '<p style="color:red;">Error de conexión</p>';
    }
    
    // 2. Renderizar el HTML Completo
    modalBody.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center;">
            <img src="${driver.profile_image_url}" style="width: 200px; height: 200px; object-fit: cover; object-position: top; border-radius: 50%; border: 4px solid ${driver.primary_color}; margin-bottom: 15px; background: rgba(255,255,255,0.05);">
            
            <h2 style="color: ${driver.primary_color}; font-size: 2rem; margin: 0;">${driver.first_name} ${driver.last_name}</h2>
            <p style="color: #aaa; display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom: 20px;">
                <img src="${driver.logo_url}" style="width: 20px;"> ${driver.team_name} | ${getFlagEmoji(driver.country_code)}
            </p>

            <div style="display: flex; justify-content: center; gap: 30px; margin-bottom: 30px; border-bottom: 1px solid #333; padding-bottom: 20px;">
                <div><span style="font-size: 1.5rem; font-weight:bold; color:white;">${driver.permanent_number}</span><br><span style="font-size:0.7rem; color:#666;">NÚMERO</span></div>
                <div><span style="font-size: 1.5rem; font-weight:bold; color:white;">${driver.podiums}</span><br><span style="font-size:0.7rem; color:#666;">PODIOS</span></div>
                <div><span style="font-size: 1.5rem; font-weight:bold; color:#e10600;">${driver.points}</span><br><span style="font-size:0.7rem; color:#666;">PUNTOS</span></div>
            </div>

            <div style="text-align: left;">
                <h4 style="color:white; margin-bottom:10px; border-left: 3px solid ${driver.primary_color}; padding-left: 10px;">Resumen de Temporada</h4>
                ${historyRows}
            </div>
        </div>
    `;
}

// --- VISTA: CALENDARIO (Versión Limpia) ---
async function loadCalendarView() {
    const app = document.querySelector('#app');
    
    // 1. Mostrar estado de carga
    app.innerHTML = '<h2 style="text-align:center; color:white; margin-top:50px;">Cargando calendario...</h2>';

    try {
        // 2. Pedir datos al servidor usando el AÑO GLOBAL (currentYear)
        const res = await fetch(`${API}/races?year=${currentYear}`);
        const result = await res.json();

        // Si no hay carreras o hubo error en datos
        if (!result.success || !result.data || result.data.length === 0) {
            app.innerHTML = `
                <div style="text-align:center; margin-top:50px;">
                    <h1 style="color:white;">CALENDARIO ${currentYear}</h1>
                    <h3 style="color:#666;">No hay carreras registradas para este año.</h3>
                </div>`;
            return;
        }

        // 3. Generar HTML de las tarjetas
        const cardsHtml = result.data.map(race => {
            const dateObj = new Date(race.date);
            // Truco para ajustar zona horaria y que no salga un día antes
            const userTimezoneOffset = dateObj.getTimezoneOffset() * 60000;
            const adjustedDate = new Date(dateObj.getTime() + userTimezoneOffset);
            
            const month = adjustedDate.toLocaleString('es-ES', { month: 'short' }).toUpperCase();
            const day = adjustedDate.getDate(); 
            
            return `
                <div class="race-card" data-id="${race.id}" data-sprint="${race.has_sprint || false}" style="cursor: pointer;">
                    <div class="race-card__date">
                        <span>${month}</span>
                        <span>${day}</span>
                    </div>
                    <div class="race-card__info">
                        <h3>Round ${race.round}: ${race.name}</h3>
                        <p>${getFlagEmoji(race.country_code)} ${race.circuit_name}</p>
                    </div>
                    <img src="${race.map_image_url}" class="race-card__map" data-map="${race.map_image_url}">
                </div>
            `;
        }).join('');

        // 4. Pintar el HTML final (SIN el selector antiguo)
        app.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; margin-bottom: 20px;">
                <h1 style="text-align:center; color:white; margin-bottom:10px;">CALENDARIO ${currentYear}</h1>
            </div>
            <div class="race-grid">${cardsHtml}</div>
        `;

        // 5. Activar los clicks en las tarjetas (ESTO SÍ SE QUEDA)
        document.querySelectorAll('.race-card').forEach(card => {
            card.addEventListener('click', () => {
                const mapUrl = card.querySelector('.race-card__map').dataset.map;
                const hasSprint = card.dataset.sprint === 'true'; // Leemos si es sprint
                // Llamamos a openRaceModal pasando el 3er parámetro
                openRaceModal(card.dataset.id, mapUrl, hasSprint);
            });
        });

    } catch (e) {
        console.error(e);
        app.innerHTML = '<h3 style="color:red; text-align:center; margin-top:50px;">Error cargando calendario. Revisa la consola.</h3>';
    }
}

async function openRaceModal(raceId, mapUrl, hasSprint) {
    const modal = document.getElementById('driverModal');
    const modalBody = modal.querySelector('.modal-body');
    modal.classList.add('is-visible');

    // DEFINIMOS LOS BOTONES SEGÚN EL FORMATO
    let tabsHTML = '';

    if (hasSprint) {
        // --- FORMATO SPRINT (5 Pestañas) ---
        tabsHTML = `
            <button class="tab-btn" onclick="loadTab('practices', ${raceId})">FP1</button>
            <button class="tab-btn" onclick="loadTab('sprint-qualy', ${raceId})">SPRINT QUALY</button>
            <button class="tab-btn" onclick="loadTab('sprint', ${raceId})">SPRINT</button>
            <button class="tab-btn" onclick="loadTab('qualy', ${raceId})">CLASIF.</button>
            <button class="tab-btn active" onclick="loadTab('race', ${raceId})">CARRERA</button>
        `;
    } else {
        // --- FORMATO NORMAL (3 Pestañas) ---
        tabsHTML = `
            <button class="tab-btn" onclick="loadTab('practices', ${raceId})">PRÁCTICAS</button>
            <button class="tab-btn" onclick="loadTab('qualy', ${raceId})">CLASIFICACIÓN</button>
            <button class="tab-btn active" onclick="loadTab('race', ${raceId})">CARRERA</button>
        `;
    }

    modalBody.innerHTML = `
        <img src="${mapUrl}" style="margin-bottom: 10px;">
        
        <div class="tabs-container" style="overflow-x: auto; white-space: nowrap; padding-bottom:5px;">
            ${tabsHTML}
        </div>

        <div id="tab-content" style="min-height: 200px;">
            <h3 style="color:white; padding:20px;">Cargando...</h3>
        </div>
    `;

    // INICIALIZAMOS EL ROUTER DE PESTAÑAS
    window.loadTab = (type, id) => {
        // 1. Gestionar estilo "Active"
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            // Lógica para resaltar el botón correcto
            const text = btn.innerText;
            if (type === 'race' && text === 'CARRERA') btn.classList.add('active');
            if (type === 'qualy' && (text === 'CLASIFICACIÓN' || text === 'CLASIF.')) btn.classList.add('active');
            if (type === 'practices' && (text === 'PRÁCTICAS' || text === 'FP1')) btn.classList.add('active');
            if (type === 'sprint' && text === 'SPRINT') btn.classList.add('active');
            if (type === 'sprint-qualy' && text === 'SPRINT QUALY') btn.classList.add('active');
        });

        // 2. Cargar contenido
        if (type === 'race') loadRaceResults(id);
        if (type === 'qualy') loadQualyResults(id);
        if (type === 'sprint') loadSprintResults(id);

        // Casos Especiales para Sprint
        if (type === 'practices') loadPracticesResults(id, hasSprint); // Pasamos hasSprint para saber si mostrar solo FP1
        if (type === 'sprint-qualy') loadSprintQualyResults(id);
    };

    // Cargar carrera por defecto
    window.loadTab('race', raceId);
}

async function loadRaceResults(raceId) {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<h3 style="color:white; text-align:center; padding-top:20px;">Cargando Carrera...</h3>';

    try {
        const res = await fetch(`http://localhost:3000/api/races/${raceId}/results`);
        const json = await res.json();

        if (!json.success || json.data.length === 0) {
            container.innerHTML = '<p style="color:#aaa; text-align:center; padding:20px;">No hay resultados de carrera aún.</p>';
            return;
        }

        const rows = json.data.map(r => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                <td style="padding:10px; font-weight:bold; text-align:center;">
                    ${getPositionBadge(r, r.primary_color)}
                </td>
                
                <td style="padding:10px; text-align:left;">
                    <span style="display:block; font-weight:bold; color:white;">${r.first_name} ${r.last_name}</span>
                    <span style="font-size:0.8rem; color:${r.primary_color};">${r.team_name}</span>
                </td>
                
                <td style="padding:10px; color:#e10600; font-weight:bold;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                        
                        ${r.fastest_lap ? `
                            <span title="Vuelta Rápida" style="
                                font-size: 0.8rem;
                                background: #3b0a4a;
                                color: #d4a5ff;
                                border-radius: 50%;
                                border: 1px solid #a01dd6;
                                display: flex; align-items: center; justify-content: center;
                                width: 22px; height: 22px;
                            ">⏱️</span>
                        ` : ''}

                        +${r.points}
                    </div>
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div style="padding-right: 5px;"> 
                <table class="results-table" style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #15151e; z-index: 1;">
                        <tr style="color:#666; font-size:0.8rem; border-bottom: 1px solid #333;">
                            <th style="padding:10px;">POS</th>
                            <th style="text-align:left; padding:10px;">PILOTO</th>
                            <th style="padding:10px;">PTS</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (e) { 
        console.error(e);
        container.innerHTML = '<p style="color:red; text-align:center; padding:20px;">Error de conexión</p>'; 
    }
}

// --- SUB-FUNCIÓN: Cargar Clasificación (NUEVA) ---
async function loadQualyResults(raceId) {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<h3 style="color:white;">Cargando Qualy...</h3>';

    try {
        const res = await fetch(`http://localhost:3000/api/races/${raceId}/qualifying`);
        const json = await res.json();

        if (!json.success || json.data.length === 0) {
            container.innerHTML = '<p style="color:#aaa;">No hay datos de Qualy.</p>';
            return;
        }

        const rows = json.data.map(r => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                <td style="padding:10px; font-weight:bold;">${r.position}</td>
                <td style="padding:10px; text-align:left; color:white;">${r.last_name} <span style="font-size:0.8rem; color:${r.primary_color}">(${r.team_name.substring(0, 3)})</span></td>
                <td style="padding:5px; font-family:monospace; color:#aaa;">${r.q1 || '-'}</td>
                <td style="padding:5px; font-family:monospace; color:#ccc;">${r.q2 || '-'}</td>
                <td style="padding:5px; font-family:monospace; color:#e10600; font-weight:bold;">${r.q3 || '-'}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table class="results-table" style="font-size:0.9rem;">
                    <thead>
                        <tr style="color:#666; font-size:0.7rem;">
                            <th>POS</th>
                            <th style="text-align:left;">PILOTO</th>
                            <th>Q1</th>
                            <th>Q2</th>
                            <th>Q3</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (e) { container.innerHTML = '<p style="color:red;">Error de conexión</p>'; }
}

// --- SUB-FUNCIÓN: Cargar Prácticas (INTELIGENTE) ---
async function loadPracticesResults(raceId, isSprint = false) {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<h3 style="color:white; padding: 20px;">⏱️ Cargando Prácticas...</h3>';

    try {
        const res = await fetch(`http://localhost:3000/api/races/${raceId}/practices`);
        const json = await res.json();

        // Validación: Si no hay datos
        if (!json.success || json.data.length === 0) {
            container.innerHTML = '<p style="color:#aaa; padding: 20px;">No hay datos de Prácticas registrados.</p>';
            return;
        }

        // --- CASO 1: ES FIN DE SEMANA SPRINT (Solo mostramos FP1) ---
        if (isSprint) {
            const rows = json.data.map(r => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <td style="padding:10px; text-align:left; color:white;">
                        ${r.last_name} 
                        <span style="font-size:0.8rem; color:${r.primary_color}">(${r.team_name.substring(0, 3)})</span>
                    </td>
                    <td style="padding:5px; font-family:monospace; color:#fff; font-weight:bold;">${r.p1 || '-'}</td>
                </tr>
            `).join('');

            container.innerHTML = `
                <div style="overflow-x:auto;">
                    <h4 style="color:#aaa; text-align:left; margin-bottom: 10px; font-size: 0.9rem;">PRÁCTICA LIBRE 1 (ÚNICA SESIÓN)</h4>
                    <table class="results-table" style="font-size:0.9rem;">
                        <thead>
                            <tr style="color:#666; font-size:0.7rem;">
                                <th style="text-align:left;">PILOTO</th>
                                <th>TIEMPO</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
            return; // Terminamos aquí para no ejecutar el código de abajo
        }

        // --- CASO 2: ES FIN DE SEMANA NORMAL (FP1, FP2, FP3) ---
        const rows = json.data.map(r => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                <td style="padding:10px; text-align:left; color:white;">
                    ${r.last_name} 
                    <span style="font-size:0.8rem; color:${r.primary_color}">(${r.team_name.substring(0, 3)})</span>
                </td>
                <td style="padding:5px; font-family:monospace; color:#ccc;">${r.p1 || '-'}</td>
                <td style="padding:5px; font-family:monospace; color:#ccc;">${r.p2 || '-'}</td>
                <td style="padding:5px; font-family:monospace; color:#fff; font-weight:bold;">${r.p3 || '-'}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table class="results-table" style="font-size:0.9rem;">
                    <thead>
                        <tr style="color:#666; font-size:0.7rem;">
                            <th style="text-align:left;">PILOTO</th>
                            <th>FP1</th>
                            <th>FP2</th>
                            <th>FP3</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:red; padding: 20px;">Error de conexión con el servidor.</p>';
    }
}

async function loadSprintResults(raceId) {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<h3 style="color:white;">Cargando Sprint...</h3>';

    try {
        const res = await fetch(`http://localhost:3000/api/races/${raceId}/sprint`);
        const json = await res.json();

        if (!json.success || json.data.length === 0) {
            container.innerHTML = '<p style="color:#aaa;">No hay resultados de Sprint.</p>';
            return;
        }

        const rows = json.data.map(r => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                <td style="padding:10px; font-weight:bold;">${r.position}</td>
                <td style="padding:10px; text-align:left; color:white;">
                    ${r.last_name} 
                    <span style="font-size:0.8rem; color:${r.primary_color}">(${r.team_name.substring(0, 3)})</span>
                </td>
                <td style="padding:10px; color:#ccc;">${r.time_gap}</td>
                <td style="padding:10px; color:#e10600; font-weight:bold;">+${r.points}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table class="results-table" style="font-size:0.9rem;">
                    <thead>
                        <tr style="color:#666; font-size:0.7rem;">
                            <th>POS</th>
                            <th style="text-align:left;">PILOTO</th>
                            <th>GAP</th>
                            <th>PTS</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (e) { container.innerHTML = '<p style="color:red;">Error de conexión</p>'; }
}

async function loadSprintQualyResults(raceId) {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<h3 style="color:white;">Cargando Shootout...</h3>';

    try {
        const res = await fetch(`http://localhost:3000/api/races/${raceId}/sprint-qualifying`);
        const json = await res.json();

        if (!json.success || json.data.length === 0) {
            container.innerHTML = '<p style="color:#aaa;">No hay datos de Sprint Qualy.</p>';
            return;
        }

        const rows = json.data.map(r => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                <td style="padding:10px; font-weight:bold;">${r.position}</td>
                <td style="padding:10px; text-align:left; color:white;">${r.last_name} <span style="font-size:0.8rem; color:${r.primary_color}">(${r.team_name.substring(0, 3)})</span></td>
                <td style="padding:5px; font-family:monospace; color:#aaa;">${r.sq1 || '-'}</td>
                <td style="padding:5px; font-family:monospace; color:#ccc;">${r.sq2 || '-'}</td>
                <td style="padding:5px; font-family:monospace; color:#e10600; font-weight:bold;">${r.sq3 || '-'}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div style="overflow-x:auto;">
                <h4 style="color:#e10600; text-align:left; margin-bottom:10px;">SPRINT SHOOTOUT</h4>
                <table class="results-table" style="font-size:0.9rem;">
                    <thead>
                        <tr style="color:#666; font-size:0.7rem;">
                            <th>POS</th>
                            <th style="text-align:left;">PILOTO</th>
                            <th>SQ1</th>
                            <th>SQ2</th>
                            <th>SQ3</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (e) { container.innerHTML = '<p style="color:red;">Error de conexión</p>'; }
}

function createModalHTML() {
    // Si ya existe, no hacemos nada (protección)
    if (document.getElementById('driverModal')) return;

    const modalHTML = `
        <div id="driverModal" class="modal-overlay">
            <div class="modal-content" style="background-color: inherit;">
                <button class="modal-close">&times;</button>
                <div class="modal-body">
                    </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Lógica para cerrar el modal
    const modal = document.getElementById('driverModal');
    const closeBtn = modal.querySelector('.modal-close');

    closeBtn.addEventListener('click', () => modal.classList.remove('is-visible'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('is-visible');
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('is-visible')) {
            modal.classList.remove('is-visible');
        }
    });
}

async function loadStandingsView() {
    const app = document.querySelector('#app');
    
    // 1. Decidir a qué API llamar según la pestaña activa
    const endpoint = currentStandingsTab === 'drivers' 
        ? `${API}/drivers?year=${currentYear}`
        : `${API}/constructors-standings?year=${currentYear}`;

    app.innerHTML = '<h2 style="text-align:center; color:white; margin-top:50px;">Cargando campeonato...</h2>';

    try {
        const res = await fetch(endpoint);
        const result = await res.json();
        const data = result.data || [];

        // 2. Generar filas de la tabla (Diferente para Pilotos vs Constructores)
        const rows = data.map((item, index) => {
            if (currentStandingsTab === 'drivers') {
                // FILA PILOTOS
                return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); height: 60px;">
                    <td style="text-align:center; font-weight:bold; font-size:1.2rem; color:white; width: 60px;">${index + 1}</td>
                    <td style="padding-left: 20px;">
                        <div style="display:flex; flex-direction:column;">
                            <span style="color:white; font-weight:bold; font-size:1.1rem;">${item.first_name} ${item.last_name}</span>
                            <span style="color:${item.primary_color}; font-size:0.85rem;">${item.team_name}</span>
                        </div>
                    </td>
                    <td style="text-align:right; padding-right: 20px; font-weight:bold; font-size:1.2rem; color:#e10600;">
                        ${item.points} <span style="font-size:0.8rem; color:#666;">PTS</span>
                    </td>
                </tr>`;
            } else {
                // FILA CONSTRUCTORES
                return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); height: 70px;">
                    <td style="text-align:center; font-weight:bold; font-size:1.2rem; color:white; width: 60px;">${index + 1}</td>
                    <td style="padding-left: 20px; display:flex; align-items:center; gap:15px; height: 70px;">
                        <span class="teamLogo" style="background: ${item.primary_color};">
                            <img src="${item.logo_url}" style="width:40px; height:40px; object-fit:contain; border-radius:5px; padding:2px;">
                        </span>
                        <span style="color:white; font-weight:bold; font-size:1.2rem;">${item.name}</span>
                    </td>
                    <td style="text-align:right; padding-right: 20px; font-weight:bold; font-size:1.2rem; color:#e10600;">
                        ${item.points} <span style="font-size:0.8rem; color:#666;">PTS</span>
                    </td>
                </tr>`;
            }
        }).join('');

        // 3. Renderizar vista con BOTONES ACTIVOS
        app.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto; padding-bottom: 40px;">
                <div style="text-align:center; margin-bottom: 30px;">
                    <h1 style="color:white; font-size: 2.5rem; margin-bottom: 15px;">
                        CAMPEONATO ${currentYear}
                    </h1>
                    
                    <div class="tab-container">
                        <button id="tab-drivers" class="tab-btn ${currentStandingsTab === 'drivers' ? 'active-tab' : ''}">
                            PILOTOS
                        </button>
                        <button id="tab-constructors" class="tab-btn ${currentStandingsTab === 'constructors' ? 'active-tab' : ''}">
                            CONSTRUCTORES
                        </button>
                    </div>
                </div>

                <div style="background: #15151e; border-radius: 12px; padding: 10px; border: 1px solid #333;">
                    <table style="width:100%; border-collapse: collapse;">
                        <thead style="border-bottom: 2px solid #333; color:#666; font-size:0.8rem; text-transform:uppercase;">
                            <tr>
                                <th style="padding:15px; width:60px;">Pos</th>
                                <th style="text-align:left; padding:15px 20px;">${currentStandingsTab === 'drivers' ? 'Piloto' : 'Equipo'}</th>
                                <th style="text-align:right; padding:15px 20px;">Puntos</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;

        // 4. Activar los Clicks de los botones
        document.getElementById('tab-drivers').addEventListener('click', () => {
            currentStandingsTab = 'drivers';
            loadStandingsView(); // Recargar vista
        });

        document.getElementById('tab-constructors').addEventListener('click', () => {
            currentStandingsTab = 'constructors';
            loadStandingsView(); // Recargar vista
        });

    } catch (e) {
        console.error(e);
        app.innerHTML = '<h3 style="color:red; text-align:center;">Error cargando datos.</h3>';
    }
}

// --- FUNCIÓN: CUENTA REGRESIVA ---
async function initCountdown() {
    const countdownContainer = document.getElementById('countdown-display');
    
    try {
        // 1. Buscamos todas las carreras de este año (o del próximo si se acaba el año)
        const currentYear = new Date().getFullYear();
        const res = await fetch(`http://localhost:3000/api/races?year=${currentYear}`);
        const json = await res.json();
        
        // 2. Encontramos la próxima carrera en el futuro
        const now = new Date();
        const nextRace = json.data.find(race => new Date(race.date) > now);

        if (!nextRace) {
            countdownContainer.innerHTML = '<span style="color:#aaa;">No hay más carreras esta temporada.</span>';
            return;
        }

        // 3. Función para actualizar el reloj cada segundo
        const updateTimer = () => {
            const raceDate = new Date(nextRace.date);
            const currentTime = new Date();
            const diff = raceDate - currentTime;

            if (diff <= 0) {
                countdownContainer.innerHTML = '¡ES HOY! 🏁';
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            countdownContainer.innerHTML = `
                <div style="text-align:center;">
                    <span style="display:block; font-size: 0.8rem; color: #e10600; font-weight: bold; letter-spacing: 2px;">PRÓXIMA CARRERA: ${nextRace.country_code}</span>
                    <span style="font-size: 1.5rem; font-weight: bold; color: white;">
                        ${days}d ${hours}h ${minutes}m ${seconds}s
                    </span>
                    <span style="display:block; font-size: 0.8rem; color: #666;">${nextRace.name}</span>
                </div>
            `;
        };

        // Iniciar intervalo
        updateTimer(); // Ejecutar una vez ya
        setInterval(updateTimer, 1000); // Repetir cada segundo

    } catch (error) {
        console.error("Error en countdown:", error);
    }
}

// --- ESTA ES LA QUE DEBE QUEDAR ---
function updateButtons(activeId) {
    // Reseteamos todos
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.border = '1px solid white';
        btn.style.color = 'white';
        btn.classList.remove('active-btn');
    });

    // Pintamos el activo
    const activeBtn = document.getElementById(`btn-${activeId}`);
    if (activeBtn) {
        activeBtn.style.background = '#e10600';
        activeBtn.style.border = '1px solid #e10600';
        activeBtn.classList.add('active-btn');
    }
}

init();