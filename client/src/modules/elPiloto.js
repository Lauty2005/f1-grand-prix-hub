// client/src/modules/elPiloto.js
// "El Piloto" — modo carrera F1, inspirado en "El Ídolo" (Potrero Fútbol).
// Sigue la misma convención que el resto de los mini-juegos del hub: el
// estado de la partida vive en localStorage, sin cuenta de usuario, y el
// server solo calcula (nunca guarda nada del lado del backend — ver
// server/src/services/elPiloto/README.md, "Contrato de estado").
//
// SEGUNDO REDISEÑO (a partir de capturas reales del juego "El Ídolo"): el
// primer rediseño calcaba el flujo carrera-por-carrera del spec original.
// Viendo el juego real, la temporada de El Ídolo no funciona así — la
// mayoría de los partidos se resuelven en un resumen narrativo tipo "Potrero
// deportivo" y solo unos pocos momentos puntuales (decisión de equipo,
// conferencia de prensa, un partido decisivo con minijuego) interrumpen el
// avance. Este archivo adapta ESO al motor real ya construido:
//
// - Temporada híbrida: el motor real (simulateNextRace) corre para las 24
//   carreras SIEMPRE, pero la UI solo se detiene en ~4-5 "momentos" por
//   temporada (sorteados al azar, categoría también al azar entre
//   carrera-decisiva/prensa/equipo). El resto se resuelve en silencio.
// - Minijuego "La Frenada": reemplaza el círculo de reacción — una barra con
//   una celda que se mueve, hay que tocar "Frenar" cuando pasa por la zona
//   verde. El tamaño de la zona escala con un atributo distinto según el
//   contexto (adelantamiento→agresividad, defensa→consistencia,
//   clasificación→ritmoQuali).
// - Dado de cartas: tanto el arquetipo inicial como las mejoras de
//   pretemporada se reparten como 3 cartas al azar de un pool grande — el
//   jugador elige 1. Reemplaza el punto-buy de la primera versión.
// - Idolatría (ex-prestigio) con 5 hitos con nombre + economía funcional
//   (valorDeMercado/dineroGanado de sabor, saldoDisponible se gasta en
//   tiradas extra del dado de mejoras).
// - Mercado de pases multi-oferta en cada cierre de temporada, con "llamar
//   al representante" utilizable una sola vez en toda la carrera.
import { API } from './config.js';
import { state } from './state.js';

const STORAGE_KEY = 'f1hub:elPiloto:save';

const TIER_LABELS = {
    figura: 'Figura', solido: 'Sólido', promesa: 'Promesa',
    enCaida: 'En caída', rookie: 'Rookie',
};

const ROLES = {
    lider: { label: 'Líder', desc: 'El equipo prioriza tu estrategia por sobre la de tu compañero.' },
    competitivo: { label: 'Competitivo', desc: 'Más libertad para jugarte adelantamientos y arriesgar en pista.' },
};

// Clasificación cosmética de escuderías — solo afecta el badge que se
// muestra en el selector, si corresponde mostrar el backstory de F2, y el
// valor de mercado inicial. Si el nombre de la escudería (viene de la DB
// real) no matchea ninguna lista, cae en "otro" sin romper nada.
const TOP_TEAMS = ['red bull', 'ferrari', 'mercedes', 'mclaren'];
const MID_TEAMS = ['aston martin', 'alpine'];
const BACKMARKER_TEAMS = ['racing bulls', 'haas'];

function tierDeEquipo(nombreEquipo) {
    const n = (nombreEquipo || '').toLowerCase();
    if (TOP_TEAMS.some((t) => n.includes(t))) return 'top';
    if (MID_TEAMS.some((t) => n.includes(t))) return 'mid';
    if (BACKMARKER_TEAMS.some((t) => n.includes(t))) return 'backmarker';
    return 'otro';
}

const TIER_BADGE_LABELS = { top: 'Top', mid: 'Media tabla', backmarker: 'Fondo de parrilla', otro: 'Escudería' };

// Etiquetas cortas de los 6 atributos del motor (ver attributes.js) — se
// usan tanto en la tira de atributos de la ficha del piloto (siempre
// visible) como dentro de cada minijuego, para que el jugador vea el
// atributo que le agranda la zona/objetivo ANTES de jugarlo.
const ATTRIBUTE_LABELS = {
    ritmoQuali: 'Ritmo Quali',
    ritmoCarrera: 'Ritmo Carrera',
    agresividad: 'Agresividad',
    consistencia: 'Consistencia',
    gestionNeumaticos: 'Neumáticos',
    feedbackTecnico: 'Feedback',
};

// Etiquetas de los campos de equipo que tocan las cartas de mejora
// (upgrade-aero / revision-fiabilidad / motor-fabrica en interactiveMoments.js).
const EQUIPO_LABELS = {
    rendimientoAuto: 'Rendimiento del auto',
    fiabilidad: 'Fiabilidad',
};

// Hitos de idolatría (0-100) — reemplaza el número plano de "prestigio" por
// una escala con nombre, calcada del vocabulario de El Ídolo.
const IDOLATRIA_TIERS = [
    { min: 0, nombre: 'Uno más' },
    { min: 20, nombre: 'Prometedor' },
    { min: 40, nombre: 'Ídolo de casa' },
    { min: 60, nombre: 'Referente' },
    { min: 80, nombre: 'Leyenda' },
];

// Tope al modificadorQuali/modificadorCarrera combinado (rol + evento
// pendiente + lluvia + bonus de minijuego) que puede llegar a una sola
// carrera. Sin esto, un jugador podía apilar rol+evento+minijuego perfecto
// hasta ~27 puntos en una sola carrera — más de lo que separaba al mejor y
// al peor auto de la parrilla, así que ni recalibrar PESO_AUTO en el motor
// alcanzaba para evitar que el peor equipo saliera campeón si el jugador
// acertaba seguido. Ver `ejecutarCarrera` — el tope se aplica ahí, en el
// único lugar por el que pasan TODAS las carreras (de fondo o destacadas).
const CAP_MODIFICADOR_TOTAL = 14;

// Plata: la primera tirada extra del dado de mejoras en pretemporada cuesta
// esto; cada tirada extra SIGUIENTE, dentro de la misma pretemporada, sale
// más cara (×COSTO_TIRADA_EXTRA_MULTIPLICADOR sobre la anterior) — a pedido
// del usuario, para que mejorar a fuerza de plata se vuelva progresivamente
// más caro en vez de un precio fijo. Tope de 2 tiradas extra compradas por
// pretemporada (además de las que da la idolatría) — ver `costoTiradaExtra`.
const COSTO_TIRADA_EXTRA = 150000;
const COSTO_TIRADA_EXTRA_MULTIPLICADOR = 1.8;
const TOPE_TIRADAS_EXTRA_PLATA = 2;

// Costo de la tirada extra número `tiradasExtra + 1` (0-indexed: 0 = primera
// compra de la pretemporada actual). Redondeado a la decena de mil para que
// se vea prolijo en la UI (fmtMoney corta en K/M).
function costoTiradaExtra(tiradasExtra) {
    const costo = COSTO_TIRADA_EXTRA * (COSTO_TIRADA_EXTRA_MULTIPLICADOR ** tiradasExtra);
    return Math.round(costo / 10000) * 10000;
}

// Más lugares en los que gastar `saldoDisponible`, todos opcionales — a
// pedido del usuario, para que la plata que se junta corriendo tenga más de
// un destino que las tiradas extra de arriba. Números "a ojo" como el resto
// del motor, se recalibran jugando.
//
// Seguro mecánico / Entrenador: compras de UNA carrera decisiva puntual (se
// ofrecen en renderMomentoDecisivo, antes de elegir el minijuego). El seguro
// sube la fiabilidad SOLO en el payload que se manda a /simular-carrera para
// esa carrera — nunca se persiste en save.equipos, así que no contamina el
// resto de la temporada ni a los rivales. El entrenador suma un bonus flat a
// ambos modificadores de esa carrera, igual de "crudo" que el bonus de rol.
const COSTO_SEGURO_MECANICO = 60000;
const BONUS_FIABILIDAD_SEGURO = 25;
const COSTO_ENTRENADOR = 60000;
const BONUS_ENTRENADOR = 6;

// Recuperación física: en el resultado de una carrera decisiva, si la forma
// quedó negativa, amortigua parte de ese pozo en vez de esperar a que decaiga
// sola carrera a carrera (ver FORMA_DECAY en rating.js, servidor).
const COSTO_RECUPERACION_FISICA = 50000;
const RECUPERACION_FISICA_FACTOR = 0.35; // a qué fracción de la forma negativa se reduce

// Gestión de imagen / Representante premium: mercado de pases.
const COSTO_GESTION_IMAGEN = 80000;
const COSTO_REPRESENTANTE_PREMIUM = 100000;

// Intento extra: hoy solo en El Telemetrista (tiene un contador explícito de
// intentos) — ver nota en ese minijuego sobre por qué no se extendió a los
// que comparten renderBarraTiming.
const COSTO_INTENTO_EXTRA = 30000;

// Casco: puramente cosmético, sin efecto en el motor — ver renderPretemporada
// y CASCO_DESIGNS en el server (interactiveMoments.js).
const COSTO_CASCO = 50000;

// Títulos de sabor para el resumen de temporada estilo "Potrero deportivo".
const TITULOS_RESUMEN = [
    'Kilómetros y aprendizaje', 'Entre boxes y ambición', 'El ritmo que faltaba',
    'Una temporada para el archivo', 'Curva a curva, paso a paso', 'De menor a mayor',
];

function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ─── PERSISTENCIA (localStorage) ───────────────────────────────────────────
function getSave() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function setSave(save) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch { /* storage no disponible */ }
}

function clearSave() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
function findPiloto(save, id) {
    return save.pilotos.find((p) => p.id === id);
}

function nameTag(save, id) {
    if (id === save.jugadorId) return ' <span class="ep-tag ep-tag--jugador">VOS</span>';
    if (id === save.rivalEternoId) return ' <span class="ep-tag ep-tag--rival">RIVAL PERMANENTE</span>';
    return '';
}

// Pilotos reales/jugador traen nombreCompleto; los ficticios generados por
// driverGenerator.js (rival permanente, reemplazos de retiro) traen
// nombre/apellido por separado.
function displayName(p) {
    return p.nombreCompleto ?? `${p.nombre} ${p.apellido}`;
}

function driverLabel(save, id) {
    const p = findPiloto(save, id);
    if (!p) return esc(id);
    return `${esc(displayName(p))}${nameTag(save, id)}`;
}

function sinModificadores(piloto) {
    const { modificadorQuali: _q, modificadorCarrera: _c, ...resto } = piloto;
    return resto;
}

function fmtMoney(valor) {
    const v = valor ?? 0;
    if (Math.abs(v) >= 1000000) return `US$ ${(v / 1000000).toFixed(1)}M`;
    if (Math.abs(v) >= 1000) return `US$ ${Math.round(v / 1000)}K`;
    return `US$ ${v}`;
}

function tierDeIdolatria(valor) {
    let actual = IDOLATRIA_TIERS[0];
    let siguiente = null;
    for (let i = 0; i < IDOLATRIA_TIERS.length; i++) {
        if (valor >= IDOLATRIA_TIERS[i].min) actual = IDOLATRIA_TIERS[i];
        else { siguiente = IDOLATRIA_TIERS[i]; break; }
    }
    return { nombre: actual.nombre, siguiente: siguiente?.nombre ?? null, faltan: siguiente ? siguiente.min - valor : 0 };
}

async function fetchJSON(url, options) {
    const res = await fetch(url, options);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Error de servidor');
    return json.data;
}

