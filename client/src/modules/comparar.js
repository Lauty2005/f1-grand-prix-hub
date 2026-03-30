import { API, SERVER_URL } from './config.js';
import { state } from './state.js';

// Instancias Chart.js activas — se destruyen al re-renderizar
const charts = {};

function destroyCharts() {
    Object.values(charts).forEach(c => c?.destroy());
    Object.keys(charts).forEach(k => delete charts[k]);
}

function imgSrc(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : SERVER_URL + url;
}

// ─── STAT BOX ─────────────────────────────────────────────────────────────────
function statBox(label, values, colors) {
    const cells = values.map((v, i) => `
        <span class="cmp-stat__value" style="color:${colors[i]};">${v}</span>
    `).join('<span class="cmp-stat__sep">vs</span>');
    return `
        <div class="cmp-stat">
            <span class="cmp-stat__label">${label}</span>
            <div class="cmp-stat__row">${cells}</div>
        </div>`;
}

// ─── DRIVER SELECTOR ──────────────────────────────────────────────────────────
function selectorHTML(slot, selectedId, drivers) {
    const options = drivers.map(d =>
        `<option value="${d.id}" ${d.id == selectedId ? 'selected' : ''}>${d.first_name} ${d.last_name}</option>`
    ).join('');
    return `
        <div class="cmp-selector" data-slot="${slot}">
            <select class="f1-select cmp-select" id="cmpSelect${slot}">
                <option value="">— Elige piloto —</option>
                ${options}
            </select>
        </div>`;
}

