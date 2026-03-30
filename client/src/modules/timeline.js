import { API } from './config.js';
import { state } from './state.js';

// ── Chart instance & state ──
let tChart     = null;
let allDrivers = [];
const activeDriverIds = new Set();

// ── Type metadata ──
const TYPE_META = {
    leader_change: { label: 'Cambio de Líder', color: '#e10600', defaultIcon: '🔄' },
    incident:      { label: 'Incidente',        color: '#ff8c00', defaultIcon: '💥' },
    regulation:    { label: 'Reglamento',        color: '#3b82f6', defaultIcon: '📋' },
    milestone:     { label: 'Hito',              color: '#10b981', defaultIcon: '🏆' },
};

// ═══════════════════════════════════════════
//  ENTRY POINT
// ═══════════════════════════════════════════
export async function loadTimelineView() {
    const app = document.querySelector('#app');
    app.innerHTML = `
        <div style="text-align:center; margin-top:60px;">
            <p style="color:rgba(255,255,255,0.4); font-size:0.9rem;">Calculando evolución del campeonato...</p>
        </div>`;

    // Destroy existing chart before re-render
    if (tChart) { tChart.destroy(); tChart = null; }
    activeDriverIds.clear();
    allDrivers = [];

    try {
        const res  = await fetch(`${API}/timeline?year=${state.currentYear}`);
        const json = await res.json();
        if (!json.success) throw new Error('API error');

        const { evolution, moments } = json.data;

        allDrivers = evolution.drivers;
        // Default: top 5 drivers active
        allDrivers.slice(0, 5).forEach(d => activeDriverIds.add(d.id));

        renderPage(app, evolution, moments);
    } catch (e) {
        console.error(e);
        app.innerHTML = '<h3 style="color:red; text-align:center; margin-top:60px;">Error cargando la timeline.</h3>';
    }
}

// ═══════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════
function renderPage(app, evolution, moments) {
    const hasEvolution = evolution.races.length > 0;

    // ── Driver pills ──
    const pillsHTML = evolution.drivers.map(d => {
        const isActive = activeDriverIds.has(d.id);
        return `
            <button class="tl-driver-pill ${isActive ? 'active' : ''}"
                    data-driver-id="${d.id}"
                    style="border-color:${isActive ? d.color : 'transparent'};">
                <span class="tl-driver-pill__dot" style="background:${d.color};"></span>
                ${d.shortName}
            </button>`;
    }).join('');

    // ── Type filter ──
    const typeFiltersHTML = [
        { key: 'all',           label: 'Todos' },
        { key: 'leader_change', label: '🔄 Líder' },
        { key: 'incident',      label: '💥 Incidente' },
        { key: 'regulation',    label: '📋 Reglamento' },
        { key: 'milestone',     label: '🏆 Hito' },
    ].map((tf, i) =>
        `<button class="tl-type-btn ${i === 0 ? 'active' : ''}" data-type="${tf.key}">${tf.label}</button>`
    ).join('');

    // ── Moment cards ──
    const momentsHTML = moments.length > 0
        ? moments.map(m => buildMomentCard(m)).join('')
        : '<p class="tl-empty">No hay momentos clave registrados para esta temporada.<br>Añádelos desde el panel de administración.</p>';

    app.innerHTML = `
        <div class="timeline-page">

            <div class="calendar-header" style="margin-bottom:32px;">
                <h1>TIMELINE ${state.currentYear}</h1>
                <p class="tl-subtitle">Evolución del campeonato y momentos clave de la temporada</p>
            </div>

            <!-- ── EVOLUCIÓN ── -->
            <p class="tl-section-title">Evolución del Campeonato</p>

            ${hasEvolution ? `
                <div class="tl-driver-filters" id="tl-driver-filters">${pillsHTML}</div>
                <div class="tl-chart-wrap">
                    <canvas id="tl-chart"></canvas>
                </div>
            ` : `
                <div class="tl-chart-wrap tl-chart-wrap--empty">
                    <p class="tl-empty">No hay resultados registrados para ${state.currentYear} aún.</p>
                </div>
            `}

            <!-- ── MOMENTOS CLAVE ── -->
            <p class="tl-section-title" style="margin-top:44px;">Momentos Clave</p>
            <div class="tl-type-filters">${typeFiltersHTML}</div>
            <div class="tl-moments-list" id="tl-moments-list">${momentsHTML}</div>

        </div>`;

    // Build chart after DOM is ready
    if (hasEvolution) buildChart(evolution);

    // ── Driver pill listeners ──
    document.querySelectorAll('.tl-driver-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const id = parseInt(pill.dataset.driverId);
            const driver = allDrivers.find(d => d.id === id);
            if (activeDriverIds.has(id)) {
                activeDriverIds.delete(id);
                pill.classList.remove('active');
                pill.style.borderColor = 'transparent';
            } else {
                activeDriverIds.add(id);
                pill.classList.add('active');
                pill.style.borderColor = driver?.color || 'white';
            }
            updateChart(evolution);
        });
    });

    // ── Type filter listeners ──
    document.querySelectorAll('.tl-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tl-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterMoments(btn.dataset.type);
        });
    });
}

