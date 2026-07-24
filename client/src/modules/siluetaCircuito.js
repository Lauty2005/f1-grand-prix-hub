// client/src/modules/siluetaCircuito.js
// Mini-juego "Silueta del Circuito": se muestra el trazado del circuito
// (map_image_url, ya cargado en races) en modo silueta (filtro CSS) y el
// usuario elige entre 4 opciones cuál es. Racha continua, igual que
// mayorMenor.js — un error corta la racha y "jugar de nuevo" arranca otra.
import { API, SERVER_URL } from './config.js';

const STORAGE_KEY = 'f1hub:siluetaCircuito:bestStreak';
const SHARE_URL = 'https://f1grandprixhub.com';
const OPTIONS_COUNT = 4;

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

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
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
let options = [];
let answered = false;
let over = false;
let streak = 0;
let best = 0;

// ─── RONDA ──────────────────────────────────────────────────────────────────
function pickRound() {
    target = pool[randInt(pool.length)];
    const distractors = shuffle(pool.filter(c => c.circuit_name !== target.circuit_name))
        .slice(0, OPTIONS_COUNT - 1);
    options = shuffle([target, ...distractors]);
    answered = false;
}

function startGame() {
    over = false;
    pickRound();
    renderScoreboard();
    renderArena();
}

function resetGame() {
    streak = 0;
    startGame();
}

function handleAnswer(circuitName) {
    if (answered || over) return;
    answered = true;

    const correct = circuitName === target.circuit_name;
    if (correct) {
        streak++;
        if (streak > best) {
            best = streak;
            setBestStreak(best);
        }
    } else {
        over = true;
        streak = 0;
    }

    renderScoreboard();
    renderArena(circuitName, correct);

    if (correct) {
        setTimeout(() => {
            pickRound();
            renderArena();
        }, 1100);
    } else {
        setTimeout(renderGameOver, 1300);
    }
}

// ─── SHARE ──────────────────────────────────────────────────────────────────
async function shareResult() {
    const text = `Llegué a una racha de ${streak} en Silueta del Circuito de F1 Grand Prix Hub 🏁🗺️ ¿La superás?`;
    if (navigator.share) {
        try { await navigator.share({ text, url: SHARE_URL }); } catch { /* el usuario canceló */ }
        return;
    }
    const btn = document.getElementById('scShare');
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
    const streakEl = document.getElementById('scStreak');
    const bestEl = document.getElementById('scBest');
    if (streakEl) streakEl.textContent = String(streak);
    if (bestEl) bestEl.textContent = String(best);
}

function optionClass(circuitName, pickedName, correct) {
    if (!answered) return '';
    if (circuitName === target.circuit_name) return 'sc-option--correct';
    if (circuitName === pickedName && !correct) return 'sc-option--wrong';
    return 'sc-option--muted';
}

function renderArena(pickedName = null, correct = null) {
    const arena = document.getElementById('scArena');
    if (!arena) return;

    arena.innerHTML = `
        <div class="sc-silhouette">
            <img src="${imgSrc(target.map_image_url)}" alt="Trazado del circuito" loading="lazy">
        </div>
        <div class="sc-options">
            ${options.map(o => `
                <button class="sc-option ${optionClass(o.circuit_name, pickedName, correct)}" data-circuit="${esc(o.circuit_name)}" ${answered ? 'disabled' : ''}>
                    ${esc(o.circuit_name)}
                </button>`).join('')}
        </div>
    `;

    if (!answered) {
        arena.querySelectorAll('.sc-option').forEach(btn => {
            btn.addEventListener('click', () => handleAnswer(btn.dataset.circuit));
        });
    }
}

function renderGameOver() {
    const arena = document.getElementById('scArena');
    if (!arena) return;

    arena.insertAdjacentHTML('beforeend', `
        <div class="sc-gameover">
            <span class="sc-gameover__eyebrow">Se acabó la racha</span>
            <span class="sc-gameover__streak">${streak === 0 ? 0 : streak}</span>
            <span class="sc-gameover__label">era ${esc(target.circuit_name)}</span>
            <span class="sc-gameover__best">Mejor racha: ${best}</span>
            <div class="sc-gameover__actions">
                <button class="sc-guess-btn sc-guess-btn--share" id="scShare">Compartir resultado</button>
                <button class="sc-guess-btn sc-guess-btn--again" id="scAgain">Jugar de nuevo</button>
            </div>
        </div>`);

    document.getElementById('scShare').addEventListener('click', shareResult);
    document.getElementById('scAgain').addEventListener('click', resetGame);
}

// ─── MAIN ENTRY POINT ───────────────────────────────────────────────────────
export async function loadSiluetaCircuitoView() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="sc-page">
            <div class="sc-header">
                <h1 class="sc-title">Silueta <span>del Circuito</span></h1>
                <p class="sc-subtitle">Mirá el trazado y elegí de qué circuito es. Un error corta la racha.</p>
            </div>

            <div class="sc-scoreboard">
                <div class="sc-score">
                    <span class="sc-score__val" id="scStreak">0</span>
                    <span class="sc-score__lbl">Racha actual</span>
                </div>
                <div class="sc-score">
                    <span class="sc-score__val" id="scBest">${getBestStreak()}</span>
                    <span class="sc-score__lbl">Mejor racha</span>
                </div>
            </div>

            <div class="sc-arena" id="scArena"><div class="sc-loading">Cargando circuitos...</div></div>
        </div>`;

    best = getBestStreak();
    streak = 0;

    if (!pool.length) {
        try {
            const res = await fetch(`${API}/game/silueta-circuito/pool`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            pool = json.data || [];
        } catch (e) {
            console.error(e);
            document.getElementById('scArena').innerHTML = `<div class="sc-loading sc-loading--error">No se pudieron cargar los circuitos. Intentá de nuevo.</div>`;
            return;
        }
    }

    if (pool.length < OPTIONS_COUNT) {
        document.getElementById('scArena').innerHTML = `<div class="sc-loading">Todavía no hay suficientes circuitos con imagen cargada.</div>`;
        return;
    }

    startGame();
}