// ─── H2H TABLE ────────────────────────────────────────────────────────────────
function h2hTableHTML(h2h, drivers) {
    if (!h2h || !h2h.races.length) return '';

    const dA = drivers[0], dB = drivers[1];

    const rows = h2h.races.map(r => {
        const aWon = !r.dnf_a && !r.dnf_b && r.pos_a < r.pos_b;
        const bWon = !r.dnf_a && !r.dnf_b && r.pos_b < r.pos_a;
        const posA = r.dnf_a ? 'NC' : `P${r.pos_a}`;
        const posB = r.dnf_b ? 'NC' : `P${r.pos_b}`;
        return `
            <tr class="cmp-h2h__row">
                <td class="cmp-h2h__pos ${aWon ? 'winner' : ''}" style="color:${aWon ? dA.primary_color : 'rgba(255,255,255,0.4)'};">${posA}</td>
                <td class="cmp-h2h__race">R${r.round} · ${r.race_name}</td>
                <td class="cmp-h2h__pos ${bWon ? 'winner' : ''}" style="color:${bWon ? dB.primary_color : 'rgba(255,255,255,0.4)'};">${posB}</td>
            </tr>`;
    }).join('');

    return `
        <div class="cmp-h2h">
            <div class="cmp-section-title">HEAD TO HEAD</div>
            <div class="cmp-h2h__scoreboard">
                <div class="cmp-h2h__score">
                    <span style="color:${dA.primary_color}; font-size:2.5rem; font-weight:900;">${h2h.wins_a}</span>
                    <span style="color:rgba(255,255,255,0.35); font-size:0.75rem;">VICTORIAS</span>
                </div>
                <span class="cmp-h2h__vs">VS</span>
                <div class="cmp-h2h__score">
                    <span style="color:${dB.primary_color}; font-size:2.5rem; font-weight:900;">${h2h.wins_b}</span>
                    <span style="color:rgba(255,255,255,0.35); font-size:0.75rem;">VICTORIAS</span>
                </div>
            </div>
            <div class="table-responsive">
                <table class="cmp-h2h__table">
                    <thead>
                        <tr>
                            <th style="color:${dA.primary_color};">${dA.last_name}</th>
                            <th>CARRERA</th>
                            <th style="color:${dB.primary_color};">${dB.last_name}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
}

// ─── RENDER RESULTS ───────────────────────────────────────────────────────────
function renderResults(data) {
    const { drivers, perRace, h2h } = data;
    const colors = drivers.map(d => d.primary_color);

    // Build race labels union (all rounds any driver participated in)
    const roundMap = {};
    perRace.forEach(r => { roundMap[r.round] = r.race_name; });
    const rounds = Object.keys(roundMap).map(Number).sort((a, b) => a - b);
    const labels = rounds.map(r => `R${r}`);

    // Points per race per driver (cumulative)
    const pointsByDriver = {};
    drivers.forEach(d => { pointsByDriver[d.id] = {}; });
    perRace.forEach(r => {
        if (pointsByDriver[r.driver_id] !== undefined) {
            pointsByDriver[r.driver_id][r.round] = r.points || 0;
        }
    });

    const cumulativeDatasets = drivers.map(d => {
        let acc = 0;
        const data = rounds.map(round => {
            acc += pointsByDriver[d.id][round] || 0;
            return acc;
        });
        return {
            label: `${d.first_name} ${d.last_name}`,
            data,
            borderColor: d.primary_color,
            backgroundColor: d.primary_color + '22',
            borderWidth: 2.5,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.3,
            fill: false,
        };
    });

    // Points per race (individual, not cumulative)
    const perRaceDatasets = drivers.map(d => ({
        label: `${d.first_name} ${d.last_name}`,
        data: rounds.map(round => pointsByDriver[d.id][round] || 0),
        backgroundColor: d.primary_color,
        borderRadius: 4,
        barPercentage: 0.6,
    }));

    // Bar chart stats: wins, podiums, top10, dnfs
    const statLabels = ['Victorias', 'Podios', 'Top 5', 'Top 10', 'DNF'];
    const statDatasets = drivers.map(d => ({
        label: `${d.first_name} ${d.last_name}`,
        data: [d.wins, d.podiums, d.top5, d.top10, d.dnfs],
        backgroundColor: d.primary_color,
        borderRadius: 4,
        barPercentage: 0.5,
    }));

    const statsHTML = `
        <div class="cmp-stats-grid">
            ${statBox('Puntos',   drivers.map(d => d.points),   colors)}
            ${statBox('Carreras', drivers.map(d => d.races),    colors)}
            ${statBox('Victorias',drivers.map(d => d.wins),     colors)}
            ${statBox('Podios',   drivers.map(d => d.podiums),  colors)}
            ${statBox('Top 10',   drivers.map(d => d.top10),    colors)}
            ${statBox('DNF',      drivers.map(d => d.dnfs),     colors)}
            ${statBox('VR',       drivers.map(d => d.fastest_laps), colors)}
        </div>`;

    const resultsContainer = document.getElementById('cmpResults');
    resultsContainer.innerHTML = `
        ${statsHTML}

        <div class="cmp-section-title">PUNTOS ACUMULADOS</div>
        <div class="cmp-chart-wrap"><canvas id="chartCumulative"></canvas></div>

        <div class="cmp-section-title">PUNTOS POR CARRERA</div>
        <div class="cmp-chart-wrap"><canvas id="chartPerRace"></canvas></div>

        <div class="cmp-section-title">ESTADÍSTICAS</div>
        <div class="cmp-chart-wrap"><canvas id="chartStats"></canvas></div>

        ${h2hTableHTML(h2h, drivers)}
    `;

    const chartDefaults = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: '#aaa', font: { size: 12 } } },
            tooltip: { backgroundColor: '#1f1f27', titleColor: '#fff', bodyColor: '#aaa', borderColor: '#333', borderWidth: 1 }
        },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#666' } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#666' }, beginAtZero: true }
        }
    };

    charts.cumulative = new Chart(
        document.getElementById('chartCumulative').getContext('2d'),
        { type: 'line', data: { labels, datasets: cumulativeDatasets }, options: { ...chartDefaults } }
    );

    charts.perRace = new Chart(
        document.getElementById('chartPerRace').getContext('2d'),
        { type: 'bar', data: { labels, datasets: perRaceDatasets }, options: { ...chartDefaults } }
    );

    charts.stats = new Chart(
        document.getElementById('chartStats').getContext('2d'),
        { type: 'bar', data: { labels: statLabels, datasets: statDatasets }, options: { ...chartDefaults } }
    );
}

// ─── FETCH & RENDER ───────────────────────────────────────────────────────────
async function fetchAndCompare(ids) {
    const resultsContainer = document.getElementById('cmpResults');
    destroyCharts();
    resultsContainer.innerHTML = `<div class="cmp-loading">Cargando comparación...</div>`;

    try {
        const res = await fetch(`${API}/drivers/compare?ids=${ids.join(',')}&year=${state.currentYear}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        renderResults(json.data);
    } catch (err) {
        console.error(err);
        resultsContainer.innerHTML = `<div class="cmp-loading" style="color:#e10600;">Error cargando datos.</div>`;
    }
}

