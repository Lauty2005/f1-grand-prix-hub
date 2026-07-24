// client/src/modules/estrategaBoxes.js
// Mini-juego "Estratega de Boxes": el jugador arma su propia estrategia de
// neumáticos (cantidad de paradas + compuesto de cada stint) para una carrera
// real, ANTES de ver qué estrategia usó el ganador real. Es una decisión, no
// trivia — no hay dato "correcto" visible hasta confirmar. Racha continua,
// mismo patrón que mayorMenor.js/siluetaCircuito.js.
import { API } from './config.js';

const STORAGE_KEY = 'f1hub:estrategaBoxes:bestStreak';
const SHARE_URL = 'https://f1grandprixhub.com';
const MAX_STOPS = 3;

const COUNTRY_NAMES = {
    AUS: 'Australia', AUT: 'Austria', AZE: 'Azerbaiyán', BHR: 'Baréin', BEL: 'Bélgica',
    BRA: 'Brasil', CAN: 'Canadá', CHN: 'China', ESP: 'España', FRA: 'Francia',
    GBR: 'Reino Unido', HUN: 'Hungría', ITA: 'Italia', JPN: 'Japón', MEX: 'México',
    MON: 'Mónaco', MCO: 'Mónaco', NLD: 'Países Bajos', QAT: 'Catar', SAU: 'Arabia Saudita',
    SGP: 'Singapur', USA: 'Estados Unidos', ARE: 'Emiratos Árabes Unidos', RUS: 'Rusia',
    TUR: 'Turquía', POR: 'Portugal', GER: 'Alemania', DEU: 'Alemania', CHE: 'Suiza',
};

// Colores/labels reales de compuestos F1 — cualquier valor no listado cae al fallback gris.
const COMPOUND_META = {
    SOFT:         { label: 'Blando',      color: '#e10600' },
    MEDIUM:       { label: 'Medio',       color: '#f2c744' },
    HARD:         { label: 'Duro',        color: '#f5f5f5' },
    INTERMEDIATE: { label: 'Intermedio',  color: '#3ba84a' },
    WET:          { label: 'Lluvia',      color: '#1e6fd9' },
};

function compoundMeta(compound) {
    return COMPOUND_META[compound] || { label: compound, color: '#888' };
}

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

function randInt(n) {
    return Math.floor(Math.random() * n);
}

function getBestStreak() {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
}

function setBestStreak(v) {
    try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* storage no disponible */ }
}

// ─── ESTADO DEL JUEGO ───────────────────────────────────────────────────────
let pool = [];
let compoundOptions = [];  // compuestos disponibles, derivados del pool
let target = null;         // carrera actual { race_name, circuit_name, country_code, total_laps, actual_compounds }
let stops = null;          // 1..MAX_STOPS elegido por el jugador, o null si no eligió aún
let guess = [];            // secuencia de compuestos que va armando el jugador
let revealed = false;
let streak = 0;
let best = 0;

// ─── RONDA ──────────────────────────────────────────────────────────────────
function pickTarget() {
    target = pool[randInt(pool.length)];
    stops = null;
    guess = [];
    revealed = false;
}

function startGame() {
    pickTarget();
    renderScoreboard();
    renderArena();
}

function resetGame() {
    startGame();
}

function chooseStops(n) {
    if (revealed) return;
    stops = n;
    guess = [];
    renderArena();
}

function pickCompound(compound) {
    if (revealed || !stops || guess.length >= stops) return;
    guess.push(compound);
    renderArena();
    if (guess.length === stops) {
        setTimeout(confirmStrategy, 200);
    }
}

function undoLast() {
    if (revealed || !guess.length) return;
    guess.pop();
    renderArena();
}

function confirmStrategy() {
    if (revealed || !stops || guess.length !== stops) return;
    revealed = true;

    const actual = target.actual_compounds || [];
    const exactMatch = guess.length === actual.length && guess.every((c, i) => c === actual[i]);

    if (exactMatch) {
        streak++;
        if (streak > best) {
            best = streak;
            setBestStreak(best);
        }
    } else {
        streak = 0;
    }

    renderScoreboard();
    renderArena();
    setTimeout(renderRoundResult, 300);
}

// ─── SHARE ──────────────────────────────────────────────────────────────────
async function shareResult() {
    const text = `Llegué a una racha de ${streak} en Estratega de Boxes de F1 Grand Prix Hub 🏎️🔧 ¿La superás?`;
    if (navigator.share) {
        try { await navigator.share({ text, url: SHARE_URL }); } catch { /* el usuario canceló */ }
        return;
    }
    const btn = document.getElementById('ebShare');
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
    const streakEl = document.getElementById('ebStreak');
    const bestEl = document.getElementById('ebBest');
    if (streakEl) streakEl.textContent = String(streak);
    if (bestEl) bestEl.textContent = String(best);
}

function chipHTML(compound, size = '') {
    const meta = compoundMeta(compound);
    return `<span class="eb-chip ${size}" style="--chip-color:${esc(meta.color)};">${esc(meta.label)}</span>`;
}

function stopsPickerHTML() {
    const options = [];
    for (let n = 1; n <= MAX_STOPS; n++) {
        options.push(`<button class="eb-stops-btn ${stops === n ? 'is-active' : ''}" data-stops="${n}">${n} parada${n > 1 ? 's' : ''}</button>`);
    }
    return `
        <div class="eb-step">
            <span class="eb-step__label">¿Cuántas paradas hacés?</span>
            <div class="eb-stops-row">${options.join('')}</div>
        </div>`;
}

