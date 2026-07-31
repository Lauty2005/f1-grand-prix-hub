// server/src/services/elPiloto/interactiveMoments.js
//
// Contenido de todo lo "de dado" y "narrativo" del modo carrera, adaptado de
// El Ídolo (Potrero Fútbol) a F1 — segunda vuelta de diseño sobre este mismo
// módulo (ver README.md para el historial completo de rediseños):
//
// - ARCHETYPE_CARDS / UPGRADE_CARDS: pools grandes de cartas de las que se
//   reparten 3 al azar y el jugador elige 1 — el mismo patrón "el dado trajo
//   3 opciones" que usa El Ídolo tanto para el arquetipo inicial como para
//   las mejoras de cada pretemporada. Pools grandes a propósito (no solo 3
//   cartas fijas) para que no salgan siempre las mismas.
// - RANDOM_EVENTS: eventos de "momento" que interrumpen la temporada (ya no
//   en cada carrera — ver client/src/modules/elPiloto.js, ahora son ~4-5
//   momentos por temporada de 24), categorizados en 'equipo' o 'prensa'.
// - MINIGAME_CONTEXTS: los 3 contextos narrativos del minijuego "La Frenada"
//   (adelantamiento/defensa/clasificación), cada uno ligado a un atributo
//   distinto que agranda la zona de acierto.
//
// Todos los números de acá son percepción gruesa "a ojo", igual que el resto
// del motor — se recalibran jugando.

// Sampler uniforme sin reemplazo — Fisher-Yates parcial. Se usa para repartir
// N cartas al azar de un pool más grande (arquetipos, mejoras).
const elegirCartas = (pool, n = 3) => {
    const copia = [...pool];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia.slice(0, Math.min(n, copia.length));
};

// ─── ARQUETIPOS (dado inicial, al arrancar la carrera) ─────────────────────
// Cada carta: { id, nombre, descripcion, atributo, bonus, rara? }. `atributo`
// es una key de ATTRIBUTE_KEYS (ver attributes.js) salvo casos especiales
// marcados abajo. Se reparten 3 al azar de este pool y el jugador elige 1.
export const ARCHETYPE_CARDS = [
    { id: 'especialista-quali', nombre: 'Especialista en clasificación', descripcion: 'Brillás cuando se apagan las luces de la Q3.', atributo: 'ritmoQuali', bonus: 6 },
    { id: 'peleador-posicion', nombre: 'Peleador de posición', descripcion: 'No regalás una posición sin pelearla.', atributo: 'agresividad', bonus: 6 },
    { id: 'estratega-neumaticos', nombre: 'Estratega de neumáticos', descripcion: 'Sacás cada vuelta extra que el compuesto tiene para dar.', atributo: 'gestionNeumaticos', bonus: 6 },
    { id: 'metronomo', nombre: 'Metrónomo', descripcion: 'Rara vez te ves involucrado en un error propio.', atributo: 'consistencia', bonus: 6 },
    { id: 'ritmo-crucero', nombre: 'Ritmo de crucero', descripcion: 'Tu fuerte es el stint largo, no la vuelta única.', atributo: 'ritmoCarrera', bonus: 6 },
    { id: 'voz-tecnica', nombre: 'Voz técnica', descripcion: 'El equipo confía en tu lectura del auto.', atributo: 'feedbackTecnico', bonus: 6 },
    { id: 'prodigio-box', nombre: 'Prodigio del box', descripcion: 'Un genio con las gomas, un poco temerario en pista.', atributo: 'gestionNeumaticos', bonus: 10, atributoSecundario: 'agresividad', bonusSecundario: -3, rara: true },
    { id: 'todoterreno', nombre: 'Todoterreno', descripcion: 'Sin un punto fuerte marcado, pero sólido en todo.', atributo: 'parejo', bonus: 3, rara: true },
];

