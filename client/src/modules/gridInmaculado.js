// client/src/modules/gridInmaculado.js
// Mini-juego "Grid Inmaculado": grilla 3x3 con categorías mezcladas al azar en
// filas y columnas (equipo, nacionalidad, "ganó en tal país", umbral de
// carreras por equipo, logros positivos/negativos) — no hay un eje fijo de
// "equipo" y otro de "logro", cualquier categoría puede caer en cualquier eje.
// Simplificación por el pool chico (31 pilotos, 2 temporadas): se permite
// repetir piloto entre celdas — la regla "sin repetir" de la versión clásica
// del juego se deja para cuando haya más pilotos históricos cargados.
import { API, SERVER_URL } from './config.js';

const STORAGE_KEY = 'f1hub:gridInmaculado:bestScore';
const SHARE_URL = 'https://f1grandprixhub.com';
const GRID_SIZE = 3;
const MAX_BUILD_ATTEMPTS = 300;
const MIN_NATIONALITY_COUNT = 3;   // evita categorías de nacionalidad con 1 solo piloto posible
const MIN_TEAM_RACES_FOR_THRESHOLD = 6; // mínimo para que un umbral "más de N carreras" tenga sentido

// Códigos de país más comunes en el calendario de F1 → nombre en español,
// para que las categorías de "ganó en..."/nacionalidad sean legibles.
const COUNTRY_NAMES = {
    AUS: 'Australia', AUT: 'Austria', AZE: 'Azerbaiyán', BHR: 'Baréin', BEL: 'Bélgica',
    BRA: 'Brasil', CAN: 'Canadá', CHN: 'China', ESP: 'España', FRA: 'Francia',
    GBR: 'Reino Unido', HUN: 'Hungría', ITA: 'Italia', JPN: 'Japón', MEX: 'México',
    MON: 'Mónaco', MCO: 'Mónaco', NLD: 'Países Bajos', QAT: 'Catar', SAU: 'Arabia Saudita',
    SGP: 'Singapur', USA: 'Estados Unidos', ARE: 'Emiratos Árabes Unidos', RUS: 'Rusia',
    TUR: 'Turquía', POR: 'Portugal', GER: 'Alemania', DEU: 'Alemania', CHE: 'Suiza',
};

function countryLabel(code) {
    return COUNTRY_NAMES[code] || code;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
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

function fullName(d) {
    return `${d.first_name} ${d.last_name}`;
}

function randInt(n) {
    return Math.floor(Math.random() * n);
}

function sampleDistinct(arr, n) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
}

function getBestScore() {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
}

function setBestScore(v) {
    try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* storage no disponible */ }
}

// ─── ESTADO DEL JUEGO ───────────────────────────────────────────────────────
let pool = [];
let categoryPool = [];
let rows = [];
let cols = [];
let cells = [];        // [{ r, c }] — solo para iterar; el estado real vive en cellState
let cellState = {};    // "r-c" -> { locked, driver, correct }
let best = 0;
let sheetCell = null;

