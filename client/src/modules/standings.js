import { API, SERVER_URL } from './config.js';
import { state } from './state.js';
import { getFlagEmoji } from './utils.js';

// Normaliza una URL de logo (relativa o absoluta) al dominio del servidor.
function resolveLogo(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : `${SERVER_URL}${url}`;
}

export async function loadStandingsView() {
    const app = document.querySelector('#app');

    // Configuración según la pestaña activa
    const isDrivers = state.currentStandingsTab === 'drivers';
    const endpoint = isDrivers
        ? `${API}/drivers?year=${state.currentYear}`
        : `${API}/constructors-standings?year=${state.currentYear}`; // Usamos la ruta nueva

    app.innerHTML = '<div style="text-align:center; color:white; margin-top:50px;">Cargando campeonato...</div>';

    try {
        const res = await fetch(endpoint);
        const result = await res.json();
        const data = result.data || [];

        // Generar filas de la tabla (diseño Stitch)
        const rows = data.map((item, index) => {
            const position = index + 1;
            const posClass = position <= 3 ? `st-pos st-pos--${position}` : 'st-pos';
            const leaderClass = position === 1 ? ' standings-row--leader' : '';
            const teamColor = item.primary_color || 'transparent';

            // Celdas centrales según el tipo de tabla
            let middleCells = '';
            if (isDrivers) {
                middleCells = `
                    <td class="st-col-name">
                        <span class="st-driver">
                            <span class="st-driver__flag">${getFlagEmoji(item.country_code)}</span>
                            <span class="st-driver__name">${item.first_name} <b>${item.last_name}</b></span>
                        </span>
                    </td>
                    <td class="st-col-team">
                        <span class="st-team">
                            <span class="teamLogo st-team__logo" style="background:${teamColor}22; border:1px solid ${teamColor};">
                                <img src="${resolveLogo(item.logo_url)}" alt="${item.team_name || ''}" loading="lazy">
                            </span>
                            <span class="st-team__name" style="color:${teamColor};">${item.team_name || ''}</span>
                        </span>
                    </td>`;
            } else {
                middleCells = `
                    <td class="st-col-team">
                        <span class="st-team">
                            <span class="teamLogo st-team__logo" style="background:${teamColor}22; border:1px solid ${teamColor};">
                                <img src="${resolveLogo(item.logo_url)}" alt="${item.name || ''}" loading="lazy">
                            </span>
                            <span class="st-team__name">${item.name || ''}</span>
                        </span>
                    </td>`;
            }

            return `
                <tr class="standings-row${leaderClass}" style="--team-color:${teamColor};">
                    <td class="st-col-pos"><span class="${posClass}">${position}</span></td>
                    ${middleCells}
                    <td class="st-col-pts">
                        <span class="st-points"><b>${item.points}</b><span>PTS</span></span>
                    </td>
                </tr>`;
        }).join('');

        // Cabecera de columnas según el tipo de tabla
        const headCells = isDrivers
            ? `<th class="st-col-pos">Pos</th><th class="st-col-name">Piloto</th><th class="st-col-team">Equipo</th><th class="st-col-pts">Puntos</th>`
            : `<th class="st-col-pos">Pos</th><th class="st-col-team">Escudería</th><th class="st-col-pts">Puntos</th>`;

        // Renderizar vista completa
        app.innerHTML = `
            <div class="standings-view">
                <div class="standings-header">
                    <h1>CAMPEONATO ${state.currentYear}</h1>
                    <div class="tab-container">
                        <button id="tab-drivers" class="tab-btn ${isDrivers ? 'active-tab' : ''}">PILOTOS</button>
                        <button id="tab-constructors" class="tab-btn ${!isDrivers ? 'active-tab' : ''}">CONSTRUCTORES</button>
                    </div>
                </div>

                <div class="standings-card">
                    <table class="standings-table standings-table--${isDrivers ? 'drivers' : 'constructors'}">
                        <thead><tr>${headCells}</tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;

        // Listeners para cambiar de pestaña
        document.getElementById('tab-drivers').addEventListener('click', () => {
            if (!isDrivers) {
                state.currentStandingsTab = 'drivers';
                loadStandingsView();
            }
        });

        document.getElementById('tab-constructors').addEventListener('click', () => {
            if (isDrivers) {
                state.currentStandingsTab = 'constructors';
                loadStandingsView();
            }
        });

    } catch (e) {
        console.error(e);
        app.innerHTML = `
            <div style="text-align:center; margin-top:50px;">
                <h3 style="color:red;">Error cargando datos 😕</h3>
                <p style="color:#666;">Intenta reiniciar el servidor.</p>
            </div>`;
    }
}
