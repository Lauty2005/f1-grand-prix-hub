// client/src/modules/adivinaPiloto.js
// Mini-juego "Adivina el Piloto" (modo práctica, sin calendario diario — el pool
// actual de 31 pilotos es chico para sostener un desafío único por día).
// Se elige un piloto al azar; el usuario busca y selecciona candidatos de una
// lista, y cada intento revela qué atributos coinciden con el piloto objetivo.
import { API, SERVER_URL } from './config.js';
import { state } from './state.js';

const STORAGE_KEY = 'f1hub:adivinaPiloto:bestStreak';
const SHARE_URL = 'https://f1grandprixhub.com';
const MAX_ATTEMPTS = 8;

const ATTRIBUTES = [
    { key: 'team_name',    label: 'Escudería',    type: 'text' },
    { key: 'country_code', label: 'Nacionalidad', type: 'text' },
    { key: 'number',       label: 'Número',       type: 'numeric' },
    { key: 'role',         label: 'Rol',          type: 'text' },
];

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

function randInt(n) {
    return Math.floor(Math.random() * n);
}

function fullName(d) {
    return `${d.first_name} ${d.last_name}`;
}

function roleOf(d) {
    return d.is_practice_only ? 'Reserva' : 'Titular';
}

function getBestStreak() {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
}

function setBestStreak(v) {
    try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* storage no disponible */ }
}

// ─── ESTADO DEL JUEGO ───────────────────────────────────────────────────────
let pool = [];
let target = null;
let guesses = [];      // [{ driver, results }]
let guessedIds = [];
let over = false;
let won = false;
let streak = 0;
let best = 0;

// ─── COMPARACIÓN DE ATRIBUTOS ──────────────────────────────────────────────
function compareGuess(driver) {
    return ATTRIBUTES.map(attr => {
        if (attr.key === 'role') {
            const match = roleOf(driver) === roleOf(target);
            return { ...attr, value: roleOf(driver), match };
        }
        if (attr.type === 'numeric') {
            const gVal = Number(driver[attr.key]);
            const tVal = Number(target[attr.key]);
            const match = gVal === tVal;
            const arrow = match ? '' : (gVal > tVal ? '↓' : '↑');
            return { ...attr, value: gVal, match, arrow };
        }
        const gVal = driver[attr.key];
        const tVal = target[attr.key];
        const match = gVal === tVal;
        return { ...attr, value: gVal, match };
    });
}

// ─── JUEGO ──────────────────────────────────────────────────────────────────
function startGame() {
    target = pool[randInt(pool.length)];
    guesses = [];
    guessedIds = [];
    over = false;
    won = false;
    renderScoreboard();
    renderGuessInput();
    renderGuessesTable();
}

function resetGame() {
    startGame();
}

function submitGuess(driver) {
    if (over || guessedIds.includes(driver.id)) return;

    const results = compareGuess(driver);
    guesses.push({ driver, results });
    guessedIds.push(driver.id);

    if (driver.id === target.id) {
        won = true;
        over = true;
        streak++;
        if (streak > best) {
            best = streak;
            setBestStreak(best);
        }
        renderScoreboard();
    } else if (guesses.length >= MAX_ATTEMPTS) {
        over = true;
        streak = 0;
        renderScoreboard();
    }

    renderGuessesTable();
    renderGuessInput();

    if (over) {
        setTimeout(renderGameOver, won ? 400 : 700);
    }
}

// ─── SHARE ──────────────────────────────────────────────────────────────────
function resultEmojiGrid() {
    return guesses.map(g =>
        g.results.map(r => (r.match ? '🟩' : '⬛')).join('')
    ).join('\n');
}