// ─── CATEGORÍAS (mezcla de tipos, derivadas del pool) ──────────────────────
function buildCategoryPool() {
    const categories = [];

    // Equipo: "Corrió para X"
    const teamMeta = {};
    pool.forEach(d => (d.teams || []).forEach(t => { if (t && t.name) teamMeta[t.name] = t; }));
    Object.values(teamMeta).forEach(t => {
        categories.push({
            type: 'team',
            label: `Corrió para ${t.name}`,
            primary_color: t.primary_color,
            logo_url: t.logo_url,
            test: d => (d.teams || []).some(dt => dt.name === t.name),
        });
    });

    // Nacionalidad: "Es de X" (solo si hay suficientes pilotos de ese país)
    const countryCounts = {};
    pool.forEach(d => { if (d.country_code) countryCounts[d.country_code] = (countryCounts[d.country_code] || 0) + 1; });
    Object.entries(countryCounts).forEach(([code, count]) => {
        if (count >= MIN_NATIONALITY_COUNT) {
            categories.push({ type: 'country', label: `Es de ${countryLabel(code)}`, test: d => d.country_code === code });
        }
    });

    // Ganó en X país
    const winCountries = new Set();
    pool.forEach(d => (d.win_countries || []).forEach(code => winCountries.add(code)));
    winCountries.forEach(code => {
        categories.push({ type: 'win', label: `Ganó en ${countryLabel(code)}`, test: d => (d.win_countries || []).includes(code) });
    });

    // Umbral de carreras por equipo: "Corrió más de N carreras para X"
    const teamMaxRaces = {};
    pool.forEach(d => (d.team_races || []).forEach(tr => {
        if (!teamMaxRaces[tr.team_name] || tr.races > teamMaxRaces[tr.team_name]) teamMaxRaces[tr.team_name] = tr.races;
    }));
    Object.entries(teamMaxRaces).forEach(([team, max]) => {
        if (max >= MIN_TEAM_RACES_FOR_THRESHOLD) {
            const threshold = Math.max(3, Math.floor(max * 0.5));
            categories.push({
                type: 'threshold',
                label: `Corrió más de ${threshold} carreras para ${team}`,
                test: d => {
                    const entry = (d.team_races || []).find(tr => tr.team_name === team);
                    return entry ? entry.races > threshold : false;
                },
            });
        }
    });

    // Logros, positivos y negativos
    categories.push({ type: 'achv', label: 'Ganó una carrera',       test: d => Number(d.wins) > 0 });
    categories.push({ type: 'achv', label: 'Nunca ganó una carrera', test: d => Number(d.wins) === 0 });
    categories.push({ type: 'achv', label: 'Subió al podio',         test: d => Number(d.podiums) > 0 });
    categories.push({ type: 'achv', label: 'Nunca subió al podio',   test: d => Number(d.podiums) === 0 });
    categories.push({ type: 'achv', label: 'Terminó en el Top 10',   test: d => Number(d.top10) > 0 });
    categories.push({ type: 'achv', label: 'Marcó la vuelta rápida', test: d => Number(d.fastest_laps) > 0 });
    categories.push({ type: 'achv', label: 'Corrió en 2025',         test: d => (d.seasons || []).includes(2025) });
    categories.push({ type: 'achv', label: 'Corrió en 2026',         test: d => (d.seasons || []).includes(2026) });
    categories.push({ type: 'achv', label: 'Piloto titular',         test: d => !d.is_practice_only });
    categories.push({ type: 'achv', label: 'Piloto reserva',         test: d => d.is_practice_only });

    return categories;
}

// ─── GENERACIÓN DE GRILLA (con reintentos hasta que las 9 celdas tengan candidato) ──
// Filas y columnas se sortean del mismo pool mezclado — cualquier categoría
// puede caer en cualquier eje, incluyendo dos del mismo tipo (ej. "Ganó en
// Australia" x "Ganó en Austria").
function buildGrid() {
    if (categoryPool.length < GRID_SIZE * 2) return null;

    for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt++) {
        const picked = sampleDistinct(categoryPool, GRID_SIZE * 2);
        const candidateRows = picked.slice(0, GRID_SIZE);
        const candidateCols = picked.slice(GRID_SIZE);
        let valid = true;

        outer:
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const hasCandidate = pool.some(d => candidateRows[r].test(d) && candidateCols[c].test(d));
                if (!hasCandidate) { valid = false; break outer; }
            }
        }

        if (valid) return { rows: candidateRows, cols: candidateCols };
    }
    return null;
}

function startGame() {
    const grid = buildGrid();
    if (!grid) {
        document.getElementById('giArena').innerHTML = `<div class="gi-loading gi-loading--error">No se pudo armar una grilla válida. Probá de nuevo.</div>`;
        return;
    }
    rows = grid.rows;
    cols = grid.cols;
    cellState = {};
    cells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            cells.push({ r, c });
            cellState[`${r}-${c}`] = { locked: false, driver: null, correct: null };
        }
    }
    renderScoreboard();
    renderGrid();
}

function resetGame() {
    startGame();
}

function currentScore() {
    return Object.values(cellState).filter(c => c.correct).length;
}

function isComplete() {
    return Object.values(cellState).every(c => c.locked);
}

// ─── GUESS ──────────────────────────────────────────────────────────────────
function submitCellGuess(r, c, driver) {
    const key = `${r}-${c}`;
    if (cellState[key].locked) return;

    const correct = rows[r].test(driver) && cols[c].test(driver);
    cellState[key] = { locked: true, driver, correct };

    renderGrid();
    renderScoreboard();

    if (isComplete()) {
        const score = currentScore();
        if (score > best) {
            best = score;
            setBestScore(best);
        }
        setTimeout(renderGameOver, 400);
    }
}

