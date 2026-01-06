import { API } from './config.js';
import { state } from './state.js';

export async function loadStandingsView() {
    const app = document.querySelector('#app');
    
    // 1. Decidir API según pestaña (usando state global)
    const endpoint = state.currentStandingsTab === 'drivers' 
        ? `${API}/drivers?year=${state.currentYear}`
        : `${API}/constructors-standings?year=${state.currentYear}`;

    app.innerHTML = '<h2 style="text-align:center; color:white; margin-top:50px;">Cargando campeonato...</h2>';

    try {
        const res = await fetch(endpoint);
        const result = await res.json();
        const data = result.data || [];

        const rows = data.map((item, index) => {
            if (state.currentStandingsTab === 'drivers') {
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

        app.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto; padding-bottom: 40px;">
                <div style="text-align:center; margin-bottom: 30px;">
                    <h1 style="color:white; font-size: 2.5rem; margin-bottom: 15px;">
                        CAMPEONATO ${state.currentYear}
                    </h1>
                    <div class="tab-container">
                        <button id="tab-drivers" class="tab-btn ${state.currentStandingsTab === 'drivers' ? 'active-tab' : ''}">PILOTOS</button>
                        <button id="tab-constructors" class="tab-btn ${state.currentStandingsTab === 'constructors' ? 'active-tab' : ''}">CONSTRUCTORES</button>
                    </div>
                </div>
                <div class="table-responsive" style="background: #15151e; border-radius: 12px; padding: 10px; border: 1px solid #333;">
                    <table style="width:100%; border-collapse: collapse;">
                        <thead style="border-bottom: 2px solid #333; color:#666; font-size:0.8rem; text-transform:uppercase;">
                            <tr>
                                <th style="padding:15px; width:60px;">Pos</th>
                                <th style="text-align:left; padding:15px 20px;">${state.currentStandingsTab === 'drivers' ? 'Piloto' : 'Equipo'}</th>
                                <th style="text-align:right; padding:15px 20px;">Puntos</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('tab-drivers').addEventListener('click', () => {
            state.currentStandingsTab = 'drivers';
            loadStandingsView();
        });

        document.getElementById('tab-constructors').addEventListener('click', () => {
            state.currentStandingsTab = 'constructors';
            loadStandingsView();
        });

    } catch (e) {
        console.error(e);
        app.innerHTML = '<h3 style="color:red; text-align:center;">Error cargando datos.</h3>';
    }
}