// ─── CARTAS DE MEJORA (dado de pretemporada, desde la 2da temporada) ───────
// Mismo patrón que ARCHETYPE_CARDS. `campo` indica dónde aplica el bonus:
// 'atributo' (jugador.atributos[x]), 'equipo' (equipos[jugador.equipoId][x])
// o 'bonusLluvia' (campo especial del jugador, solo pega en pistas
// propensas a lluvia — ver client/src/modules/elPiloto.js).
export const UPGRADE_CARDS = [
    { id: 'sesiones-simulador', nombre: 'Sesiones extra de simulador', descripcion: 'Más vueltas rápidas en la cabeza antes de pisar la pista.', campo: 'atributo', clave: 'ritmoQuali', bonus: 4 },
    { id: 'telemetria-fondo', nombre: 'Análisis de telemetría a fondo', descripcion: 'Cada dato de la vuelta se convierte en ritmo sostenido.', campo: 'atributo', clave: 'ritmoCarrera', bonus: 4 },
    { id: 'frenada-bajo-presion', nombre: 'Rutina de frenada bajo presión', descripcion: 'Menos errores propios cuando la pelea se pone cerrada.', campo: 'atributo', clave: 'consistencia', bonus: 4 },
    { id: 'estudio-compuestos', nombre: 'Programa de estudio de compuestos', descripcion: 'Entendés mejor cuándo la goma da para un giro más.', campo: 'atributo', clave: 'gestionNeumaticos', bonus: 4 },
    { id: 'feedback-ingenieros', nombre: 'Feedback directo con los ingenieros', descripcion: 'El equipo confía cada vez más en tu lectura del auto.', campo: 'atributo', clave: 'feedbackTecnico', bonus: 4 },
    { id: 'simulacros-lluvia', nombre: 'Simulacros de lluvia', descripcion: 'Practicaste tanto mojado que ya no te sorprende.', campo: 'bonusLluvia', clave: 'bonusLluvia', bonus: 4 },
    { id: 'upgrade-aero', nombre: 'Upgrade aerodinámico', descripcion: 'Más carga en curva — el auto responde mejor.', campo: 'equipo', clave: 'rendimientoAuto', bonus: 4 },
    { id: 'revision-fiabilidad', nombre: 'Revisión de fiabilidad', descripcion: 'Menos sustos mecánicos de acá en más.', campo: 'equipo', clave: 'fiabilidad', bonus: 4 },
    { id: 'salto-nivel', nombre: 'Salto de nivel', descripcion: 'Una pretemporada redonda, en todos los frentes.', campo: 'atributo', clave: 'parejo', bonus: 2, rara: true },
    { id: 'motor-fabrica', nombre: 'Motor nuevo de fábrica', descripcion: 'Mucha más potencia — a costa de algo de confiabilidad al principio.', campo: 'equipo', clave: 'rendimientoAuto', bonus: 8, claveSecundaria: 'fiabilidad', bonusSecundario: -3, rara: true },
];

export const repartirArquetipos = () => elegirCartas(ARCHETYPE_CARDS, 3);
export const repartirMejoras = () => elegirCartas(UPGRADE_CARDS, 3);

// ─── CASCOS (compra puramente cosmética en pretemporada) ───────────────────
// Mismo patrón que ARCHETYPE_CARDS/UPGRADE_CARDS (3 al azar de un pool más
// grande) pero SIN atributo/campo/bonus — es flavor, no toca el motor. Vive
// server-side igual que el resto del contenido random (ver README, "content-
// server convention"), aunque no tenga efecto mecánico.
export const CASCO_DESIGNS = [
    { id: 'llamas-medianoche', nombre: 'Llamas de medianoche', descripcion: 'Negro mate con llamas violetas que arrancan desde la visera.' },
    { id: 'bandera-cuadros', nombre: 'Bandera a cuadros', descripcion: 'Blanco y negro clásico, homenaje a la bandera de largada.' },
    { id: 'sol-naciente', nombre: 'Sol naciente', descripcion: 'Degradé rojo a naranja, inspirado en los amaneceres de Suzuka.' },
    { id: 'circuito-urbano', nombre: 'Circuito urbano', descripcion: 'Líneas plateadas que dibujan el trazado de un circuito callejero.' },
    { id: 'oro-de-temporada', nombre: 'Oro de temporada', descripcion: 'Base azul profundo con detalles dorados en la cúpula.' },
    { id: 'grafiti-boxes', nombre: 'Grafiti de boxes', descripcion: 'Diseño abstracto multicolor, estilo arte urbano de paddock.' },
    { id: 'verde-bandera', nombre: 'Verde bandera', descripcion: 'Verde flúo con la visera ahumada — el que más se ve en TV.' },
    { id: 'plata-vintage', nombre: 'Plata vintage', descripcion: 'Acabado plateado envejecido, inspirado en cascos de otra época.' },
];