function postJSON(url, body) {
    return fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function wizardShell(titulo, subtitulo, contenidoHTML) {
    return `
        <div class="ep-page">
            <div class="ep-header">
                <h1 class="ep-title">${esc(titulo)}</h1>
                <p class="ep-subtitle">${esc(subtitulo)}</p>
            </div>
            ${contenidoHTML}
        </div>`;
}

// Traduce lo que efectivamente suma/resta una carta de arquetipo o de
// mejora (campos crudos del motor: atributo/bonus, o campo/clave/bonus para
// las de mejora) a una lista de { label, valor } legible — para que cada
// carta del dado diga explícitamente "Feedback +6" en vez de que el jugador
// tenga que adivinarlo por la descripción de sabor.
function formatoEfectoCarta(carta) {
    const efectos = [];
    const agregar = (label, valor) => { if (valor) efectos.push({ label, valor }); };

    if (carta.atributo) {
        // Carta de arquetipo (dado inicial): atributo/bonus (+ secundario).
        agregar(carta.atributo === 'parejo' ? 'Todos los atributos' : (ATTRIBUTE_LABELS[carta.atributo] ?? carta.atributo), carta.bonus);
        if (carta.atributoSecundario) {
            agregar(ATTRIBUTE_LABELS[carta.atributoSecundario] ?? carta.atributoSecundario, carta.bonusSecundario ?? 0);
        }
    } else if (carta.campo === 'atributo') {
        // Carta de mejora (dado de pretemporada) sobre un atributo del piloto.
        agregar(carta.clave === 'parejo' ? 'Todos los atributos' : (ATTRIBUTE_LABELS[carta.clave] ?? carta.clave), carta.bonus);
    } else if (carta.campo === 'equipo') {
        // Carta de mejora sobre el auto/equipo (+ secundaria, ej. motor-fabrica).
        agregar(EQUIPO_LABELS[carta.clave] ?? carta.clave, carta.bonus);
        if (carta.claveSecundaria) {
            agregar(EQUIPO_LABELS[carta.claveSecundaria] ?? carta.claveSecundaria, carta.bonusSecundario ?? 0);
        }
    } else if (carta.campo === 'bonusLluvia') {
        agregar('Bono en lluvia', carta.bonus);
    }

    return efectos;
}

function efectoCartaHTML(carta) {
    const efectos = formatoEfectoCarta(carta);
    if (!efectos.length) return '';
    return `
        <span class="ep-carta__efecto">
            ${efectos.map((ef) => `
                <span class="ep-carta__stat ${ef.valor >= 0 ? 'ep-carta__stat--positivo' : 'ep-carta__stat--negativo'}">
                    ${esc(ef.label)} ${ef.valor >= 0 ? '+' : ''}${esc(ef.valor)}
                </span>`).join('')}
        </span>`;
}

function cartasHTML(cartas) {
    return `
        <div class="ep-cartas">
            ${cartas.map((c) => `
                <button type="button" class="ep-carta" data-id="${esc(c.id)}">
                    ${c.rara ? '<span class="ep-carta__rara">RARA</span>' : ''}
                    <span class="ep-carta__nombre">${esc(c.nombre)}</span>
                    <span class="ep-carta__desc">${esc(c.descripcion)}</span>
                    ${efectoCartaHTML(c)}
                </button>`).join('')}
        </div>`;
}

// ─── PANEL STICKY (HUD + ficha del piloto) ─────────────────────────────────
// A pedido del usuario: la ficha completa (economía, idolatría, atributos)
// ya no aparece solo en la pantalla de temporada — queda pegada arriba de
// TODA pantalla durante la carrera (circuito, minijuegos, resultado,
// decisiones, pretemporada, etc.), igual que el HUD compacto de
// temporada/victorias/poles/títulos. Se mantiene el nombre `renderHUD` a
// propósito: así no hace falta tocar los ~30 lugares del archivo que ya lo
// llaman, alcanza con ampliar lo que devuelve.
function renderHUD(save) {
    const jugador = findPiloto(save, save.jugadorId);
    if (!jugador) return '';
    return `
        <div class="ep-sticky-top">
            <div class="ep-hud-sticky">
                <div class="ep-hud-sticky__stat"><span>${esc(save.temporadaNumero ?? 1)}</span><small>Temporada</small></div>
                <div class="ep-hud-sticky__stat"><span>${esc(jugador.victoriasCareer ?? 0)}</span><small>Victorias</small></div>
                <div class="ep-hud-sticky__stat"><span>${esc(jugador.polesCareer ?? 0)}</span><small>Poles</small></div>
                <div class="ep-hud-sticky__stat"><span>${esc(jugador.titulosCareer ?? 0)}</span><small>Títulos</small></div>
            </div>
            ${renderFichaPiloto(save)}
        </div>`;
}

// ─── BANNER DE TEMPORADA ────────────────────────────────────────────────────
function renderBanner(save) {
    const jugador = findPiloto(save, save.jugadorId);
    const equipo = save.equipos?.[jugador?.equipoId];
    if (!jugador || !equipo) return '';
    const color = equipo.primaryColor || '#e10600';
    return `
        <div class="ep-banner" style="--team-color:${esc(color)};">
            <div class="ep-banner__team">${esc(equipo.nombre)}</div>
            <div class="ep-banner__meta">
                <span class="ep-banner__role">${esc(ROLES[jugador.rol]?.label ?? jugador.rol)}</span>
                <span class="ep-banner__year">Temporada ${esc(save.temporadaNumero ?? 1)}</span>
            </div>
        </div>`;
}

// ─── FICHA DEL PILOTO (idolatría + economía + rival) ───────────────────────
function renderFichaPiloto(save) {
    const jugador = findPiloto(save, save.jugadorId);
    const rival = findPiloto(save, save.rivalEternoId);
    if (!jugador) return '';
    const tier = tierDeIdolatria(jugador.idolatria ?? 50);
    const pct = clamp(jugador.idolatria ?? 50, 0, 100);

    return `
        <div class="ep-ficha">
            <div class="ep-ficha__economia">
                <div class="ep-ficha__dato"><span>${esc(fmtMoney(jugador.valorDeMercado))}</span><small>Valor de mercado</small></div>
                <div class="ep-ficha__dato"><span>${esc(fmtMoney(jugador.dineroGanado))}</span><small>Ganado</small></div>
                <div class="ep-ficha__dato"><span>${esc(jugador.victoriasCareer ?? 0)}-${esc(rival?.victoriasCareer ?? 0)}</span><small>vs ${esc(rival ? displayName(rival) : 'rival')}</small></div>
            </div>
            <div class="ep-idolatria">
                <div class="ep-idolatria__bar"><div class="ep-idolatria__fill" style="width:${pct}%"></div></div>
                <span class="ep-idolatria__label">${esc(tier.nombre)}${tier.siguiente ? ` · Te faltan ${esc(tier.faltan)} pts para ser ${esc(tier.siguiente)}` : ''}</span>
            </div>
            ${jugador.cascoDiseno ? `<span class="ep-idolatria__label ep-ficha__casco">🪖 Casco: ${esc(jugador.cascoDiseno)}</span>` : ''}
            ${renderAtributosStrip(jugador)}
        </div>`;
}

// Tira de los 6 atributos del motor, siempre visible en la ficha del
// piloto — el equivalente de la fila de stats constante de "El Ídolo".
function renderAtributosStrip(jugador) {
    const claves = Object.keys(ATTRIBUTE_LABELS);
    return `
        <div class="ep-atributos">
            ${claves.map((clave) => {
                const valor = clamp(jugador.atributos?.[clave] ?? 50, 0, 100);
                return `
                    <div class="ep-atributos__item">
                        <div class="ep-atributos__bar"><div class="ep-atributos__fill" style="width:${valor}%"></div></div>
                        <span class="ep-atributos__label">${esc(ATTRIBUTE_LABELS[clave])} <strong>${esc(valor)}</strong></span>
                    </div>`;
            }).join('')}
        </div>`;
}

// ─── PANTALLA: SELECTOR DE EQUIPO (arrancar carrera nueva) ─────────────────
async function renderTeamPicker() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="ep-page">
            <div class="ep-header">
                <h1 class="ep-title ep-title--idolo">EL <span>ÍDOLO</span></h1>
                <p class="ep-subtitle">Modo Carrera · Fórmula 1</p>
                <p class="ep-tagline">De la Fórmula 2 a leyenda de la Fórmula 1...</p>
            </div>
            <div class="ep-grid" id="epGrid"><div class="ep-loading">Cargando grid...</div></div>
        </div>`;

    const grid = document.getElementById('epGrid');

    try {
        const data = await fetchJSON(`${API}/el-piloto/roster?year=${state.currentYear}`);
        const { pilotos, equipos } = data;

        if (!pilotos?.length) {
            grid.innerHTML = `<div class="ep-loading">No hay pilotos cargados para la temporada ${esc(state.currentYear)}.</div>`;
            return;
        }

        const porEquipo = new Map();
        pilotos.forEach((p) => {
            if (!porEquipo.has(p.equipoId)) porEquipo.set(p.equipoId, []);
            porEquipo.get(p.equipoId).push(p);
        });

        const orden = { top: 0, mid: 1, backmarker: 2, otro: 3 };
        const equiposOrdenados = Array.from(porEquipo.entries()).sort((a, b) => {
            const ta = tierDeEquipo(equipos[a[0]]?.nombre);
            const tb = tierDeEquipo(equipos[b[0]]?.nombre);
            return orden[ta] - orden[tb];
        });

        grid.innerHTML = equiposOrdenados.map(([equipoId, drivers]) => {
            const equipo = equipos[equipoId];
            const color = equipo.primaryColor || '#e10600';
            const tier = tierDeEquipo(equipo.nombre);
            return `
                <div class="ep-team" style="--team-color:${esc(color)};">
                    <div class="ep-team__header">
                        ${equipo.logoUrl ? `<img class="ep-team__logo" src="${esc(equipo.logoUrl)}" alt="" loading="lazy">` : ''}
                        <span class="ep-team__name">${esc(equipo.nombre)}</span>
                        <span class="ep-team__tier">${esc(TIER_BADGE_LABELS[tier])}</span>
                    </div>
                    <div class="ep-team__drivers">
                        ${drivers.map((p) => `
                            <div class="ep-driver">
                                <div class="ep-driver__name">#${esc(p.numero ?? '—')} ${esc(p.nombreCompleto)}</div>
                                <div class="ep-driver__meta">
                                    <span>${esc(p.nacionalidad || '—')}</span>
                                    <span>${esc(TIER_LABELS[p.tier] ?? p.tier)}</span>
                                    <span class="ep-driver__rating">${esc(p.rating)}</span>
                                </div>
                            </div>`).join('')}
                    </div>
                    <button class="ep-btn ep-btn--primary ep-team__pick" data-equipo-id="${esc(equipoId)}">
                        Empezar en ${esc(equipo.nombre)}
                    </button>
                </div>`;
        }).join('');

        grid.querySelectorAll('.ep-team__pick').forEach((btn) => {
            btn.addEventListener('click', () => renderCharacterCreation(btn.dataset.equipoId, pilotos, equipos));
        });
    } catch (e) {
        console.error(e);
        grid.innerHTML = `<div class="ep-loading ep-loading--error">No se pudo cargar el grid. Intentá de nuevo.</div>`;
    }
}

// ─── PANTALLA: CREACIÓN DE PERSONAJE (nombre + número + rol) ───────────────
function renderCharacterCreation(equipoId, pilotosGrid, equiposGrid) {
    const app = document.getElementById('app');
    const equipo = equiposGrid[equipoId];
    const numerosOcupados = pilotosGrid
        .filter((p) => p.equipoId !== equipoId)
        .map((p) => p.numero)
        .filter((n) => n != null)
        .sort((a, b) => a - b);

    let rolElegido = null;

    app.innerHTML = wizardShell('Tu debut', `Arrancás en ${equipo.nombre}. Elegí tu nombre, tu número y tu rol.`, `
        <form id="epCharacterForm" class="ep-form">
            <label class="ep-field">
                <span>Nombre</span>
                <input type="text" id="epNombre" maxlength="30" value="Vos" required>
            </label>
            <label class="ep-field">
                <span>Número (1-99)</span>
                <input type="number" id="epNumero" min="1" max="99" required>
            </label>
            <p class="ep-hint">Ocupados en el resto de la parrilla: ${numerosOcupados.map(esc).join(', ') || '—'}</p>
            <div class="ep-role-picker" id="epRolPicker">
                ${Object.entries(ROLES).map(([id, r]) => `
                    <button type="button" class="ep-role-card" data-rol="${esc(id)}">
                        <span class="ep-role-card__label">${esc(r.label)}</span>
                        <span class="ep-role-card__desc">${esc(r.desc)}</span>
                    </button>`).join('')}
            </div>
            <p class="ep-error" id="epNumeroError"></p>
            <div class="ep-season-actions">
                <button type="submit" class="ep-btn ep-btn--primary" id="epFirmar" disabled>Firmar contrato</button>
                <button type="button" class="ep-btn ep-btn--ghost" id="epVolver">Volver</button>
            </div>
        </form>
    `);

    document.getElementById('epVolver').addEventListener('click', renderTeamPicker);

    document.querySelectorAll('.ep-role-card').forEach((btn) => {
        btn.addEventListener('click', () => {
            rolElegido = btn.dataset.rol;
            document.querySelectorAll('.ep-role-card').forEach((b) => b.classList.toggle('is-selected', b === btn));
            document.getElementById('epFirmar').disabled = false;
        });
    });

    document.getElementById('epCharacterForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const nombre = document.getElementById('epNombre').value.trim() || 'Vos';
        const numero = parseInt(document.getElementById('epNumero').value, 10);
        const errorEl = document.getElementById('epNumeroError');

        if (!rolElegido) return;
        if (!Number.isInteger(numero) || numero < 1 || numero > 99) {
            errorEl.textContent = 'Elegí un número entre 1 y 99.';
            return;
        }
        if (numerosOcupados.includes(numero)) {
            errorEl.textContent = `El ${numero} ya lo usa otro piloto de la parrilla.`;
            return;
        }
        errorEl.textContent = '';

        renderDadoArquetipo(equipoId, nombre, numero, rolElegido, equipo);
    });
}

// Panel de "tus atributos de base" — se usa en las pantallas de creación de
// personaje (dado de arquetipo, backstory de F2), ANTES de que exista un
// save/HUD real. Mismo look que la ficha del piloto, para que se sienta
// igual de "siempre visible" que en el resto del juego (ver
// `renderHUD`/`renderFichaPiloto`) aunque acá todavía no haya carrera.
function renderAtributosPreview(atributosBase, titulo) {
    if (!atributosBase) return '';
    return `
        <div class="ep-sticky-top ep-sticky-top--preview">
            <div class="ep-ficha">
                <span class="ep-idolatria__label">${esc(titulo)}</span>
                ${renderAtributosStrip({ atributos: atributosBase })}
            </div>
        </div>`;
}

// ─── PANTALLA: DADO DE ARQUETIPO (define el estilo de piloto para siempre) ─
async function renderDadoArquetipo(equipoId, nombre, numero, rol, equipo) {
    const app = document.getElementById('app');
    app.innerHTML = `<div class="ep-page"><div class="ep-loading">El dado elige tu arquetipo...</div></div>`;

    try {
        const [cartas, atributosBase] = await Promise.all([
            fetchJSON(`${API}/el-piloto/cartas-arquetipo`),
            fetchJSON(`${API}/el-piloto/atributos-rookie`),
        ]);

        app.innerHTML = `
            ${renderAtributosPreview(atributosBase, 'Tus atributos de base (antes del arquetipo)')}
            ${wizardShell('¿Qué clase de piloto sos?', 'El dado trajo tres estilos. Elegí uno: te define para siempre.', cartasHTML(cartas))}`;

        app.querySelectorAll('.ep-carta').forEach((btn) => {
            btn.addEventListener('click', () => {
                const carta = cartas.find((c) => c.id === btn.dataset.id);
                if (tierDeEquipo(equipo.nombre) === 'backmarker') {
                    renderBackstoryF2(equipoId, nombre, numero, rol, equipo, carta, atributosBase);
                } else {
                    startCareer(equipoId, nombre, numero, rol, carta, equipo, atributosBase);
                }
            });
        });
    } catch (e) {
        console.error(e);
        app.innerHTML = `<div class="ep-page"><div class="ep-loading ep-loading--error">No se pudo repartir el dado de arquetipo: ${esc(e.message)}</div></div>`;
    }
}

// ─── PANTALLA: BACKSTORY F2 (solo si elige escudería de fondo de parrilla) ─
function generarTemporadaF2() {
    const victorias = Math.floor(Math.random() * 5);
    const podios = victorias + Math.floor(Math.random() * 4);
    return { victorias, podios };
}

function renderBackstoryF2(equipoId, nombre, numero, rol, equipo, arquetipo, atributosBase) {
    const app = document.getElementById('app');
    const year1 = generarTemporadaF2();
    const year2 = generarTemporadaF2();

    app.innerHTML = `
        ${renderAtributosPreview(atributosBase, 'Tus atributos de base')}
        ${wizardShell('Antes de la F1', `${esc(nombre)} — dos años en Fórmula 2 con Prema Racing`, `
        <div class="ep-events">
            <div class="ep-event">Año 1 en F2: ${year1.victorias} victorias, ${year1.podios} podios.</div>
            <div class="ep-event">Año 2 en F2: ${year2.victorias} victorias, ${year2.podios} podios.</div>
            <div class="ep-event">Prema Racing te da el salto: llegás a la Fórmula 1 con ${esc(equipo.nombre)}, a los 21 años.</div>
        </div>
        <div class="ep-season-actions">
            <button class="ep-btn ep-btn--primary" id="epContinuarF1">Continuar a la Fórmula 1</button>
        </div>
    `)}`;

    document.getElementById('epContinuarF1').addEventListener('click', () => startCareer(equipoId, nombre, numero, rol, arquetipo, equipo, atributosBase));
}

async function startCareer(equipoId, nombreJugador, numeroJugador, rol, arquetipo, equipo, atributosBase) {
    const app = document.getElementById('app');
    app.innerHTML = `<div class="ep-page"><div class="ep-loading">Armando tu primera temporada...</div></div>`;
    try {
        const data = await postJSON(`${API}/el-piloto/nueva-carrera`, {
            year: state.currentYear,
            equipoId,
            nombreJugador,
            numeroJugador,
            rol,
            atributosBase,
            arquetipo: arquetipo
                ? {
                    atributo: arquetipo.atributo,
                    bonus: arquetipo.bonus,
                    atributoSecundario: arquetipo.atributoSecundario,
                    bonusSecundario: arquetipo.bonusSecundario,
                }
                : null,
            tierEquipo: tierDeEquipo(equipo.nombre),
        });
        const save = {
            ...data,
            temporadaNumero: 1,
            bonusEventoPendiente: 0,
            historialTemporadas: [],
            momentos: generarMomentos(data.calendario.length),
        };
        setSave(save);
        renderSeasonScreen(save);
    } catch (e) {
        console.error(e);
        app.innerHTML = `<div class="ep-page"><div class="ep-loading ep-loading--error">No se pudo iniciar la carrera: ${esc(e.message)}</div></div>`;
    }
}

// ─── MOMENTOS DE TEMPORADA (~4-5 al azar, categoría al azar) ───────────────
// Pesos de categoría de cada momento — antes era 1/3 parejo entre las 3
// (mucha "decisión" narrativa de prensa/equipo, poco minijuego). Ajustado a
// pedido del usuario para que la mayoría de los momentos sean minijuegos
// jugables y las decisiones narrativas queden como algo más ocasional.
const PESO_CATEGORIA_MOMENTO = { 'carrera-decisiva': 0.6, prensa: 0.2, equipo: 0.2 };

function elegirCategoriaMomento() {
    const entradas = Object.entries(PESO_CATEGORIA_MOMENTO);
    const total = entradas.reduce((sum, [, peso]) => sum + peso, 0);
    let umbral = Math.random() * total;
    for (const [categoria, peso] of entradas) {
        if (umbral < peso) return categoria;
        umbral -= peso;
    }
    return entradas[entradas.length - 1][0];
}

function generarMomentos(totalCarreras) {
    const cantidad = Math.min(4 + Math.round(Math.random()), totalCarreras); // 4 o 5
    const indices = [];
    while (indices.length < cantidad) {
        const candidato = Math.floor(Math.random() * totalCarreras);
        if (!indices.includes(candidato)) indices.push(candidato);
    }
    return indices
        .map((carreraIndex) => ({ carreraIndex, categoria: elegirCategoriaMomento() }))
        .sort((a, b) => a.carreraIndex - b.carreraIndex);
}

// ─── PANTALLA: TEMPORADA EN CURSO ──────────────────────────────────────────
function standingsRows(save) {
    return Object.entries(save.tablaPuntos)
        .map(([id, puntos]) => ({ id, puntos }))
        .sort((a, b) => b.puntos - a.puntos);
}

function standingsHTML(save, limite = 10) {
    const rows = standingsRows(save).slice(0, limite);
    if (!rows.length) return `<p class="ep-loading">Todavía no hay carreras corridas esta temporada.</p>`;
    return `
        <table class="ep-standings">
            <thead><tr><th>Pos</th><th>Piloto</th><th>Pts</th></tr></thead>
            <tbody>
                ${rows.map((r, i) => `
                    <tr>
                        <td>${i + 1}</td>
                        <td>${driverLabel(save, r.id)}</td>
                        <td>${r.puntos}</td>
                    </tr>`).join('')}
            </tbody>
        </table>`;
}

function renderSeasonScreen(save) {
    // Si la temporada ya se cerró (procesarCierreTemporada ya corrió y ya
    // sumó el historialEntry) pero el jugador todavía no eligió destino en
    // el mercado de pases, NO volvemos a mostrar "Cerrar temporada" — eso
    // permitía re-disparar el cierre (ej: el usuario navega a otra sección
    // con el navbar y vuelve a "El Piloto" a mitad del mercado de pases) y
    // duplicaba la entrada de esa temporada en historialTemporadas. En
    // cambio, lo mandamos directo a donde tenga que seguir.
    if (save.temporadaCerrada) {
        const jugador = findPiloto(save, save.jugadorId);
        if (jugador && jugador.edad >= jugador.edadRetiro) {
            renderRetiroFinal(save);
        } else {
            renderMercadoDePases(save);
        }
        return;
    }

    const app = document.getElementById('app');
    const total = save.calendario.length;
    const temporadaTerminada = save.carreraIndex >= total;

    app.innerHTML = `
        ${renderHUD(save)}
        <div class="ep-page">
            ${renderBanner(save)}
            <div class="ep-season-actions">
                ${temporadaTerminada
                    ? `<button class="ep-btn ep-btn--primary" id="epCerrarTemporada">Cerrar temporada</button>`
                    : `<button class="ep-btn ep-btn--primary" id="epAvanzar">Avanzar temporada (carrera ${save.carreraIndex + 1}/${total})</button>`}
                <button class="ep-btn ep-btn--ghost" id="epReiniciar">Reiniciar carrera</button>
            </div>
            <h2 class="ep-section-title">Posiciones (Top 10)</h2>
            <div id="epStandings">${standingsHTML(save)}</div>
        </div>`;

    document.getElementById('epReiniciar').addEventListener('click', () => {
        if (confirm('¿Reiniciar y volver a elegir equipo? Se pierde el progreso actual.')) {
            clearSave();
            renderTeamPicker();
        }
    });

    if (temporadaTerminada) {
        document.getElementById('epCerrarTemporada').addEventListener('click', () => iniciarCierreTemporada(save));
    } else {
        document.getElementById('epAvanzar').addEventListener('click', () => avanzarTemporada(save));
    }
}

// ─── MOTOR DE UNA CARRERA (compartido entre fondo y momentos destacados) ───
// Corre simulateNextRace, actualiza estadísticas de carrera completa
// (victorias/podios/poles/puntos), economía (dineroGanado/saldoDisponible/
// valorDeMercado) y limpia el bonus de evento pendiente. Devuelve el save
// actualizado (ya persistido) más un resumen — el resumen solo se usa para
// renderizar cuando la carrera es un momento destacado; las carreras de
// fondo lo descartan.
// prepExtras.seguroMecanico: sube la fiabilidad del equipo del jugador SOLO
// en el payload que se manda al motor para ESTA carrera — se arma una copia
// de save.equipos con ese único campo tocado, nunca se persiste en el save
// real (así no contamina el resto de la temporada ni al compañero/rival que
// comparte equipo).
async function ejecutarCarrera(save, modificadorQualiCrudo, modificadorCarreraCrudo, prepExtras = {}) {
    const modificadorQuali = clamp(modificadorQualiCrudo, -CAP_MODIFICADOR_TOTAL, CAP_MODIFICADOR_TOTAL);
    const modificadorCarrera = clamp(modificadorCarreraCrudo, -CAP_MODIFICADOR_TOTAL, CAP_MODIFICADOR_TOTAL);

    const pilotosParaEnviar = save.pilotos.map((p) => (
        p.id === save.jugadorId ? { ...p, modificadorQuali, modificadorCarrera } : p
    ));

    const jugadorEquipoId = findPiloto(save, save.jugadorId)?.equipoId;
    const equiposParaEnviar = prepExtras.seguroMecanico && jugadorEquipoId && save.equipos[jugadorEquipoId]
        ? {
            ...save.equipos,
            [jugadorEquipoId]: {
                ...save.equipos[jugadorEquipoId],
                fiabilidad: clamp((save.equipos[jugadorEquipoId].fiabilidad ?? 75) + BONUS_FIABILIDAD_SEGURO, 0, 100),
            },
        }
        : save.equipos;

    const data = await postJSON(`${API}/el-piloto/simular-carrera`, {
        pilotos: pilotosParaEnviar,
        equipos: equiposParaEnviar,
        calendario: save.calendario,
        carreraIndex: save.carreraIndex,
        tablaPuntos: save.tablaPuntos,
    });

    const resultadoJugador = data.resultadoGP.resultado.find((r) => r.pilotoId === save.jugadorId);
    const esPole = resultadoJugador?.posicionSalida === 1;
    let esVueltaRapida = false;
    if (!resultadoJugador?.dnf && resultadoJugador?.posicionFinal <= 10) {
        const chance = Math.max(0, 11 - resultadoJugador.posicionFinal) * 0.03;
        esVueltaRapida = Math.random() < chance;
    }

    const puntosPrevios = save.tablaPuntos[save.jugadorId] ?? 0;
    const puntosGanados = Math.max(0, (data.tablaPuntos[save.jugadorId] ?? 0) - puntosPrevios);
    const esVictoria = resultadoJugador?.posicionFinal === 1;
    const esPodio = !resultadoJugador?.dnf && resultadoJugador?.posicionFinal <= 3;

    const ganancia = 15000 + puntosGanados * 8000;
    const incrementoValor = (esVictoria ? 40000 : 0) + (esPodio && !esVictoria ? 15000 : 0) + puntosGanados * 5000;

    const resultadoRival = data.resultadoGP.resultado.find((r) => r.pilotoId === save.rivalEternoId);

    const nuevoPilotos = data.pilotos.map((p) => {
        if (p.id === save.jugadorId) {
            const base = sinModificadores(p);
            return {
                ...base,
                victoriasCareer: (base.victoriasCareer ?? 0) + (esVictoria ? 1 : 0),
                podiosCareer: (base.podiosCareer ?? 0) + (esPodio ? 1 : 0),
                polesCareer: (base.polesCareer ?? 0) + (esPole ? 1 : 0),
                puntosCareerTotal: (base.puntosCareerTotal ?? 0) + puntosGanados,
                dineroGanado: (base.dineroGanado ?? 0) + ganancia,
                saldoDisponible: (base.saldoDisponible ?? 0) + ganancia,
                valorDeMercado: (base.valorDeMercado ?? 0) + incrementoValor,
            };
        }
        if (p.id === save.rivalEternoId && resultadoRival?.posicionFinal === 1) {
            return { ...p, victoriasCareer: (p.victoriasCareer ?? 0) + 1 };
        }
        return p;
    });

    const nuevoSave = {
        ...save,
        pilotos: nuevoPilotos,
        tablaPuntos: data.tablaPuntos,
        carreraIndex: data.carreraIndex,
        bonusEventoPendiente: 0,
    };
    setSave(nuevoSave);

    return {
        save: nuevoSave,
        resumen: {
            pista: data.resultadoGP.pista,
            posicionFinal: resultadoJugador?.posicionFinal,
            dnf: resultadoJugador?.dnf,
            esPole,
            esVueltaRapida,
            puntosGanados,
            ganancia,
        },
    };
}

// Modificadores de base para una carrera SIN minijuego (rol + lluvia +
// bonus de evento pendiente si lo hay) — usados tanto para las carreras de
// fondo como para el tramo de carrera de los momentos narrativos.
function modificadoresBase(save) {
    const jugador = findPiloto(save, save.jugadorId);
    const pista = save.calendario[save.carreraIndex];
    const rolBonus = jugador.rol === 'lider' ? { quali: 2, carrera: 0 } : { quali: 0, carrera: 3 };
    const lluviaBonus = pista.propensaLluvia ? (jugador.bonusLluvia ?? 0) : 0;
    return {
        modificadorQuali: rolBonus.quali + lluviaBonus,
        modificadorCarrera: rolBonus.carrera + lluviaBonus + (save.bonusEventoPendiente ?? 0),
    };
}

async function simularCarreraSilenciosa(save) {
    const { modificadorQuali, modificadorCarrera } = modificadoresBase(save);
    const { save: nuevoSave } = await ejecutarCarrera(save, modificadorQuali, modificadorCarrera);
    return nuevoSave;
}

// ─── LOOP HÍBRIDO DE TEMPORADA ──────────────────────────────────────────────
// Avanza carrera por carrera: si el índice actual NO es un momento, se
// resuelve en silencio con el motor real y se sigue; si ES un momento, se
// detiene y muestra la pantalla correspondiente (el resto de la temporada
// continúa cuando el jugador confirma esa pantalla).
async function avanzarTemporada(save) {
    const app = document.getElementById('app');
    app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading">Corriendo carreras...</div></div>`;

    let estadoActual = save;
    while (estadoActual.carreraIndex < estadoActual.calendario.length) {
        const idx = estadoActual.carreraIndex;
        const momento = (estadoActual.momentos ?? []).find((m) => m.carreraIndex === idx);

        if (!momento) {
            try {
                estadoActual = await simularCarreraSilenciosa(estadoActual);
            } catch (e) {
                console.error(e);
                app.innerHTML = `${renderHUD(estadoActual)}<div class="ep-page"><div class="ep-loading ep-loading--error">Error simulando una carrera de fondo: ${esc(e.message)}</div></div>`;
                return;
            }
            continue;
        }

        setSave(estadoActual);
        if (momento.categoria === 'carrera-decisiva') {
            renderMomentoDecisivo(estadoActual);
        } else {
            renderMomentoNarrativo(estadoActual, momento.categoria);
        }
        return;
    }

    setSave(estadoActual);
    iniciarCierreTemporada(estadoActual);
}

