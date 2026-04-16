// 👇 1. IMPORTAMOS SERVER_URL
import { API, SERVER_URL } from './config.js';
import { state } from './state.js';
import { getFlagEmoji, getPositionBadge } from './utils.js';

export async function loadCalendarView() {
    const app = document.querySelector('#app');
    app.innerHTML = '<h2 style="text-align:center; color:white; margin-top:50px;">Cargando calendario...</h2>';

    try {
        const res = await fetch(`${API}/races?year=${state.currentYear}`);
        const result = await res.json();

        if (!result.success || !result.data || result.data.length === 0) {
            app.innerHTML = `
                <div style="text-align:center; margin-top:50px;">
                    <h1 style="color:white;">CALENDARIO ${state.currentYear}</h1>
                    <h3 style="color:#666;">No hay carreras registradas para este año.</h3>
                </div>`;
            return;
        }

        const cardsHtml = result.data.map(race => {
            const dateObj = new Date(race.date);
            const userTimezoneOffset = dateObj.getTimezoneOffset() * 60000;
            const adjustedDate = new Date(dateObj.getTime() + userTimezoneOffset);

            const month = adjustedDate.toLocaleString('es-ES', { month: 'short' }).toUpperCase().replace('.', '');
            const day = adjustedDate.getDate();

            // Rango del fin de semana (Sprint: -3 días, Normal: -2 días)
            const weekendDaysBack = race.has_sprint ? 3 : 2;
            const weekendStart = new Date(adjustedDate);
            weekendStart.setDate(weekendStart.getDate() - weekendDaysBack);
            const monthLong = adjustedDate.toLocaleString('es-ES', { month: 'long' });
            const monthCap = monthLong.charAt(0).toUpperCase() + monthLong.slice(1);
            const dateRange = `${weekendStart.getDate()} - ${day} ${monthCap}`;

            // Badge de estado
            const now = new Date();
            const diffDays = (adjustedDate - now) / (1000 * 60 * 60 * 24);
            let statusKey, statusLabel;
            if (race.status === 'suspended') { statusKey = 'suspended'; statusLabel = 'Suspendida'; }
            else if (diffDays < -1)          { statusKey = 'done'; statusLabel = 'Finalizado'; }
            else if (diffDays <= 4)          { statusKey = 'live'; statusLabel = '● En vivo'; }
            else                             { statusKey = 'soon'; statusLabel = 'Próximamente'; }

            // Imagen de mapa
            let mapSrc = race.map_image_url;
            if (mapSrc && !mapSrc.startsWith('http')) {
                mapSrc = `${SERVER_URL}${mapSrc}`;
            }

            return `
                <div class="race-card-wide" data-id="${race.id}" data-sprint="${race.has_sprint || false}">
                    <div class="race-card-wide__date-col">
                        <span class="race-card-wide__date-col-month">${month}</span>
                        <span class="race-card-wide__date-col-day">${day}</span>
                    </div>
                    <div class="race-card-wide__info">
                        <div class="race-card-wide__info-header">
                            <h3>R${race.round} &mdash; ${race.name}</h3>
                            <span class="race-status-badge race-status-badge--${statusKey}">${statusLabel}</span>
                        </div>
                        <p>
                            <span class="race-circuit-name">
                                <span class="race-circuit-name__flag">${getFlagEmoji(race.country_code)}</span>
                                <span>${race.circuit_name}</span>
                            </span>
                            <span class="race-dates">${dateRange}</span>
                            ${race.has_sprint ? '<span class="sprint-badge">SPRINT</span>' : ''}
                        </p>
                    </div>
                    <div class="race-card-wide__map-col">
                        <img src="${mapSrc}" class="race-card__map" alt="Map" loading="lazy">
                    </div>
                    <div class="race-card-wide__cta">›</div>
                </div>
            `;
        }).join('');

        app.innerHTML = `
            <div class="calendar-header">
                <h1>CALENDARIO ${state.currentYear}</h1>
            </div>
            <div class="race-list">${cardsHtml}</div>
         `;

        document.querySelectorAll('.race-card-wide').forEach(card => {
            card.addEventListener('click', () => {
                // 👇 Leemos la URL corregida directamente de la imagen
                const mapUrl = card.querySelector('.race-card__map').src;
                const hasSprint = card.dataset.sprint === 'true';
                openRaceModal(card.dataset.id, mapUrl, hasSprint);
            });
        });

    } catch (e) {
        console.error(e);
        app.innerHTML = '<h3 style="color:red; text-align:center; margin-top:50px;">Error cargando calendario.</h3>';
    }
}

// --- MODAL ---

