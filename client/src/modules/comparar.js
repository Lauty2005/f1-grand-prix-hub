import { Chart, LineController, BarController, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from 'chart.js';
Chart.register(LineController, BarController, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

import { API, SERVER_URL } from './config.js';
import { state } from './state.js';

// ─── XSS PROTECTION ───────────────────────────────────────────────────────────
function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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

// Etiqueta del slot: A, B, C, D
const SLOT_LABELS = ['A', 'B', 'C', 'D'];

// ─── STAT BOX ─────────────────────────────────────────────────────────────────
function statBox(label, values, colors) {
    const cells = values.map((v, i) => `
        <span class="cmp-stat__value" style="color:${colors[i]};">${esc(v)}</span>
    `).join('<span class="cmp-stat__sep">vs</span>');
    return `
        <div class="cmp-stat">
            <span class="cmp-stat__label">${esc(label)}</span>
            <div class="cmp-stat__row">${cells}</div>
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
                <td class="cmp-h2h__pos ${aWon ? 'winner' : ''}" style="color:${aWon ? esc(dA.primary_color) : 'rgba(255,255,255,0.4)'};">${posA}</td>
                <td class="cmp-h2h__race">R${esc(r.round)} · ${esc(r.race_name)}</td>
                <td class="cmp-h2h__pos ${bWon ? 'winner' : ''}" style="color:${bWon ? esc(dB.primary_color) : 'rgba(255,255,255,0.4)'};">${posB}</td>
            </tr>`;
    }).join('');

    return `
        <div class="cmp-h2h">
            <div class="cmp-section-title">Head to Head</div>
            <div class="cmp-h2h__scoreboard">
                <div class="cmp-h2h__score">
                    <span class="cmp-h2h__score-val" style="color:${esc(dA.primary_color)};">${esc(h2h.wins_a)}</span>
                    <span class="cmp-h2h__score-lbl">Victorias</span>
                </div>
                <span class="cmp-h2h__vs">VS</span>
                <div class="cmp-h2h__score">
                    <span class="cmp-h2h__score-val" style="color:${esc(dB.primary_color)};">${esc(h2h.wins_b)}</span>
                    <span class="cmp-h2h__score-lbl">Victorias</span>
                </div>
            </div>
            <div class="table-responsive">
                <table class="cmp-h2h__table">
                    <thead>
                        <tr>
                            <th style="color:${esc(dA.primary_color)};">${esc(dA.last_name)}</th>
                            <th>Carrera</th>
                            <th style="color:${esc(dB.primary_color)};">${esc(dB.last_name)}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
}

// ─── RENDER RESULTS (stats + charts + h2h) ─────────────────────────────────────
function renderResults(data) {
    const { drivers, perRace, h2h } = data;
    const colors = drivers.map(d => d.primary_color);

    // Build race labels union (all rounds any driver participated in)
    const roundMap = {};
    perRace.forEach(r => { roundMap[r.round] = r.race_name; });
    const rounds = Object.keys(roundMap).map(Number).sort((a, b) => a - b);
    const labels = rounds.map(r => `R${r}`);

    // Points per race per driver
    const pointsByDriver = {};
    drivers.forEach(d => { pointsByDriver[d.id] = {}; });

    perRace.forEach(r => {
        if (pointsByDriver[r.driver_id] !== undefined) {
            // pg devuelve strings para sumas SQL → parseFloat
            pointsByDriver[r.driver_id][r.round] = parseFloat(r.points) || 0;
        }
    });

    const cumulativeDatasets = drivers.map(d => {
        let acc = 0;
        const dd = rounds.map(round => {
            acc += Number(pointsByDriver[d.id][round] || 0);
            return acc;
        });
        return {
            label: `${d.first_name} ${d.last_name}`,
            data: dd,
            borderColor: d.primary_color,
            backgroundColor: d.primary_color + '22',
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 6,
            tension: 0.3,
            fill: false,
        };
    });

    // Bar chart stats: wins, podiums, top5, top10, dnfs
    const statLabels = ['Victorias', 'Podios', 'Top 5', 'Top 10', 'DNF'];
    const statDatasets = drivers.map(d => ({
        label: `${d.first_name} ${d.last_name}`,
        data: [d.wins, d.podiums, d.top5, d.top10, d.dnfs].map(Number),
        backgroundColor: d.primary_color,
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.7,
    }));

    const statsHTML = `
        <div class="cmp-stats-grid">
            ${statBox('Puntos',    drivers.map(d => d.points),       colors)}
            ${statBox('Carreras',  drivers.map(d => d.races),        colors)}
            ${statBox('Victorias', drivers.map(d => d.wins),         colors)}
            ${statBox('Podios',    drivers.map(d => d.podiums),      colors)}
            ${statBox('Top 10',    drivers.map(d => d.top10),        colors)}
            ${statBox('DNF',       drivers.map(d => d.dnfs),         colors)}
            ${statBox('V. Rápida', drivers.map(d => d.fastest_laps), colors)}
        </div>`;

    const resultsContainer = document.getElementById('cmpResults');
    resultsContainer.innerHTML = `
        <div class="cmp-section-title">Estadísticas de la temporada</div>
        ${statsHTML}

        <div class="cmp-section-title">Victorias, podios y posiciones</div>
        <div class="cmp-chart-wrap"><canvas id="chartStats"></canvas></div>

        <div class="cmp-section-title">Puntos acumulados</div>
        <div class="cmp-chart-wrap"><canvas id="chartCumulative"></canvas></div>

        ${h2hTableHTML(h2h, drivers)}
    `;

    // Función (no objeto compartido) para evitar que los charts compartan
    // la misma referencia de `scales`
    const makeChartOptions = () => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: '#aeb4bb', font: { size: 12 }, usePointStyle: true, boxWidth: 8 } },
            tooltip: {
                backgroundColor: '#1f1f27',
                titleColor: '#fff',
                bodyColor: '#aeb4bb',
                borderColor: '#333',
                borderWidth: 1,
            },
        },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#666' } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#666' }, beginAtZero: true },
        },
    });

    charts.stats = new Chart(
        document.getElementById('chartStats').getContext('2d'),
        { type: 'bar', data: { labels: statLabels, datasets: statDatasets }, options: makeChartOptions() }
    );

    charts.cumulative = new Chart(
        document.getElementById('chartCumulative').getContext('2d'),
        { type: 'line', data: { labels, datasets: cumulativeDatasets }, options: makeChartOptions() }
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
        resultsContainer.innerHTML = `<div class="cmp-loading cmp-loading--error">No se pudo cargar la comparación. Intentá de nuevo.</div>`;
    }
}

// ─── VS HERO CARD ─────────────────────────────────────────────────────────────
// Los slots A/B se eligen desde los rails. Los slots extra (C/D) son removibles
// y traen su propio <select> para poder cambiar el piloto (los rails no los cubren).
function heroPickerHTML(slot, selectedId, allDrivers) {
    const opts = (allDrivers || []).map(d =>
        `<option value="${esc(d.id)}" ${d.id == selectedId ? 'selected' : ''}>${esc(d.first_name)} ${esc(d.last_name)}</option>`
    ).join('');
    return `
        <select class="cmp-hero-card__select" data-select-slot="${slot}" aria-label="Elegir piloto ${SLOT_LABELS[slot] || ''}">
            ${opts}
        </select>`;
}

function heroCardHTML(driver, slot, removable, allDrivers) {
    const label = SLOT_LABELS[slot] || '';
    const removeBtn = removable
        ? `<button class="cmp-hero-card__remove" data-remove-slot="${slot}" aria-label="Quitar piloto ${label}">×</button>`
        : '';

    if (!driver) {
        // Sólo ocurre en slots extra sin piloto resuelto → mostramos el picker igual
        return `
            <div class="cmp-hero-card cmp-hero-card--empty" data-slot="${slot}">
                ${removeBtn}
                <span class="cmp-hero-card__eyebrow">Piloto ${label}</span>
                <span class="cmp-hero-card__placeholder">Elegí un piloto</span>
                ${removable ? heroPickerHTML(slot, null, allDrivers) : ''}
            </div>`;
    }

    return `
        <div class="cmp-hero-card" style="--team-color:${esc(driver.primary_color)};" data-slot="${slot}">
            ${removeBtn}
            <span class="cmp-hero-card__eyebrow">Piloto ${label}</span>
            <div class="cmp-hero-card__photo">
                <img src="${imgSrc(driver.profile_image_url)}" alt="${esc(driver.first_name)} ${esc(driver.last_name)}" width="200" height="200" loading="lazy">
            </div>
            <span class="cmp-hero-card__first">${esc(driver.first_name)}</span>
            <span class="cmp-hero-card__last">${esc(driver.last_name)}</span>
            <span class="cmp-hero-card__team">
                <span class="cmp-hero-card__logo"><img src="${imgSrc(driver.logo_url)}" alt="" width="20" height="20" loading="lazy" role="presentation"></span>
                ${esc(driver.team_name)}
            </span>
            <span class="cmp-hero-card__num">${esc(driver.permanent_number)}</span>
            ${removable ? heroPickerHTML(slot, driver.id, allDrivers) : ''}
        </div>`;
}

// ─── RAIL ITEM ────────────────────────────────────────────────────────────────
function railItemHTML(driver, slot, active) {
    return `
        <button class="cmp-rail__item ${active ? 'is-active' : ''}"
                style="--team-color:${esc(driver.primary_color)};"
                data-driver-id="${esc(driver.id)}" data-slot="${slot}"
                aria-pressed="${active}">
            <span class="cmp-rail__logo"><img src="${imgSrc(driver.logo_url)}" alt="" width="22" height="22" loading="lazy" role="presentation"></span>
            <span class="cmp-rail__names">
                <span class="cmp-rail__driver">${esc(driver.first_name)} ${esc(driver.last_name)}</span>
                <span class="cmp-rail__team">${esc(driver.team_name)}</span>
            </span>
            <span class="cmp-rail__num">${esc(driver.permanent_number)}</span>
        </button>`;
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────
export async function loadCompararView() {
    const app = document.getElementById('app');
    destroyCharts();

    // Re-fetch si la lista es de otro año o está vacía
    let drivers = state.driversList;
    if (!drivers.length || state.driversListYear !== state.currentYear) {
        app.innerHTML = `<div class="cmp-loading">Cargando pilotos...</div>`;
        try {
            const res = await fetch(`${API}/drivers?year=${state.currentYear}`);
            const json = await res.json();
            drivers = json.data || [];
            state.driversList = drivers;
            state.driversListYear = state.currentYear;
        } catch (e) {
            app.innerHTML = `<div class="cmp-loading cmp-loading--error">No se pudieron cargar los pilotos.</div>`;
            return;
        }
    }

    if (drivers.length < 2) {
        app.innerHTML = `<div class="cmp-loading">Todavía no hay pilotos suficientes para comparar esta temporada.</div>`;
        return;
    }

    // Estado local del comparador
    const cmp = {
        ids: [drivers[0].id, drivers[1].id],   // slot 0 (A) y slot 1 (B) por defecto
        railSearch: ['', ''],                  // texto de búsqueda por rail
        railTeam: ['', ''],                    // filtro de equipo por rail
    };

    // Lista de equipos únicos (para el filtro de cada rail)
    const teams = [...new Set(drivers.map(d => d.team_name))].sort();
    const teamOptions = teams.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');

    function railHTML(slot) {
        const label = SLOT_LABELS[slot];
        return `
            <aside class="cmp-rail cmp-rail--${slot === 0 ? 'a' : 'b'}" data-slot="${slot}">
                <div class="cmp-rail__head">Piloto ${label}</div>
                <input type="search" class="cmp-rail__search" placeholder="Buscar piloto..."
                       data-rail-search="${slot}" aria-label="Buscar piloto ${label}">
                <select class="cmp-rail__filter f1-select" data-rail-team="${slot}" aria-label="Filtrar por equipo ${label}">
                    <option value="">Todos los equipos</option>
                    ${teamOptions}
                </select>
                <div class="cmp-rail__list" data-rail-list="${slot}"></div>
            </aside>`;
    }

    app.innerHTML = `
        <div class="cmp-page">
            <div class="cmp-header">
                <h1 class="cmp-title">Comparador <span>Mano a Mano</span></h1>
                <p class="cmp-subtitle">Elegí dos pilotos para enfrentarlos — o sumá hasta cuatro.</p>
            </div>

            <div class="cmp-layout">
                ${railHTML(0)}

                <section class="cmp-center">
                    <div class="cmp-hero" id="cmpHero"></div>
                    <div class="cmp-extra-actions">
                        <button class="cmp-add-btn" id="btnAddSlot">+ Agregar piloto</button>
                    </div>
                    <div id="cmpResults"></div>
                </section>

                ${railHTML(1)}
            </div>
        </div>
    `;

    // ── Render helpers ──────────────────────────────────────────────────────────
    function filteredDrivers(slot) {
        const q = cmp.railSearch[slot].trim().toLowerCase();
        const team = cmp.railTeam[slot];
        return drivers.filter(d => {
            if (team && d.team_name !== team) return false;
            if (!q) return true;
            return `${d.first_name} ${d.last_name} ${d.team_name}`.toLowerCase().includes(q);
        });
    }

    function renderRail(slot) {
        const list = app.querySelector(`[data-rail-list="${slot}"]`);
        if (!list) return;
        const activeId = cmp.ids[slot];
        const items = filteredDrivers(slot);
        list.innerHTML = items.length
            ? items.map(d => railItemHTML(d, slot, d.id == activeId)).join('')
            : `<div class="cmp-rail__empty">Sin resultados</div>`;
    }

    function renderHero() {
        const hero = document.getElementById('cmpHero');
        const cards = [];
        cmp.ids.forEach((id, i) => {
            const d = drivers.find(x => x.id == id) || null;
            // Slots A y B nunca removibles; los extras (C, D) sí, con su propio selector
            cards.push(heroCardHTML(d, i, i >= 2, drivers));
            if (i < cmp.ids.length - 1) cards.push(`<span class="cmp-vs-badge">VS</span>`);
        });
        hero.innerHTML = cards.join('');
        hero.classList.toggle('cmp-hero--multi', cmp.ids.length > 2);

        const addBtn = document.getElementById('btnAddSlot');
        if (addBtn) addBtn.disabled = cmp.ids.length >= 4;
    }

    function runCompare() {
        const ids = cmp.ids.filter(Boolean);
        if (ids.length < 2) return;
        fetchAndCompare(ids);
    }

    // ── Eventos: selección en rails (delegación) ────────────────────────────────
    app.querySelectorAll('[data-rail-list]').forEach(listEl => {
        listEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.cmp-rail__item');
            if (!btn) return;
            const slot = Number(btn.dataset.slot);
            const id = Number(btn.dataset.driverId);
            if (cmp.ids[slot] == id) return;
            cmp.ids[slot] = id;
            renderRail(slot);
            renderHero();
            runCompare();
        });
    });

    // Búsqueda y filtro por rail
    app.querySelectorAll('[data-rail-search]').forEach(input => {
        input.addEventListener('input', (e) => {
            const slot = Number(e.target.dataset.railSearch);
            cmp.railSearch[slot] = e.target.value;
            renderRail(slot);
        });
    });
    app.querySelectorAll('[data-rail-team]').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const slot = Number(e.target.dataset.railTeam);
            cmp.railTeam[slot] = e.target.value;
            renderRail(slot);
        });
    });

    // Quitar slot extra (delegación en el hero)
    document.getElementById('cmpHero').addEventListener('click', (e) => {
        const rm = e.target.closest('[data-remove-slot]');
        if (!rm) return;
        const slot = Number(rm.dataset.removeSlot);
        cmp.ids.splice(slot, 1);
        renderHero();
        runCompare();
    });

    // Cambiar el piloto de un slot extra (C/D) desde su propio selector
    document.getElementById('cmpHero').addEventListener('change', (e) => {
        const sel = e.target.closest('[data-select-slot]');
        if (!sel) return;
        const slot = Number(sel.dataset.selectSlot);
        const id = Number(sel.value);
        if (!id || cmp.ids[slot] == id) return;
        cmp.ids[slot] = id;
        renderHero();
        runCompare();
    });

    // Agregar slot extra (toma el primer piloto no usado)
    document.getElementById('btnAddSlot').addEventListener('click', () => {
        if (cmp.ids.length >= 4) return;
        const unused = drivers.find(d => !cmp.ids.includes(d.id));
        if (!unused) return;
        cmp.ids.push(unused.id);
        renderHero();
        runCompare();
    });

    // ── Render inicial ──────────────────────────────────────────────────────────
    renderRail(0);
    renderRail(1);
    renderHero();
    runCompare();
}