// ─── MOMENTO: CARRERA DECISIVA (circuito + 1 de 11 minijuegos al azar) ─────
function renderMomentoDecisivo(save) {
    const pista = save.calendario[save.carreraIndex];
    let seguroComprado = false;
    let entrenadorComprado = false;
    let saldo = findPiloto(save, save.jugadorId)?.saldoDisponible ?? 0;

    function render() {
        const app = document.getElementById('app');
        app.innerHTML = `
        ${renderHUD(save)}
        ${wizardShell(`${pista.bandera} ${pista.nombre}`, `Gran Premio ${pista.round} de ${save.calendario.length} — carrera decisiva`, `
            <div class="ep-circuit-card">
                <div class="ep-circuit-card__flag">${esc(pista.bandera)}</div>
                <div class="ep-circuit-card__name">${esc(pista.nombre)}</div>
            </div>
            <div class="ep-prep">
                <div class="ep-prep__item">
                    <div class="ep-prep__info">
                        <span class="ep-prep__nombre">Seguro mecánico</span>
                        <span class="ep-prep__desc">Baja el riesgo de falla mecánica en esta carrera.</span>
                    </div>
                    <button type="button" class="ep-btn ep-btn--ghost ep-prep__btn" id="epComprarSeguro" ${seguroComprado || saldo < COSTO_SEGURO_MECANICO ? 'disabled' : ''}>
                        ${seguroComprado ? 'Comprado ✓' : `Comprar (${esc(fmtMoney(COSTO_SEGURO_MECANICO))})`}
                    </button>
                </div>
                <div class="ep-prep__item">
                    <div class="ep-prep__info">
                        <span class="ep-prep__nombre">Entrenador personal</span>
                        <span class="ep-prep__desc">+${BONUS_ENTRENADOR} a clasificación y a carrera, solo esta vez.</span>
                    </div>
                    <button type="button" class="ep-btn ep-btn--ghost ep-prep__btn" id="epComprarEntrenador" ${entrenadorComprado || saldo < COSTO_ENTRENADOR ? 'disabled' : ''}>
                        ${entrenadorComprado ? 'Comprado ✓' : `Comprar (${esc(fmtMoney(COSTO_ENTRENADOR))})`}
                    </button>
                </div>
            </div>
            <div class="ep-season-actions">
                <button class="ep-btn ep-btn--primary" id="epContinuarDecisivo">Continuar</button>
            </div>
        `)}`;

        const gastar = (costo) => {
            saldo -= costo;
            save = { ...save, pilotos: save.pilotos.map((p) => (p.id === save.jugadorId ? { ...p, saldoDisponible: saldo } : p)) };
            setSave(save);
        };

        const btnSeguro = document.getElementById('epComprarSeguro');
        if (btnSeguro) {
            btnSeguro.addEventListener('click', () => {
                seguroComprado = true;
                gastar(COSTO_SEGURO_MECANICO);
                render();
            });
        }

        const btnEntrenador = document.getElementById('epComprarEntrenador');
        if (btnEntrenador) {
            btnEntrenador.addEventListener('click', () => {
                entrenadorComprado = true;
                gastar(COSTO_ENTRENADOR);
                render();
            });
        }

        document.getElementById('epContinuarDecisivo').addEventListener('click', () => {
            const disponibles = MINIGAMES.filter((m) => !m.disponible || m.disponible(save));
            const elegido = disponibles[Math.floor(Math.random() * disponibles.length)];
            const prepExtras = { seguroMecanico: seguroComprado, entrenador: entrenadorComprado };
            elegido.render(save, (resultado) => resolverResultadoMinijuego(save, resultado, prepExtras));
        });
    }

    render();
}

