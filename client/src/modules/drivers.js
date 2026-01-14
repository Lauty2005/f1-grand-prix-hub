import { API, SERVER_URL } from './config.js';
import { state } from './state.js';
import { getFlagEmoji, getPositionBadge } from './utils.js';

let driverChart = null; // Variable para guardar la instancia del gráfico

export async function loadDriversView() {
    const app = document.querySelector('#app');
    app.innerHTML = '<h2 style="text-align:center; color:white;">Cargando parrilla...</h2>';

    try {
        const res = await fetch(`${API}/drivers?year=${state.currentYear}`);
        const result = await res.json();

        if (!result.success || !result.data) {
            app.innerHTML = '<h3 style="color:red; text-align:center; margin-top:50px;">Error al cargar datos.</h3>';
            return;
        }

        state.driversList = result.data;

        const html = result.data.map(d => `
            <article class="driver-card" data-id="${d.id}" style="border-top: 4px solid ${d.primary_color}; cursor: pointer;">
                <div class="driver-card__image-container">
                    <img src="${d.profile_image_url.startsWith('http') ? d.profile_image_url : SERVER_URL + d.profile_image_url}" class="driver-card__image" alt="${d.last_name}">
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
                                ${d.permanent_number /* El backend ya trae la suma total aquí */} 
                        </span>
                    </div>
                </div>
            </article>
        `).join('');

        app.innerHTML = `<div class="driver-grid">${html}</div>`;

        document.querySelectorAll('.driver-card').forEach(card => {
            card.addEventListener('click', () => openDriverModal(card.dataset.id));
        });

    } catch (e) {
        console.error(e);
        app.innerHTML = '<h3 style="color:red; text-align:center">Error cargando pilotos</h3>';
    }
}

async function openDriverModal(id) {
    const driver = state.driversList.find(d => d.id == id);
    if (!driver) return;

    const modal = document.getElementById('driverModal');
    const modalBody = modal.querySelector('.modal-body');
    modal.classList.add('is-visible');

    let historyHTML = '';
    let raceLabels = [];
    let pointsPerRace = []; 

    try {
        const res = await fetch(`${API}/drivers/${id}/results`);
        const json = await res.json();
        const history = json.data;
        
        if (history.length > 0) {
            // 1. Preparar datos para el gráfico
            history.forEach(r => {
                raceLabels.push(`R${r.round}`);
                // Usamos el total (Carrera + Sprint) que viene del backend
                pointsPerRace.push(r.points || 0);
            });

            // 2. Generar tabla HTML con lógica visual para Sprint
            historyHTML = `
                <div class="table-responsive" style="max-height: 200px; overflow-y: auto; margin-bottom: 20px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        ${history.map(r => {
                            // 👇 LOGICA VISUAL: Desglose de puntos Sprint
                            let pointsDisplay = `+${r.points}`;

                            return `
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                <td style="padding: 12px 0; color: #aaa; font-size: 0.9rem;">R${r.round}</td>
                                <td style="padding: 12px 10px; color: white; font-weight: bold;">${r.race_name}</td>
                                <td style="text-align: right;">
                                    <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                                        ${r.fastest_lap && !r.dnf ? `<span title="Vuelta Rápida">⏱️</span>` : ''}
                                        
                                        <span style="font-weight:bold; color:#e10600; font-size:0.9rem;">${pointsDisplay}</span>    
                                        ${getPositionBadge(r, driver.primary_color)}
                                    </div>
                                </td>
                            </tr>
                            `;
                        }).join('')}
                    </table>
                </div>
            `;
        } else {
            historyHTML = '<p style="text-align:center; color:#666; margin: 20px 0;">Aún no ha corrido esta temporada.</p>';
        }
    } catch (e) { 
        console.error(e);
        historyHTML = '<p style="color:red;">Error de conexión al cargar historial</p>'; 
    }
    
    // Inyectar HTML del Modal
    modalBody.innerHTML = `
        <div class="driver-modal-layout">
            
            <div class="driver-info-col">
                <img src="${driver.profile_image_url.startsWith('http') ? driver.profile_image_url : SERVER_URL + driver.profile_image_url}" style="width: 120px; height: 120px; object-fit: cover; object-position: top; border-radius: 50%; border: 3px solid ${driver.primary_color}; margin-bottom: 10px; background: rgba(255,255,255,0.05);">

                <h2 style="color: ${driver.primary_color}; font-size: 1.8rem; margin: 0; text-align:center;">${driver.first_name} ${driver.last_name}</h2>
                
                <p style="color: #aaa; display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom: 15px;">
                    <img src="${driver.logo_url.startsWith('http') ? driver.logo_url : SERVER_URL + driver.logo_url}" style="width: 20px;"> ${driver.team_name} | ${getFlagEmoji(driver.country_code)}
                </p>

                <div style="display: flex; justify-content: center; gap: 20px; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 15px; width: 100%;">
                    <div style="text-align:center;"><span style="font-size: 1.2rem; font-weight:bold; color:white;">${driver.permanent_number}</span><br><span style="font-size:0.6rem; color:#666;">NÚMERO</span></div>
                    <div style="text-align:center;"><span style="font-size: 1.2rem; font-weight:bold; color:white;">${driver.podiums}</span><br><span style="font-size:0.6rem; color:#666;">PODIOS</span></div>
                    <div style="text-align:center;"><span style="font-size: 1.2rem; font-weight:bold; color:#e10600;">${driver.points}</span><br><span style="font-size:0.6rem; color:#666;">PUNTOS</span></div>
                </div>

                <div style="width: 100%;">
                    <h4 style="color:white; margin-bottom:10px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px;">Historial de Carreras</h4>
                    ${historyHTML}
                </div>
            </div>

            <div class="driver-chart-col">
                <h4 style="color:#aaa; margin-bottom:15px; text-align:center;">Puntos por Carrera</h4>
                <div style="width: 100%; height: 100%; min-height: 300px;">
                    <canvas id="pointsChart"></canvas>
                </div>
            </div>

        </div>
    `;

    // Renderizar el gráfico si hay datos
    if (raceLabels.length > 0) {
        renderChart(raceLabels, pointsPerRace, driver.primary_color);
    }
}

function renderChart(labels, data, color) {
    const ctx = document.getElementById('pointsChart').getContext('2d');
    
    // Si ya existe un gráfico previo, lo destruimos
    if (driverChart) {
        driverChart.destroy();
    }

    // GRÁFICO DE BARRAS
    driverChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Puntos',
                data: data,
                backgroundColor: color, 
                borderRadius: 4,        
                barPercentage: 0.6,     
                hoverBackgroundColor: '#fff' 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f1f27',
                    titleColor: '#fff',
                    bodyColor: color,
                    borderColor: '#333',
                    borderWidth: 1,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `+ ${context.raw} Pts Totales`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#666' },
                    title: { display: true, text: 'Puntos', color: '#444' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#666' }
                }
            }
        }
    });
}