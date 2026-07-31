// client/src/modules/juegos.js
//
// Hub de minijuegos: antes "Mayor o Menor", "Adiviná el Piloto", "Silueta del
// Circuito" y "El Piloto" tenían cada uno su propio botón en el navbar. A
// pedido del usuario, ahora comparten un único botón "JUEGOS" que abre un
// menú de selección — cada juego sigue siendo 100% dueño de su propia vista
// (`load*View()`) y de su propio estado/localStorage, este módulo solo
// decide qué se muestra dentro de #app.
//
// Los 4 módulos de juego reemplazan `#app` por completo y no saben que ahora
// viven "dentro" de un hub, así que este módulo les agrega un botón flotante
// "← Juegos" fuera de #app (en <body>, para que sobreviva a los innerHTML
// que hace cada juego) en vez de tocar esos 4 módulos.

const GAMES = [
    {
        id: 'mayor-menor',
        nombre: 'Mayor o Menor',
        emoji: '📊',
        descripcion: 'Adiviná si el retador tiene más o menos que el piloto actual en una estadística de la temporada.',
        load: () => import('./mayorMenor.js').then((m) => m.loadMayorMenorView()),
    },
    {
        id: 'adivina-piloto',
        nombre: 'Adiviná el Piloto',
        emoji: '🔍',
        descripcion: 'Pistas progresivas sobre un piloto real — cuantas menos uses, más puntos.',
        load: () => import('./adivinaPiloto.js').then((m) => m.loadAdivinaPilotoView()),
    },
    {
        id: 'silueta-circuito',
        nombre: 'Silueta del Circuito',
        emoji: '🏁',
        descripcion: 'Reconocé el circuito por su silueta, antes de que se revele.',
        load: () => import('./siluetaCircuito.js').then((m) => m.loadSiluetaCircuitoView()),
    },
    {
        id: 'el-piloto',
        nombre: 'El Piloto',
        emoji: '🏎️',
        descripcion: 'Modo carrera: viví tu propia carrera de F1, temporada a temporada.',
        load: () => import('./elPiloto.js').then((m) => m.loadElPilotoView()),
    },
];

// Qué juego está abierto ahora mismo (o null si estás en el menú). Vive en
// el módulo, no en el DOM, para que un cambio de temporada (refreshJuegosView)
// sepa si tiene que refrescar el juego activo o simplemente el menú.
let juegoActivo = null;

// Entrada desde el botón de nav "JUEGOS" — siempre vuelve al menú, sea cual
// sea el juego que estaba abierto antes.
export function loadJuegosView() {
    juegoActivo = null;
    quitarBotonVolver();
    renderMenu();
}

// Entrada desde refreshActiveView() (cambio de temporada) — a diferencia de
// loadJuegosView, respeta en qué juego estabas parado.
export function refreshJuegosView() {
    if (juegoActivo) {
        abrirJuego(juegoActivo);
    } else {
        renderMenu();
    }
}

function abrirJuego(id) {
    const juego = GAMES.find((g) => g.id === id);
    if (!juego) {
        renderMenu();
        return;
    }
    juegoActivo = id;
    inyectarBotonVolver();
    juego.load();
}

function renderMenu() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="juegos-hub">
            <h1 class="juegos-hub__title">Juegos</h1>
            <p class="juegos-hub__subtitle">Elegí a qué jugar.</p>
            <div class="juegos-hub__grid">
                ${GAMES.map((g) => `
                    <button type="button" class="juegos-hub__card" data-id="${g.id}">
                        <span class="juegos-hub__emoji">${g.emoji}</span>
                        <span class="juegos-hub__nombre">${g.nombre}</span>
                        <span class="juegos-hub__desc">${g.descripcion}</span>
                    </button>`).join('')}
            </div>
        </div>`;

    app.querySelectorAll('.juegos-hub__card').forEach((btn) => {
        btn.addEventListener('click', () => abrirJuego(btn.dataset.id));
    });
}

function inyectarBotonVolver() {
    if (document.getElementById('juegosVolverBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'juegosVolverBtn';
    btn.type = 'button';
    btn.className = 'juegos-hub__volver';
    btn.textContent = '← Juegos';
    btn.addEventListener('click', () => loadJuegosView());
    document.body.appendChild(btn);
}

// main.js saca este botón por id directo (no importa este módulo para eso,
// así no fuerza la descarga del chunk en cada click de nav de otra sección)
// — queda acá sin exportar, de uso puramente interno (loadJuegosView).
function quitarBotonVolver() {
    document.getElementById('juegosVolverBtn')?.remove();
}