// ─── SHARE ──────────────────────────────────────────────────────────────────
function resultEmojiGrid() {
    let out = '';
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            out += cellState[`${r}-${c}`].correct ? '🟩' : '⬛';
        }
        out += '\n';
    }
    return out.trim();
}

async function shareResult() {
    const score = currentScore();
    const text = `Hice ${score}/9 en Grid Inmaculado de F1 Grand Prix Hub 🏎️🧩\n${resultEmojiGrid()}\n¿Lo superás?`;
    if (navigator.share) {
        try { await navigator.share({ text, url: SHARE_URL }); } catch { /* el usuario canceló */ }
        return;
    }
    const btn = document.getElementById('giShare');
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

// ─── SHEET DE BÚSQUEDA (elegir piloto para una celda) ──────────────────────
function openSheet(r, c) {
    sheetCell = { r, c };
    const sheetEl = document.getElementById('giSheet');
    const title = document.getElementById('giSheetTitle');
    const search = document.getElementById('giSheetSearch');
    title.textContent = `${rows[r].label} + ${cols[c].label}`;
    search.value = '';
    renderSheetList('');
    sheetEl.hidden = false;
    sheetEl.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => sheetEl.classList.add('is-open'));
    document.body.style.overflow = 'hidden';
    setTimeout(() => search.focus(), 60);
}

function closeSheet() {
    const sheetEl = document.getElementById('giSheet');
    sheetEl.classList.remove('is-open');
    sheetEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(() => { sheetEl.hidden = true; }, 240);
    sheetCell = null;
}

function renderSheetList(query) {
    const list = document.getElementById('giSheetList');
    const q = (query || '').trim().toLowerCase();
    const matches = q ? pool.filter(d => fullName(d).toLowerCase().includes(q)) : pool;

    list.innerHTML = matches.length
        ? matches.map(d => `
            <button class="gi-sheet__item" data-driver-id="${esc(d.id)}">
                <span class="gi-sheet__name">${esc(fullName(d))}</span>
            </button>`).join('')
        : `<div class="gi-sheet__empty">Sin coincidencias.</div>`;
}

// ─── RENDER ─────────────────────────────────────────────────────────────────
function renderScoreboard() {
    const scoreEl = document.getElementById('giScore');
    const bestEl = document.getElementById('giBest');
    if (scoreEl) scoreEl.textContent = `${currentScore()}/9`;
    if (bestEl) bestEl.textContent = `${best}/9`;
}

// Cualquier categoría puede caer en fila o columna — el header solo cambia
// de estilo (logo + color de equipo) cuando el tipo es 'team', sea cual sea
// el eje en el que haya caído.
function headerHTML(cat, axisClass) {
    if (cat.type === 'team') {
        return `
            <div class="gi-header ${axisClass}" style="--team-color:${esc(cat.primary_color || '#e10600')};">
                <span class="gi-header__logo"><img src="${imgSrc(cat.logo_url)}" alt="" width="22" height="22" loading="lazy" role="presentation"></span>
                <span class="gi-header__label">${esc(cat.label)}</span>
            </div>`;
    }
    return `<div class="gi-header ${axisClass}"><span class="gi-header__label">${esc(cat.label)}</span></div>`;
}

function cellHTML(r, c) {
    const state = cellState[`${r}-${c}`];
    if (!state.locked) {
        return `<button class="gi-cell gi-cell--empty" data-r="${r}" data-c="${c}">+</button>`;
    }
    const cls = state.correct ? 'gi-cell--correct' : 'gi-cell--wrong';
    return `
        <div class="gi-cell ${cls}">
            <span class="gi-cell__name">${esc(fullName(state.driver))}</span>
        </div>`;
}

function renderGrid() {
    const arena = document.getElementById('giArena');
    if (!arena) return;

    let gridHTML = `<div class="gi-corner"></div>`;
    cols.forEach(cat => { gridHTML += headerHTML(cat, 'gi-header--col'); });
    rows.forEach((rowCat, r) => {
        gridHTML += headerHTML(rowCat, 'gi-header--row');
        cols.forEach((colCat, c) => { gridHTML += cellHTML(r, c); });
    });

    arena.innerHTML = `<div class="gi-grid">${gridHTML}</div>`;

    arena.querySelectorAll('.gi-cell--empty').forEach(btn => {
        btn.addEventListener('click', () => openSheet(Number(btn.dataset.r), Number(btn.dataset.c)));
    });
}