export const repartirCascos = () => elegirCartas(CASCO_DESIGNS, 3);

// ─── EVENTOS ALEATORIOS (momentos de "prensa" o "equipo" entre carreras) ───
export const RANDOM_EVENTS = [
    {
        id: 'conflicto-box', categoria: 'equipo',
        pregunta: 'Tensión con tu ingeniero de pista por la estrategia de las últimas carreras.',
        opciones: [
            { id: 'bancar', texto: 'Bancar al ingeniero', idolatriaDelta: 1, bonusCarrera: 2, mensaje: 'Reforzaste la confianza con tu ingeniero — trabajan mejor juntos.' },
            { id: 'cambio', texto: 'Pedir un cambio de ingeniero', idolatriaDelta: -3, bonusCarrera: 4, mensaje: 'El cambio sacudió al box, pero llegó con ideas frescas de estrategia.' },
            { id: 'ignorar', texto: 'Ignorarlo y seguir', idolatriaDelta: 0, bonusCarrera: 0, mensaje: 'Preferiste no hacer olas — la tensión sigue ahí, latente.' },
        ],
    },
    {
        id: 'problema-mecanico', categoria: 'equipo',
        pregunta: 'El equipo detecta una falla menor en el auto antes de la próxima carrera.',
        opciones: [
            { id: 'arriesgar', texto: 'Correr el riesgo y salir igual', idolatriaDelta: 0, bonusCarrera: 3, mensaje: 'Decidiste no perder tiempo de pista — el equipo cruza los dedos.' },
            { id: 'revision', texto: 'Pedir una revisión completa', idolatriaDelta: -2, bonusCarrera: -2, mensaje: 'Perdiste horas de preparación, pero el auto sale impecable.' },
            { id: 'confiar-mecanicos', texto: 'Confiar en los mecánicos', idolatriaDelta: 1, bonusCarrera: 1, mensaje: 'El equipo resolvió todo a tiempo — un voto de confianza que se agradece.' },
        ],
    },
    {
        id: 'safety-car', categoria: 'equipo',
        pregunta: 'El equipo repasa el protocolo de Safety Car de cara a la próxima carrera.',
        opciones: [
            { id: 'practicar-reinicios', texto: 'Practicar los reinicios', idolatriaDelta: 0, bonusCarrera: 2, mensaje: 'Ensayaste los reinicios — un detalle que puede valer posiciones.' },
            { id: 'ritmo-puro', texto: 'Enfocarte en el ritmo puro', idolatriaDelta: 0, bonusCarrera: 1, mensaje: 'Preferiste no distraerte del trabajo de fondo.' },
            { id: 'delegar', texto: 'Delegar todo en el equipo', idolatriaDelta: -2, bonusCarrera: -1, mensaje: 'Dejaste el protocolo en manos ajenas — quizás demasiado.' },
        ],
    },
    {
        id: 'lluvia-inesperada', categoria: 'equipo',
        pregunta: 'El pronóstico cambia de golpe de cara a la próxima carrera.',
        opciones: [
            { id: 'confiar', texto: 'Confiar en el equipo', idolatriaDelta: 0, bonusCarrera: 3, mensaje: 'Le diste el visto bueno a la lectura del equipo — apuesta arriesgada, pero con convicción.' },
            { id: 'simulador', texto: 'Pedir horas extra de simulador', idolatriaDelta: 1, bonusCarrera: 1, mensaje: 'Llegaste más preparado — nada espectacular, pero sólido.' },
            { id: 'restar', texto: 'No darle importancia', idolatriaDelta: -2, bonusCarrera: -2, mensaje: 'Subestimaste el cambio de clima — se nota en la preparación.' },
        ],
    },
    {
        id: 'entrevista-polemica', categoria: 'prensa',
        pregunta: 'Un periodista te busca la boca sobre tu rival de siempre.',
        opciones: [
            { id: 'calma', texto: 'Responder con calma', idolatriaDelta: 1, bonusCarrera: 0, mensaje: 'Una respuesta medida — no suma titulares, pero tampoco resta.' },
            { id: 'picante', texto: 'Picante, sin filtro', idolatriaDelta: 3, bonusCarrera: -2, mensaje: 'Titular asegurado — creciste en fama, pero la cabeza no está 100% en el auto.' },
            { id: 'no-responder', texto: 'No responder', idolatriaDelta: -2, bonusCarrera: 1, mensaje: 'Esquivaste la pregunta y te concentraste en lo tuyo.' },
        ],
    },
    {
        id: 'duelo-pista', categoria: 'prensa',
        pregunta: 'Tu rival de siempre te desafía públicamente de cara a la próxima carrera.',
        opciones: [
            { id: 'aceptar', texto: 'Aceptar el desafío', idolatriaDelta: 2, bonusCarrera: 3, mensaje: 'Subiste la apuesta en público — la presión ahora es mutua.' },
            { id: 'bajar-tono', texto: 'Bajar el tono', idolatriaDelta: 0, bonusCarrera: 0, mensaje: 'Preferiste no entrar en el juego mediático.' },
            { id: 'ignorar-desafio', texto: 'Ignorarlo', idolatriaDelta: -3, bonusCarrera: -1, mensaje: 'El silencio se leyó como esquive — no cayó del todo bien.' },
        ],
    },
    {
        id: 'fiesta-fin-ano', categoria: 'prensa',
        pregunta: 'Te invitan a una fiesta de la F1 la noche antes de viajar al próximo Gran Premio.',
        opciones: [
            { id: 'ir-un-rato', texto: 'Ir un rato y volver temprano', idolatriaDelta: 1, bonusCarrera: 0, mensaje: 'Un equilibrio sano entre imagen pública y descanso.' },
            { id: 'quedarse-full', texto: 'Quedarte a full', idolatriaDelta: 2, bonusCarrera: -4, mensaje: 'La noche te hizo viral — el cuerpo lo va a facturar en pista.' },
            { id: 'no-ir', texto: 'No ir, descansar', idolatriaDelta: -2, bonusCarrera: 2, mensaje: 'Preferiste llegar fresco — nadie lo va a notar, pero vos sí.' },
        ],
    },
    {
        id: 'rumor-traspaso', categoria: 'prensa',
        pregunta: 'Un rumor de pase a otro equipo se filtra en la prensa especializada.',
        opciones: [
            { id: 'desmentir', texto: 'Desmentirlo en conferencia', idolatriaDelta: -2, bonusCarrera: 2, mensaje: 'Bajaste el ruido mediático — el equipo lo agradece.' },
            { id: 'no-confirmar-ni-negar', texto: 'No confirmar ni negar', idolatriaDelta: 1, bonusCarrera: -1, mensaje: 'Dejaste la puerta abierta — el rumor sigue vivo, y con él tu perfil.' },
            { id: 'confirmar-interes', texto: 'Confirmar que hay interés', idolatriaDelta: 3, bonusCarrera: -3, mensaje: 'Encendiste el mercado de pases — la interna del equipo no lo tomó bien.' },
        ],
    },
];

