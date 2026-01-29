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
            
            // 👇 2. ARREGLO DE IMAGEN (LISTA): Si es relativa, pegamos SERVER_URL
            let mapSrc = race.map_image_url;
            if (mapSrc && !mapSrc.startsWith('http')) {
                mapSrc = `${SERVER_URL}${mapSrc}`;
            }

            return `
                <div class="race-card-wide" data-id="${race.id}" data-sprint="${race.has_sprint || false}" style="
                    display: flex; 
                    align-items: center; 
                    background: #1e1e24; 
                    border-radius: 8px; 
                    overflow: hidden; 
                    cursor: pointer; 
                    border-left: 4px solid #e10600; 
                    min-height: 90px;
                    transition: transform 0.2s, background 0.2s;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                "
                onmouseover="this.style.background='#25252d'; this.style.transform='scale(1.01)'"
                onmouseout="this.style.background='#1e1e24'; this.style.transform='scale(1)'"
                >
                    <div style="padding: 0 25px; text-align: center; border-right: 1px solid rgba(255,255,255,0.1); min-width: 80px; display: flex; flex-direction: column; justify-content: center;">
                        <span style="font-size: 0.8rem; color: #aaa; font-weight: bold; text-transform: uppercase;">${month}</span>
                        <span style="font-size: 1.6rem; font-weight: 800; color: #fff; line-height: 1;">${day}</span>
                    </div>

                    <div style="flex-grow: 1; padding: 15px 20px; display: flex; flex-direction: column; justify-content: center;">
                        <h3 style="margin: 0 0 5px 0; font-size: 1.1rem; text-transform: uppercase; color: #fff; letter-spacing: 0.5px;">
                            Round ${race.round}: ${race.name}
                        </h3>
                        <p style="margin: 0; color: #888; font-size: 0.9rem; display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 1.2rem;">${getFlagEmoji(race.country_code)}</span> 
                            ${race.circuit_name}
                        </p>
                    </div>

                    <div style="padding: 10px 30px; display: flex; align-items: center; justify-content: center;">
                        <img src="${mapSrc}" class="race-card__map" alt="Map" style="
                            height: 50px; 
                            width: auto; 
                            opacity: 0.7; 
                            filter: invert(1);
                        ">
                    </div>
                </div>
            `;
        }).join('');

        app.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; margin-bottom: 30px;">
                <h1 style="text-align:center; color:white; margin-bottom:10px; font-size: 2rem;">CALENDARIO ${state.currentYear}</h1>
            </div>
            
            <div class="race-list" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));  flex-direction: column; gap: 15px; max-width: 1000px; margin: 0 auto; padding-bottom: 50px;">
                ${cardsHtml}
            </div>
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
            `<button class="tab-btn" onclick="loadTab('${type}', ${raceId})" style="${btnStyle}">${label}</button>`;

        if (hasSprint) {
            tabsHTML = `${createBtn('practices', 'FP1')} ${createBtn('sprint-qualy', 'S. QUALY')} ${createBtn('sprint', 'SPRINT')} ${createBtn('qualy', 'CLASIF.')} ${createBtn('race', 'CARRERA')}`;
        } else {
            tabsHTML = `${createBtn('practices', 'PRÁCTICAS')} ${createBtn('qualy', 'CLASIFICACIÓN')} ${createBtn('race', 'CARRERA')}`;
        }

        const statBoxStyle = "background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; text-align: center; justify-content: center;";
        const labelStyle = "font-size: 0.65rem; color: #aaa; text-transform: uppercase; font-weight: bold; margin-bottom: 3px;";
        const valueStyle = "font-size: 1rem; font-weight: 800; color: #fff;";

        modalBody.innerHTML = `
            <div style="text-align:center; margin-bottom:15px;">
                <h2 style="color:#e10600; text-transform:uppercase; margin:0;">${race.name}</h2>
            </div>

            <div class="circuit_info">
                
                <div style="flex: 3; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); border-radius: 10px; padding: 10px;">
                    <img src="${displayImage}" style="width: 100%; height: auto; filter: drop-shadow(0 0 8px rgba(255,255,255,0.1));">
                </div>

                <div style="flex: 2; display: flex; flex-direction: column; gap: 8px; justify-content: center;">
                    <div style="${statBoxStyle}">
                        <span style="${labelStyle}">Circuit</span>
                        <div>
                            <span style="font-size: 1.2rem;">${getFlagEmoji(race.country_code)}</span> 
                            <span style="${valueStyle}">${race.circuit_name || '-'}</span>
                        </div>
                    </div>
                    <div style="${statBoxStyle}">
                        <span style="${labelStyle}">Circuit Length</span>
                        <span style="${valueStyle}">${race.circuit_length || '-'}</span>
                    </div>
                    <div style="${statBoxStyle}">
                        <span style="${labelStyle}">Laps</span>
                        <span style="${valueStyle}">${race.total_laps || '-'}</span>
                    </div>
                    <div style="${statBoxStyle}">
                        <span style="${labelStyle}">Distance</span>
                        <span style="${valueStyle}">${race.race_distance || '-'}</span>
                    </div>
                    <div style="${statBoxStyle}">
                        <span style="${labelStyle}">Fastest Lap</span>
                        <span style="${valueStyle}" style="font-size:0.8rem;">${race.lap_record || '-'}</span>
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
        window.loadTab = (type, id) => {
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.style.color = '#aaa';
                btn.style.borderBottom = 'none';
                if (btn.getAttribute('onclick').includes(`'${type}'`)) {
                    btn.style.color = 'white';
                    btn.style.borderBottom = '2px solid #e10600';
                }
            });

            if (type === 'race') loadRaceResults(id);
            if (type === 'qualy') loadQualyResults(id);
            if (type === 'sprint') loadSprintResults(id);
            if (type === 'practices') loadPracticesResults(id, hasSprint);
            if (type === 'sprint-qualy') loadSprintQualyResults(id);
        };

        window.loadTab('race', raceId);

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
    container.innerHTML = '<div style="text-align:center; color:white;">Cargando Qualy...</div>';
    try {
        const res = await fetch(`${API}/races/${raceId}/qualifying`);
        const json = await res.json();
        if (!json.success || json.data.length === 0) { container.innerHTML = '<p style="color:#aaa; text-align:center;">No hay datos.</p>'; return; }
        
        const rows = json.data.map(r => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding:10px; font-weight:bold; text-align:center; color:white;">${r.position}</td>
                <td style="font-weight:bold; padding:10px; text-align:left; color:white;">${r.last_name} <span style="font-weight:normal; font-size:0.7rem; color:${r.primary_color}">(${r.team_name.substring(0, 3).toUpperCase()})</span></td>
                <td style="padding:5px; font-family:monospace; color:#aaa; text-align:center;">${r.q1 || '-'}</td>
                <td style="padding:5px; font-family:monospace; color:#ccc; text-align:center;">${r.q2 || '-'}</td>
                <td style="padding:5px; font-family:monospace; color:#e10600; font-weight:bold; text-align:center;">${r.q3 || '-'}</td>
            </tr>
        `).join('');
        container.innerHTML = `<table style="width:100%; border-collapse:collapse; font-size:0.9rem;"><thead><tr style="color:#666; font-size:0.7rem; border-bottom:1px solid #333;"><th>POS</th><th style="text-align:left;">PILOTO</th><th>Q1</th><th>Q2</th><th>Q3</th></tr></thead><tbody>${rows}</tbody></table>`;
    } catch (e) { container.innerHTML = '<p style="color:red;">Error</p>'; }
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