// ─── RESOLUCIÓN GENÉRICA DE CUALQUIER MINIJUEGO ────────────────────────────
// Todos los minijuegos terminan llamando a onResult con una de estas dos
// formas:
//   { tipoEfecto: 'carrera' | 'quali', bonus, mensaje } — se suma al
//   modificador correspondiente ANTES de correr la carrera (como La Frenada).
//   { tipoEfecto: 'narrativo', idolatriaDelta, economiaDelta, mensaje } — no
//   toca el modificador de la carrera (que se resuelve con la base de
//   rol/lluvia/evento pendiente), pero sí afecta idolatría/economía, igual
//   que un evento de prensa/equipo.
// Cualquier resultado puede además traer `gastoExtra` (plata gastada DENTRO
// del propio minijuego, ej. un intento extra comprado en El Telemetrista) —
// se descuenta acá, no donde se compra, porque el `save` que tiene el
// minijuego en su clausura es una copia que nunca vuelve a subir hasta acá;
// si se descontara ahí y no acá, el round-trip por /simular-carrera lo
// pisaría con el saldo viejo. Mismo motivo por el que idolatriaDelta/
// economiaDelta ya se resolvían acá y no en cada minijuego.
// prepExtras (seguroMecanico/entrenador) son las compras de ANTES del
// minijuego, hechas en renderMomentoDecisivo — ver ejecutarCarrera para el
// seguro, acá para el entrenador (bonus flat a ambos modificadores).
async function resolverResultadoMinijuego(save, resultado, prepExtras = {}) {
    const app = document.getElementById('app');
    app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading">Corriendo el Gran Premio...</div></div>`;

    try {
        let saveBase = save;
        if (resultado.tipoEfecto === 'narrativo' && resultado.idolatriaDelta) {
            saveBase = {
                ...save,
                pilotos: save.pilotos.map((p) => (
                    p.id === save.jugadorId
                        ? { ...p, idolatria: clamp((p.idolatria ?? 50) + resultado.idolatriaDelta, 0, 100) }
                        : p
                )),
            };
        }
        if (resultado.gastoExtra) {
            saveBase = {
                ...saveBase,
                pilotos: saveBase.pilotos.map((p) => (
                    p.id === save.jugadorId
                        ? { ...p, saldoDisponible: Math.max(0, (p.saldoDisponible ?? 0) - resultado.gastoExtra) }
                        : p
                )),
            };
        }

        const entrenadorBonus = prepExtras.entrenador ? BONUS_ENTRENADOR : 0;
        const { modificadorQuali: baseQuali, modificadorCarrera: baseCarrera } = modificadoresBase(saveBase);
        const modificadorQuali = baseQuali + entrenadorBonus + (resultado.tipoEfecto === 'quali' ? resultado.bonus : 0);
        const modificadorCarrera = baseCarrera + entrenadorBonus + (resultado.tipoEfecto === 'carrera' ? resultado.bonus : 0);

        const { save: nuevoSave, resumen } = await ejecutarCarrera(saveBase, modificadorQuali, modificadorCarrera, prepExtras);

        let saveFinal = nuevoSave;
        if (resultado.tipoEfecto === 'narrativo' && resultado.economiaDelta) {
            saveFinal = {
                ...nuevoSave,
                pilotos: nuevoSave.pilotos.map((p) => (
                    p.id === save.jugadorId
                        ? {
                            ...p,
                            saldoDisponible: Math.max(0, (p.saldoDisponible ?? 0) + resultado.economiaDelta),
                            dineroGanado: (p.dineroGanado ?? 0) + Math.max(0, resultado.economiaDelta),
                        }
                        : p
                )),
            };
            setSave(saveFinal);
        }

        renderResultadoCarrera(saveFinal, resumen, resultado);
    } catch (e) {
        console.error(e);
        app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading ep-loading--error">No se pudo simular la carrera: ${esc(e.message)}</div></div>`;
    }
}

// Línea explícita de "qué puntos se sumaron al elegir esto" — el mensaje de
// sabor de cada minijuego ya cuenta la historia, pero no siempre incluye el
// número. Esto lo deja claro sin depender de que cada uno de los 11
// minijuegos lo escriba a mano en su propio mensaje.
function lineaPuntosMinijuego(resultado) {
    if (!resultado) return '';
    const partes = [];
    if (resultado.tipoEfecto === 'narrativo') {
        if (resultado.idolatriaDelta) partes.push(`${resultado.idolatriaDelta > 0 ? '🔺 +' : '🔻 '}${resultado.idolatriaDelta} de idolatría`);
        if (resultado.economiaDelta) partes.push(`${resultado.economiaDelta > 0 ? '+' : ''}${esc(fmtMoney(resultado.economiaDelta))}`);
    } else if (resultado.bonus) {
        const etiqueta = resultado.tipoEfecto === 'quali' ? 'Clasificación' : 'Carrera';
        const signo = resultado.bonus > 0 ? `🔺 +${resultado.bonus}` : `🔻 ${resultado.bonus}`;
        partes.push(`${signo} a ${etiqueta} en esta carrera`);
    }
    // Gasto DENTRO del minijuego (hoy solo el intento extra de El
    // Telemetrista) — se muestra siempre, sea cual sea el tipoEfecto.
    if (resultado.gastoExtra) partes.push(`-${esc(fmtMoney(resultado.gastoExtra))} en preparación extra`);
    return partes.join(' · ');
}

// Recuperación física: si la carrera dejó la forma del jugador en negativo,
// se ofrece amortiguarla acá en vez de esperar el decaimiento natural
// (FORMA_DECAY en rating.js, servidor) — compra de una sola vez por
// resultado, se aplica directo sobre `forma` y se persiste antes de
// continuar, así ya pega en el cálculo de la próxima carrera.
function renderResultadoCarrera(save, resumen, resultadoMinijuego) {
    const posicionTexto = resumen.dnf ? 'Abandono (DNF)' : `P${resumen.posicionFinal}`;
    const mensajeExtra = resultadoMinijuego?.mensaje;
    const lineaPuntos = lineaPuntosMinijuego(resultadoMinijuego);
    let recuperacionComprada = false;

    function render() {
        const app = document.getElementById('app');
        const jugador = findPiloto(save, save.jugadorId);
        const formaNegativa = (jugador?.forma ?? 0) < 0;
        const saldo = jugador?.saldoDisponible ?? 0;

        app.innerHTML = `
            ${renderHUD(save)}
            ${wizardShell(resumen.pista, 'Resultado del Gran Premio', `
                <div class="ep-result">
                    <div class="ep-result__posicion">${esc(posicionTexto)}</div>
                    <div class="ep-events">
                        ${mensajeExtra ? `<div class="ep-event">${esc(mensajeExtra)}</div>` : ''}
                        ${lineaPuntos ? `<div class="ep-event ep-event--bonus">${esc(lineaPuntos)}</div>` : ''}
                        ${resumen.esPole ? '<div class="ep-event">🏁 Pole position.</div>' : ''}
                        ${resumen.esVueltaRapida ? '<div class="ep-event">⏱️ Vuelta rápida.</div>' : ''}
                        <div class="ep-event">+${esc(resumen.puntosGanados)} puntos de campeonato · +${esc(fmtMoney(resumen.ganancia))}.</div>
                    </div>
                    ${formaNegativa ? `
                        <div class="ep-prep__item ep-prep__item--forma">
                            <div class="ep-prep__info">
                                <span class="ep-prep__nombre">Recuperación física</span>
                                <span class="ep-prep__desc">Tu forma quedó en ${esc(jugador.forma)} — amortiguala en vez de esperar que decaiga sola.</span>
                            </div>
                            <button type="button" class="ep-btn ep-btn--ghost ep-prep__btn" id="epComprarRecuperacion" ${recuperacionComprada || saldo < COSTO_RECUPERACION_FISICA ? 'disabled' : ''}>
                                ${recuperacionComprada ? 'Aplicada ✓' : `Comprar (${esc(fmtMoney(COSTO_RECUPERACION_FISICA))})`}
                            </button>
                        </div>` : ''}
                </div>
                <div class="ep-season-actions">
                    <button class="ep-btn ep-btn--primary" id="epSiguienteMomento">Continuar</button>
                </div>
            `)}`;

        const btnRecuperacion = document.getElementById('epComprarRecuperacion');
        if (btnRecuperacion) {
            btnRecuperacion.addEventListener('click', () => {
                recuperacionComprada = true;
                save = {
                    ...save,
                    pilotos: save.pilotos.map((p) => (
                        p.id === save.jugadorId
                            ? {
                                ...p,
                                forma: Math.round((p.forma ?? 0) * RECUPERACION_FISICA_FACTOR),
                                saldoDisponible: Math.max(0, (p.saldoDisponible ?? 0) - COSTO_RECUPERACION_FISICA),
                            }
                            : p
                    )),
                };
                setSave(save);
                render();
            });
        }

        document.getElementById('epSiguienteMomento').addEventListener('click', () => avanzarTemporada(save));
    }

    render();
}

// ─── BARRA DE TIMING GENÉRICA (base de La Frenada, Pit Stop, Vuelta de ─────
// Pole y Adelantamiento Perfecto) — una celda recorre una barra de N
// segmentos, hay que tocar el botón cuando está dentro de la "zona verde".
// onDone(acierto, celdaFinal, zonaInicio, zonaFin) — los últimos 3 valores
// dejan que el que llama distinga "demasiado pronto" de "demasiado tarde".
function atributoJugador(save, clave) {
    return findPiloto(save, save.jugadorId)?.atributos?.[clave] ?? 50;
}

// "Agresividad: 62" — se agrega al subtítulo de los minijuegos que escalan
// su dificultad con un atributo, para que el jugador vea el número ANTES de
// jugar (por qué la zona le sale grande o chica).
function etiquetaAtributo(save, clave) {
    return `${ATTRIBUTE_LABELS[clave] ?? clave}: ${atributoJugador(save, clave)}`;
}

function renderBarraTiming(save, { titulo, subtitulo, segmentos = 10, zonaSize }, onDone) {
    const zona = clamp(zonaSize, 2, segmentos - 1);
    const zonaInicio = Math.floor(Math.random() * (segmentos - zona + 1));
    const zonaFin = zonaInicio + zona - 1;

    const app = document.getElementById('app');
    app.innerHTML = `
        ${renderHUD(save)}
        ${wizardShell(titulo, subtitulo, `
            <div class="ep-frenada">
                <div class="ep-frenada__pista" id="epFrenadaPista">
                    ${Array.from({ length: segmentos }).map((_, i) => `
                        <div class="ep-frenada__celda ${i >= zonaInicio && i <= zonaFin ? 'ep-frenada__celda--zona' : ''}" data-i="${i}"></div>`).join('')}
                </div>
                <button type="button" class="ep-btn ep-btn--primary ep-frenada__boton" id="epFrenar">FRENAR</button>
            </div>
        `)}`;

    const celdas = Array.from(app.querySelectorAll('.ep-frenada__celda'));
    const boton = document.getElementById('epFrenar');
    let actual = -1;
    let detenido = false;

    const intervalo = setInterval(() => {
        if (detenido) return;
        actual += 1;
        if (actual >= segmentos) {
            detenido = true;
            clearInterval(intervalo);
            finalizar(false);
            return;
        }
        celdas.forEach((c) => c.classList.remove('ep-frenada__celda--activa'));
        celdas[actual].classList.add('ep-frenada__celda--activa');
    }, 220);

    function finalizar(acierto) {
        clearInterval(intervalo);
        boton.disabled = true;
        const celda = celdas[actual];
        if (celda) celda.classList.add(acierto ? 'ep-frenada__celda--acierto' : 'ep-frenada__celda--fallo');
        setTimeout(() => onDone(acierto, actual, zonaInicio, zonaFin), 500);
    }

    boton.addEventListener('click', () => {
        if (detenido) return;
        detenido = true;
        clearInterval(intervalo);
        const acierto = actual >= zonaInicio && actual <= zonaFin;
        finalizar(acierto);
    });
}

// Mapa de setup "óptimo" por tipo de pista para El Telemetrista — igual de
// "a ojo" que el resto de los pesos del motor (ver README). callejero
// (Mónaco) pide máxima carga aerodinámica; altaVelocidad (Monza-like) pide
// mínima carga; tecnica y propensaLluvia quedan en un punto intermedio.
const TELEMETRY_TARGETS = {
    altaVelocidad: { aero: 25, presion: 55, frenada: 50 },
    callejero: { aero: 85, presion: 50, frenada: 55 },
    tecnica: { aero: 60, presion: 50, frenada: 52 },
    propensaLluvia: { aero: 70, presion: 40, frenada: 48 },
};

// ─── TA-TE-TI: IA MÍNIMA (minimax completo, tablero de 9 celdas) ───────────
const TTT_LINEAS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function tttGanador(board) {
    for (const [a, b, c] of TTT_LINEAS) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    if (board.every((c) => c)) return 'empate';
    return null;
}

function tttMinimax(board, turno, ia, humano) {
    const ganador = tttGanador(board);
    if (ganador === ia) return { score: 1 };
    if (ganador === humano) return { score: -1 };
    if (ganador === 'empate') return { score: 0 };

    let mejor = null;
    board.forEach((celda, i) => {
        if (celda) return;
        const copia = [...board];
        copia[i] = turno;
        const resultado = tttMinimax(copia, turno === ia ? humano : ia, ia, humano);
        if (turno === ia) {
            if (mejor === null || resultado.score > mejor.score) mejor = { score: resultado.score, movimiento: i };
        } else if (mejor === null || resultado.score < mejor.score) {
            mejor = { score: resultado.score, movimiento: i };
        }
    });
    return mejor;
}

function tttJugadaIA(board, ia, humano) {
    // Dificultad fija "competitivo": juega óptimo la mayoría de las veces,
    // con algo de margen para no ser imposible de ganar/empatar.
    const vacios = [];
    board.forEach((c, i) => { if (!c) vacios.push(i); });
    if (Math.random() < 0.25) return vacios[Math.floor(Math.random() * vacios.length)];
    return tttMinimax(board, ia, ia, humano).movimiento;
}

