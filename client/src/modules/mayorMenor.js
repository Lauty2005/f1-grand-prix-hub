// client/src/modules/mayorMenor.js
// Mini-juego "Mayor o Menor": se muestra un piloto con una estadística revelada
// y un "retador" con la misma estadística oculta. El usuario adivina si el
// retador tiene MÁS o MENOS que el piloto actual. Un error corta la racha.
import { API, SERVER_URL } from './config.js';
import { state } from './state.js';

const STORAGE_KEY = 'f1hub:mayorMenor:bestStreak';
const SHARE_URL = 'https://f1grandprixhub.com';

const CATEGORIES = [
    { key: 'points',       label: 'Puntos en la temporada' },
    { key: 'wins',         label: 'Victorias' },
    { key: 'podiums',      label: 'Podios' },
    { key: 'top5',         label: 'Top 5' },
    { key: 'top10',        label: 'Top 10' },
    { key: 'fastest_laps', label: 'Vueltas rápidas' },
];

// ─── XSS PROTECTION (mismo patrón que comparar.js) ─────────────────────────
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

function fmt(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function randInt(n) {
    return Math.floor(Math.random() * n);
}

function getBestStreak() {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
}

function setBestStreak(v) {
    try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* storage no disponible */ }
}

// ─── ESTADO DEL JUEGO (módulo, se resetea en cada loadMayorMenorView) ──────
let pool = [];
let known = null;
let challenger = null;
let currentCategory = CATEGORIES[0];
let revealed = false;
let over = false;
let streak = 0;
let best = 0;

// ─── LÓGICA DE RONDA ────────────────────────────────────────────────────────
function pickChallengerAndCategory() {
    for (let i = 0; i < 60; i++) {
        const category = CATEGORIES[randInt(CATEGORIES.length)];
        const candidate = pool[randInt(pool.length)];
        if (candidate.id === known.id) continue;
        if (Number(candidate[category.key]) !== Number(known[category.key])) {
            return { candidate, category };
        }
    }
    // Fallback muy improbable: mismos valores en todas las categorías.
    const candidate = pool.find(d => d.id !== known.id) || pool[0];
    return { candidate, category: CATEGORIES[0] };
}

function startGame() {
    known = pool[randInt(pool.length)];
    const next = pickChallengerAndCategory();
    challenger = next.candidate;
    currentCategory = next.category;
    revealed = false;
    over = false;
    renderScoreboard();
    renderDuel();
    renderActions();
}

function resetGame() {
    streak = 0;
    startGame();
}

function handleGuess(direction) {
    if (revealed || over) return;
    revealed = true;
    document.querySelectorAll('.mm-guess-btn').forEach(b => { b.disabled = true; });

    const a = Number(known[currentCategory.key]);
    const b = Number(challenger[currentCategory.key]);
    const correct = b === a ? true : (direction === 'higher' ? b > a : b < a);

    renderDuel(correct ? 'correct' : 'wrong');

    if (correct) {
        streak++;
        if (streak > best) {
            best = streak;
            setBestStreak(best);
        }
        renderScoreboard();
        setTimeout(() => {
            known = challenger;
            const next = pickChallengerAndCategory();
            challenger = next.candidate;
            currentCategory = next.category;
            revealed = false;
            renderDuel();
            renderActions();
        }, 1100);
    } else {
        over = true;
        setTimeout(renderGameOver, 1100);
    }
}