export const elegirEventoAleatorio = (categoria) => {
    const pool = categoria ? RANDOM_EVENTS.filter((e) => e.categoria === categoria) : RANDOM_EVENTS;
    return pool[Math.floor(Math.random() * pool.length)];
};

export const evaluarEventoAleatorio = (eventoId, opcionId) => {
    const evento = RANDOM_EVENTS.find((e) => e.id === eventoId);
    const opcion = evento?.opciones.find((o) => o.id === opcionId);
    if (!evento || !opcion) throw new Error('Evento aleatorio inválido.');
    return opcion;
};

// ─── MINIJUEGO "LA FRENADA" (carreras decisivas, ~1 de cada 5-6) ───────────
// 3 contextos narrativos distintos para el mismo minijuego (barra con zona
// de acierto que se mueve, tocar "Frenar" en el momento justo) — cada uno
// ligado a un atributo diferente que agranda la zona:
export const MINIGAME_CONTEXTS = [
    {
        id: 'adelantamiento',
        pregunta: 'Vas pegado al auto de adelante. Frená justo en el punto de frenada para intentar el sobrepaso.',
        atributo: 'agresividad',
        aplicaA: 'carrera',
    },
    {
        id: 'defensa',
        pregunta: 'Tenés un rival pegado al espejo. Frená en el punto justo para no dejarle el hueco por adentro.',
        atributo: 'consistencia',
        aplicaA: 'carrera',
    },
    {
        id: 'clasificacion',
        pregunta: 'Última vuelta de clasificación. Frená en el punto exacto para no pasarte de largo en la curva de entrada.',
        atributo: 'ritmoQuali',
        aplicaA: 'quali',
    },
];