// ─── DRIVER CARD (selector header) ────────────────────────────────────────────
function driverCardHeaderHTML(driver) {
    if (!driver) return `<div class="cmp-driver-card cmp-driver-card--empty">Selecciona un piloto</div>`;
    return `
        <div class="cmp-driver-card" style="--team-color: ${driver.primary_color};">
            <img class="cmp-driver-card__img" src="${imgSrc(driver.profile_image_url)}" alt="${driver.last_name}">
            <div class="cmp-driver-card__info">
                <span class="cmp-driver-card__name">${driver.first_name} <strong>${driver.last_name}</strong></span>
                <span class="cmp-driver-card__team" style="color:${driver.primary_color};">${driver.team_name}</span>
            </div>
            <span class="cmp-driver-card__number" style="color:${driver.primary_color};">#${driver.permanent_number}</span>
        </div>`;
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────
export async function loadCompararView() {
    const app = document.getElementById('app');
    destroyCharts();

    // Ensure drivers are loaded
    let drivers = state.driversList;
    if (!drivers.length) {
        try {
            const res = await fetch(`${API}/drivers?year=${state.currentYear}`);
            const json = await res.json();
            drivers = json.data || [];
            state.driversList = drivers;
        } catch (e) {
            app.innerHTML = `<div class="cmp-loading" style="color:#e10600;">Error cargando pilotos.</div>`;
            return;
        }
    }

    // Default: first two drivers
    let selectedIds = drivers.length >= 2 ? [drivers[0].id, drivers[1].id] : [];

    app.innerHTML = `
        <div class="cmp-page">
            <div class="cmp-header">
                <h1 class="cmp-title">COMPARADOR DE PILOTOS</h1>
                <p class="cmp-subtitle">Seleccioná hasta 4 pilotos para comparar</p>
            </div>

            <div class="cmp-selector-area" id="cmpSelectorArea">
                <div class="cmp-selectors-row" id="cmpSelectorsRow">
                    ${selectedIds.map((id, i) => selectorHTML(i, id, drivers)).join('')}
                </div>

                <div class="cmp-driver-cards-row" id="cmpDriverCards">
                    ${selectedIds.map(id => driverCardHeaderHTML(drivers.find(d => d.id == id))).join('')}
                </div>

                <div class="cmp-actions">
                    <button class="nav-btn active-btn" id="btnCompare">COMPARAR</button>
                    <button class="nav-btn" id="btnAddSlot" ${selectedIds.length >= 4 ? 'disabled' : ''}>+ Agregar piloto</button>
                    <button class="nav-btn" id="btnRemoveSlot" ${selectedIds.length <= 2 ? 'disabled' : ''}>− Quitar</button>
                </div>
            </div>

            <div id="cmpResults"></div>
        </div>
    `;

    // ── State local del comparador ──
    const compareState = { ids: [...selectedIds] };

    function getSelectedIds() {
        return compareState.ids.map((_, i) => {
            const sel = document.getElementById(`cmpSelect${i}`);
            return sel ? parseInt(sel.value) || null : null;
        }).filter(Boolean);
    }

    function rebuildSelectors() {
        const row = document.getElementById('cmpSelectorsRow');
        const cards = document.getElementById('cmpDriverCards');
        const btnAdd = document.getElementById('btnAddSlot');
        const btnRemove = document.getElementById('btnRemoveSlot');

        row.innerHTML = compareState.ids.map((id, i) => selectorHTML(i, id, drivers)).join('');
        cards.innerHTML = compareState.ids.map(id => driverCardHeaderHTML(drivers.find(d => d.id == id))).join('');

        if (btnAdd) btnAdd.disabled = compareState.ids.length >= 4;
        if (btnRemove) btnRemove.disabled = compareState.ids.length <= 2;

        // Re-attach listeners
        compareState.ids.forEach((_, i) => {
            document.getElementById(`cmpSelect${i}`)?.addEventListener('change', (e) => {
                compareState.ids[i] = parseInt(e.target.value) || null;
                const card = document.getElementById('cmpDriverCards').children[i];
                if (card) card.outerHTML = driverCardHeaderHTML(drivers.find(d => d.id == compareState.ids[i]));
                // Rebuild just the cards column
                document.getElementById('cmpDriverCards').innerHTML =
                    compareState.ids.map(id => driverCardHeaderHTML(drivers.find(d => d.id == id))).join('');
            });
        });
    }

    // Initial listener attachment
    rebuildSelectors();

    document.getElementById('btnCompare').addEventListener('click', () => {
        const ids = getSelectedIds();
        if (ids.length < 2) {
            document.getElementById('cmpResults').innerHTML =
                `<div class="cmp-loading">Seleccioná al menos 2 pilotos.</div>`;
            return;
        }
        fetchAndCompare(ids);
    });

    document.getElementById('btnAddSlot').addEventListener('click', () => {
        if (compareState.ids.length >= 4) return;
        const unused = drivers.find(d => !compareState.ids.includes(d.id));
        compareState.ids.push(unused ? unused.id : null);
        rebuildSelectors();
    });

    document.getElementById('btnRemoveSlot').addEventListener('click', () => {
        if (compareState.ids.length <= 2) return;
        compareState.ids.pop();
        rebuildSelectors();
    });

    // Auto-compare on load
    if (selectedIds.length >= 2) fetchAndCompare(selectedIds);
}