async function openRaceModal(raceId, mapUrl, hasSprint) {
    const modal = document.getElementById('driverModal');
    const modalBody = modal.querySelector('.modal-body');
    modal.classList.add('is-visible');

    modalBody.innerHTML = '<h3 style="color:white; text-align:center; padding:50px;">Cargando circuito...</h3>';

    try {
        const res = await fetch(`${API}/races/${raceId}`);
        const json = await res.json();
        const race = json.data;

        // 👇 3. ARREGLO IMAGEN MODAL: Prioridad circuit > map > mapUrl
        let rawImage = race.circuit_image_url || race.map_image_url || mapUrl;

        let displayImage = rawImage;
        if (displayImage && !displayImage.startsWith('http')) {
            displayImage = `${SERVER_URL}${displayImage}`;
        }

        // Preparación de Tabs
        let tabsHTML = '';
        const btnStyle = "background:none; border:none; color:#aaa; padding:10px 15px; cursor:pointer; font-weight:bold; font-size:0.9rem; transition: color 0.3s;";
        const createBtn = (type, label) =>
            `<button class="tab-btn" data-type="${type}" data-id="${raceId}" style="${btnStyle}">${label}</button>`;

        if (hasSprint) {
            tabsHTML = `${createBtn('practices', 'FP1')} ${createBtn('sprint-qualy', 'S. QUALY')} ${createBtn('sprint', 'SPRINT')} ${createBtn('qualy', 'CLASIF.')} ${createBtn('race', 'CARRERA')} ${createBtn('strategy', 'ESTRATEGIA')}`;
        } else {
            tabsHTML = `${createBtn('practices', 'PRÁCTICAS')} ${createBtn('qualy', 'CLASIFICACIÓN')} ${createBtn('race', 'CARRERA')} ${createBtn('strategy', 'ESTRATEGIA')}`;
        }

        modalBody.innerHTML = `
            <div style="text-align:center; margin-bottom:15px;">
                <h2 style="color:#e10600; text-transform:uppercase; margin:0;">${race.name}</h2>
            </div>

            <div class="circuit_info">
                <div class="modal-circuit-image">
                    <img src="${displayImage}" alt="${race.circuit_name}">
                </div>
                <div class="modal-circuit-stats">
                    <div class="circuit-stat">
                        <span class="circuit-stat__label">Circuit</span>
                        <div><span style="font-size:1.2rem">${getFlagEmoji(race.country_code)}</span> <span class="circuit-stat__value">${race.circuit_name || '-'}</span></div>
                    </div>
                    <div class="circuit-stat">
                        <span class="circuit-stat__label">Circuit Length</span>
                        <span class="circuit-stat__value">${race.circuit_length || '-'}</span>
                    </div>
                    <div class="circuit-stat">
                        <span class="circuit-stat__label">Laps</span>
                        <span class="circuit-stat__value">${race.total_laps || '-'}</span>
                    </div>
                    <div class="circuit-stat">
                        <span class="circuit-stat__label">Distance</span>
                        <span class="circuit-stat__value">${race.race_distance || '-'}</span>
                    </div>
                    <div class="circuit-stat">
                        <span class="circuit-stat__label">Fastest Lap</span>
                        <span class="circuit-stat__value">${race.lap_record || '-'}</span>
                    </div>
                </div>
            </div>

            <div class="tabs-container" style="overflow-x: auto; white-space: nowrap; padding-bottom:5px; border-bottom: 1px solid #333; text-align:center; margin-bottom:15px;">
                ${tabsHTML}
            </div>

            <div id="tab-content" style="min-height: 200px;">
                <h3 style="color:white; padding:20px; text-align:center;">Cargando...</h3>
            </div>
        `;

        // 4. LÓGICA DE TABS
        const loadTab = (type, id) => {
            try {
                document.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.style.color = '#aaa';
                    btn.style.borderBottom = 'none';
                    if (btn.dataset.type === type) {
                        btn.style.color = 'white';
                        btn.style.borderBottom = '2px solid #e10600';
                    }
                });

                if (type === 'race') loadRaceResults(id);
                if (type === 'qualy') loadQualyResults(id);
                if (type === 'sprint') loadSprintResults(id);
                if (type === 'practices') loadPracticesResults(id, hasSprint);
                if (type === 'sprint-qualy') loadSprintQualyResults(id);
                if (type === 'circuit')  loadCircuitAnalysis(id);
                if (type === 'strategy') loadStrategyAnalysis(id);
            } catch (e) {
                console.error('Error cargando tab:', e);
            }
        };

        // Agregar listeners a los botones
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                loadTab(btn.dataset.type, btn.dataset.id);
            });
        });

        // Carga inicial
        loadTab('race', raceId);

    } catch (e) {
        console.error(e);
        modalBody.innerHTML = '<p style="color:red; text-align:center; padding:20px;">Error al cargar datos del circuito.</p>';
    }
}

// --- SUB-FUNCIONES DE CARGA ---