// ─── REGISTRO DE LOS 11 MINIJUEGOS DE MOMENTO DECISIVO ─────────────────────
// Cada entrada expone render(save, onResult) — onResult recibe SIEMPRE una
// de estas dos formas (ver resolverResultadoMinijuego):
//   { tipoEfecto: 'carrera' | 'quali', bonus, mensaje }
//   { tipoEfecto: 'narrativo', idolatriaDelta, economiaDelta, mensaje }
// `disponible(save)` es opcional — si está y devuelve false, ese minijuego
// se saca del sorteo para ese momento (hoy solo lo usa Evolución de Cascos,
// que necesita al menos 2 temporadas jugadas).
const MINIGAMES = [
    // 1. LA FRENADA — ya validado en la primera vuelta de este rediseño.
    {
        id: 'la-frenada',
        async render(save, onResult) {
            const app = document.getElementById('app');
            app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading">Se viene un momento clave...</div></div>`;
            try {
                const contexto = await fetchJSON(`${API}/el-piloto/contexto-minijuego`);
                const valorAtributo = atributoJugador(save, contexto.atributo);
                renderBarraTiming(save, {
                    titulo: 'La Frenada',
                    subtitulo: `${contexto.pregunta} (Tu ${etiquetaAtributo(save, contexto.atributo)})`,
                    segmentos: 10,
                    zonaSize: clamp(2 + Math.round(valorAtributo / 40), 2, 5),
                }, (acierto) => {
                    onResult({
                        tipoEfecto: contexto.aplicaA === 'quali' ? 'quali' : 'carrera',
                        bonus: acierto ? 14 : -6,
                        mensaje: acierto ? '✅ Frenada perfecta.' : '⚠️ Te pasaste de largo en la frenada.',
                    });
                });
            } catch (e) {
                console.error(e);
                onResult({ tipoEfecto: 'carrera', bonus: 0, mensaje: 'No se pudo cargar La Frenada — carrera resuelta sin bonus extra.' });
            }
        },
    },

    // 2. LIGHTS OUT — reacción en la largada.
    {
        id: 'lights-out',
        render(save, onResult) {
            const app = document.getElementById('app');
            const N = 5;
            app.innerHTML = `
                ${renderHUD(save)}
                ${wizardShell('Lights Out', 'Esperá a que se apaguen los 5 semáforos y tocá "¡YA!" lo más rápido posible.', `
                    <div class="ep-lights">
                        <div class="ep-lights__row" id="epLightsRow">
                            ${Array.from({ length: N }).map((_, i) => `<div class="ep-lights__bulb" data-i="${i}"></div>`).join('')}
                        </div>
                        <button type="button" class="ep-btn ep-btn--primary ep-lights__boton" id="epLightsBoton">¡YA!</button>
                        <p class="ep-lights__estado" id="epLightsEstado">Preparate...</p>
                    </div>
                `)}`;

            const bulbs = Array.from(app.querySelectorAll('.ep-lights__bulb'));
            const boton = document.getElementById('epLightsBoton');
            const estadoEl = document.getElementById('epLightsEstado');
            let fase = 'encendiendo';
            let horaApagado = 0;
            const timers = [];

            bulbs.forEach((b, i) => {
                timers.push(setTimeout(() => { b.classList.add('ep-lights__bulb--on'); }, 500 + i * 550));
            });

            timers.push(setTimeout(() => {
                fase = 'espera';
                estadoEl.textContent = 'Esperá...';
                const demora = 800 + Math.random() * 1200;
                timers.push(setTimeout(() => {
                    bulbs.forEach((b) => b.classList.remove('ep-lights__bulb--on'));
                    fase = 'apagado';
                    horaApagado = performance.now();
                    estadoEl.textContent = '¡YA!';
                }, demora));
            }, 500 + N * 550 + 200));

            boton.addEventListener('click', () => {
                if (fase === 'terminado') return;
                if (fase !== 'apagado') {
                    fase = 'terminado';
                    timers.forEach(clearTimeout);
                    boton.disabled = true;
                    estadoEl.textContent = 'Salida adelantada.';
                    setTimeout(() => onResult({ tipoEfecto: 'carrera', bonus: -8, mensaje: '🚦 Salida adelantada — arrancaste antes de que se apagaran las luces.' }), 600);
                    return;
                }
                fase = 'terminado';
                const reaccionMs = performance.now() - horaApagado;
                boton.disabled = true;
                let bonus;
                let mensaje;
                if (reaccionMs < 220) { bonus = 16; mensaje = `🚦 ¡Reacción perfecta! ${(reaccionMs / 1000).toFixed(3)}s — más rápido que el promedio de la parrilla (0.24s).`; }
                else if (reaccionMs < 300) { bonus = 10; mensaje = `🚦 Gran salida — ${(reaccionMs / 1000).toFixed(3)}s.`; }
                else if (reaccionMs < 450) { bonus = 3; mensaje = `🚦 Salida correcta — ${(reaccionMs / 1000).toFixed(3)}s.`; }
                else { bonus = -4; mensaje = `🚦 Salida lenta — ${(reaccionMs / 1000).toFixed(3)}s, perdiste terreno.`; }
                estadoEl.textContent = mensaje;
                setTimeout(() => onResult({ tipoEfecto: 'carrera', bonus, mensaje }), 700);
            });
        },
    },

    // 3. PIT STOP CHALLENGE — QTE de 3 pasos (aflojar/cambiar/ajustar).
    {
        id: 'pit-stop-challenge',
        render(save, onResult) {
            const pasos = [
                { label: 'Aflojar la tuerca', sub: 'Frená la celda iluminada dentro de la zona verde.' },
                { label: 'Cambiar el neumático', sub: 'Mismo truco: tocá cuando esté en la zona.' },
                { label: 'Ajustar la tuerca', sub: 'Último paso — no te apures de más.' },
            ];
            const zonaSize = clamp(2 + Math.round(atributoJugador(save, 'gestionNeumaticos') / 35), 2, 5);
            let aciertos = 0;

            function jugarPaso(i) {
                if (i >= pasos.length) {
                    let bonus;
                    let mensaje;
                    if (aciertos === 3) { bonus = 16; mensaje = '🛞 Parada perfecta — por debajo de los 2.0s, felicitación por radio incluida.'; }
                    else if (aciertos === 2) { bonus = 6; mensaje = '🛞 Buena parada, un pasito lento en algún cambio.'; }
                    else if (aciertos === 1) { bonus = -2; mensaje = '🛞 Parada lenta — se perdió tiempo valioso en el box.'; }
                    else { bonus = -10; mensaje = '🛞 Parada desastrosa — el box costó varios segundos.'; }
                    onResult({ tipoEfecto: 'carrera', bonus, mensaje });
                    return;
                }
                renderBarraTiming(save, {
                    titulo: 'Pit Stop Challenge',
                    subtitulo: `Paso ${i + 1}/3 — ${pasos[i].label}. ${pasos[i].sub} (Tu ${etiquetaAtributo(save, 'gestionNeumaticos')})`,
                    segmentos: 8,
                    zonaSize,
                }, (acierto) => {
                    if (acierto) aciertos += 1;
                    jugarPaso(i + 1);
                });
            }

            jugarPaso(0);
        },
    },

    // 4. LA VUELTA DE POLE — 3 sectores de precisión (frenada/vértice/salida).
    {
        id: 'vuelta-de-pole',
        render(save, onResult) {
            const sectores = ['Sector 1 — punto de frenada', 'Sector 2 — vértice de la curva', 'Sector 3 — salida de la curva'];
            const zonaSize = clamp(2 + Math.round(atributoJugador(save, 'ritmoQuali') / 30), 2, 5);
            let perfectos = 0;

            function jugarSector(i) {
                if (i >= sectores.length) {
                    let bonus;
                    let mensaje;
                    if (perfectos === 3) { bonus = 18; mensaje = '🏎️ Vuelta perfecta — los tres sectores en el límite, vuelta de referencia.'; }
                    else if (perfectos === 2) { bonus = 10; mensaje = '🏎️ Gran vuelta, con un sector para afinar.'; }
                    else if (perfectos === 1) { bonus = 4; mensaje = '🏎️ Vuelta correcta, sin sobresaltos.'; }
                    else { bonus = -6; mensaje = '🏎️ Vuelta floja — te faltó precisión en los tres sectores.'; }
                    onResult({ tipoEfecto: 'quali', bonus, mensaje });
                    return;
                }
                renderBarraTiming(save, { titulo: 'La Vuelta de Pole', subtitulo: `${sectores[i]} (Tu ${etiquetaAtributo(save, 'ritmoQuali')})`, segmentos: 10, zonaSize }, (acierto) => {
                    if (acierto) perfectos += 1;
                    jugarSector(i + 1);
                });
            }

            jugarSector(0);
        },
    },

    // 5. EL ADELANTAMIENTO PERFECTO — timing de boost ERS/DRS.
    {
        id: 'adelantamiento-perfecto',
        render(save, onResult) {
            const zonaSize = clamp(2 + Math.round(atributoJugador(save, 'agresividad') / 35), 2, 5);
            renderBarraTiming(save, {
                titulo: 'El Adelantamiento Perfecto',
                subtitulo: `Presioná el boost de ERS justo antes del punto de frenada para pasar por afuera. (Tu ${etiquetaAtributo(save, 'agresividad')})`,
                segmentos: 10,
                zonaSize,
            }, (acierto, celdaFinal, zonaInicio, zonaFin) => {
                let bonus;
                let mensaje;
                if (acierto) { bonus = 14; mensaje = '⚡ Adelantamiento limpio — usaste el ERS en el momento justo.'; }
                else if (celdaFinal > zonaFin) { bonus = -10; mensaje = '⚡ Te pasaste con el boost y frenaste tarde — bloqueaste los neumáticos.'; }
                else { bonus = -2; mensaje = '⚡ Te quedaste corto de energía — no alcanzó para completar el sobrepaso.'; }
                onResult({ tipoEfecto: 'carrera', bonus, mensaje });
            });
        },
    },

    // 6. TYRE WHISPERER — mantener la aguja en la zona óptima, a pura muñeca.
    {
        id: 'tyre-whisperer',
        render(save, onResult) {
            const zonaAncho = clamp(16 + Math.round(atributoJugador(save, 'gestionNeumaticos') / 4), 16, 40);
            const centro = 50;
            const zonaMin = centro - zonaAncho / 2;
            const zonaMax = centro + zonaAncho / 2;

            const app = document.getElementById('app');
            app.innerHTML = `
                ${renderHUD(save)}
                ${wizardShell('Tyre Whisperer', `Tocá "AJUSTAR" para mantener la temperatura en la zona verde mientras cambia el clima. (Tu ${etiquetaAtributo(save, 'gestionNeumaticos')})`, `
                    <div class="ep-tyre">
                        <div class="ep-tyre__track">
                            <div class="ep-tyre__zona" style="left:${zonaMin}%; width:${zonaAncho}%;"></div>
                            <div class="ep-tyre__aguja" id="epTyreAguja" style="left:${centro}%;"></div>
                        </div>
                        <div class="ep-tyre__labels"><span>Frío</span><span>Óptimo</span><span>Sobrecalentado</span></div>
                        <button type="button" class="ep-btn ep-btn--primary" id="epTyreBoton">AJUSTAR</button>
                        <p class="ep-hint" id="epTyreTiempo"></p>
                    </div>
                `)}`;

            const aguja = document.getElementById('epTyreAguja');
            const boton = document.getElementById('epTyreBoton');
            const tiempoEl = document.getElementById('epTyreTiempo');

            let posicion = centro;
            let deriva = (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random());
            let ticksEnZona = 0;
            let ticksTotal = 0;
            const DURACION_TICKS = 24;
            let ajusteQueue = 0;

            boton.addEventListener('click', () => { ajusteQueue += 14; });

            const intervalo = setInterval(() => {
                if (Math.random() < 0.15) deriva = clamp(deriva + (Math.random() < 0.5 ? -1 : 1) * 1.2, -4, 4);

                posicion += deriva;
                if (ajusteQueue !== 0) {
                    posicion -= Math.sign(posicion - centro || 1) * Math.min(ajusteQueue, 14);
                    ajusteQueue = 0;
                }
                posicion = clamp(posicion, 0, 100);
                aguja.style.left = `${posicion}%`;

                const enZona = posicion >= zonaMin && posicion <= zonaMax;
                aguja.classList.toggle('ep-tyre__aguja--verde', enZona);
                if (enZona) ticksEnZona += 1;
                ticksTotal += 1;

                if (ticksTotal >= DURACION_TICKS) {
                    clearInterval(intervalo);
                    boton.disabled = true;
                    const pct = Math.round((ticksEnZona / DURACION_TICKS) * 100);
                    let bonus;
                    let mensaje;
                    if (pct >= 80) { bonus = 16; mensaje = `🔥 Gestión impecable — ${pct}% del stint en temperatura óptima.`; }
                    else if (pct >= 55) { bonus = 8; mensaje = `🔥 Buena gestión — ${pct}% del stint en la zona ideal.`; }
                    else if (pct >= 30) { bonus = 0; mensaje = `🔥 Gestión irregular — ${pct}% del stint en zona óptima.`; }
                    else { bonus = -8; mensaje = `🔥 Neumáticos mal gestionados — solo ${pct}% del stint en zona óptima.`; }
                    tiempoEl.textContent = mensaje;
                    setTimeout(() => onResult({ tipoEfecto: 'carrera', bonus, mensaje }), 700);
                }
            }, 250);
        },
    },

    // 7. EL TELEMETRISTA — 3 sliders de setup vs. el óptimo del circuito.
    // Rediseñado a pedido del usuario ("menos ida y vuelta"): antes se
    // ajustaban los 3 sliders juntos, se probaban juntos, se leía un hint
    // "subila/bajala" por cada uno y se repetía todo el panel hasta 3 veces
    // — lento, y el estado de "sin intentos" quedaba mal resuelto (el botón
    // "Probar configuración" seguía visible y clickeable al mismo tiempo que
    // el cartel de comprar un intento extra). Ahora es secuencial: un slider
    // a la vez, feedback caliente/frío EN VIVO mientras arrastrás (sin decir
    // si te pasaste para arriba o para abajo, ni el valor objetivo), y un
    // solo "Confirmar" por paso — no hay vuelta atrás sobre ese slider salvo
    // que pagues (ver `ofrecerReintento`). `render()` siempre redibuja la
    // pantalla completa según `modo`, para que nunca queden dos estados de
    // UI superpuestos como en la versión vieja.
    {
        id: 'el-telemetrista',
        render(save, onResult) {
            const pista = save.calendario[save.carreraIndex];
            const objetivo = TELEMETRY_TARGETS[pista.tipo] ?? TELEMETRY_TARGETS.tecnica;
            const CLAVES = ['aero', 'presion', 'frenada'];
            const ETIQUETAS = { aero: 'Carga aerodinámica', presion: 'Presión de neumáticos', frenada: 'Reparto de frenada' };
            const UMBRAL_REINTENTO = 18; // "Frío" — a partir de acá se ofrece pagar para repetir el paso

            const resultados = {};
            let paso = 0;
            let valorActual = 50;
            let modo = 'ajustando'; // 'ajustando' | 'oferta-reintento'
            let diffUltimo = 0;
            let intentoExtraUsado = false;
            let gastoIntentoExtra = 0;

            function feedbackCalor(diff) {
                const abs = Math.abs(diff);
                if (abs <= 3) return '🔥🔥🔥 Ardiendo — clavado.';
                if (abs <= 8) return '🔥 Caliente.';
                if (abs <= UMBRAL_REINTENTO) return '🌡️ Tibio.';
                return '❄️ Frío.';
            }

            // El fill rojo del track no lo da accent-color solo (queda con
            // el look nativo del navegador) — se arma a mano con un
            // gradiente en el propio input (ver ::-webkit-slider-runnable-
            // track/::-moz-range-track en el SCSS, que dejan el track
            // transparente para que se vea este gradiente).
            function pintarFill(input) {
                const pct = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
                input.style.background = `linear-gradient(to right, #e10600 ${pct}%, rgba(255,255,255,0.14) ${pct}%)`;
            }

            function render() {
                const app = document.getElementById('app');
                const clave = CLAVES[paso];

                const cuerpo = modo === 'ajustando' ? `
                    <div class="ep-telemetria">
                        <label class="ep-telemetria__slider">
                            <div class="ep-telemetria__cabecera">
                                <span>${ETIQUETAS[clave]}</span>
                                <span class="ep-telemetria__valor" id="epTelemetriaValor">${valorActual}</span>
                            </div>
                            <input type="range" min="0" max="100" value="${valorActual}" id="epTelemetriaSlider">
                        </label>
                    </div>
                    <p class="ep-hint" id="epTelemetriaCalor">${feedbackCalor(valorActual - objetivo[clave])}</p>
                    <div class="ep-season-actions">
                        <button type="button" class="ep-btn ep-btn--primary" id="epTelemetriaConfirmar">Confirmar ajuste</button>
                    </div>
                ` : `
                    <div class="ep-telemetria">
                        <label class="ep-telemetria__slider">
                            <div class="ep-telemetria__cabecera">
                                <span>${ETIQUETAS[clave]}</span>
                                <span class="ep-telemetria__valor">${valorActual}</span>
                            </div>
                            <input type="range" min="0" max="100" value="${valorActual}" disabled>
                        </label>
                    </div>
                    <p class="ep-hint">${feedbackCalor(diffUltimo)} Quedó bastante lejos del objetivo.</p>
                    <div class="ep-season-actions">
                        <button type="button" class="ep-btn ep-btn--primary" id="epTelemetriaRepetir">Repetir este ajuste (${esc(fmtMoney(COSTO_INTENTO_EXTRA))})</button>
                        <button type="button" class="ep-btn ep-btn--ghost" id="epTelemetriaSeguirIgual">Seguir así</button>
                    </div>
                `;

                app.innerHTML = `
                    ${renderHUD(save)}
                    ${wizardShell('El Telemetrista', `Ajustá el setup para ${pista.nombre} antes de clasificar. Paso ${paso + 1}/${CLAVES.length} — ${ETIQUETAS[clave]}.`, cuerpo)}`;

                if (modo === 'ajustando') {
                    const input = document.getElementById('epTelemetriaSlider');
                    pintarFill(input);
                    input.addEventListener('input', () => {
                        valorActual = Number(input.value);
                        document.getElementById('epTelemetriaValor').textContent = valorActual;
                        document.getElementById('epTelemetriaCalor').textContent = feedbackCalor(valorActual - objetivo[clave]);
                        pintarFill(input);
                    });
                    document.getElementById('epTelemetriaConfirmar').addEventListener('click', confirmarPaso);
                } else {
                    document.getElementById('epTelemetriaRepetir').addEventListener('click', () => {
                        intentoExtraUsado = true;
                        gastoIntentoExtra += COSTO_INTENTO_EXTRA;
                        valorActual = 50;
                        modo = 'ajustando';
                        render();
                    });
                    document.getElementById('epTelemetriaSeguirIgual').addEventListener('click', avanzar);
                }
            }

            function confirmarPaso() {
                const clave = CLAVES[paso];
                resultados[clave] = valorActual;
                const diff = Math.abs(valorActual - objetivo[clave]);
                const saldo = (findPiloto(save, save.jugadorId)?.saldoDisponible ?? 0) - gastoIntentoExtra;

                if (diff > UMBRAL_REINTENTO && !intentoExtraUsado && saldo >= COSTO_INTENTO_EXTRA) {
                    diffUltimo = diff;
                    modo = 'oferta-reintento';
                    render();
                    return;
                }
                avanzar();
            }

            function avanzar() {
                paso += 1;
                if (paso >= CLAVES.length) {
                    finalizar();
                    return;
                }
                modo = 'ajustando';
                valorActual = 50;
                render();
            }

            function finalizar() {
                const diffTotal = CLAVES.reduce((sum, clave) => sum + Math.abs(resultados[clave] - objetivo[clave]), 0);
                const score = clamp(100 - diffTotal, 0, 100);
                let bonus;
                let mensaje;
                if (score >= 90) { bonus = 16; mensaje = `📊 Setup casi perfecto para ${pista.nombre} — clasificación asegurada.`; }
                else if (score >= 70) { bonus = 8; mensaje = `📊 Buen setup, cerca del óptimo para ${pista.nombre}.`; }
                else if (score >= 45) { bonus = 0; mensaje = `📊 Setup mediocre — ni cómodo ni rápido en ${pista.nombre}.`; }
                else { bonus = -8; mensaje = '📊 Setup lejos del óptimo — el auto se sintió raro en clasificación.'; }
                onResult({ tipoEfecto: 'quali', bonus, mensaje, gastoExtra: gastoIntentoExtra || undefined });
            }

            render();
        },
    },

    // 8. PADDOCK MATCH — memoria de parejas conceptuales genéricas de F1.
    // Colores reales de banda de compuesto (FIA): blando rojo, medio
    // amarillo, duro blanco, intermedio verde, lluvia extrema azul — se usan
    // para dibujar un neumático de verdad (aro negro + banda de color) en
    // vez del emoji de círculo plano, así la conexión "neumático con banda
    // roja" ↔ "Blando" se lee de un vistazo en vez de ser dos colores
    // sueltos sin relación visual.
    {
        id: 'paddock-match',
        async render(save, onResult) {
            const app = document.getElementById('app');
            app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading">Armando el paddock...</div></div>`;
            try {
                const pares = await fetchJSON(`${API}/el-piloto/paddock-pairs?cantidad=8`);
                const TIRE_COMPOUND_COLORS = { blando: '#e10600', medio: '#f5d500', duro: '#f2f2f2', intermedio: '#00c46a', lluvia: '#0066ff' };

                const cartas = [];
                pares.forEach((par) => {
                    cartas.push({ pairId: par.id, cara: par.a, esIcono: true });
                    cartas.push({ pairId: par.id, cara: par.b, esIcono: false });
                });
                for (let i = cartas.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [cartas[i], cartas[j]] = [cartas[j], cartas[i]];
                }

                function caraHTML(c) {
                    const bandaColor = c.esIcono ? TIRE_COMPOUND_COLORS[c.pairId] : null;
                    if (bandaColor) return `<span class="ep-paddock__neumatico" style="--banda-color:${bandaColor}"></span>`;
                    if (c.esIcono) return `<span class="ep-paddock__icono">${esc(c.cara)}</span>`;
                    return `<span class="ep-paddock__texto">${esc(c.cara)}</span>`;
                }

                const inicio = performance.now();
                let primeraSeleccion = null;
                let bloqueado = false;
                let terminado = false;
                let parejasEncontradas = 0;
                // Antes esto no se podía perder — el único castigo por jugar
                // mal era un bonus más bajo al terminar. A pedido del
                // usuario, ahora hay un tope finito de intentos (cada
                // "vuelta" de 2 cartas cuenta, acierte o no) y quedarte sin
                // ellos con parejas pendientes es una derrota real.
                const intentosMax = pares.length + 6;
                let intentosRestantes = intentosMax;

                app.innerHTML = `
                    ${renderHUD(save)}
                    ${wizardShell('Paddock Match', `Encontrá las ${pares.length} parejas antes de quedarte sin intentos.`, `
                        <p class="ep-hint" id="epPaddockIntentos">Intentos restantes: ${intentosRestantes}</p>
                        <div class="ep-paddock" id="epPaddockGrid">
                            ${cartas.map((c, i) => `
                                <button type="button" class="ep-paddock__carta ${c.esIcono ? 'ep-paddock__carta--icono' : 'ep-paddock__carta--texto'}" data-i="${i}">
                                    <span class="ep-paddock__reverso">🏎️</span>
                                    <span class="ep-paddock__cara" hidden>${caraHTML(c)}</span>
                                </button>`).join('')}
                        </div>
                    `)}`;

                const botones = Array.from(app.querySelectorAll('.ep-paddock__carta'));

                function voltear(i, mostrar) {
                    const btn = botones[i];
                    btn.querySelector('.ep-paddock__reverso').hidden = mostrar;
                    btn.querySelector('.ep-paddock__cara').hidden = !mostrar;
                    btn.classList.toggle('ep-paddock__carta--volteada', mostrar);
                }

                function actualizarIntentos() {
                    const el = document.getElementById('epPaddockIntentos');
                    if (el) el.textContent = `Intentos restantes: ${Math.max(0, intentosRestantes)}`;
                }

                function finalizarPorIntentos() {
                    terminado = true;
                    botones.forEach((btn) => { btn.disabled = true; });
                    const mensaje = `🃏 Se acabaron los intentos — ${parejasEncontradas}/${pares.length} parejas encontradas.`;
                    setTimeout(() => onResult({ tipoEfecto: 'quali', bonus: -10, mensaje }), 500);
                }

                botones.forEach((btn, i) => {
                    btn.addEventListener('click', () => {
                        if (terminado || bloqueado || btn.classList.contains('ep-paddock__carta--resuelta') || btn.classList.contains('ep-paddock__carta--volteada')) return;
                        voltear(i, true);

                        if (primeraSeleccion === null) {
                            primeraSeleccion = i;
                            return;
                        }

                        intentosRestantes -= 1;
                        actualizarIntentos();

                        const a = cartas[primeraSeleccion];
                        const b = cartas[i];
                        if (a.pairId === b.pairId) {
                            botones[primeraSeleccion].classList.add('ep-paddock__carta--resuelta');
                            botones[i].classList.add('ep-paddock__carta--resuelta');
                            parejasEncontradas += 1;
                            primeraSeleccion = null;
                            if (parejasEncontradas === pares.length) {
                                terminado = true;
                                const segundos = (performance.now() - inicio) / 1000;
                                let bonus;
                                let mensaje;
                                if (segundos < 20) { bonus = 16; mensaje = `🃏 ¡Completado en ${segundos.toFixed(1)}s! Pole position en la memoria del paddock.`; }
                                else if (segundos < 35) { bonus = 8; mensaje = `🃏 Completado en ${segundos.toFixed(1)}s — buena clasificación.`; }
                                else if (segundos < 50) { bonus = 2; mensaje = `🃏 Completado en ${segundos.toFixed(1)}s — clasificación mediocre.`; }
                                else { bonus = -4; mensaje = `🃏 Completado en ${segundos.toFixed(1)}s — te quedaste sin tiempo en clasificación.`; }
                                setTimeout(() => onResult({ tipoEfecto: 'quali', bonus, mensaje }), 500);
                            } else if (intentosRestantes <= 0) {
                                finalizarPorIntentos();
                            }
                        } else {
                            bloqueado = true;
                            const iActual = i;
                            const iPrimera = primeraSeleccion;
                            setTimeout(() => {
                                voltear(iPrimera, false);
                                voltear(iActual, false);
                                primeraSeleccion = null;
                                bloqueado = false;
                                if (intentosRestantes <= 0) {
                                    finalizarPorIntentos();
                                }
                            }, 700);
                        }
                    });
                });
            } catch (e) {
                console.error(e);
                onResult({ tipoEfecto: 'quali', bonus: 0, mensaje: 'No se pudo armar el paddock — clasificación resuelta sin bonus extra.' });
            }
        },
    },

    // 9. EVOLUCIÓN DE CASCOS — ordenar cronológicamente TUS PROPIAS temporadas.
    // Rediseñado: antes la carta imprimía "Temporada N" en la cara, así que
    // ordenar era leer números, no memoria. Ahora la carta muestra solo
    // equipo + puntos + posición — el número de temporada nunca se ve hasta
    // el resultado final. Además, las cartas se identifican por su ÍNDICE en
    // el array (no por el valor de `temporada`), así que si el historial
    // llegara a tener dos entradas con el mismo número de temporada (bug de
    // datos viejo), el juego no se traba: cada carta es un elemento
    // independiente sin importar si su `temporada` se repite.
    {
        id: 'evolucion-cascos',
        disponible: (save) => (save.historialTemporadas ?? []).length >= 2,
        render(save, onResult) {
            const temporadas = [...save.historialTemporadas];
            const indices = temporadas.map((_, i) => i).sort(() => Math.random() - 0.5);
            const ordenElegido = []; // índices en el orden en que se tocaron, NO números de temporada

            function render() {
                const app = document.getElementById('app');
                app.innerHTML = `
                    ${renderHUD(save)}
                    ${wizardShell('Evolución de Cascos', 'Tocá tus temporadas en orden cronológico, de la más vieja a la más nueva — sin el número a la vista, esta vez es de memoria.', `
                        <div class="ep-cartas">
                            ${indices.map((i) => {
                                const t = temporadas[i];
                                const posicionElegida = ordenElegido.indexOf(i);
                                const elegida = posicionElegida !== -1;
                                return `
                                <button type="button" class="ep-carta ep-casco" data-indice="${i}" ${elegida ? 'disabled' : ''}>
                                    ${elegida ? `<span class="ep-carta__orden">${posicionElegida + 1}º</span>` : ''}
                                    <span class="ep-carta__nombre">${esc(t.equipo)}</span>
                                    <span class="ep-carta__desc">${esc(t.puntos)} pts${t.posicionCampeonato ? ` · P${esc(t.posicionCampeonato)}` : ''}</span>
                                </button>`;
                            }).join('')}
                        </div>
                        <p class="ep-hint">Elegidas: ${ordenElegido.length} / ${temporadas.length}</p>
                    `)}`;

                app.querySelectorAll('.ep-casco').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const i = Number(btn.dataset.indice);
                        if (ordenElegido.includes(i)) return;
                        ordenElegido.push(i);
                        if (ordenElegido.length === temporadas.length) {
                            const secuencia = ordenElegido.map((idx) => temporadas[idx].temporada);
                            const correcto = secuencia.every((v, i, arr) => i === 0 || arr[i - 1] < v);
                            const idolatriaDelta = correcto ? 3 : -3;
                            const ordenCorrecto = [...temporadas]
                                .sort((a, b) => a.temporada - b.temporada)
                                .map((t) => `T${t.temporada} ${t.equipo}`)
                                .join(' → ');
                            const mensaje = correcto
                                ? '🪖 Ordenaste bien tu propia evolución — los fans valoran que conozcas tu propia historia.'
                                : `🪖 Te confundiste el orden de tus propias temporadas — un pequeño papelón en redes. El orden real era: ${ordenCorrecto}.`;
                            setTimeout(() => onResult({ tipoEfecto: 'narrativo', idolatriaDelta, economiaDelta: 0, mensaje }), 500);
                            return;
                        }
                        render();
                    });
                });
            }

            render();
        },
    },

    // 10. MURO DE BOXES — decisión de carrera de 2 opciones, sin comparación real.
    {
        id: 'muro-de-boxes',
        async render(save, onResult) {
            const app = document.getElementById('app');
            app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading">Se complica la carrera...</div></div>`;
            try {
                const decision = await fetchJSON(`${API}/el-piloto/decision-muro-boxes`);
                app.innerHTML = `
                    ${renderHUD(save)}
                    ${wizardShell('Muro de Boxes', decision.escenario, `
                        <div class="ep-choices">
                            ${decision.opciones.map((o) => `<button class="ep-choice" data-valor="${esc(o.id)}">${esc(o.texto)}</button>`).join('')}
                        </div>
                    `)}`;
                app.querySelectorAll('.ep-choice').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        try {
                            const resultado = await postJSON(`${API}/el-piloto/resolver-decision-muro-boxes`, { decisionId: decision.id, opcionId: btn.dataset.valor });
                            onResult({ tipoEfecto: 'narrativo', idolatriaDelta: resultado.idolatriaDelta, economiaDelta: resultado.economiaDelta, mensaje: `🧱 ${resultado.mensaje}` });
                        } catch (e) {
                            console.error(e);
                            onResult({ tipoEfecto: 'narrativo', idolatriaDelta: 0, economiaDelta: 0, mensaje: 'No se pudo resolver la decisión — la carrera sigue igual.' });
                        }
                    });
                });
            } catch (e) {
                console.error(e);
                onResult({ tipoEfecto: 'narrativo', idolatriaDelta: 0, economiaDelta: 0, mensaje: 'No se pudo cargar el Muro de Boxes.' });
            }
        },
    },

    // 11. TA-TE-TI: DUELO EN LA GRILLA — vs. IA local, con variante Grid Trivia.
    {
        id: 'ta-te-ti',
        render(save, onResult) {
            const app = document.getElementById('app');
            app.innerHTML = `
                ${renderHUD(save)}
                ${wizardShell('Duelo en la Grilla', 'Neumático blando (vos) vs. neumático duro (rival). Elegí el modo.', `
                    <div class="ep-season-actions">
                        <button type="button" class="ep-btn ep-btn--primary" id="epTttRapido">Ta-Te-Ti rápido</button>
                        <button type="button" class="ep-btn ep-btn--ghost" id="epTttTrivia">Grid Trivia</button>
                    </div>
                `)}`;

            document.getElementById('epTttRapido').addEventListener('click', () => jugarTicTacToe(save, false, onResult));
            document.getElementById('epTttTrivia').addEventListener('click', () => jugarTicTacToe(save, true, onResult));
        },
    },
];