function compoundPickerHTML() {
    const slots = Array.from({ length: stops }, (_, i) => (
        guess[i] ? chipHTML(guess[i]) : `<span class="eb-slot eb-slot--empty">${i + 1}</span>`
    )).join('<span class="eb-arrow">→</span>');

    const buttons = compoundOptions.map(c => `
        <button class="eb-compound-btn" data-compound="${esc(c)}" style="--chip-color:${esc(compoundMeta(c).color)};" ${guess.length >= stops ? 'disabled' : ''}>
            ${esc(compoundMeta(c).label)}
        </button>`).join('');

    return `
        <div class="eb-step">
            <span class="eb-step__label">Elegí el compuesto de cada stint, en orden</span>
            <div class="eb-sequence">${slots}</div>
            <div class="eb-compound-row">${buttons}</div>
            ${guess.length ? '<button class="eb-undo" id="ebUndo">← Deshacer</button>' : ''}
        </div>`;
}

function renderArena() {
    const arena = document.getElementById('ebArena');
    if (!arena) return;

    const header = `
        <div class="eb-race-card">
            <span class="eb-race-card__name">${esc(target.race_name || target.circuit_name)}</span>
            <span class="eb-race-card__meta">${esc(countryLabel(target.country_code))} · ${esc(target.total_laps)} vueltas</span>
        </div>`;

    let body = '';
    if (revealed) {
        body = `<div class="eb-loading">Calculando resultado...</div>`;
    } else if (stops == null) {
        body = stopsPickerHTML();
    } else {
        body = compoundPickerHTML();
    }

    arena.innerHTML = `${header}<div class="eb-decision">${body}</div>`;

    arena.querySelectorAll('.eb-stops-btn').forEach(btn => {
        btn.addEventListener('click', () => chooseStops(Number(btn.dataset.stops)));
    });
    arena.querySelectorAll('.eb-compound-btn').forEach(btn => {
        btn.addEventListener('click', () => pickCompound(btn.dataset.compound));
    });
    const undoBtn = document.getElementById('ebUndo');
    if (undoBtn) undoBtn.addEventListener('click', undoLast);
}

function renderRoundResult() {
    const arena = document.getElementById('ebArena');
    if (!arena) return;

    const actual = target.actual_compounds || [];
    const exactMatch = guess.length === actual.length && guess.every((c, i) => c === actual[i]);

    const guessRow = guess.map((c, i) => {
        const hit = actual[i] === c;
        return `<span class="eb-result-chip ${hit ? 'eb-result-chip--hit' : 'eb-result-chip--miss'}" style="--chip-color:${esc(compoundMeta(c).color)};">${esc(compoundMeta(c).label)}</span>`;
    }).join('<span class="eb-arrow">→</span>');

    const actualRow = actual.map(c => chipHTML(c)).join('<span class="eb-arrow">→</span>');

    arena.insertAdjacentHTML('beforeend', `
        <div class="eb-result ${exactMatch ? 'eb-result--win' : 'eb-result--lose'}">
            <span class="eb-result__eyebrow">${exactMatch ? '¡Estrategia exacta!' : 'No coincidió'}</span>
            <div class="eb-result__block">
                <span class="eb-result__label">Tu estrategia</span>
                <div class="eb-result__row">${guessRow}</div>
            </div>
            <div class="eb-result__block">
                <span class="eb-result__label">Estrategia real del ganador</span>
                <div class="eb-result__row">${actualRow}</div>
            </div>
            <div class="eb-result__actions">
                <button class="eb-guess-btn eb-guess-btn--share" id="ebShare">Compartir resultado</button>
                <button class="eb-guess-btn eb-guess-btn--again" id="ebAgain">Jugar de nuevo</button>
            </div>
        </div>`);

    document.getElementById('ebShare').addEventListener('click', shareResult);
    document.getElementById('ebAgain').addEventListener('click', resetGame);
}

// ─── MAIN ENTRY POINT ───────────────────────────────────────────────────────
export async function loadEstrategaBoxesView() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="eb-page">
            <div class="eb-header">
                <h1 class="eb-title">Estratega <span>de Boxes</span></h1>
                <p class="eb-subtitle">Armá tu estrategia de neumáticos antes de ver qué hizo el ganador real. Si no coincide exacto, se corta la racha.</p>
            </div>

            <div class="eb-scoreboard">
                <div class="eb-score">
                    <span class="eb-score__val" id="ebStreak">0</span>
                    <span class="eb-score__lbl">Racha actual</span>
                </div>
                <div class="eb-score">
                    <span class="eb-score__val" id="ebBest">${getBestStreak()}</span>
                    <span class="eb-score__lbl">Mejor racha</span>
                </div>
            </div>

            <div class="eb-arena" id="ebArena"><div class="eb-loading">Cargando carreras...</div></div>
        </div>`;

    best = getBestStreak();
    streak = 0;

    if (!pool.length) {
        try {
            const res = await fetch(`${API}/game/estratega-boxes/pool`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            pool = (json.data || []).filter(r => Array.isArray(r.actual_compounds) && r.actual_compounds.length > 0);
            const compoundSet = new Set();
            pool.forEach(r => r.actual_compounds.forEach(c => compoundSet.add(c)));
            compoundOptions = Array.from(compoundSet);
        } catch (e) {
            console.error(e);
            document.getElementById('ebArena').innerHTML = `<div class="eb-loading eb-loading--error">No se pudieron cargar las carreras. Intentá de nuevo.</div>`;
            return;
        }
    }

    if (pool.length < 1 || compoundOptions.length < 1) {
        document.getElementById('ebArena').innerHTML = `<div class="eb-loading">Todavía no hay carreras con datos de estrategia cargados.</div>`;
        return;
    }

    startGame();
}
