// client/src/modules/armaGrid.js
// Mini-juego "Arma tu Grid": el usuario arma una dupla de pilotos dentro de un
// presupuesto fijo (estilo fantasy). El costo de cada piloto se deriva de sus
// puntos en la temporada (reutiliza el mismo pool que Mayor o Menor) y el
// resultado se compara contra la mejor dupla matemáticamente posible con ese
// mismo presupuesto, para dar una noción de "qué tan óptimo" fue el equipo.
import { API, SERVER_URL } from './config.js';
import { state } from './state.js';

const STORAGE_KEY = 'f1hub:armaGrid:bestPercent';
const SHARE_URL = 'https://f1grandprixhub.com';
const BUDGET = 40;
const MAX_PICKS = 2;

function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function imgSrc(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : SERVER_URL + url;
}

function getBestPercent() {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
}

function setBestPercent(v) {
    try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* storage no disponible */ }
}

// ─── ESTADO DEL JUEGO ───────────────────────────────────────────────────────
let pool = [];       // [{ ...driver, points, wins, podiums, cost }]
let selected = [];   // hasta 2 drivers elegidos
let optimal = null;  // mejor dupla posible dentro del presupuesto
let revealed = false;

// ─── COSTOS Y ÓPTIMO ────────────────────────────────────────────────────────
function assignCosts(rawPool) {
    const maxPoints = Math.max(1, ...rawPool.map(d => Number(d.points) || 0));
    return rawPool.map(d => {
        const points = Number(d.points) || 0;
        const cost = Math.min(30, Math.max(4, Math.round(4 + 26 * (points / maxPoints))));
        return { ...d, points, cost };
    });
}

function findOptimalPair(list) {
    let best = null;
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const a = list[i], b = list[j];
            const cost = a.cost + b.cost;
            if (cost > BUDGET) continue;
            const points = a.points + b.points;
            if (!best || points > best.points) best = { a, b, points, cost };
        }
    }
    return best;
}

// ─── SELECCIÓN ──────────────────────────────────────────────────────────────
function usedBudget() {
    return selected.reduce((sum, d) => sum + d.cost, 0);
}

function toggleDriver(id) {
    if (revealed) return;
    const idx = selected.findIndex(d => d.id === id);
    if (idx !== -1) {
        selected.splice(idx, 1);
        renderAll();
        return;
    }
    if (selected.length >= MAX_PICKS) return;
    const driver = pool.find(d => d.id === id);
    if (!driver) return;
    if (usedBudget() + driver.cost > BUDGET) {
        flashBudget();
        return;
    }
    selected.push(driver);
    renderAll();
}

function flashBudget() {
    const bar = document.getElementById('agBudgetBar');
    if (!bar) return;
    bar.classList.remove('ag-budget--shake');
    void bar.offsetWidth; // reinicia la animación
    bar.classList.add('ag-budget--shake');
}

function confirmTeam() {
    if (selected.length !== MAX_PICKS) return;
    revealed = true;
    renderAll();
}

function resetTeam() {
    selected = [];
    revealed = false;
    renderAll();
}

// ─── SHARE ──────────────────────────────────────────────────────────────────
async function shareResult() {
    const totalPoints = selected.reduce((s, d) => s + d.points, 0);
    const percent = optimal && optimal.points > 0 ? Math.round((totalPoints / optimal.points) * 100) : 100;
    const names = selected.map(d => `${d.first_name} ${d.last_name}`).join(' y ');
    const text = `Armé un Grid con ${names} y logré el ${percent}% del máximo posible en Arma tu Grid de F1 Grand Prix Hub 🏎️💰 ¿Podés superarlo?`;
    if (navigator.share) {
        try { await navigator.share({ text, url: SHARE_URL }); } catch { /* el usuario canceló */ }
        return;
    }
    const btn = document.getElementById('agShare');
    try {
        await navigator.clipboard.writeText(`${text} ${SHARE_URL}`);
        if (btn) {
            const original = btn.textContent;
            btn.textContent = '¡Copiado!';
            setTimeout(() => { if (btn) btn.textContent = original; }, 1800);
        }
    } catch {
        if (btn) btn.textContent = `${text} ${SHARE_URL}`;
    }
}

// ─── RENDER ─────────────────────────────────────────────────────────────────
function driverCardHTML(driver) {
    const isSelected = selected.some(d => d.id === driver.id);
    const disabled = !isSelected && (selected.length >= MAX_PICKS || usedBudget() + driver.cost > BUDGET);
    return `
        <button type="button" class="ag-driver ${isSelected ? 'ag-driver--selected' : ''} ${disabled ? 'ag-driver--disabled' : ''}"
                data-id="${driver.id}" style="--team-color:${esc(driver.primary_color)};" ${revealed ? 'disabled' : ''}>
            <span class="ag-driver__cost">$${driver.cost}M</span>
            <img class="ag-driver__photo" src="${imgSrc(driver.profile_image_url)}" alt="${esc(driver.first_name)} ${esc(driver.last_name)}" width="72" height="72" loading="lazy">
            <span class="ag-driver__name">${esc(driver.first_name)}<br>${esc(driver.last_name)}</span>
            <span class="ag-driver__team">
                <img src="${imgSrc(driver.logo_url)}" alt="" width="14" height="14" loading="lazy" role="presentation">
                ${esc(driver.team_name)}
            </span>
            <span class="ag-driver__points">${driver.points} pts</span>
        </button>`;
}