// ─── SHARE ──────────────────────────────────────────────────────────────────
async function shareResult() {
    const text = `Llegué a una racha de ${streak} en Mayor o Menor de F1 Grand Prix Hub 🏎️🔥 ¿La superás?`;
    if (navigator.share) {
        try { await navigator.share({ text, url: SHARE_URL }); } catch { /* el usuario canceló */ }
        return;
    }
    const btn = document.getElementById('mmShare');
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
function cardHTML({ driver, category, value, hidden, resultClass }) {
    return `
        <div class="mm-card ${resultClass || ''}" style="--team-color:${esc(driver.primary_color)};">
            <div class="mm-card__photo">
                <img src="${imgSrc(driver.profile_image_url)}" alt="${esc(driver.first_name)} ${esc(driver.last_name)}" width="140" height="140" loading="lazy">
            </div>
            <span class="mm-card__first">${esc(driver.first_name)}</span>
            <span class="mm-card__last">${esc(driver.last_name)}</span>
            <span class="mm-card__team">
                <span class="mm-card__logo"><img src="${imgSrc(driver.logo_url)}" alt="" width="18" height="18" loading="lazy" role="presentation"></span>
                ${esc(driver.team_name)}
            </span>
            <div class="mm-card__stat">
                <span class="mm-card__stat-label">${esc(category.label)}</span>
                <span class="mm-card__stat-value">${hidden ? '?' : esc(value)}</span>
            </div>
        </div>`;
}

function renderDuel(highlight = null) {
    const arena = document.getElementById('mmArena');
    if (!arena) return;
    const knownVal = fmt(Number(known[currentCategory.key]));
    const challengerVal = fmt(Number(challenger[currentCategory.key]));
    arena.innerHTML = `
        <div class="mm-duel">
            ${cardHTML({ driver: known, category: currentCategory, value: knownVal })}
            <span class="mm-vs-badge">${esc(currentCategory.label)}</span>
            ${cardHTML({
                driver: challenger,
                category: currentCategory,
                value: challengerVal,
                hidden: !revealed,
                resultClass: highlight ? `mm-card--${highlight}` : '',
            })}
        </div>`;
}

function renderActions() {
    const actions = document.getElementById('mmActions');
    if (!actions) return;
    actions.innerHTML = `
        <button class="mm-guess-btn mm-guess-btn--higher" id="mmHigher">MÁS ▲</button>
        <button class="mm-guess-btn mm-guess-btn--lower" id="mmLower">MENOS ▼</button>
    `;
    document.getElementById('mmHigher').addEventListener('click', () => handleGuess('higher'));
    document.getElementById('mmLower').addEventListener('click', () => handleGuess('lower'));
}

function renderScoreboard() {
    const streakEl = document.getElementById('mmStreak');
    const bestEl = document.getElementById('mmBest');
    if (streakEl) streakEl.textContent = String(streak);
    if (bestEl) bestEl.textContent = String(best);
}

function renderGameOver() {
    const arena = document.getElementById('mmArena');
    const actions = document.getElementById('mmActions');
    if (!arena || !actions) return;

    arena.innerHTML = `
        <div class="mm-gameover">
            <span class="mm-gameover__eyebrow">Se acabó la racha</span>
            <span class="mm-gameover__streak">${streak}</span>
            <span class="mm-gameover__label">aciertos seguidos</span>
            <span class="mm-gameover__best">Mejor racha: ${best}</span>
        </div>`;
    actions.innerHTML = `
        <button class="mm-guess-btn mm-guess-btn--share" id="mmShare">Compartir resultado</button>
        <button class="mm-guess-btn mm-guess-btn--again" id="mmAgain">Jugar de nuevo</button>
    `;
    document.getElementById('mmShare').addEventListener('click', shareResult);
    document.getElementById('mmAgain').addEventListener('click', resetGame);
}

// ─── MAIN ENTRY POINT ───────────────────────────────────────────────────────
export async function loadMayorMenorView() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="mm-page">
            <div class="mm-header">
                <h1 class="mm-title">Mayor <span>o Menor</span></h1>
                <p class="mm-subtitle">Adiviná si el próximo piloto tiene más o menos que el actual. Un error corta la racha.</p>
            </div>

            <div class="mm-scoreboard">
                <div class="mm-score">
                    <span class="mm-score__val" id="mmStreak">0</span>
                    <span class="mm-score__lbl">Racha actual</span>
                </div>
                <div class="mm-score">
                    <span class="mm-score__val" id="mmBest">${getBestStreak()}</span>
                    <span class="mm-score__lbl">Mejor racha</span>
                </div>
            </div>

            <div class="mm-arena" id="mmArena"><div class="mm-loading">Cargando pilotos...</div></div>
            <div class="mm-actions" id="mmActions"></div>
        </div>`;

    best = getBestStreak();
    streak = 0;
    over = false;

    // Reutiliza el pool cacheado si ya es del mismo año (mismo patrón que driversList en comparar.js)
    if (!pool.length || state.gamePoolYear !== state.currentYear) {
        try {
            const res = await fetch(`${API}/game/mayor-menor/pool?year=${state.currentYear}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            pool = json.data || [];
            state.gamePoolYear = state.currentYear;
        } catch (e) {
            console.error(e);
            document.getElementById('mmArena').innerHTML = `<div class="mm-loading mm-loading--error">No se pudieron cargar los datos del juego. Intentá de nuevo.</div>`;
            return;
        }
    }

    if (pool.length < 2) {
        document.getElementById('mmArena').innerHTML = `<div class="mm-loading">Todavía no hay suficientes pilotos con resultados esta temporada.</div>`;
        return;
    }

    startGame();
}