async function jugarTicTacToe(save, conTrivia, onResult) {
    const app = document.getElementById('app');
    const HUMANO = 'jugador';
    const IA = 'rival';
    const board = Array(9).fill(null);
    let terminado = false;
    let trivia = null;

    if (conTrivia) {
        app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading">Preparando las preguntas...</div></div>`;
        try {
            trivia = await fetchJSON(`${API}/el-piloto/trivia-f1?cantidad=9`);
        } catch (e) {
            console.error(e);
            trivia = null;
        }
    }

    function render() {
        app.innerHTML = `
            ${renderHUD(save)}
            ${wizardShell('Duelo en la Grilla', conTrivia ? 'Respondé bien para poder colocar tu ficha.' : 'Neumático blando (vos) vs. neumático duro (rival).', `
                <div class="ep-ttt">
                    ${board.map((c, i) => `
                        <button type="button" class="ep-ttt__celda" data-i="${i}" ${c ? 'disabled' : ''}>${c === HUMANO ? '🔴' : c === IA ? '⚪' : ''}</button>`).join('')}
                </div>
            `)}`;

        app.querySelectorAll('.ep-ttt__celda').forEach((btn) => {
            btn.addEventListener('click', () => onCeldaClick(Number(btn.dataset.i)));
        });
    }

    function chequearFin() {
        const resultado = tttGanador(board);
        if (!resultado) return false;
        terminado = true;
        let idolatriaDelta;
        let economiaDelta;
        let mensaje;
        if (resultado === HUMANO) { idolatriaDelta = 3; economiaDelta = 4000; mensaje = '❌⭕ Ganaste el duelo en la grilla — la comunidad lo compartió a full.'; }
        else if (resultado === IA) { idolatriaDelta = -3; economiaDelta = 0; mensaje = '❌⭕ Perdiste el duelo — nada grave, es solo un juego entre carreras.'; }
        else { idolatriaDelta = 0; economiaDelta = 1000; mensaje = '❌⭕ Empate parejo en la grilla.'; }
        render();
        setTimeout(() => onResult({ tipoEfecto: 'narrativo', idolatriaDelta, economiaDelta, mensaje }), 700);
        return true;
    }

    function turnoIA() {
        const movimiento = tttJugadaIA(board, IA, HUMANO);
        if (movimiento == null) return;
        board[movimiento] = IA;
        if (!chequearFin()) render();
    }

    function colocarFicha(i) {
        board[i] = HUMANO;
        if (!chequearFin()) {
            render();
            setTimeout(turnoIA, 400);
        }
    }

    function onCeldaClick(i) {
        if (terminado || board[i]) return;
        if (!conTrivia || !trivia) {
            colocarFicha(i);
            return;
        }
        const pregunta = trivia[i % trivia.length];
        app.innerHTML = `
            ${renderHUD(save)}
            ${wizardShell('Grid Trivia', pregunta.pregunta, `
                <div class="ep-choices">
                    ${pregunta.opciones.map((op, idx) => `<button class="ep-choice" data-idx="${idx}">${esc(op)}</button>`).join('')}
                </div>
            `)}`;
        app.querySelectorAll('.ep-choice').forEach((btn) => {
            btn.addEventListener('click', () => {
                const acierto = Number(btn.dataset.idx) === pregunta.correcta;
                if (acierto) {
                    colocarFicha(i);
                } else {
                    render();
                    setTimeout(turnoIA, 400);
                }
            });
        });
    }

    render();
}