function renderGrid() {
    const grid = document.getElementById('agGrid');
    if (!grid) return;
    grid.innerHTML = pool.map(driverCardHTML).join('');
    grid.querySelectorAll('.ag-driver').forEach(btn => {
        btn.addEventListener('click', () => toggleDriver(Number(btn.dataset.id)));
    });
}

function renderBudget() {
    const bar = document.getElementById('agBudgetBar');
    const label = document.getElementById('agBudgetLabel');
    if (!bar || !label) return;
    const used = usedBudget();
    const pct = Math.min(100, (used / BUDGET) * 100);
    bar.style.setProperty('--fill', `${pct}%`);
    label.textContent = `$${used}M / $${BUDGET}M`;
}

function renderFooter() {
    const footer = document.getElementById('agFooter');
    if (!footer) return;

    if (revealed) {
        const totalPoints = selected.reduce((s, d) => s + d.points, 0);
        const totalWins = selected.reduce((s, d) => s + (Number(d.wins) || 0), 0);
        const totalPodiums = selected.reduce((s, d) => s + (Number(d.podiums) || 0), 0);
        const percent = optimal && optimal.points > 0 ? Math.round((totalPoints / optimal.points) * 100) : 100;
        const best = getBestPercent();
        if (percent > best) setBestPercent(percent);

        footer.innerHTML = `
            <div class="ag-result">
                <div class="ag-result__row">
                    <div class="ag-result__stat"><span class="ag-result__val">${totalPoints}</span><span class="ag-result__lbl">Puntos combinados</span></div>
                    <div class="ag-result__stat"><span class="ag-result__val">${totalWins}</span><span class="ag-result__lbl">Victorias</span></div>
                    <div class="ag-result__stat"><span class="ag-result__val">${totalPodiums}</span><span class="ag-result__lbl">Podios</span></div>
                </div>
                <div class="ag-result__percent">
                    <span class="ag-result__percent-val">${percent}%</span>
                    <span class="ag-result__percent-lbl">del máximo posible con $${BUDGET}M</span>
                </div>
                <div class="ag-result__best">Tu mejor marca: ${Math.max(percent, best)}%</div>
                <div class="ag-actions">
                    <button class="ag-btn ag-btn--share" id="agShare">Compartir resultado</button>
                    <button class="ag-btn ag-btn--again" id="agAgain">Armar otro equipo</button>
                </div>
            </div>`;
        document.getElementById('agShare').addEventListener('click', shareResult);
        document.getElementById('agAgain').addEventListener('click', resetTeam);
        return;
    }

    footer.innerHTML = `
        <div class="ag-picks">
            ${selected.map(d => `<span class="ag-pick-chip">${esc(d.first_name)} ${esc(d.last_name)} · $${d.cost}M</span>`).join('') || '<span class="ag-picks__empty">Elegí 2 pilotos sin pasarte del presupuesto</span>'}
        </div>
        <button class="ag-btn ag-btn--confirm" id="agConfirm" ${selected.length === MAX_PICKS ? '' : 'disabled'}>Confirmar equipo</button>
    `;
    const confirmBtn = document.getElementById('agConfirm');
    if (confirmBtn) confirmBtn.addEventListener('click', confirmTeam);
}

function renderAll() {
    renderGrid();
    renderBudget();
    renderFooter();
}

// ─── MAIN ENTRY POINT ───────────────────────────────────────────────────────
export async function loadArmaGridView() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="ag-page">
            <div class="ag-header">
                <h1 class="ag-title">Arma tu <span>Grid</span></h1>
                <p class="ag-subtitle">Elegí una dupla de pilotos sin pasarte de $${BUDGET}M. Cuanto más puntos sumó un piloto en la temporada, más cara su ficha.</p>
            </div>

            <div class="ag-budget" id="agBudgetBar">
                <div class="ag-budget__fill"></div>
                <span class="ag-budget__label" id="agBudgetLabel">$0M / $${BUDGET}M</span>
            </div>

            <div class="ag-grid" id="agGrid"><div class="ag-loading">Cargando pilotos...</div></div>
            <div class="ag-footer" id="agFooter"></div>
        </div>`;

    selected = [];
    revealed = false;

    if (!pool.length || state.gamePoolYear !== state.currentYear) {
        try {
            const res = await fetch(`${API}/game/arma-grid/pool?year=${state.currentYear}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            pool = assignCosts(json.data || []);
            optimal = findOptimalPair(pool);
            state.gamePoolYear = state.currentYear;
        } catch (e) {
            console.error(e);
            document.getElementById('agGrid').innerHTML = `<div class="ag-loading ag-loading--error">No se pudieron cargar los datos del juego. Intentá de nuevo.</div>`;
            return;
        }
    } else {
        pool = assignCosts(pool);
        optimal = findOptimalPair(pool);
    }

    if (pool.length < MAX_PICKS) {
        document.getElementById('agGrid').innerHTML = `<div class="ag-loading">Todavía no hay suficientes pilotos con resultados esta temporada.</div>`;
        return;
    }

    renderAll();
}