// ─────────────────────────────────────────────
//  MOMENT CARD
// ─────────────────────────────────────────────
function buildMomentCard(m) {
    const meta      = TYPE_META[m.type] || TYPE_META.milestone;
    const icon      = m.icon || meta.defaultIcon;
    const raceLabel = m.race_name ? `R${m.round} · ${m.race_name}` : '';

    const actorParts = [];
    if (m.driver_name) actorParts.push(`<span>${m.driver_name}</span>`);
    if (m.team_name)   actorParts.push(`<span>${m.team_name}</span>`);
    const actorHTML = actorParts.length
        ? `<div class="tl-moment__actor">${actorParts.join('<span class="tl-moment__actor-sep">·</span>')}</div>`
        : '';

    return `
        <div class="tl-moment" data-type="${m.type}">
            <div class="tl-moment__dot tl-moment__dot--${m.type}"></div>
            <div class="tl-moment__card">
                <div class="tl-moment__header">
                    <span class="tl-moment__icon">${icon}</span>
                    <span class="tl-moment__type-badge tl-moment__type-badge--${m.type}">${meta.label}</span>
                    ${raceLabel ? `<span class="tl-moment__race">${raceLabel}</span>` : ''}
                </div>
                <div class="tl-moment__title">${m.title}</div>
                ${m.description ? `<div class="tl-moment__desc">${m.description}</div>` : ''}
                ${actorHTML}
            </div>
        </div>`;
}

// ─────────────────────────────────────────────
//  CHART
// ─────────────────────────────────────────────
function buildDatasets(evolution) {
    return evolution.drivers
        .filter(d => activeDriverIds.has(d.id))
        .map(d => ({
            label:                d.shortName,
            data:                 d.points,
            borderColor:          d.color,
            backgroundColor:      d.color + '18',
            borderWidth:          2.5,
            pointRadius:          4,
            pointHoverRadius:     7,
            pointBackgroundColor: d.color,
            pointBorderColor:     '#15151e',
            pointBorderWidth:     1.5,
            tension:              0.35,
            fill:                 false,
        }));
}

function buildChart(evolution) {
    const ctx = document.getElementById('tl-chart');
    if (!ctx) return;

    if (tChart) { tChart.destroy(); tChart = null; }

    tChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels:   evolution.races.map(r => `R${r.round}`),
            datasets: buildDatasets(evolution),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            animation:   { duration: 600, easing: 'easeInOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor:  'rgba(10,10,18,0.95)',
                    titleColor:       'rgba(255,255,255,0.9)',
                    bodyColor:        'rgba(255,255,255,0.65)',
                    borderColor:      'rgba(255,255,255,0.1)',
                    borderWidth:      1,
                    padding:          14,
                    titleFont:        { size: 12, weight: 'bold' },
                    bodyFont:         { size: 12 },
                    callbacks: {
                        title: (items) => evolution.races[items[0]?.dataIndex]?.name || '',
                        label: (item)  => `  ${item.dataset.label}: ${item.raw} pts`,
                    },
                },
            },
            scales: {
                x: {
                    grid:  { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 11 } },
                    border:{ color: 'rgba(255,255,255,0.08)' },
                },
                y: {
                    grid:       { color: 'rgba(255,255,255,0.04)' },
                    ticks:      { color: 'rgba(255,255,255,0.35)', font: { size: 11 } },
                    border:     { color: 'rgba(255,255,255,0.08)' },
                    beginAtZero: true,
                },
            },
        },
    });
}

function updateChart(evolution) {
    if (!tChart) return;
    tChart.data.datasets = buildDatasets(evolution);
    tChart.update('active');
}

// ─────────────────────────────────────────────
//  TYPE FILTER
// ─────────────────────────────────────────────
function filterMoments(type) {
    document.querySelectorAll('.tl-moment').forEach(el => {
        const visible = type === 'all' || el.dataset.type === type;
        el.classList.toggle('tl-moment--hidden', !visible);
    });
}