export const elegirContextoMinijuego = () => MINIGAME_CONTEXTS[Math.floor(Math.random() * MINIGAME_CONTEXTS.length)];

// ─── AMPLIACIÓN A 11 MINIJUEGOS (2026-07-31, segunda vuelta) ───────────────
// El jugador de El Piloto es un piloto 100% ficticio sobre la parrilla real
// actual — no hay una carrera histórica real de la que sacar tiempos de
// reacción, decisiones reales o cascos reales para el "toque del Ídolo" que
// tiene el juego original. Se decidió (ver ping-pong con el usuario)
// resolver eso de tres formas distintas según el minijuego:
//   1. Comparaciones de sabor genérico, sin pretender ser de nadie en
//      particular (Lights Out, La Vuelta de Pole, Tyre Whisperer — números
//      de referencia fijos, no datos reales).
//   2. Usar el PROPIO historial del jugador en vez de un piloto real
//      (Evolución de Cascos — ordena las temporadas que VOS ya jugaste).
//   3. Trivia real y verificable sobre la Fórmula 1 como deporte (reglas,
//      compuestos, formato de carrera), nunca inventada sobre una persona
//      puntual (Ta-Te-Ti, variante Grid Trivia).
// Todos los minijuegos de reflejos/sincronización/memoria (Lights Out, Pit
// Stop Challenge, El Telemetrista, La Vuelta de Pole, El Adelantamiento
// Perfecto, Tyre Whisperer, Paddock Match) son 100% client-side — no
// necesitan contenido random del server, solo leen atributos del piloto ya
// presentes en el save. Los 3 que sí necesitan un pool random del lado del
// servidor son los de abajo.