async function loadRaceResults(raceId) {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<div class="loader" style="text-align:center; color:white;">Cargando Carrera...</div>';
    try {
        const res = await fetch(`${API}/races/${raceId}/results`);
        const json = await res.json();
        if (!json.success || json.data.length === 0) {
            container.innerHTML = '<p style="color:#aaa; text-align:center; padding:20px;">No hay resultados aún.</p>';
            return;
        }
        const rows = json.data.map(r => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding:12px; font-weight:bold; text-align:center; color:white;">${getPositionBadge(r, r.primary_color)}</td>
                <td style="padding:12px; text-align:left;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:3px; height:20px; background:${r.primary_color};"></div>
                        <div>
                            <span style="display:block; font-weight:bold; color:white;">${r.first_name} ${r.last_name}</span>
                            <span style="font-size:0.75rem; color:#888;">${r.team_name}</span>
                        </div>
                    </div>
                </td>
                <td style="padding:12px; color:#00ff88; font-weight:bold; text-align:center;">
                    ${r.fastest_lap ? '🟣 ' : ''}+${r.points}
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div class="table-responsive"> 
                <table style="width: 100%; border-collapse: collapse; font-size:0.9rem;">
                    <thead>
                        <tr style="color:#666; font-size:0.75rem; text-transform:uppercase; border-bottom: 2px solid #333;">
                            <th style="padding:10px;">Pos</th>
                            <th style="text-align:left; padding:10px;">Piloto</th>
                            <th style="padding:10px;">Pts</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    } catch (e) { container.innerHTML = '<p style="color:red; text-align:center;">Error de conexión</p>'; }
}

async function loadQualyResults(raceId) {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<div style="text-align:center; color:white; padding:20px;">Cargando Clasificación...</div>';

    try {
        const res = await fetch(`${API}/races/${raceId}/qualifying`);
        const json = await res.json();

        if (!json.success || json.data.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">No hay datos de Clasificación aún.</p>';
            return;
        }

        const qualyData = json.data;

        const renderSession = (sessionKey) => {
            const tableContainer = document.getElementById('qualy-table-container');

            // Actualizar botones
            ['q1', 'q2', 'q3'].forEach(key => {
                const btn = document.getElementById(`btn-${key}`);
                if (btn) {
                    if (key === sessionKey) {
                        btn.style.background = '#e10600';
                        btn.style.color = 'white';
                        btn.style.border = '1px solid #e10600';
                    } else {
                        btn.style.background = 'rgba(255,255,255,0.05)';
                        btn.style.color = '#aaa';
                        btn.style.border = '1px solid #333';
                    }
                }
            });

            // Filtrar por sesión
            const sessionData = qualyData.filter(r => r[sessionKey] && r[sessionKey] !== '-');
            const eliminated  = qualyData.filter(r => !r[sessionKey] || r[sessionKey] === '-');

            // Ordenar por tiempo
            const sorted = [...sessionData].sort((a, b) => {
                const tA = (a[sessionKey] || '').trim();
                const tB = (b[sessionKey] || '').trim();
                if (!tA) return 1;
                if (!tB) return -1;
                return tA.localeCompare(tB, undefined, { numeric: true });
            });

            const activeRows = sorted.map((r, index) => {
                const isLeader = index === 0;
                const timeColor = isLeader ? '#e10600' : (index < 3 ? '#fff' : '#aaa');
                return `
                <tr style="${isLeader ? 'background: rgba(225, 6, 0, 0.08);' : 'border-bottom: 1px solid rgba(255,255,255,0.05);'}">
                    <td style="padding:10px; text-align:center; color:${isLeader ? '#e10600' : '#666'}; font-weight:bold; width:40px;">${index + 1}</td>
                    <td style="padding:10px; text-align:left;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="width:3px; height:25px; background:${r.primary_color}; border-radius:2px; flex-shrink:0;"></div>
                            <div style="display:flex; flex-direction:column;">
                                <span style="color:white; font-weight:bold; font-size:0.95rem;">${r.last_name}</span>
                                <span style="font-size:0.7rem; color:#888;">${r.team_name}</span>
                            </div>
                        </div>
                    </td>
                    <td style="padding:10px 20px; text-align:right; font-family:'Courier New', monospace; font-size:0.95rem; font-weight:bold; color:${timeColor};">${r[sessionKey]}</td>
                </tr>`;
            }).join('');

            const eliminatedRows = eliminated.map(r => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); opacity:0.45;">
                    <td style="padding:8px; text-align:center; color:#444; font-weight:bold; width:40px;">—</td>
                    <td style="padding:8px; text-align:left;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="width:3px; height:20px; background:${r.primary_color}; border-radius:2px; flex-shrink:0; opacity:0.4;"></div>
                            <div style="display:flex; flex-direction:column;">
                                <span style="color:#555; font-weight:bold; font-size:0.85rem;">${r.last_name}</span>
                                <span style="font-size:0.65rem; color:#444;">${r.team_name}</span>
                            </div>
                        </div>
                    </td>
                    <td style="padding:8px 20px; text-align:right; font-family:'Courier New', monospace; font-size:0.85rem; color:#333;">—</td>
                </tr>`).join('');

            const separator = eliminated.length > 0 && sessionData.length > 0
                ? `<tr><td colspan="3" style="padding:4px 10px;"><div style="border-top:1px dashed #333; margin:4px 0;"></div></td></tr>`
                : '';

            tableContainer.innerHTML = `
                <div class="table-responsive">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="color:#666; font-size:0.7rem; text-transform:uppercase; border-bottom:2px solid #333;">
                                <th style="padding:10px;">Pos</th>
                                <th style="text-align:left; padding:10px;">Piloto</th>
                                <th style="text-align:right; padding-right:20px;">Tiempo</th>
                            </tr>
                        </thead>
                        <tbody>${activeRows}${separator}${eliminatedRows}</tbody>
                    </table>
                </div>`;
        };

        const subBtnStyle = `background: rgba(255,255,255,0.05); border: 1px solid #333; color: #aaa; padding: 5px 15px; cursor: pointer; border-radius: 20px; font-size: 0.8rem; font-weight: bold; transition: all 0.2s;`;

        container.innerHTML = `
            <div style="display:flex; justify-content:center; gap:10px; margin-bottom:20px; padding-top:10px;">
                <button id="btn-q1" style="${subBtnStyle}">Q1</button>
                <button id="btn-q2" style="${subBtnStyle}">Q2</button>
                <button id="btn-q3" style="${subBtnStyle}">Q3</button>
            </div>
            <div id="qualy-table-container"></div>`;

        document.getElementById('btn-q1').onclick = () => renderSession('q1');
        document.getElementById('btn-q2').onclick = () => renderSession('q2');
        document.getElementById('btn-q3').onclick = () => renderSession('q3');

        renderSession('q3'); // Q3 por defecto (más relevante)

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar datos.</p>';
    }
}

async function loadPracticesResults(raceId, isSprint) {
    const container = document.getElementById('tab-content');

    // 1. Carga inicial
    container.innerHTML = '<div style="text-align:center; color:white; padding:20px;">Cargando tiempos...</div>';

    try {
        const res = await fetch(`${API}/races/${raceId}/practices`);
        const json = await res.json();

        if (!json.success || json.data.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">No hay datos de prácticas registrados.</p>';
            return;
        }

        const practiceData = json.data;

        // 2. FUNCIÓN DE RENDERIZADO (Reutilizable)
        const renderSession = (sessionKey) => {
            const tableContainer = document.getElementById('practice-table-container');

            // A. ACTUALIZAR BOTONES (Solo si existen, es decir, si NO es Sprint)
            if (!isSprint) {
                ['p1', 'p2', 'p3'].forEach(key => {
                    const btn = document.getElementById(`btn-${key}`);
                    if (btn) {
                        if (key === sessionKey) {
                            btn.style.background = '#e10600';
                            btn.style.color = 'white';
                            btn.style.border = '1px solid #e10600';
                        } else {
                            btn.style.background = 'rgba(255,255,255,0.05)';
                            btn.style.color = '#aaa';
                            btn.style.border = '1px solid #333';
                        }
                    }
                });
            }

            // B. ORDENAR DATOS
            const sortedData = [...practiceData].sort((a, b) => {
                const timeA = (a[sessionKey] || '').trim();
                const timeB = (b[sessionKey] || '').trim();

                if (!timeA || timeA === '-') return 1;
                if (!timeB || timeB === '-') return -1;

                const isGapA = timeA.startsWith('+');
                const isGapB = timeB.startsWith('+');

                if (!isGapA && isGapB) return -1;
                if (isGapA && !isGapB) return 1;

                return timeA.localeCompare(timeB, undefined, { numeric: true });
            });

            // C. GENERAR FILAS
            const rows = sortedData.map((r, index) => {
                const timeValue = r[sessionKey] || '-';
                const hasTime = timeValue !== '-';
                const position = hasTime ? index + 1 : '-';
                const isLeader = index === 0 && hasTime;

                return `
                <tr style="${isLeader ? 'background: rgba(0, 255, 136, 0.1);' : 'border-bottom: 1px solid rgba(255,255,255,0.05);'}">
                    <td style="padding:10px; text-align:center; color:${isLeader ? '#00ff88' : '#666'}; font-weight:bold; width:40px;">
                        ${position}
                    </td>
                    <td style="padding:10px; text-align:left;">
                        <div style="display:flex; align-items:center; gap: 8px;">
                            <div style="width:3px; height:25px; background:${r.primary_color}; border-radius:2px;"></div>
                            <div style="display:flex; flex-direction:column;">
                                <span style="color:white; font-weight:bold; font-size:0.95rem;">${r.last_name}</span>
                                <span style="font-size:0.7rem; color:#888;">${r.team_name}</span>
                            </div>
                        </div>
                    </td>
                    <td style="padding:10px 20px; text-align:right; font-family:'Courier New', monospace; font-size:1rem; font-weight:bold; color:${isLeader ? '#00ff88' : (hasTime ? 'white' : '#444')};">
                        ${timeValue}
                    </td>
                </tr>
                `;
            }).join('');

            // D. INYECTAR TABLA
            tableContainer.innerHTML = `
                <div class="table-responsive">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="color:#666; font-size:0.7rem; text-transform:uppercase; border-bottom: 2px solid #333;">
                                <th style="padding:10px;">Pos</th>
                                <th style="text-align:left; padding:10px;">Piloto</th>
                                <th style="text-align:right; padding-right:20px;">Tiempo / Gap</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        };

        // 3. ESTRUCTURA SEGÚN TIPO DE CARRERA
        if (isSprint) {
            // --- MODO SPRINT: Solo mostramos la tabla (FP1 por defecto) ---
            container.innerHTML = `<div id="practice-table-container" style="margin-top:10px;"></div>`;
            renderSession('p1');
        } else {
            // --- MODO NORMAL: Mostramos botones FP1, FP2, FP3 ---
            const subBtnStyle = `background: rgba(255,255,255,0.05); border: 1px solid #333; color: #aaa; padding: 5px 15px; cursor: pointer; border-radius: 20px; font-size: 0.8rem; font-weight: bold; transition: all 0.2s;`;

            container.innerHTML = `
                <div style="display:flex; justify-content:center; gap:10px; margin-bottom: 20px; padding-top: 10px;">
                    <button id="btn-p1" style="${subBtnStyle}">FP1</button>
                    <button id="btn-p2" style="${subBtnStyle}">FP2</button>
                    <button id="btn-p3" style="${subBtnStyle}">FP3</button>
                </div>
                <div id="practice-table-container"></div>
            `;

            // Asignar eventos
            document.getElementById('btn-p1').onclick = () => renderSession('p1');
            document.getElementById('btn-p2').onclick = () => renderSession('p2');
            document.getElementById('btn-p3').onclick = () => renderSession('p3');

            // Cargar FP1 por defecto
            renderSession('p1');
        }

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar datos.</p>';
    }
}

async function loadSprintResults(raceId) {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<div style="text-align:center; color:white; padding:20px;">Cargando Sprint...</div>';

    try {
        const res = await fetch(`${API}/races/${raceId}/sprint`);
        const json = await res.json();

        if (!json.success || json.data.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">No hay resultados del Sprint aún.</p>';
            return;
        }

        const rows = json.data.map(r => {
            // Lógica para DNF o Tiempo
            let timeDisplay = r.time_gap || '-';
            let colorTime = 'white';

            if (r.dnf) { timeDisplay = 'DNF'; colorTime = '#ff4444'; }
            else if (r.dns) { timeDisplay = 'DNS'; colorTime = '#aaa'; }
            else if (r.dsq) { timeDisplay = 'DSQ'; colorTime = 'orange'; }

            // Puntos destacados
            const pointsDisplay = r.points > 0 ? `<span style="color:#e10600; font-weight:bold;">+${r.points}</span>` : '<span style="color:#444;">0</span>';

            return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding:10px; text-align:center; font-weight:bold; width:40px;">${r.position}</td>
                <td style="padding:10px; text-align:left;">
                    <div style="display:flex; align-items:center; gap: 8px;">
                         <div style="width:3px; height:25px; background:${r.primary_color}; border-radius:2px;"></div>
                         <div>
                            <span style="color:white; font-weight:bold;">${r.last_name}</span>
                            <div style="font-size:0.7rem; color:#888;">${r.team_name}</div>
                         </div>
                    </div>
                </td>
                <td style="text-align:right; padding-right:15px; font-family:monospace; color:${colorTime};">${timeDisplay}</td>
                <td style="text-align:center; width:50px;">${pointsDisplay}</td>
            </tr>`;
        }).join('');

        container.innerHTML = `
            <div class="table-responsive">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="color:#666; font-size:0.7rem; text-transform:uppercase; border-bottom: 2px solid #333;">
                            <th style="padding:10px;">Pos</th>
                            <th style="text-align:left; padding:10px;">Piloto</th>
                            <th style="text-align:right; padding-right:15px;">Tiempo</th>
                            <th style="text-align:center;">Pts</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    } catch (e) { console.error(e); }
}

async function loadCircuitAnalysis(raceId) {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<div style="text-align:center; color:white; padding:30px;">Cargando análisis...</div>';

    try {
        const res = await fetch(`${API}/races/${raceId}/circuit-analysis`);
        const json = await res.json();

        if (!json.success) {
            container.innerHTML = '<p style="color:#aaa; text-align:center; padding:20px;">No hay datos de análisis para este circuito.</p>';
            return;
        }

        const { race, winners } = json.data;

        // ── Meta grid ──
        const metaItems = [
            { label: 'Primer GP', value: race.first_gp_year ? race.first_gp_year : '—' },
            { label: 'Zonas DRS', value: race.drs_zones != null ? race.drs_zones : '—' },
            { label: 'Longitud', value: race.circuit_length || '—' },
            { label: 'Vueltas', value: race.total_laps || '—' },
            { label: 'Distancia', value: race.race_distance || '—' },
            { label: 'Récord Vuelta', value: race.lap_record || '—' },
        ];

        const metaHTML = metaItems.map(item => `
            <div class="circuit-meta-item">
                <span class="circuit-meta-item__label">${item.label}</span>
                <span class="circuit-meta-item__value">${item.value}</span>
            </div>
        `).join('');

        // ── Notes ──
        const notesHTML = race.circuit_notes
            ? `<div class="circuit-notes">${race.circuit_notes}</div>`
            : '';

        // ── Winners table ──
        let winnersHTML = '';
        if (winners.length === 0) {
            winnersHTML = '<p class="circuit-empty">No hay ganadores históricos registrados para este circuito.</p>';
        } else {
            const rows = winners.map(w => `
                <tr>
                    <td class="cw-year">${w.year}</td>
                    <td class="cw-winner">${w.winner_name}</td>
                    <td class="cw-team">${w.team_name || '—'}</td>
                    <td class="cw-pole">${w.pole_name || '—'}</td>
                    <td class="cw-fl">${w.fastest_lap || '—'}</td>
                </tr>
            `).join('');

            winnersHTML = `
                <div class="table-responsive">
                    <table class="circuit-winners-table">
                        <thead>
                            <tr>
                                <th>Año</th>
                                <th>Ganador</th>
                                <th>Equipo</th>
                                <th>Pole</th>
                                <th>VR</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="circuit-analysis">
                <div class="circuit-meta-grid">${metaHTML}</div>
                ${notesHTML}
                <p class="circuit-section-title">Palmarés histórico</p>
                ${winnersHTML}
            </div>
        `;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:red; text-align:center; padding:20px;">Error al cargar análisis del circuito.</p>';
    }
}

async function loadSprintQualyResults(raceId) {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<div style="text-align:center; color:white; padding:20px;">Cargando Sprint Shootout...</div>';

    try {
        const res = await fetch(`${API}/races/${raceId}/sprint-qualifying`);
        const json = await res.json();

        if (!json.success || json.data.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">No hay datos de Sprint Shootout.</p>';
            return;
        }

        const sqData = json.data;

        const renderSession = (sessionKey) => {
            const tableContainer = document.getElementById('sq-table-container');

            // Actualizar botones (naranja para diferenciar del Sprint Qualifying)
            ['sq1', 'sq2', 'sq3'].forEach(key => {
                const btn = document.getElementById(`btn-${key}`);
                if (btn) {
                    if (key === sessionKey) {
                        btn.style.background = '#ff6b00';
                        btn.style.color = 'white';
                        btn.style.border = '1px solid #ff6b00';
                    } else {
                        btn.style.background = 'rgba(255,255,255,0.05)';
                        btn.style.color = '#aaa';
                        btn.style.border = '1px solid #333';
                    }
                }
            });

            const sessionData = sqData.filter(r => r[sessionKey] && r[sessionKey] !== '-');
            const eliminated  = sqData.filter(r => !r[sessionKey] || r[sessionKey] === '-');

            const sorted = [...sessionData].sort((a, b) => {
                const tA = (a[sessionKey] || '').trim();
                const tB = (b[sessionKey] || '').trim();
                if (!tA) return 1;
                if (!tB) return -1;
                return tA.localeCompare(tB, undefined, { numeric: true });
            });

            const activeRows = sorted.map((r, index) => {
                const isLeader = index === 0;
                const timeColor = isLeader ? '#ff6b00' : (index < 3 ? '#fff' : '#aaa');
                return `
                <tr style="${isLeader ? 'background: rgba(255, 107, 0, 0.08);' : 'border-bottom: 1px solid rgba(255,255,255,0.05);'}">
                    <td style="padding:10px; text-align:center; color:${isLeader ? '#ff6b00' : '#666'}; font-weight:bold; width:40px;">${index + 1}</td>
                    <td style="padding:10px; text-align:left;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="width:3px; height:25px; background:${r.primary_color}; border-radius:2px; flex-shrink:0;"></div>
                            <div style="display:flex; flex-direction:column;">
                                <span style="color:white; font-weight:bold; font-size:0.95rem;">${r.last_name}</span>
                                <span style="font-size:0.7rem; color:#888;">${r.team_name}</span>
                            </div>
                        </div>
                    </td>
                    <td style="padding:10px 20px; text-align:right; font-family:'Courier New', monospace; font-size:0.95rem; font-weight:bold; color:${timeColor};">${r[sessionKey]}</td>
                </tr>`;
            }).join('');

            const eliminatedRows = eliminated.map(r => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); opacity:0.4;">
                    <td style="padding:8px; text-align:center; color:#444; font-weight:bold; width:40px;">—</td>
                    <td style="padding:8px; text-align:left;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="width:3px; height:20px; background:${r.primary_color}; border-radius:2px; flex-shrink:0; opacity:0.4;"></div>
                            <div style="display:flex; flex-direction:column;">
                                <span style="color:#555; font-weight:bold; font-size:0.85rem;">${r.last_name}</span>
                                <span style="font-size:0.65rem; color:#444;">${r.team_name}</span>
                            </div>
                        </div>
                    </td>
                    <td style="padding:8px 20px; text-align:right; font-family:'Courier New', monospace; font-size:0.85rem; color:#333;">—</td>
                </tr>`).join('');

            const separator = eliminated.length > 0 && sessionData.length > 0
                ? `<tr><td colspan="3" style="padding:4px 10px;"><div style="border-top:1px dashed #333; margin:4px 0;"></div></td></tr>`
                : '';

            tableContainer.innerHTML = `
                <div class="table-responsive">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="color:#666; font-size:0.7rem; text-transform:uppercase; border-bottom:2px solid #333;">
                                <th style="padding:10px;">Pos</th>
                                <th style="text-align:left; padding:10px;">Piloto</th>
                                <th style="text-align:right; padding-right:20px;">Tiempo</th>
                            </tr>
                        </thead>
                        <tbody>${activeRows}${separator}${eliminatedRows}</tbody>
                    </table>
                </div>`;
        };

        const subBtnStyle = `background: rgba(255,255,255,0.05); border: 1px solid #333; color: #aaa; padding: 5px 15px; cursor: pointer; border-radius: 20px; font-size: 0.8rem; font-weight: bold; transition: all 0.2s;`;

        container.innerHTML = `
            <div style="display:flex; justify-content:center; gap:10px; margin-bottom:20px; padding-top:10px;">
                <button id="btn-sq1" style="${subBtnStyle}">SQ1</button>
                <button id="btn-sq2" style="${subBtnStyle}">SQ2</button>
                <button id="btn-sq3" style="${subBtnStyle}">SQ3</button>
            </div>
            <div id="sq-table-container"></div>`;

        document.getElementById('btn-sq1').onclick = () => renderSession('sq1');
        document.getElementById('btn-sq2').onclick = () => renderSession('sq2');
        document.getElementById('btn-sq3').onclick = () => renderSession('sq3');

        renderSession('sq3'); // SQ3 por defecto

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:red; text-align:center;">Error al cargar datos.</p>';
    }
}

// ─────────────────────────────────────────────
//  STRATEGY ANALYSIS TAB
// ─────────────────────────────────────────────
const COMPOUND_ABBR = { SOFT:'S', MEDIUM:'M', HARD:'H', INTER:'I', WET:'W', UNKNOWN:'?' };

async function loadStrategyAnalysis(raceId) {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.3);padding:40px;font-family:\'Barlow Condensed\',sans-serif;letter-spacing:2px;font-size:0.9rem;">CARGANDO ESTRATEGIA...</div>';

    try {
        const res  = await fetch(`${API}/races/${raceId}/strategy`);
        const json = await res.json();

        if (!json.success || json.data.drivers.length === 0) {
            container.innerHTML = `
                <div class="strat">
                    <p style="text-align:center;color:rgba(255,255,255,0.25);padding:40px 20px;font-family:'Barlow Condensed',sans-serif;letter-spacing:2px;font-size:0.85rem;">
                        SIN DATOS DE ESTRATEGIA
                    </p>
                </div>`;
            return;
        }

        const { race, stats } = json.data;
        const drivers = [...json.data.drivers].sort((a, b) => {
            if (a.final_position && b.final_position) return a.final_position - b.final_position;
            if (a.final_position) return -1;
            if (b.final_position) return 1;
            return 0;
        });
        const totalLaps = race.total_laps || 1;

        // ── KPI strip ────────────────────────────────
        const fastestKPI = stats.fastestPitStop
            ? `<div class="strat-kpi">
                   <span class="strat-kpi__label">Pit más rápido</span>
                   <span class="strat-kpi__value">${stats.fastestPitStop.time}s</span>
                   <span class="strat-kpi__sub">${stats.fastestPitStop.driver}</span>
               </div>`
            : '';

        const stopKPIs = Object.entries(stats.stopCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([n, cnt]) => `
                <div class="strat-kpi">
                    <span class="strat-kpi__label">${n} parada${n > 1 ? 's' : ''}</span>
                    <span class="strat-kpi__value">${cnt}</span>
                    <span class="strat-kpi__sub">piloto${cnt > 1 ? 's' : ''}</span>
                </div>`).join('');

        // ── Compound legend ──────────────────────────
        const CMP_NAMES = { SOFT:'Blando', MEDIUM:'Medio', HARD:'Duro', INTER:'Intermedio', WET:'Lluvia', UNKNOWN:'?' };
        const activeCmps = [...new Set(drivers.flatMap(d => d.compounds))];
        const legendHTML = activeCmps.map(c => `
            <div class="strat-compound strat-compound--${c}">
                <span class="strat-compound__circle"></span>
                ${CMP_NAMES[c] || c}
            </div>`).join('');

        // ── Lap axis ─────────────────────────────────
        const tickInterval = totalLaps <= 60 ? 10 : 20;
        const ticks = [];
        for (let lap = 0; lap <= totalLaps; lap += tickInterval) {
            ticks.push(`<span class="strat-axis-tick" style="left:${(lap / totalLaps) * 100}%">${lap}</span>`);
        }
        if (totalLaps % tickInterval !== 0) {
            ticks.push(`<span class="strat-axis-tick" style="left:100%">${totalLaps}</span>`);
        }

        // ── Gantt rows ───────────────────────────────
        const ganttHTML = drivers.map((d, idx) => {
            const pos = d.final_position ? `P${d.final_position}` : '—';
            const stintsHTML = d.stints.map(s => {
                const abbr    = COMPOUND_ABBR[s.tire_compound] || '?';
                const pitAttr = s.pit_duration ? `data-pit="Pit: ${s.pit_duration}s"` : '';
                return `<div class="strat-bar strat-bar--${s.tire_compound}"
                              style="flex:${s.laps};"
                              title="${s.tire_compound} · ${s.laps} vueltas (L${s.start_lap}–L${s.end_lap})"
                              ${pitAttr}>
                            <span class="strat-bar__label">${abbr}·${s.laps}</span>
                        </div>`;
            }).join('');

            return `
                <div class="strat-row" style="animation-delay:${idx * 35}ms">
                    <div class="strat-driver-info">
                        <div class="strat-team-bar" style="background:${d.primary_color};"></div>
                        <span class="strat-pos">${pos}</span>
                        <span class="strat-name">${d.shortName}</span>
                    </div>
                    <div class="strat-bars">${stintsHTML}</div>
                    <span class="strat-stop-count">${d.stops}p</span>
                </div>`;
        }).join('');

        // ── P1 vs P2 ─────────────────────────────────
        let h2hHTML = '';
        const top2 = drivers.filter(d => d.final_position <= 2).sort((a, b) => a.final_position - b.final_position);
        if (top2.length === 2) {
            const cardHTML = d => {
                const pillsHTML = d.compounds.map((c, i) => {
                    const arrow = i < d.compounds.length - 1 ? `<span class="strat-pill-arrow">›</span>` : '';
                    return `<span class="strat-pill strat-pill--${c}">${COMPOUND_ABBR[c] || '?'}</span>${arrow}`;
                }).join('');
                const pitTimeStr = d.totalPitTime > 0 ? `${d.totalPitTime}s` : '—';
                return `
                    <div class="strat-h2h-card" style="--team-color:${d.primary_color};">
                        <span class="strat-h2h-card__pos">P${d.final_position}</span>
                        <span class="strat-h2h-card__name">${d.name}</span>
                        <span class="strat-h2h-card__team">${d.team_name}</span>
                        <span class="strat-h2h-card__stat-label">Paradas</span>
                        <span class="strat-h2h-card__stat-value">${d.stops}</span>
                        <span class="strat-h2h-card__stat-label">Estrategia</span>
                        <span class="strat-h2h-card__stat-value">${pillsHTML}</span>
                        <span class="strat-h2h-card__stat-label">Tiempo en pits</span>
                        <span class="strat-h2h-card__stat-value">${pitTimeStr}</span>
                        ${d.fastestPit ? `
                        <span class="strat-h2h-card__stat-label">Mejor pit</span>
                        <span class="strat-h2h-card__stat-value">${d.fastestPit}s</span>` : ''}
                    </div>`;
            };
            h2hHTML = `
                <p class="strat-section-label">P1 vs P2</p>
                <div class="strat-h2h">
                    ${cardHTML(top2[0])}
                    <div class="strat-h2h-vs">VS</div>
                    ${cardHTML(top2[1])}
                </div>`;
        }

        container.innerHTML = `
            <div class="strat">
                <div class="strat-kpis">
                    <div class="strat-kpi">
                        <span class="strat-kpi__label">Pilotos</span>
                        <span class="strat-kpi__value">${drivers.length}</span>
                    </div>
                    ${fastestKPI}
                    ${stopKPIs}
                </div>

                <div class="strat-legend">${legendHTML}</div>

                <p class="strat-section-label">Mapa de Estrategia · ${totalLaps} vueltas</p>
                <div class="strat-gantt">
                    <div class="strat-axis">${ticks.join('')}</div>
                    ${ganttHTML}
                </div>

                ${h2hHTML}
            </div>`;

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:#e10600;text-align:center;padding:20px;font-family:\'Barlow Condensed\',sans-serif;letter-spacing:1px;">ERROR AL CARGAR ESTRATEGIA</p>';
    }
}