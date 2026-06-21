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
// Código de 3 letras estilo timing F1 (Verstappen → VER), sin acentos.
function driverCode(d) {
    return (d.last_name || d.first_name || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .slice(0, 3).toUpperCase();
}

// 2 pilotos → duelo "A vs B"; 3-4 → mini tabla de tiempos (código + valor).
function statBox(label, values, meta) {
    if (values.length > 2) {
        const lines = values.map((v, i) => `
            <div class="cmp-stat__line">
                <span class="cmp-stat__code" style="color:${meta[i].color};">${esc(meta[i].code)}</span>
                <span class="cmp-stat__lineval">${esc(v)}</span>
            </div>`).join('');
        return `
            <div class="cmp-stat cmp-stat--multi">
                <span class="cmp-stat__label">${esc(label)}</span>
                <div class="cmp-stat__list">${lines}</div>
            </div>`;
    }

    const cells = values.map((v, i) =>
        `<span class="cmp-stat__value" style="color:${meta[i].color};">${esc(v)}</span>`
    ).join('<span class="cmp-stat__sep">vs</span>');
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
    const statMeta = drivers.map(d => ({ color: d.primary_color, code: driverCode(d) }));

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
            ${statBox('Puntos',    drivers.map(d => d.points),       statMeta)}
            ${statBox('Carreras',  drivers.map(d => d.races),        statMeta)}
            ${statBox('Victorias', drivers.map(d => d.wins),         statMeta)}
            ${statBox('Podios',    drivers.map(d => d.podiums),      statMeta)}
            ${statBox('Top 10',    drivers.map(d => d.top10),        statMeta)}
            ${statBox('DNF',       drivers.map(d => d.dnfs),         statMeta)}
            ${statBox('V. Rápida', drivers.map(d => d.fastest_laps), statMeta)}
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
// La selección (en cualquier viewport) ocurre desde el bottom-sheet/modal que
// abre el botón "Cambiar piloto". Los slots extra (C/D) además son removibles.
function heroCardHTML(driver, slot, removable) {
    const label = SLOT_LABELS[slot] || '';
    const removeBtn = removable
        ? `<button class="cmp-hero-card__remove" data-remove-slot="${slot}" aria-label="Quitar piloto ${label}">×</button>`
        : '';
    const changeBtn = `<button class="cmp-hero-card__change" data-open-slot="${slot}" aria-haspopup="dialog">Cambiar piloto</button>`;

    if (!driver) {
        return `
            <div class="cmp-hero-card cmp-hero-card--empty" data-slot="${slot}">
                ${removeBtn}
                <span class="cmp-hero-card__eyebrow">Piloto ${label}</span>
                <span class="cmp-hero-card__placeholder">Elegí un piloto</span>
                ${changeBtn}
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
            ${changeBtn}
        </div>`;
}

// ─── PICKER ITEM (lista del sheet) ─────────────────────────────────────────────
function pickerItemHTML(driver, active) {
    return `
        <button class="cmp-pick__item ${active ? 'is-active' : ''}"
                style="--team-color:${esc(driver.primary_color)};"
                data-driver-id="${esc(driver.id)}" aria-pressed="${active}">
            <span class="cmp-pick__logo"><img src="${imgSrc(driver.logo_url)}" alt="" width="22" height="22" loading="lazy" role="presentation"></span>
            <span class="cmp-pick__names">
                <span class="cmp-pick__driver">${esc(driver.first_name)} ${esc(driver.last_name)}</span>
                <span class="cmp-pick__team">${esc(driver.team_name)}</span>
            </span>
            <span class="cmp-pick__num">${esc(driver.permanent_number)}</span>
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
    const cmp = { ids: [drivers[0].id, drivers[1].id] };   // slot 0 (A) y 1 (B) por defecto

    // Equipos únicos (filtro del sheet)
    const teams = [...new Set(drivers.map(d => d.team_name))].sort();
    const teamOptions = teams.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');

    app.innerHTML = `
        <div class="cmp-page">
            <div class="cmp-header">
                <h1 class="cmp-title">Comparador <span>Mano a Mano</span></h1>
                <p class="cmp-subtitle">Elegí dos pilotos para enfrentarlos — o sumá hasta cuatro.</p>
            </div>

            <section class="cmp-center">
                <div class="cmp-hero" id="cmpHero"></div>
                <div class="cmp-extra-actions">
                    <button class="cmp-add-btn" id="btnAddSlot">+ Agregar piloto</button>
                </div>
                <div id="cmpResults"></div>
            </section>

            <div class="cmp-sheet" id="cmpSheet" hidden aria-hidden="true">
                <div class="cmp-sheet__backdrop" data-sheet-close></div>
                <div class="cmp-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="cmpSheetTitle">
                    <div class="cmp-sheet__grip"></div>
                    <div class="cmp-sheet__head">
                        <h2 class="cmp-sheet__title" id="cmpSheetTitle">Elegí piloto</h2>
                        <button class="cmp-sheet__close" data-sheet-close aria-label="Cerrar">×</button>
                    </div>
                    <input type="search" class="cmp-sheet__search" id="cmpSheetSearch" placeholder="Buscar piloto..." aria-label="Buscar piloto">
                    <select class="cmp-sheet__filter f1-select" id="cmpSheetTeam" aria-label="Filtrar por equipo">
                        <option value="">Todos los equipos</option>
                        ${teamOptions}
                    </select>
                    <div class="cmp-sheet__list" id="cmpSheetList"></div>
                </div>
            </div>
        </div>
    `;

    // ── Render helpers ──────────────────────────────────────────────────────────
    function matchDrivers(query, team) {
        const q = (query || '').trim().toLowerCase();
        return drivers.filter(d => {
            if (team && d.team_name !== team) return false;
            if (!q) return true;
            return `${d.first_name} ${d.last_name} ${d.team_name}`.toLowerCase().includes(q);
        });
    }

    function renderHero() {
        const hero = document.getElementById('cmpHero');
        const cards = [];
        cmp.ids.forEach((id, i) => {
            const d = drivers.find(x => x.id == id) || null;
            cards.push(heroCardHTML(d, i, i >= 2));   // A y B fijos; extras removibles
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

    // ── Bottom sheet / modal de selección ───────────────────────────────────────
    const sheet = { slot: null, search: '', team: '', trigger: null };
    const sheetEl = document.getElementById('cmpSheet');
    const sheetList = document.getElementById('cmpSheetList');
    const sheetSearch = document.getElementById('cmpSheetSearch');
    const sheetTeam = document.getElementById('cmpSheetTeam');
    const sheetTitle = document.getElementById('cmpSheetTitle');

    function renderSheetList() {
        const activeId = cmp.ids[sheet.slot];
        const items = matchDrivers(sheet.search, sheet.team);
        sheetList.innerHTML = items.length
            ? items.map(d => pickerItemHTML(d, d.id == activeId)).join('')
            : `<div class="cmp-pick__empty">No hay pilotos que coincidan.</div>`;
    }

    function openSheet(slot, trigger) {
        sheet.slot = slot;
        sheet.search = '';
        sheet.team = '';
        sheet.trigger = trigger || null;
        sheetSearch.value = '';
        sheetTeam.value = '';
        sheetTitle.textContent = `Elegí Piloto ${SLOT_LABELS[slot] || ''}`;
        renderSheetList();
        sheetEl.hidden = false;
        sheetEl.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => sheetEl.classList.add('is-open'));
        document.body.style.overflow = 'hidden';
        setTimeout(() => sheetSearch.focus(), 60);
    }

    function closeSheet() {
        const trigger = sheet.trigger;
        sheetEl.classList.remove('is-open');
        sheetEl.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        setTimeout(() => { sheetEl.hidden = true; }, 240);
        sheet.slot = null;
        sheet.trigger = null;
        if (trigger && trigger.focus) trigger.focus();
    }

    sheetEl.querySelectorAll('[data-sheet-close]').forEach(el => el.addEventListener('click', closeSheet));
    sheetEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

    sheetSearch.addEventListener('input', (e) => { sheet.search = e.target.value; renderSheetList(); });
    sheetTeam.addEventListener('change', (e) => { sheet.team = e.target.value; renderSheetList(); });

    sheetList.addEventListener('click', (e) => {
        const btn = e.target.closest('.cmp-pick__item');
        if (!btn || sheet.slot == null) return;
        const slot = sheet.slot;
        const id = Number(btn.dataset.driverId);
        if (cmp.ids[slot] != id) {
            cmp.ids[slot] = id;
            renderHero();
            runCompare();
        }
        closeSheet();
    });

    // ── Clicks en el hero: abrir sheet o quitar slot extra ──────────────────────
    document.getElementById('cmpHero').addEventListener('click', (e) => {
        const open = e.target.closest('[data-open-slot]');
        if (open) { openSheet(Number(open.dataset.openSlot), open); return; }

        const rm = e.target.closest('[data-remove-slot]');
        if (!rm) return;
        const slot = Number(rm.dataset.removeSlot);
        cmp.ids.splice(slot, 1);
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
    renderHero();
    runCompare();
}