// ─── MURO DE BOXES: DECISIÓN DE CARRERA (historia interactiva, 2 opciones) ─
// A diferencia de RANDOM_EVENTS (3 opciones, categoría equipo/prensa), estas
// son escenas más "dramáticas" pensadas para el momento de carrera decisiva
// — 2 opciones, sin una "decisión correcta" real contra la que comparar
// (no hay carrera histórica real), solo consecuencias de sabor con su
// propio idolatriaDelta/economiaDelta.
export const WALL_DECISIONS = [
    {
        id: 'lluvia-parcial-spa',
        escenario: 'Vuelta 42. Empieza a llover en el Sector 2, pero el Sector 1 sigue seco. Vas en P2 persiguiendo al líder.',
        opciones: [
            { id: 'entrar-intermedios', texto: 'Entrar ya a poner neumáticos intermedios', idolatriaDelta: 1, economiaDelta: 5000, mensaje: 'Entraste a tiempo — el resto de la pista se moja un giro después y ganás posiciones con el compuesto correcto.' },
            { id: 'arriesgar-slick', texto: 'Arriesgarte un giro más con slicks para un overcut', idolatriaDelta: 3, economiaDelta: -5000, mensaje: 'La apuesta se sintió heroica en la radio, aunque el último sector mojado te costó tiempo valioso.' },
        ],
    },
    {
        id: 'safety-car-restart',
        escenario: 'Safety Car en la última vuelta antes del reinicio. Tu compañero de equipo va justo atrás tuyo.',
        opciones: [
            { id: 'defender-linea', texto: 'Cerrar la línea interior en la primera frenada', idolatriaDelta: 0, economiaDelta: 4000, mensaje: 'Defendiste limpio — el equipo respira tranquilo, la posición queda asegurada.' },
            { id: 'dejar-pasar', texto: 'Dejarlo pasar por orden del equipo', idolatriaDelta: -3, economiaDelta: 2000, mensaje: 'Acatar la orden no cayó bien en la tribuna, pero el equipo lo valora puertas adentro.' },
        ],
    },
    {
        id: 'ultima-parada-undercut',
        escenario: 'El de adelante todavía no paró. Tenés el ritmo para meter un undercut agresivo, pero el box está justo en el límite de tiempo.',
        opciones: [
            { id: 'meter-undercut', texto: 'Entrar ya y jugarte el undercut', idolatriaDelta: 2, economiaDelta: 6000, mensaje: 'Salida limpia de boxes — el undercut funcionó mejor de lo esperado.' },
            { id: 'esperar-una-vuelta', texto: 'Esperar una vuelta más para asegurar el tráfico libre', idolatriaDelta: 0, economiaDelta: 1000, mensaje: 'Jugaste seguro — no ganaste posiciones, pero tampoco te arriesgaste a un box lento.' },
        ],
    },
    {
        id: 'motor-al-limite',
        escenario: 'Telemetría marca temperaturas altas en el motor a 5 vueltas del final, peleando el podio.',
        opciones: [
            { id: 'bajar-modo-motor', texto: 'Bajar el modo de motor y cuidar el podio', idolatriaDelta: -2, economiaDelta: 3000, mensaje: 'El auto llegó entero — una decisión conservadora que el equipo agradeció.' },
            { id: 'exprimir-motor', texto: 'Exprimirlo igual, el podio vale el riesgo', idolatriaDelta: 2, economiaDelta: -2000, mensaje: 'El motor aguantó por poco — la gente ama a los que se juegan todo.' },
        ],
    },
    {
        id: 'companero-mismo-ritmo',
        escenario: 'Vas rueda a rueda con tu compañero de equipo por la última posición de puntos, sin orden de equipo clara.',
        opciones: [
            { id: 'jugartela', texto: 'Jugártela por afuera en la última curva', idolatriaDelta: 2, economiaDelta: -1000, mensaje: 'Un adelantamiento límpio que se replicó en todos los resúmenes del fin de semana.' },
            { id: 'asegurar-puntos', texto: 'Asegurar el punto sin arriesgar un choque', idolatriaDelta: -1, economiaDelta: 3000, mensaje: 'Nadie habla de esa vuelta, pero el equipo sumó el punto sin sobresaltos.' },
        ],
    },
    {
        id: 'lluvia-total-ultimas-vueltas',
        escenario: 'Diluvio total a 3 vueltas del final. La dirección de carrera todavía no sacó la bandera roja.',
        opciones: [
            { id: 'seguir-al-limite', texto: 'Seguir al límite de la visibilidad para no perder la posición', idolatriaDelta: 1, economiaDelta: -3000, mensaje: 'Terminaste la carrera entre aplausos por el temple, aunque el auto volvió con algún roce.' },
            { id: 'levantar-el-pie', texto: 'Levantar el pie y priorizar terminar la carrera', idolatriaDelta: -2, economiaDelta: 4000, mensaje: 'Una decisión poco vistosa, pero el auto y los puntos llegaron enteros a la bandera a cuadros.' },
        ],
    },
];

export const elegirDecisionMuroBoxes = () => WALL_DECISIONS[Math.floor(Math.random() * WALL_DECISIONS.length)];

export const evaluarDecisionMuroBoxes = (decisionId, opcionId) => {
    const decision = WALL_DECISIONS.find((d) => d.id === decisionId);
    const opcion = decision?.opciones.find((o) => o.id === opcionId);
    if (!decision || !opcion) throw new Error('Decisión de Muro de Boxes inválida.');
    return opcion;
};