// ─── MOMENTO: NARRATIVO (prensa / equipo) ──────────────────────────────────
async function renderMomentoNarrativo(save, categoria) {
    const app = document.getElementById('app');
    app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading">Preparando un imprevisto...</div></div>`;

    try {
        const evento = await fetchJSON(`${API}/el-piloto/evento-aleatorio?categoria=${categoria}`);
        const opciones = evento.opciones.map((o) => `
            <button class="ep-choice" data-valor="${esc(o.id)}">${esc(o.texto)}</button>`).join('');

        app.innerHTML = `
            ${renderHUD(save)}
            ${wizardShell(categoria === 'prensa' ? 'Conferencia de prensa' : 'Decisión de equipo', evento.pregunta, `<div class="ep-choices">${opciones}</div>`)}`;

        app.querySelectorAll('.ep-choice').forEach((btn) => {
            btn.addEventListener('click', () => resolverMomentoNarrativo(save, evento.id, btn.dataset.valor));
        });
    } catch (e) {
        console.error(e);
        // Si falla el evento no bloqueamos el avance de la temporada.
        avanzarTemporada(save);
    }
}

async function resolverMomentoNarrativo(save, eventoId, opcionId) {
    const app = document.getElementById('app');
    try {
        const data = await postJSON(`${API}/el-piloto/resolver-evento`, { eventoId, opcionId });

        const saveConIdolatria = {
            ...save,
            pilotos: save.pilotos.map((p) => (
                p.id === save.jugadorId
                    ? { ...p, idolatria: clamp((p.idolatria ?? 50) + data.idolatriaDelta, 0, 100) }
                    : p
            )),
            bonusEventoPendiente: (save.bonusEventoPendiente ?? 0) + data.bonusCarrera,
        };
        setSave(saveConIdolatria);

        app.innerHTML = `
            ${renderHUD(saveConIdolatria)}
            ${wizardShell('Antes de la próxima carrera', data.mensaje, `
                <div class="ep-season-actions">
                    <button class="ep-btn ep-btn--primary" id="epContinuarEvento">Continuar</button>
                </div>
            `)}`;

        document.getElementById('epContinuarEvento').addEventListener('click', async () => {
            app.innerHTML = `${renderHUD(saveConIdolatria)}<div class="ep-page"><div class="ep-loading">Corriendo la carrera...</div></div>`;
            try {
                const nuevoSave = await simularCarreraSilenciosa(saveConIdolatria);
                avanzarTemporada(nuevoSave);
            } catch (e) {
                console.error(e);
                app.innerHTML = `${renderHUD(saveConIdolatria)}<div class="ep-page"><div class="ep-loading ep-loading--error">No se pudo simular la carrera: ${esc(e.message)}</div></div>`;
            }
        });
    } catch (e) {
        console.error(e);
        avanzarTemporada(save);
    }
}

// ─── FIN DE TEMPORADA ───────────────────────────────────────────────────────
function jugadorEsCampeon(save) {
    const rows = standingsRows(save);
    return rows.length > 0 && rows[0].id === save.jugadorId;
}

function iniciarCierreTemporada(save) {
    if (jugadorEsCampeon(save)) {
        renderPantallaCampeon(save);
    } else {
        procesarCierreTemporada(save);
    }
}

function renderPantallaCampeon(save) {
    const app = document.getElementById('app');
    app.innerHTML = `
        ${renderHUD(save)}
        ${wizardShell('CAMPEÓN DEL MUNDO', `Temporada ${save.temporadaNumero ?? 1}`, `
            <div class="ep-season-actions">
                <button class="ep-btn ep-btn--primary" id="epContinuarCampeon">Continuar</button>
            </div>
        `)}`;

    document.getElementById('epContinuarCampeon').addEventListener('click', () => {
        const nuevoSave = {
            ...save,
            pilotos: save.pilotos.map((p) => (
                p.id === save.jugadorId ? { ...p, titulosCareer: (p.titulosCareer ?? 0) + 1 } : p
            )),
        };
        setSave(nuevoSave);
        procesarCierreTemporada(nuevoSave);
    });
}

async function procesarCierreTemporada(save) {
    // Guarda de idempotencia: si esta temporada ya se cerró (ver
    // `temporadaCerrada` y el guard en renderSeasonScreen) no la proceses de
    // nuevo — evita duplicar el historialEntry si algún llamador viejo
    // llegara a invocar esto dos veces para la misma temporada.
    if (save.temporadaCerrada) {
        renderSeasonScreen(save);
        return;
    }

    const app = document.getElementById('app');
    app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading">Cerrando la temporada...</div></div>`;

    const jugadorAntes = findPiloto(save, save.jugadorId);
    const equipoAntes = save.equipos[jugadorAntes.equipoId];
    const standingsPrevias = standingsRows(save);
    const posicionCampeonato = standingsPrevias.findIndex((r) => r.id === save.jugadorId) + 1;

    const historialEntry = {
        temporada: save.temporadaNumero ?? 1,
        equipo: equipoAntes?.nombre ?? '—',
        posicionCampeonato: posicionCampeonato || null,
        puntos: save.tablaPuntos[save.jugadorId] ?? 0,
    };

    try {
        const data = await postJSON(`${API}/el-piloto/cerrar-temporada`, { pilotos: save.pilotos, equipos: save.equipos });

        const saveConHistorial = {
            ...save,
            pilotos: data.pilotos,
            equipos: data.equipos,
            historialTemporadas: [...(save.historialTemporadas ?? []), historialEntry],
            temporadaCerrada: true,
        };
        setSave(saveConHistorial);

        renderResumenTemporada(saveConHistorial, historialEntry, () => {
            const jugadorDespues = findPiloto(saveConHistorial, save.jugadorId);
            if (jugadorDespues && jugadorDespues.edad >= jugadorDespues.edadRetiro) {
                renderRetiroFinal(saveConHistorial);
            } else {
                renderMercadoDePases(saveConHistorial);
            }
        });
    } catch (e) {
        console.error(e);
        app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading ep-loading--error">No se pudo cerrar la temporada: ${esc(e.message)}</div></div>`;
    }
}

// ─── RESUMEN DE TEMPORADA (estilo "Potrero deportivo") ─────────────────────
function renderResumenTemporada(save, historialEntry, onContinuar) {
    const app = document.getElementById('app');
    const titulo = TITULOS_RESUMEN[Math.floor(Math.random() * TITULOS_RESUMEN.length)];
    const nota = clamp(4 + historialEntry.puntos / 25, 1, 10).toFixed(1);
    const jugador = findPiloto(save, save.jugadorId);
    const rival = findPiloto(save, save.rivalEternoId);

    app.innerHTML = `
        ${renderHUD(save)}
        ${wizardShell(titulo, `Temporada ${historialEntry.temporada} con ${historialEntry.equipo}`, `
            <div class="ep-resumen">
                <div class="ep-resumen__nota">${esc(nota)}<small>Nota de la temporada</small></div>
                <div class="ep-events">
                    <div class="ep-event">${esc(historialEntry.puntos)} puntos${historialEntry.posicionCampeonato ? ` — P${esc(historialEntry.posicionCampeonato)} en el campeonato` : ''}.</div>
                    <div class="ep-event">Vas ${esc(jugador?.victoriasCareer ?? 0)}-${esc(rival?.victoriasCareer ?? 0)} en victorias de carrera contra ${esc(rival ? displayName(rival) : 'tu rival')}.</div>
                </div>
            </div>
            <div class="ep-season-actions">
                <button class="ep-btn ep-btn--primary" id="epContinuarResumen">Continuar</button>
            </div>
        `)}`;

    document.getElementById('epContinuarResumen').addEventListener('click', onContinuar);
}

// Ni la renovación con el equipo actual ni las ofertas externas están
// garantizadas — antes SIEMPRE aparecían las dos cosas, algo raro si la
// temporada fue mala. Se calcula una "cotización" 0-100 (mitad puntos de la
// última temporada, tope 200 pts = una gran temporada; mitad idolatría) que
// define ambas probabilidades. No se persiste en el save — es solo el
// criterio para armar esta pantalla.
function evaluarMercado(save) {
    const jugador = findPiloto(save, save.jugadorId);
    const ultimaTemporada = (save.historialTemporadas ?? []).slice(-1)[0];
    const puntos = ultimaTemporada?.puntos ?? 0;
    const idolatria = jugador.idolatria ?? 50;
    const cotizacion = clamp(puntos / 2, 0, 100) * 0.5 + clamp(idolatria, 0, 100) * 0.5;

    // El equipo actual: piso del 10% de no renovar incluso con la mejor
    // cotización posible (siempre puede haber una sorpresa), techo del 95%
    // de renovar con cotización muy baja para que igual no sea un hecho.
    const probRenovacion = clamp(0.25 + cotizacion / 130, 0.1, 0.95);
    // Cada equipo rival tira SU propia moneda con esta probabilidad — así el
    // mercado puede aparecer vacío (mala cotización) o casi completo (muy
    // buena), en vez de ser siempre "las mismas 4 ofertas".
    const probOferta = clamp(0.12 + cotizacion / 140, 0.04, 0.85);

    return { cotizacion, renueva: Math.random() < probRenovacion, probOferta };
}

// ─── MERCADO DE PASES (multi-oferta, "llamar al representante" 1 vez) ──────
function renderMercadoDePases(save) {
    const jugador = findPiloto(save, save.jugadorId);
    const equipoActual = save.equipos[jugador.equipoId];
    const otros = Object.values(save.equipos).filter((eq) => eq.id !== jugador.equipoId);
    const mezclados = [...otros].sort(() => Math.random() - 0.5);

    const { renueva, probOferta } = evaluarMercado(save);
    let ofertasVisibles = mezclados.filter(() => Math.random() < probOferta).slice(0, 4);

    // Nunca se deja al jugador sin ningún botón que lo lleve a la próxima
    // temporada: si no renovás Y ningún equipo ofertó, se fuerza una oferta
    // de "mercy" — preferentemente de un equipo de fondo de parrilla, que
    // encaja con la narrativa de "el único que te da una silla".
    if (!renueva && ofertasVisibles.length === 0 && mezclados.length > 0) {
        const backmarker = mezclados.find((eq) => tierDeEquipo(eq.nombre) === 'backmarker');
        ofertasVisibles = [backmarker ?? mezclados[0]];
    }

    let representanteDisponible = !save.llamadaRepresentanteUsada;
    let representantePremiumUsado = false;
    let gestionImagenComprada = false;
    const noOfertaron = () => mezclados.filter((eq) => !ofertasVisibles.some((v) => v.id === eq.id));

    function render() {
        const app = document.getElementById('app');
        const saldo = findPiloto(save, save.jugadorId)?.saldoDisponible ?? 0;
        app.innerHTML = `
            ${renderHUD(save)}
            ${wizardShell(
                'Mercado de pases',
                renueva ? '¿Gloria o continuidad? Elegí para la próxima temporada.' : `${esc(equipoActual.nombre)} no te renueva — a ver qué te consigue el mercado.`,
                `
                <div class="ep-market">
                    ${renueva ? `
                        <div class="ep-market__offer ep-market__offer--renovacion" style="--team-color:${esc(equipoActual.primaryColor || '#e10600')}">
                            <span class="ep-market__badge">Renovación</span>
                            <span class="ep-market__team">${esc(equipoActual.nombre)}</span>
                        </div>` : `
                        <div class="ep-market__offer ep-market__offer--descarte" style="--team-color:${esc(equipoActual.primaryColor || '#e10600')}">
                            <span class="ep-market__badge ep-market__badge--descarte">Sin renovación</span>
                            <span class="ep-market__team">${esc(equipoActual.nombre)} busca otro piloto para el año que viene</span>
                        </div>`}
                    ${ofertasVisibles.map((eq) => `
                        <div class="ep-market__offer" style="--team-color:${esc(eq.primaryColor || '#e10600')}">
                            <span class="ep-market__team">${esc(eq.nombre)}</span>
                            <span class="ep-market__hint">${renueva ? (gestionImagenComprada ? `Dejás ${esc(equipoActual.nombre)}: sin costo de idolatría (gestión de imagen)` : `Dejás ${esc(equipoActual.nombre)}: -8 de idolatría`) : 'Te suma a su parrilla para el año que viene'}</span>
                            <button type="button" class="ep-btn ep-btn--ghost ep-market__pick" data-equipo-id="${esc(eq.id)}">Fichar acá</button>
                        </div>`).join('')}
                    ${renueva && ofertasVisibles.length === 0 ? `<p class="ep-hint">Ningún otro equipo se acercó esta vez — nadie te vio como una prioridad de mercado.</p>` : ''}
                </div>
                ${renueva && ofertasVisibles.length > 0 ? `
                    <div class="ep-prep--market">
                        <div class="ep-prep__item">
                            <div class="ep-prep__info">
                                <span class="ep-prep__nombre">Gestión de imagen</span>
                                <span class="ep-prep__desc">Si te vas de ${esc(equipoActual.nombre)}, no pagás el costo de idolatría por irte.</span>
                            </div>
                            <button type="button" class="ep-btn ep-btn--ghost ep-prep__btn" id="epComprarGestionImagen" ${gestionImagenComprada || saldo < COSTO_GESTION_IMAGEN ? 'disabled' : ''}>
                                ${gestionImagenComprada ? 'Contratada ✓' : `Comprar (${esc(fmtMoney(COSTO_GESTION_IMAGEN))})`}
                            </button>
                        </div>
                    </div>` : ''}
                ${renueva ? `
                    <div class="ep-season-actions">
                        <button class="ep-btn ep-btn--primary" id="epQuedarse">Quedarme en ${esc(equipoActual.nombre)}</button>
                    </div>` : ''}
                ${representanteDisponible || (!representantePremiumUsado && noOfertaron().length > 0) ? `
                    <div class="ep-season-actions ep-season-actions--secundarias">
                        ${representanteDisponible ? `<button type="button" class="ep-btn ep-btn--ghost" id="epLlamarRepresentante">Llamar al representante (1 vez por carrera)</button>` : ''}
                        ${!representantePremiumUsado && noOfertaron().length > 0 ? `<button type="button" class="ep-btn ep-btn--ghost" id="epRepresentantePremium" ${saldo < COSTO_REPRESENTANTE_PREMIUM ? 'disabled' : ''}>Representante premium (${esc(fmtMoney(COSTO_REPRESENTANTE_PREMIUM))})</button>` : ''}
                    </div>` : ''}
            `)}`;

        const btnQuedarse = document.getElementById('epQuedarse');
        if (btnQuedarse) btnQuedarse.addEventListener('click', () => renderPretemporada(save));

        app.querySelectorAll('.ep-market__pick').forEach((btn) => {
            btn.addEventListener('click', () => aceptarOferta(save, btn.dataset.equipoId, renueva && !gestionImagenComprada));
        });

        const btnGestionImagen = document.getElementById('epComprarGestionImagen');
        if (btnGestionImagen) {
            btnGestionImagen.addEventListener('click', () => {
                gestionImagenComprada = true;
                save = {
                    ...save,
                    pilotos: save.pilotos.map((p) => (p.id === save.jugadorId ? { ...p, saldoDisponible: Math.max(0, (p.saldoDisponible ?? 0) - COSTO_GESTION_IMAGEN) } : p)),
                };
                setSave(save);
                render();
            });
        }

        const btnRepresentante = document.getElementById('epLlamarRepresentante');
        if (btnRepresentante) {
            btnRepresentante.addEventListener('click', () => {
                representanteDisponible = false;
                save.llamadaRepresentanteUsada = true;
                // Segunda vuelta, con mejor suerte, solo para los equipos
                // que no habían ofertado en la primera — así "llamar al
                // representante" sirve incluso (sobre todo) cuando el
                // mercado apareció vacío o casi vacío.
                const nuevas = noOfertaron().filter(() => Math.random() < clamp(probOferta + 0.35, 0, 0.9));
                ofertasVisibles = [...ofertasVisibles, ...nuevas];
                setSave(save);
                render();
            });
        }

        const btnRepresentantePremium = document.getElementById('epRepresentantePremium');
        if (btnRepresentantePremium) {
            btnRepresentantePremium.addEventListener('click', () => {
                representantePremiumUsado = true;
                // Misma "segunda vuelta con mejor suerte" que la versión
                // gratis, pero pagada: no depende de save.llamadaRepresentanteUsada,
                // así que sirve incluso si ya se usó (o nunca) la gratuita —
                // solo una vez por visita al mercado (representantePremiumUsado
                // es local a esta pantalla, no se persiste en el save).
                const nuevas = noOfertaron().filter(() => Math.random() < clamp(probOferta + 0.35, 0, 0.9));
                ofertasVisibles = [...ofertasVisibles, ...nuevas];
                save = {
                    ...save,
                    pilotos: save.pilotos.map((p) => (p.id === save.jugadorId ? { ...p, saldoDisponible: Math.max(0, (p.saldoDisponible ?? 0) - COSTO_REPRESENTANTE_PREMIUM) } : p)),
                };
                setSave(save);
                render();
            });
        }
    }

    render();
}