async function loadSprintQualyResults(raceId) {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<div style="text-align:center; color:white; padding:20px;">Cargando Shootout...</div>';

    try {
        const res = await fetch(`${API}/races/${raceId}/sprint-qualifying`);
        const json = await res.json();

        if (!json.success || json.data.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">No hay datos de Shootout.</p>';
            return;
        }

        const rows = json.data.map(r => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding:10px; text-align:center; font-weight:bold;">${r.position}</td>
                <td style="padding:10px; text-align:left;">
                    <span style="color:white; font-weight:bold;">${r.last_name}</span>
                    <span style="font-size:0.75rem; color:${r.primary_color}; margin-left:5px;">${r.team_name}</span>
                </td>
                <td style="text-align:right; font-family:monospace; color:${r.sq1 ? '#fff' : '#444'};">${r.sq1 || '-'}</td>
                <td style="text-align:right; font-family:monospace; color:${r.sq2 ? '#fff' : '#444'};">${r.sq2 || '-'}</td>
                <td style="text-align:right; font-family:monospace; color:${r.sq3 ? '#fff' : '#444'}; font-weight:bold;">${r.sq3 || '-'}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div class="table-responsive">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="color:#666; font-size:0.7rem; text-transform:uppercase; border-bottom: 2px solid #333;">
                            <th style="padding:10px;">Pos</th>
                            <th style="text-align:left; padding:10px;">Piloto</th>
                            <th style="text-align:right;">SQ1</th>
                            <th style="text-align:right;">SQ2</th>
                            <th style="text-align:right;">SQ3</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    } catch (e) { console.error(e); }
}