function renderGameOver() {
    const arena = document.getElementById('giArena');
    if (!arena) return;
    const score = currentScore();

    arena.insertAdjacentHTML('beforeend', `
        <div class="gi-gameover">
            <span class="gi-gameover__eyebrow">Grilla completa</span>
            <span class="gi-gameover__score">${score}/9</span>
            <span class="gi-gameover__best">Mejor puntaje: ${best}/9</span>
            <div class="gi-gameover__actions">
                <button class="gi-guess-btn gi-guess-btn--share" id="giShare">Compartir resultado</button>
                <button class="gi-guess-btn gi-guess-btn--again" id="giAgain">Jugar de nuevo</button>
            </div>
        </div>`);

    document.getElementById('giShare').addEventListener('click', shareResult);
    document.getElementById('giAgain').addEventListener('click', resetGame);
}

// ─── MAIN ENTRY POINT ───────────────────────────────────────────────────────
export async function loadGridInmaculadoView() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="gi-page">
            <div class="gi-header-block">
                <h1 class="gi-title">Grid <span>Inmaculado</span></h1>
                <p class="gi-subtitle">Para cada celda, nombrá un piloto que cumpla la fila y la columna a la vez.</p>
            </div>

            <div class="gi-scoreboard">
                <div class="gi-score">
                    <span class="gi-score__val" id="giScore">0/9</span>
                    <span class="gi-score__lbl">Puntaje</span>
                </div>
                <div class="gi-score">
                    <span class="gi-score__val" id="giBest">${getBestScore()}/9</span>
                    <span class="gi-score__lbl">Mejor puntaje</span>
                </div>
            </div>

            <div class="gi-arena" id="giArena"><div class="gi-loading">Cargando pilotos...</div></div>
        </div>

        <div class="gi-sheet" id="giSheet" hidden aria-hidden="true">
            <div class="gi-sheet__backdrop" data-sheet-close></div>
            <div class="gi-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="giSheetTitle">
                <div class="gi-sheet__grip"></div>
                <div class="gi-sheet__head">
                    <h2 class="gi-sheet__title" id="giSheetTitle">Elegí piloto</h2>
                    <button class="gi-sheet__close" data-sheet-close aria-label="Cerrar">×</button>
                </div>
                <input type="search" class="gi-sheet__search" id="giSheetSearch" placeholder="Buscar piloto..." aria-label="Buscar piloto" autocomplete="off">
                <div class="gi-sheet__list" id="giSheetList"></div>
            </div>
        </div>`;

    best = getBestScore();

    const sheetEl = document.getElementById('giSheet');
    sheetEl.querySelectorAll('[data-sheet-close]').forEach(el => el.addEventListener('click', closeSheet));
    sheetEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
    document.getElementById('giSheetSearch').addEventListener('input', (e) => renderSheetList(e.target.value));
    document.getElementById('giSheetList').addEventListener('click', (e) => {
        const btn = e.target.closest('.gi-sheet__item');
        if (!btn || !sheetCell) return;
        const driver = pool.find(d => d.id === Number(btn.dataset.driverId));
        if (driver) {
            const { r, c } = sheetCell;
            closeSheet();
            submitCellGuess(r, c, driver);
        }
    });

    if (!pool.length) {
        try {
            const res = await fetch(`${API}/game/grid-inmaculado/pool`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            pool = json.data || [];
            categoryPool = buildCategoryPool();
        } catch (e) {
            console.error(e);
            document.getElementById('giArena').innerHTML = `<div class="gi-loading gi-loading--error">No se pudieron cargar los datos del juego. Intentá de nuevo.</div>`;
            return;
        }
    }

    if (pool.length < GRID_SIZE || categoryPool.length < GRID_SIZE * 2) {
        document.getElementById('giArena').innerHTML = `<div class="gi-loading">Todavía no hay suficientes datos para armar la grilla.</div>`;
        return;
    }

    startGame();
}