// ─── TRIVIA REAL DE FÓRMULA 1 (Ta-Te-Ti, variante "Grid Trivia") ───────────
// Preguntas sobre reglas/formato/historia GENERAL del deporte, siempre
// verificables — nunca inventadas sobre un piloto o escudería puntual, para
// no fabricar "hechos" falsos sobre personas reales.
export const TRIVIA_F1 = [
    { id: 'puntos-ganador', pregunta: '¿Cuántos puntos suma el ganador de un Gran Premio (sin contar el punto extra de vuelta rápida)?', opciones: ['20', '25', '30'], correcta: 1 },
    { id: 'compuesto-blando', pregunta: '¿De qué color es la banda lateral del neumático más blando de la gama seca?', opciones: ['Rojo', 'Amarillo', 'Blanco'], correcta: 0 },
    { id: 'compuesto-lluvia-extrema', pregunta: '¿De qué color es la banda lateral del neumático de lluvia extrema?', opciones: ['Verde', 'Azul', 'Naranja'], correcta: 1 },
    { id: 'primer-mundial', pregunta: '¿En qué año se corrió la primera temporada del campeonato mundial de Fórmula 1?', opciones: ['1946', '1950', '1958'], correcta: 1 },
    { id: 'drs-funcion', pregunta: '¿Qué hace el DRS al activarse?', opciones: ['Abre el alerón trasero para reducir resistencia', 'Sube la presión de los neumáticos', 'Limita las revoluciones del motor'], correcta: 0 },
    { id: 'bandera-cuadros', pregunta: '¿Qué bandera indica el final de una sesión o carrera?', opciones: ['Bandera roja', 'Bandera a cuadros', 'Bandera azul'], correcta: 1 },
    { id: 'parc-ferme', pregunta: '¿Qué restringe el régimen de "parc fermé"?', opciones: ['Las entrevistas post-carrera', 'Los cambios de configuración del auto', 'El orden de la parrilla'], correcta: 1 },
    { id: 'peso-minimo-concepto', pregunta: '¿Qué establece el reglamento técnico sobre el peso del monoplaza con piloto?', opciones: ['Un peso mínimo obligatorio', 'Un peso máximo obligatorio', 'No hay ningún límite de peso'], correcta: 0 },
    { id: 'bandera-azul', pregunta: '¿Para qué se usa la bandera azul?', opciones: ['Avisar que se acerca un auto más rápido a pasar de vuelta', 'Anunciar lluvia', 'Marcar el pit lane cerrado'], correcta: 0 },
    { id: 'regla-dos-compuestos', pregunta: 'En una carrera en seco, ¿qué obliga el reglamento sobre los neumáticos usados?', opciones: ['Usar como mínimo dos compuestos secos distintos', 'Usar un solo compuesto toda la carrera', 'Parar en boxes al menos tres veces'], correcta: 0 },
];

export const elegirTriviaF1 = (cantidad = 9) => elegirCartas(TRIVIA_F1, cantidad);

// ─── PADDOCK MATCH (memoria de parejas conceptuales, contenido genérico) ───
// Parejas de concepto↔representación sobre la F1 como deporte (compuestos,
// banderas, procedimientos) — nunca fotos ni datos de una persona puntual,
// para no inventar contenido "biográfico" sobre nadie.
export const PADDOCK_PAIRS = [
    { id: 'blando', a: '🔴', b: 'Blando' },
    { id: 'medio', a: '🟡', b: 'Medio' },
    { id: 'duro', a: '⚪', b: 'Duro' },
    { id: 'intermedio', a: '🟢', b: 'Intermedio' },
    { id: 'lluvia', a: '🔵', b: 'Lluvia extrema' },
    { id: 'drs', a: '💨', b: 'Ala móvil trasera' },
    { id: 'safety-car', a: '🚨', b: 'Neutraliza la carrera' },
    { id: 'pit-stop', a: '🔧', b: 'Cambio de neumáticos' },
    { id: 'bandera-cuadros', a: '🏁', b: 'Fin de la carrera' },
    { id: 'parc-ferme', a: '🔒', b: 'Auto bajo custodia técnica' },
];

export const elegirPaddockPairs = (cantidad = 8) => elegirCartas(PADDOCK_PAIRS, cantidad);