async function shareResult() {
    const header = won
        ? `Adiviné al piloto en ${guesses.length}/${MAX_ATTEMPTS} intentos en Adivina el Piloto de F1 Grand Prix Hub 🏎️`
        : `No adiviné al piloto (❌/${MAX_ATTEMPTS}) en Adivina el Piloto de F1 Grand Prix Hub 🏎️`;
    const text = `${header}\n${resultEmojiGrid()}\n¿Lo adivinás vos?`;

    if (navigator.share) {
        try { await navigator.share({ text, url: SHARE_URL }); } catch { /* el usuario canceló */ }
        return;
    }
    const btn = document.getElementById('apShare');
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
function renderScoreboard() {
    const streakEl = document.getElementById('apStreak');
    const bestEl = document.getElementById('apBest');
    if (streakEl) streakEl.textContent = String(streak);
    if (bestEl) bestEl.textContent = String(best);
}

function chipHTML(r) {
    const cls = r.match ? 'ap-chip--match' : 'ap-chip--miss';
    const arrow = r.arrow ? ` <span class="ap-chip__arrow">${r.arrow}</span>` : '';
    return `
        <div class="ap-chip ${cls}">
            <span class="ap-chip__label">${esc(r.label)}</span>
            <span class="ap-chip__value">${esc(r.value)}${arrow}</span>
        </div>`;
}

function guessRowHTML(g) {
    return `
        <div class="ap-guess-row">
            <div class="ap-guess-row__name">${esc(fullName(g.driver))}</div>
            <div class="ap-guess-row__chips">${g.results.map(chipHTML).join('')}</div>
        </div>`;
}

function renderGuessesTable() {
    const container = document.getElementById('apGuesses');
    if (!container) return;
    if (!guesses.length) {
        container.innerHTML = `<div class="ap-loading">Elegí un piloto de la lista para arrancar.</div>`;
        return;
    }
    container.innerHTML = guesses.slice().reverse().map(guessRowHTML).join('');
}

function renderGuessInput() {
    const wrap = document.getElementById('apInputWrap');
    if (!wrap) return;

    if (over) {
        wrap.innerHTML = '';
        return;
    }

    wrap.innerHTML = `
        <div class="ap-search">
            <input type="search" class="ap-search__input" id="apSearchInput" placeholder="Buscar piloto..." aria-label="Buscar piloto" autocomplete="off">
            <div class="ap-search__list" id="apSearchList"></div>
        </div>
        <div class="ap-attempts">Intento ${guesses.length + 1} de ${MAX_ATTEMPTS}</div>
    `;

    const input = document.getElementById('apSearchInput');
    const list = document.getElementById('apSearchList');

    function renderList(q) {
        const query = (q || '').trim().toLowerCase();
        const available = pool.filter(d => !guessedIds.includes(d.id));
        const matches = query
            ? available.filter(d => fullName(d).toLowerCase().includes(query))
            : available;

        list.innerHTML = matches.length
            ? matches.map(d => `
                <button class="ap-search__item" data-driver-id="${esc(d.id)}" style="--team-color:${esc(d.primary_color)};">
                    <span class="ap-search__logo"><img src="${imgSrc(d.logo_url)}" alt="" width="20" height="20" loading="lazy" role="presentation"></span>
                    <span class="ap-search__name">${esc(fullName(d))}</span>
                    <span class="ap-search__team">${esc(d.team_name)}</span>
                </button>`).join('')
            : `<div class="ap-search__empty">Sin coincidencias.</div>`;
    }

    input.addEventListener('input', (e) => renderList(e.target.value));
    list.addEventListener('click', (e) => {
        const btn = e.target.closest('.ap-search__item');
        if (!btn) return;
        const driver = pool.find(d => d.id === Number(btn.dataset.driverId));
        if (driver) {
            submitGuess(driver);
        }
    });

    renderList('');
}

function renderGameOver() {
    const arena = document.getElementById('apArena');
    if (!arena) return;

    const resultHTML = won
        ? `
            <div class="ap-gameover ap-gameover--win">
                <span class="ap-gameover__eyebrow">¡Lo adivinaste!</span>
                <span class="ap-gameover__name">${esc(fullName(target))}</span>
                <span class="ap-gameover__label">en ${guesses.length} de ${MAX_ATTEMPTS} intentos</span>
            </div>`
        : `
            <div class="ap-gameover ap-gameover--lose">
                <span class="ap-gameover__eyebrow">Se acabaron los intentos</span>
                <span class="ap-gameover__name">${esc(fullName(target))}</span>
                <span class="ap-gameover__label">era el piloto</span>
            </div>`;

    arena.insertAdjacentHTML('beforeend', `
        <div class="ap-result">
            ${resultHTML}
            <div class="ap-result__actions">
                <button class="ap-guess-btn ap-guess-btn--share" id="apShare">Compartir resultado</button>
                <button class="ap-guess-btn ap-guess-btn--again" id="apAgain">Jugar de nuevo</button>
            </div>
        </div>`);

    document.getElementById('apShare').addEventListener('click', shareResult);
    document.getElementById('apAgain').addEventListener('click', resetGame);
}

// ─── MAIN ENTRY POINT ───────────────────────────────────────────────────────
export async function loadAdivinaPilotoView() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="ap-page">
            <div class="ap-header">
                <h1 class="ap-title">Adiviná <span>al Piloto</span></h1>
                <p class="ap-subtitle">Buscá un piloto y comparalo con el objetivo. Tenés ${MAX_ATTEMPTS} intentos.</p>
            </div>

            <div class="ap-scoreboard">
                <div class="ap-score">
                    <span class="ap-score__val" id="apStreak">0</span>
                    <span class="ap-score__lbl">Racha actual</span>
                </div>
                <div class="ap-score">
                    <span class="ap-score__val" id="apBest">${getBestStreak()}</span>
                    <span class="ap-score__lbl">Mejor racha</span>
                </div>
            </div>

            <div class="ap-arena" id="apArena">
                <div class="ap-legend">
                    ${ATTRIBUTES.map(a => `<span>${esc(a.label)}</span>`).join('')}
                </div>
                <div id="apInputWrap"><div class="ap-loading">Cargando pilotos...</div></div>
                <div class="ap-guesses" id="apGuesses"></div>
            </div>
        </div>`;

    best = getBestStreak();
    streak = 0;

    // Pool cacheado en el módulo (no depende del selector de temporada global)
    if (!pool.length) {
        try {
            const res = await fetch(`${API}/game/adivina-piloto/pool`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            pool = json.data || [];
        } catch (e) {
            console.error(e);
            document.getElementById('apInputWrap').innerHTML = `<div class="ap-loading ap-loading--error">No se pudieron cargar los datos del juego. Intentá de nuevo.</div>`;
            return;
        }
    }

    if (pool.length < 2) {
        document.getElementById('apInputWrap').innerHTML = `<div class="ap-loading">Todavía no hay suficientes pilotos cargados.</div>`;
        return;
    }

    startGame();
}
