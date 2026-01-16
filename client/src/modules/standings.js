import { API, SERVER_URL } from './config.js';
import { state } from './state.js';

export async function loadStandingsView() {
    const app = document.querySelector('#app');
    
    // Configuración según la pestaña activa
    const isDrivers = state.currentStandingsTab === 'drivers';
    const endpoint = isDrivers 
        ? `${API}/drivers?year=${state.currentYear}`
        : `${API}/constructors-standings?year=${state.currentYear}`; // Usamos la ruta nueva

    app.innerHTML = '<div class="loader">Cargando campeonato...</div>';

    try {
        const res = await fetch(endpoint);
        const result = await res.json();
        const data = result.data || [];

        // Generar filas de la tabla
        const rows = data.map((item, index) => {
            const position = index + 1;
            
            // Estilos dinámicos para el Top 3
            let posColor = 'white';
            if (position === 1) posColor = '#FFD700'; // Oro
            if (position === 2) posColor = '#C0C0C0'; // Plata
            if (position === 3) posColor = '#CD7F32'; // Bronce

            // Contenido de la celda "Participante"
            let participantInfo = '';
            
            if (isDrivers) {
                // Diseño Piloto
                participantInfo = `
                    <div style="display:flex; flex-direction:column;">
                        <span style="color:white; font-weight:700; font-size:1.1rem;">
                            ${item.first_name} ${item.last_name}
                        </span>
                        <span style="color:${item.primary_color}; font-size:0.8rem; letter-spacing:1px;">
                            ${item.team_name}
                        </span>
                    </div>`;
            } else {
                // Diseño Constructor
                participantInfo = `
                    <div style="display:flex; align-items:center; gap:15px;">
                        <span class="teamLogo" style="background: ${item.primary_color}22; border: 1px solid ${item.primary_color};">
                            <img src="${item.logo_url.startsWith('http') ? item.logo_url : SERVER_URL + item.logo_url}" style="width:30px; height:30px; object-fit:contain;">
                        </span>
                        <span style="color:white; font-weight:800; font-size:1.2rem; letter-spacing:0.5px;">
                            ${item.name}
                        </span>
                    </div>`;
            }

            return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); height: 70px; transition: background 0.2s;">
                <td style="text-align:center; font-weight:900; font-size:1.2rem; color:${posColor}; width: 60px;">
                    ${position}
                </td>
                <td style="padding-left: 20px;">
                    ${participantInfo}
                </td>
                <td style="text-align:right;">
                    <span style="font-weight:900; font-size:1.4rem; color:#e10600;">${item.points}</span>
                    <span style="font-size:0.7rem; color:#666; font-weight:bold;">PTS</span>
                </td>
            </tr>`;
        }).join('');

        // Renderizar vista completa
        app.innerHTML = `
            <div style="max-width: 900px; margin: 0 auto; padding-bottom: 60px; animation: fadeIn 0.5s ease;">
                
                <div style="text-align:center; margin-bottom: 40px;">
                    <h1 style="color:white; font-size: 2.5rem; font-weight:900; letter-spacing:-1px; margin-bottom: 20px;">
                        CAMPEONATO ${state.currentYear}
                    </h1>
                    
                    <div class="tab-container">
                        <button id="tab-drivers" class="tab-btn ${isDrivers ? 'active-tab' : ''}">
                            PILOTOS
                        </button>
                        <button id="tab-constructors" class="tab-btn ${!isDrivers ? 'active-tab' : ''}">
                            CONSTRUCTORES
                        </button>
                    </div>
                </div>

                <div class="table-card">
                    <table style="width:100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #333; color:#666; font-size:0.75rem; text-transform:uppercase; letter-spacing:1px;">
                                <th style="padding:15px; width:60px;">Pos</th>
                                <th style="text-align:left; padding:15px 20px;">${isDrivers ? 'Piloto / Equipo' : 'Escudería'}</th>
                                <th style="text-align:right; padding:15px 25px;">Puntos</th>
                            </tr>
                        </thead>
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
                <h3 style="color:#ff4444;">Error cargando datos 😕</h3>
                <p style="color:#666;">Intenta reiniciar el servidor.</p>
            </div>`;
    }
}