// aplicarPenalizacion: si el equipo actual seguía queriéndote y elegiste
// irte de todas formas, la fanaticada lo lee como una traición (-8
// idolatría, como antes) — salvo que hayas contratado gestión de imagen. Si
// en cambio te descartaron y fichás en otro lado porque no había otra
// opción, no hay penalización — no fue una decisión del jugador.
function aceptarOferta(save, equipoDestinoId, aplicarPenalizacion = true) {
    const jugador = findPiloto(save, save.jugadorId);
    const companerosNuevos = save.pilotos.filter((p) => p.equipoId === equipoDestinoId && p.id !== save.jugadorId);
    const equipoViejoId = jugador.equipoId;
    const penalizacionIdolatria = aplicarPenalizacion ? -8 : 0;

    let intercambiado = false;
    const nuevoPilotos = save.pilotos.map((p) => {
        if (p.id === save.jugadorId) return { ...p, equipoId: equipoDestinoId, idolatria: clamp((p.idolatria ?? 50) + penalizacionIdolatria, 0, 100) };
        if (!intercambiado && companerosNuevos.length && p.id === companerosNuevos[0].id) {
            intercambiado = true;
            return { ...p, equipoId: equipoViejoId };
        }
        return p;
    });

    const nuevoSave = { ...save, pilotos: nuevoPilotos };
    setSave(nuevoSave);
    renderPretemporada(nuevoSave);
}

// ─── PRETEMPORADA: DADO DE MEJORAS ──────────────────────────────────────────
function renderPretemporada(save) {
    const jugadorOriginal = findPiloto(save, save.jugadorId);
    const tiradasBase = 1 + Math.floor((jugadorOriginal.idolatria ?? 50) / 33);
    let tiradasExtra = 0;
    let saldoRestante = jugadorOriginal.saldoDisponible ?? 0;
    // Casco: puramente cosmético, no se persiste hasta "Tirar el dado" (junto
    // con saldoRestante) — mismo patrón que las tiradas extra, para no pisar
    // el save real con una compra a mitad de camino de esta pantalla.
    let cascoElegido = null;

    function render() {
        const app = document.getElementById('app');
        const cascoActual = cascoElegido?.nombre ?? jugadorOriginal.cascoDiseno;
        const costoProximaTirada = costoTiradaExtra(tiradasExtra);
        app.innerHTML = `
            ${renderHUD(save)}
            ${wizardShell('Pretemporada', `Tenés ${tiradasBase + tiradasExtra} tiradas de mejora. Saldo: ${esc(fmtMoney(saldoRestante))}`, `
                <div class="ep-prep">
                    <div class="ep-prep__item">
                        <div class="ep-prep__info">
                            <span class="ep-prep__nombre">Casco</span>
                            <span class="ep-prep__desc">${cascoActual ? esc(cascoActual) : 'Sin personalizar — puramente estético, no afecta tu rendimiento.'}</span>
                        </div>
                        <button type="button" class="ep-btn ep-btn--ghost ep-prep__btn" id="epPersonalizarCasco" ${saldoRestante < COSTO_CASCO ? 'disabled' : ''}>
                            ${cascoActual ? 'Cambiar' : 'Personalizar'} (${esc(fmtMoney(COSTO_CASCO))})
                        </button>
                    </div>
                </div>
                <div class="ep-season-actions">
                    <button type="button" class="ep-btn ep-btn--ghost" id="epComprarTirada" ${tiradasExtra >= TOPE_TIRADAS_EXTRA_PLATA || saldoRestante < costoProximaTirada ? 'disabled' : ''}>Comprar tirada extra (${esc(fmtMoney(costoProximaTirada))})</button>
                    <button type="button" class="ep-btn ep-btn--primary" id="epEmpezarDado">Tirar el dado</button>
                </div>
            `)}`;

        const btnComprar = document.getElementById('epComprarTirada');
        if (btnComprar) {
            btnComprar.addEventListener('click', () => {
                saldoRestante -= costoProximaTirada;
                tiradasExtra += 1;
                render();
            });
        }

        document.getElementById('epPersonalizarCasco').addEventListener('click', renderElegirCasco);

        document.getElementById('epEmpezarDado').addEventListener('click', () => {
            const nuevoPilotos = save.pilotos.map((p) => (
                p.id === save.jugadorId
                    ? { ...p, saldoDisponible: saldoRestante, ...(cascoElegido ? { cascoDiseno: cascoElegido.nombre } : {}) }
                    : p
            ));
            const saveConGasto = { ...save, pilotos: nuevoPilotos };
            setSave(saveConGasto);
            tirarDadoMejora(saveConGasto, tiradasBase + tiradasExtra);
        });
    }

    async function renderElegirCasco() {
        const app = document.getElementById('app');
        app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading">Buscando diseños de casco...</div></div>`;
        try {
            const cartas = await fetchJSON(`${API}/el-piloto/cartas-casco`);
            app.innerHTML = `
                ${renderHUD(save)}
                ${wizardShell('Personalizar casco', 'Puramente estético — no afecta tu rendimiento en pista.', cartasHTML(cartas))}`;
            app.querySelectorAll('.ep-carta').forEach((btn) => {
                btn.addEventListener('click', () => {
                    cascoElegido = cartas.find((c) => c.id === btn.dataset.id);
                    saldoRestante -= COSTO_CASCO;
                    render();
                });
            });
        } catch (e) {
            console.error(e);
            render();
        }
    }

    render();
}

async function tirarDadoMejora(save, tiradasRestantes) {
    if (tiradasRestantes <= 0) {
        comenzarNuevaTemporada(save);
        return;
    }

    const app = document.getElementById('app');
    app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading">El dado trae 3 mejoras...</div></div>`;

    try {
        const cartas = await fetchJSON(`${API}/el-piloto/cartas-mejora`);
        app.innerHTML = `
            ${renderHUD(save)}
            ${wizardShell('El dado trajo estas mejoras', `Elegí una (te quedan ${tiradasRestantes} tirada${tiradasRestantes === 1 ? '' : 's'})`, cartasHTML(cartas))}`;

        app.querySelectorAll('.ep-carta').forEach((btn) => {
            btn.addEventListener('click', () => {
                const carta = cartas.find((c) => c.id === btn.dataset.id);
                aplicarCartaMejora(save, carta, tiradasRestantes - 1);
            });
        });
    } catch (e) {
        console.error(e);
        comenzarNuevaTemporada(save);
    }
}

function aplicarCartaMejora(save, carta, tiradasRestantes) {
    const equipoId = findPiloto(save, save.jugadorId).equipoId;

    const nuevoPilotos = save.pilotos.map((p) => {
        if (p.id !== save.jugadorId) return p;
        const atributos = { ...p.atributos };
        let bonusLluvia = p.bonusLluvia ?? 0;

        if (carta.campo === 'atributo') {
            if (carta.clave === 'parejo') {
                Object.keys(atributos).forEach((k) => { atributos[k] = Math.min(100, atributos[k] + carta.bonus); });
            } else {
                atributos[carta.clave] = Math.min(100, (atributos[carta.clave] ?? 50) + carta.bonus);
            }
        } else if (carta.campo === 'bonusLluvia') {
            bonusLluvia += carta.bonus;
        }

        return { ...p, atributos, bonusLluvia };
    });

    const nuevoEquipos = { ...save.equipos };
    if (carta.campo === 'equipo') {
        const equipo = { ...nuevoEquipos[equipoId] };
        equipo[carta.clave] = Math.min(100, (equipo[carta.clave] ?? 70) + carta.bonus);
        if (carta.claveSecundaria) {
            equipo[carta.claveSecundaria] = Math.max(0, Math.min(100, (equipo[carta.claveSecundaria] ?? 70) + (carta.bonusSecundario ?? 0)));
        }
        nuevoEquipos[equipoId] = equipo;
    }

    const nuevoSave = { ...save, pilotos: nuevoPilotos, equipos: nuevoEquipos };
    setSave(nuevoSave);
    tirarDadoMejora(nuevoSave, tiradasRestantes);
}

async function comenzarNuevaTemporada(save) {
    const app = document.getElementById('app');
    app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading">Armando el calendario...</div></div>`;

    try {
        const nuevoCalendario = await fetchJSON(`${API}/el-piloto/calendario?carreras=${save.calendario.length}`);
        const nuevoSave = {
            ...save,
            calendario: nuevoCalendario,
            carreraIndex: 0,
            tablaPuntos: {},
            temporadaNumero: (save.temporadaNumero ?? 1) + 1,
            momentos: generarMomentos(nuevoCalendario.length),
            temporadaCerrada: false,
        };
        setSave(nuevoSave);
        renderSeasonScreen(nuevoSave);
    } catch (e) {
        console.error(e);
        app.innerHTML = `${renderHUD(save)}<div class="ep-page"><div class="ep-loading ep-loading--error">No se pudo armar la próxima temporada: ${esc(e.message)}</div></div>`;
    }
}

// ─── RETIRO Y PANTALLA FINAL ────────────────────────────────────────────────
function calcularBadge(jugador) {
    if ((jugador.titulosCareer ?? 0) >= 3) return 'LEYENDA';
    if ((jugador.titulosCareer ?? 0) >= 1) return 'CAMPEÓN';
    if ((jugador.victoriasCareer ?? 0) >= 10) return 'DESTACADO';
    return 'PILOTO DE F1';
}

// Comparación cualitativa, no una equivalencia estadística exacta — el
// objetivo es dar un cierre narrativo, no afirmar hechos puntuales sobre
// pilotos reales.
function compararConLeyenda(jugador) {
    const titulos = jugador.titulosCareer ?? 0;
    const victorias = jugador.victoriasCareer ?? 0;
    if (titulos >= 5) return 'Tu carrera evoca a Schumacher o Hamilton — de las máximas figuras de la historia.';
    if (titulos >= 2) return 'Tu carrera se compara con la de Senna o Prost — un campeón de verdad.';
    if (titulos >= 1) return 'Ganaste un título, como tantos grandes campeones de una sola corona.';
    if (victorias >= 10) return 'Nunca fuiste campeón, pero tu palmarés de victorias te pone entre los pilotos más recordados sin corona.';
    return 'Tu historia todavía se está escribiendo en la memoria de los fanáticos de la F1.';
}

function renderRetiroFinal(save) {
    const jugador = findPiloto(save, save.jugadorId);
    const badge = calcularBadge(jugador);
    const app = document.getElementById('app');

    const timeline = (save.historialTemporadas ?? []).map((t) => `
        <div class="ep-timeline__item">
            <span class="ep-timeline__temporada">Temporada ${esc(t.temporada)}</span>
            <span class="ep-timeline__equipo">${esc(t.equipo)}</span>
            <span class="ep-timeline__resultado">${t.posicionCampeonato ? `P${esc(t.posicionCampeonato)} campeonato` : 'Sin puntos'} · ${esc(t.puntos)} pts</span>
        </div>`).join('');

    app.innerHTML = wizardShell('Fin de carrera', `${esc(displayName(jugador))} se retira a los ${esc(jugador.edad)} años`, `
        <div class="ep-legend-badge">${esc(badge)}</div>
        <div class="ep-standings-final">
            <table class="ep-standings">
                <tbody>
                    <tr><td>Grandes Premios</td><td>${esc(jugador.racesCompleted ?? 0)}</td></tr>
                    <tr><td>Victorias</td><td>${esc(jugador.victoriasCareer ?? 0)}</td></tr>
                    <tr><td>Poles</td><td>${esc(jugador.polesCareer ?? 0)}</td></tr>
                    <tr><td>Podios</td><td>${esc(jugador.podiosCareer ?? 0)}</td></tr>
                    <tr><td>Campeonatos</td><td>${esc(jugador.titulosCareer ?? 0)}</td></tr>
                    <tr><td>Puntos totales</td><td>${esc(jugador.puntosCareerTotal ?? 0)}</td></tr>
                    <tr><td>Valor de mercado final</td><td>${esc(fmtMoney(jugador.valorDeMercado))}</td></tr>
                    <tr><td>Dinero ganado en la carrera</td><td>${esc(fmtMoney(jugador.dineroGanado))}</td></tr>
                </tbody>
            </table>
        </div>
        <p class="ep-legend-comparacion">${esc(compararConLeyenda(jugador))}</p>
        <h2 class="ep-section-title">Tu carrera</h2>
        <div class="ep-timeline">${timeline || '<p class="ep-loading">Retiro en la primera temporada.</p>'}</div>
        <div class="ep-season-actions">
            <button class="ep-btn ep-btn--primary" id="epNuevaCarrera">Nueva carrera</button>
        </div>
    `);

    document.getElementById('epNuevaCarrera').addEventListener('click', () => {
        clearSave();
        renderTeamPicker();
    });
}

// ─── MAIN ENTRY POINT ───────────────────────────────────────────────────────
export async function loadElPilotoView() {
    const save = getSave();
    if (save) {
        renderSeasonScreen(save);
    } else {
        await renderTeamPicker();
    }
}
