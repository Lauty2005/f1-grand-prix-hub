# El Piloto — modo carrera F1 ("El Ídolo: F1 Edition")

Modo carrera "El Piloto" (ver la memoria del proyecto para el contexto
completo del brainstorm): motor de simulación puro + integración con el grid
real + un motor de temporada stateless, expuestos en `/api/el-piloto/*`.
Frontend en `client/src/modules/elPiloto.js`.

**Historial de rediseños:**

1. **(2026-07-28) Adaptación al spec "El Ídolo: F1 Edition":** se mantuvo el
   roster real de la DB y el motor Elo/atributos/caos ya hechos, pero se
   descartó el sistema anterior de "3 de 12 carreras interactivas con wizard
   de neumáticos" en favor de un flujo único de 24 carreras (circuito → rival
   cada 3 → 30% evento aleatorio → minijuego de reacción → resolución).
2. **(2026-07-31) Segunda vuelta, a partir de capturas reales del juego "El
   Ídolo" (Potrero Fútbol):** viendo el juego real, la temporada NO se juega
   partido a partido — la mayoría se resuelve en un resumen narrativo y solo
   unos pocos "momentos" puntuales interrumpen el avance. Esta sección
   documenta el diseño ACTUAL, que reemplaza por completo el punto 1.
3. **(2026-07-31, misma tarde) Ampliación a 11 minijuegos:** La Frenada era
   el único minijuego jugable en un momento de carrera decisiva. Se agregaron
   10 más (reflejos, sincronización, memoria, estrategia y narrativos) para
   que cada momento decisivo sortee uno al azar entre los 11. Ver "Los 11
   minijuegos" más abajo.
4. **(2026-07-31, misma tarde) Rebalance de realismo:** un usuario reportó
   salir campeón en su 2da temporada con el peor equipo de la parrilla — no
   era un golpe de suerte puntual, era un bug estructural de balance (ver
   "Por qué el peor auto podía salir campeón" más abajo).
5. **(2026-07-31, cierre del día) 7 destinos nuevos para `saldoDisponible`:**
   hasta acá la plata solo servía para comprar tiradas extra del dado de
   mejoras. Se agregaron seguro mecánico, entrenador personal, recuperación
   física, gestión de imagen, representante premium, intento extra (El
   Telemetrista) y personalización de casco — ver "En qué se gasta
   `saldoDisponible`" más abajo.
6. **(2026-08-01) Paddock Match y El Telemetrista, rediseñados:** un usuario
   reportó que El Telemetrista "andaba mal" — el cartel de comprar intento
   extra convivía con el botón "Probar configuración" todavía visible, dos
   estados de UI superpuestos. Aprovechando el rediseño, se sacó la ida y
   vuelta del panel de 3 sliders juntos (ver la nota en "Los 11 minijuegos")
   a favor de un flujo secuencial de 1 slider a la vez con feedback
   caliente/frío en vivo. Paddock Match también se rehizo: neumáticos
   dibujados con CSS en vez de emoji plano, y un tope de intentos que ahora
   permite perder de verdad este minijuego.
7. **(2026-08-01) Evolución de Cascos: fix del bug de temporada duplicada +
   rediseño por trivialidad.** Un usuario reportó dos problemas sobre una
   misma captura: (a) el juego "es una estupidez" porque cada carta imprimía
   "Temporada N" en la cara, así que ordenar cronológicamente no exigía
   memoria, solo leer números; y (b) el juego se trababa con dos cartas
   "Temporada 4" repetidas y ninguna quedaba jugable.
   - **Causa raíz de (b):** `renderSeasonScreen` (la pantalla de temporada,
     disparada por `loadElPilotoView` cada vez que se toca el botón de nav
     "El Piloto", ver `refreshActiveView` en `main.js`) decidía mostrar el
     botón "Cerrar temporada" únicamente mirando `carreraIndex >= total` —
     sin saber si esa temporada YA se había cerrado. Si el jugador cerraba la
     temporada y, mientras `procesarCierreTemporada` corría (o ya en el
     mercado de pases, antes de elegir destino), volvía a tocar el botón de
     nav "El Piloto", `carreraIndex` seguía siendo el de la temporada vieja
     (recién se resetea en `comenzarNuevaTemporada`, que corre después del
     mercado de pases) — entonces se veía otra vez "Cerrar temporada", y
     tocarlo volvía a llamar a `procesarCierreTemporada` para la MISMA
     temporada, duplicando el `historialEntry` en `historialTemporadas`. No
     hacía falta doble clic ni ninguna condición de carrera rara: alcanzaba
     con navegar afuera y volver en cualquier momento entre "cerrar
     temporada" y terminar el mercado de pases.
   - **Fix:** se agregó una bandera `save.temporadaCerrada` — `true` en
     cuanto `procesarCierreTemporada` termina, `false` de nuevo recién en
     `comenzarNuevaTemporada`. `renderSeasonScreen` ahora, si ve la bandera en
     `true`, ni siquiera dibuja la pantalla de temporada: redirige derecho a
     `renderMercadoDePases` (o `renderRetiroFinal` si corresponde retiro), así
     que "Cerrar temporada" es literalmente imposible de volver a tocar.
     `procesarCierreTemporada` además tiene su propio guard de idempotencia
     (si `temporadaCerrada` ya es `true`, no reprocesa) por las dudas de que
     algún llamador futuro la invoque dos veces.
   - **Rediseño de (a):** la carta dejó de mostrar el número de temporada —
     ahora solo muestra equipo + puntos + posición en el campeonato, y el
     número real recién se revela en el mensaje final (si te equivocás, te
     dice "el orden real era..."). Además, el juego pasó a identificar cada
     carta por su ÍNDICE en el array en vez del valor de `temporada`, así que
     aunque el historial tuviera datos duplicados (viejos o de un bug futuro)
     el juego ya no puede trabarse — cada carta es un elemento independiente
     sin importar si dos comparten número de temporada.
8. **(2026-08-01) Precio creciente para tiradas extra + hub "JUEGOS" + limpieza
   pre-merge.** Tres pedidos del usuario antes de fusionar la rama a `main`:
   - **Tiradas extra más caras:** antes `COSTO_TIRADA_EXTRA` (150K) era fijo
     sin importar cuántas ya se compraron en la pretemporada. Ahora
     `costoTiradaExtra(tiradasExtra)` multiplica por
     `COSTO_TIRADA_EXTRA_MULTIPLICADOR` (1.8×) por cada compra ya hecha: 150K
     la primera, 270K la segunda (tope de 2 sigue siendo
     `TOPE_TIRADAS_EXTRA_PLATA`).
   - **Hub "JUEGOS":** Mayor o Menor, Adiviná el Piloto, Silueta del Circuito
     y El Piloto tenían cada uno su botón de nav — se agruparon bajo un único
     botón `btn-juegos` con un menú de selección (`client/src/modules/juegos.js`,
     `_juegos.scss`). Ver la nota de "Navegación" en el `CLAUDE.md` del repo
     (sección Mini-games) para el detalle de cómo sumar un juego nuevo al hub.
   - **Limpieza pre-merge:** auditado `elPiloto.js` completo función por
     función y selector CSS por selector CSS contra `_el-piloto.scss` — se
     encontraron y sacaron 2 reglas CSS muertas sin ningún uso en el JS
     (`.ep-notice`, un aviso que nunca se llegó a cablear; `.ep-row--dnf`, un
     estilo pensado para atenuar pilotos abandonados en la tabla de posiciones
     que nunca se aplicó porque `standingsHTML` no lo agrega a ninguna fila) y
     un `export` innecesario en `juegos.js` (`quitarBotonVolver` solo se usa
     dentro del propio módulo). No se encontraron funciones huérfanas de los
     rediseños anteriores (El Telemetrista, Paddock Match, Evolución de
     Cascos) ni imports sin usar — el resto del archivo estaba limpio.

## Estado actual: jugable de punta a punta

Elegir equipo (agrupado por tier: top/media tabla/fondo de parrilla, según
el nombre real de la escudería) → crear personaje (nombre, número validado
contra la parrilla, rol Líder/Competitivo) → **dado de arquetipo** (3 cartas,
elegís 1 — define un bonus permanente de atributos) → si el equipo es de
fondo de parrilla, backstory de 2 años en F2 con Prema Racing (flavor
generado en el cliente, no persiste mecánicamente) → arrancar carrera a los
21 años (`careerSetup.js`, `POST /nueva-carrera`) → **temporada híbrida** de
24 carreras (ver abajo) → cerrar temporada (campeón si corresponde, retiros/
reemplazos de IA, resumen narrativo, mercado de pases multi-oferta,
pretemporada con dado de mejoras) → siguiente temporada, o pantalla final de
retiro si el jugador llegó a su edad de retiro (28-32, sorteada al arrancar).
Todo en `client/src/modules/elPiloto.js`, estado en localStorage (clave
`f1hub:elPiloto:save`).

### Temporada híbrida: motor real de fondo + momentos puntuales

Ya no hay una pantalla por cada una de las 24 carreras. Al arrancar cada
temporada (`generarMomentos` en el cliente) se sortean 4 o 5 índices de
carrera al azar como "momentos", cada uno con una categoría sorteada con
peso (`PESO_CATEGORIA_MOMENTO` — 60% `carrera-decisiva`, 20% `prensa`, 20%
`equipo`; antes era 1/3 parejo entre las 3, se ajustó a pedido del usuario
para que la mayoría de los momentos sean minijuegos jugables y las
decisiones narrativas queden como algo más ocasional):

- **`carrera-decisiva`** — se muestra la tarjeta de circuito y luego se
  sortea 1 de los 11 minijuegos (ver más abajo) antes de resolver esa
  carrera.
- **`prensa`** / **`equipo`** — se muestra un evento narrativo de 3 opciones
  (`GET /evento-aleatorio?categoria=X`, `interactiveMoments.js`) que afecta
  `idolatria` y deja un `bonusCarrera` pendiente para la próxima carrera que
  se corra (destacada o de fondo).

El botón "Avanzar temporada" (`avanzarTemporada` en el cliente) recorre las
24 carreras en un loop: si el índice actual NO es un momento, se llama a
`POST /simular-carrera` **en silencio** (sin pantalla de resultado, con
modificadores base de rol/lluvia/evento pendiente) y se sigue de largo; si
ES un momento, se detiene y muestra la pantalla correspondiente — al
confirmarla, el loop continúa desde la carrera siguiente. El motor real
(`simulateNextRace`) corre para las 24 carreras siempre, sean o no
destacadas — la diferencia es puramente de UI.

### Los 11 minijuegos de "carrera decisiva"

Cada vez que un momento sale `carrera-decisiva`, el cliente sortea 1 minijuego
al azar del registro `MINIGAMES` (`elPiloto.js`). Todos terminan llamando a
`onResult` con una de estas dos formas, resueltas de manera genérica por
`resolverResultadoMinijuego`:

- `{ tipoEfecto: 'carrera' | 'quali', bonus, mensaje }` — el `bonus` se suma
  al modificador correspondiente ANTES de llamar a `simular-carrera` (igual
  que hacía La Frenada sola antes de esta ampliación).
- `{ tipoEfecto: 'narrativo', idolatriaDelta, economiaDelta, mensaje }` — no
  toca el modificador de la carrera (que se resuelve con la base de
  rol/lluvia/evento pendiente), pero sí afecta idolatría/economía, igual que
  un evento de prensa/equipo.

El juego original ("El Ídolo") compara varias de estas mecánicas contra
datos REALES de un piloto histórico (tiempos de reacción reales, la decisión
real que tomó, sus cascos reales). Acá el jugador es un piloto 100% ficticio
sobre la parrilla actual — no existe esa carrera real de la que sacar datos.
Se resolvió de 3 formas (decisión tomada con el usuario):

1. Comparaciones de sabor genérico, con números de referencia fijos (Lights
   Out, La Vuelta de Pole, Tyre Whisperer, Muro de Boxes) — nunca se
   pretende que sean de una persona real.
2. Usar el PROPIO historial del jugador en vez de un piloto real (Evolución
   de Cascos — pide ordenar las temporadas que VOS ya jugaste).
3. Trivia real y verificable sobre la Fórmula 1 como deporte, nunca inventada
   sobre una persona puntual (Ta-Te-Ti, variante Grid Trivia).

| # | Minijuego | Categoría | Efecto | Mecánica |
|---|-----------|-----------|--------|----------|
| 1 | La Frenada | Sincronización | `carrera` o `quali` (según contexto) | Barra de 10 celdas, tocar "FRENAR" dentro de la zona verde. Contexto sorteado en `GET /contexto-minijuego` (adelantamiento→agresividad, defensa→consistencia, clasificación→ritmoQuali). |
| 2 | Lights Out | Reflejos | `carrera` | 5 luces se encienden y se apagan juntas tras una demora al azar; se mide el tiempo de reacción real (`performance.now()`). Clic antes de tiempo = salida adelantada (penalización). |
| 3 | Pit Stop Challenge | Sincronización | `carrera` | 3 rondas seguidas de la barra de La Frenada (aflojar/cambiar/ajustar tuerca), zona escalada por `gestionNeumaticos`. |
| 4 | La Vuelta de Pole | Sincronización | `quali` | 3 sectores seguidos de la misma barra (frenada/vértice/salida), zona escalada por `ritmoQuali`. |
| 5 | El Adelantamiento Perfecto | Sincronización | `carrera` | Barra con zona única escalada por `agresividad`; pasarse de largo = bloqueo de gomas (peor), quedarse corto = sobrepaso fallido. |
| 6 | Tyre Whisperer | Sincronización | `carrera` | Aguja que deriva sola sobre un eje frío↔óptimo↔sobrecalentado; tocar "AJUSTAR" para corregirla. Zona escalada por `gestionNeumaticos`, puntaje = % de ticks dentro de la zona. |
| 7 | El Telemetrista | Estrategia | `quali` | 3 sliders (carga aero/presión/frenada) contra un objetivo fijo por `pista.tipo` (`TELEMETRY_TARGETS`), uno a la vez, con feedback caliente/frío en vivo mientras arrastrás y un solo "Confirmar" por slider — rediseñado a pedido del usuario para sacar la ida y vuelta de la versión anterior (ajustar los 3 juntos, probar, leer un hint, reajustar, hasta 3 veces). |
| 8 | Paddock Match | Memoria | `quali` | Memoria clásica de 8 parejas conceptuales genéricas de F1 (`GET /paddock-pairs`); el tiempo total de resolución define el bonus SI se completa. Tope finito de intentos (`pares.length + 6` — cada vuelta de 2 cartas cuenta, acierte o no); quedarse sin intentos con parejas pendientes es una derrota real (`bonus: -10`), no solo un bonus más bajo — antes no se podía perder este minijuego. |
| 9 | Evolución de Cascos | Memoria/narrativo | `narrativo` | Ordenar cronológicamente las temporadas que el jugador ya jugó (`save.historialTemporadas`). Solo aparece en el sorteo si hay 2+ temporadas jugadas (`disponible`). Rediseñado (2026-08-01): la carta ya NO muestra "Temporada N" — solo equipo + puntos + posición, para que ordenar exija memoria real en vez de leer el número impreso. Las cartas se identifican por índice de array, no por el valor de `temporada`, así que el juego no se traba si el historial tiene dos entradas con el mismo número (ver punto 7 del historial de rediseños). |
| 10 | Muro de Boxes | Narrativo | `narrativo` | Escena de 2 opciones sin "decisión correcta" (`WALL_DECISIONS`, `GET /decision-muro-boxes` + `POST /resolver-decision-muro-boxes`), cada una con su propio `idolatriaDelta`/`economiaDelta`. |
| 11 | Ta-Te-Ti: Duelo en la Grilla | Narrativo | `narrativo` | Tres en línea contra una IA local (minimax con 25% de jugada al azar). Variante opcional "Grid Trivia": cada casilla exige responder bien una pregunta real de F1 (`GET /trivia-f1`) antes de poder jugarla. |

Notas de implementación:

- Los minijuegos 1-6 comparten una única función `renderBarraTiming` (barra +
  zona + botón "FRENAR"), variando solo el número de rondas y qué atributo
  escala el tamaño de la zona — evita reescribir la misma mecánica 5 veces.
- **Paddock Match — rediseño de cartas (a pedido del usuario)**: las 5
  parejas de compuesto de neumático (blando/medio/duro/intermedio/lluvia)
  antes mostraban un emoji de círculo de color plano (🔴🟡⚪🟢🔵) sin ninguna
  relación visual con su pareja de texto. Ahora ese lado de la carta dibuja
  un neumático de verdad con CSS (aro negro + banda del color real de
  compuesto FIA — rojo/amarillo/blanco/verde/azul), y las cartas de ícono vs.
  las de texto llevan un tinte de fondo distinto una vez reveladas para
  leerse como dos "familias" a emparejar. El dorso (boca abajo) también pasó
  de un emoji suelto sobre fondo gris a un degradé con la identidad del resto
  del juego.
- El "toque del Ídolo" de "Muro de Boxes" en el spec original pedía comparar
  la decisión del jugador contra la decisión real que tomó un piloto en una
  carrera histórica puntual, mostrando foto/clip del resultado real. Sin esa
  carrera real disponible, se simplificó a un evento de 2 opciones con
  consecuencias de sabor (ninguna es "la correcta") — mismo patrón que
  `RANDOM_EVENTS`, pero pensado para el momento de carrera decisiva en vez
  de prensa/equipo.
- El modo multijugador por link que pedía el spec de Ta-Te-Ti ("compartiendo
  un link de desafío") se descartó a propósito: el resto del hub (y de este
  módulo) es 100% stateless y sin cuentas de usuario (ver CLAUDE.md) — un
  duelo async entre dos dispositivos necesitaría persistencia de servidor
  que no existe hoy. Ta-Te-Ti quedó como single-player contra una IA local.

### Por qué el peor auto podía salir campeón (y el fix)

Un usuario jugó una carrera completa y salió campeón en su 2da temporada
manejando el peor equipo de la parrilla — no debería ser posible con ese
auto, ni siquiera siendo un piloto excelente. La causa tenía dos partes,
las dos corregidas juntas porque una sola no alcanzaba:

1. **`realGridSeed.js` estaba vacío.** `REAL_TEAM_SEEDS` no tiene ninguna
   entrada (no hay forma de verificar los IDs numéricos de `constructors`
   sin pegarle a la DB desde acá), así que TODOS los equipos cargaban
   `DEFAULT_TEAM_SEED` (`rendimientoAuto: 70, fiabilidad: 80`) — el mismo
   auto para Red Bull que para el último de la tabla. El "peor equipo" solo
   era peor cosméticamente (badge "Fondo de parrilla" en el selector), el
   motor nunca vio ninguna diferencia real. **Fix:** `teamSeedForName()` en
   `realGridSeed.js` clasifica por nombre de escudería (mismo criterio que
   `tierDeEquipo()` en el cliente — mantener ambas listas sincronizadas) y
   le da un `rendimientoAuto`/`fiabilidad` real por tier (top 88, mid 76,
   backmarker 61, resto 68). `buildRealGrid()` en `rosterFromDb.js` prueba
   `REAL_TEAM_SEEDS[constructor_id]` primero (por si algún día se cargan IDs
   verificados a mano) y usa `teamSeedForName()` como fallback antes de caer
   en el default neutral.
2. **El auto no pesaba lo suficiente frente al piloto, y los bonos del
   jugador podían acumularse por encima de cualquier diferencia de auto
   razonable.** `PESO_PILOTO`/`PESO_AUTO` estaban 0.5/0.5 (recalibrado a
   0.35/0.65 en `raceSimulator.js` — el comentario que ya estaba en el
   código decía "en F1 real el auto pesa más", pero nunca se había tocado el
   número). Y en una sola carrera destacada, el jugador podía sumar rol
   (+3) + bonus de evento pendiente (+4) + un minijuego perfecto (hasta
   +16/+18) ≈ 27 puntos de `modificadorCarrera`/`modificadorQuali` — más de
   lo que separaba al mejor auto del peor incluso con el fix del punto 1
   (26 puntos de `rendimientoAuto` × 0.65 ≈ 17). **Fix:**
   `CAP_MODIFICADOR_TOTAL = 14` en el cliente, aplicado dentro de
   `ejecutarCarrera` (el único punto por el que pasan TODAS las carreras,
   de fondo o destacadas) — ningún combo de bonos puede superar ±14 en una
   carrera, sea cual sea la cantidad de cosas que se acumulen.

Con los dos fixes juntos, un piloto en el peor auto todavía puede ganar UNA
carrera puntual con una actuación perfecta, pero no puede sostener eso las
24 carreras de una temporada — que es exactamente lo que hace un
campeonato realista o no realista.

### Dado de cartas (arquetipo inicial + mejoras de pretemporada)

Mismo patrón que usa El Ídolo real: se reparten 3 cartas al azar de un pool
más grande y el jugador elige 1 (`elegirCartas` en `interactiveMoments.js`,
Fisher-Yates parcial). Pools grandes a propósito para que no salgan siempre
las mismas 3 opciones:

- **`ARCHETYPE_CARDS`** (8 cartas, `GET /cartas-arquetipo`) — se reparte una
  vez al arrancar la carrera, define un bonus permanente a uno o dos
  atributos (o a los 6 por igual, caso `atributo: 'parejo'`). Incluye 2
  cartas "raras" con mejor bonus pero alguna contrapartida.
- **`UPGRADE_CARDS`** (11 cartas, `GET /cartas-mejora`) — se reparte una vez
  por cada "tirada" disponible en la pretemporada de cada temporada. El
  número de tiradas es `1 + piso(idolatria/33)` más hasta 2 tiradas extra
  compradas con `saldoDisponible` (150K cada una). Cada carta aplica su
  bonus a un atributo del jugador, a un campo del equipo
  (`rendimientoAuto`/`fiabilidad`), o al `bonusLluvia` especial.

### Idolatría y economía

`prestigio` se renombró a **`idolatria`** (0-100) y ahora tiene 5 hitos con
nombre (`IDOLATRIA_TIERS` en el cliente): Uno más (0) → Prometedor (20) →
Ídolo de casa (40) → Referente (60) → Leyenda (80). Se muestra como barra +
"Te faltan N pts para ser X" en la ficha del piloto (`renderFichaPiloto`).

Economía (puramente de sabor + un uso funcional): `valorDeMercado` crece de
a poco con cada victoria/podio/punto (`ejecutarCarrera`), `dineroGanado` es
el acumulado histórico (nunca baja), `saldoDisponible` es lo que
efectivamente se puede gastar.

### En qué se gasta `saldoDisponible` (a pedido del usuario)

Antes el único gasto era comprar tiradas extra del dado de mejoras en
pretemporada (`COSTO_TIRADA_EXTRA`, tope `TOPE_TIRADAS_EXTRA_PLATA`) — a
precio fijo, sin importar cuántas ya se compraron. Un usuario pidió que
mejorar a fuerza de plata se vuelva progresivamente más caro; ahora cada
tirada extra sale `COSTO_TIRADA_EXTRA_MULTIPLICADOR` (1.8×) más cara que la
anterior dentro de la misma pretemporada (`costoTiradaExtra(tiradasExtra)`,
redondeado a la decena de mil): 150K la primera, 270K la segunda (tope de 2).
Ahora hay 7 destinos más, todos opcionales, números "a ojo" (ver las
constantes `COSTO_*`/`BONUS_*` cerca del principio de `elPiloto.js`):

- **Seguro mecánico** (`renderMomentoDecisivo`, antes de elegir el
  minijuego): sube `fiabilidad` del equipo del jugador SOLO en el payload que
  se manda a `POST /simular-carrera` para esa carrera puntual — nunca se
  persiste en `save.equipos`, así que no contamina el resto de la temporada
  ni al compañero de equipo que la comparte.
- **Entrenador personal** (mismo lugar): bonus flat (`BONUS_ENTRENADOR`) a
  ambos modificadores (quali y carrera) de esa carrera — se suma en
  `resolverResultadoMinijuego`, tan "crudo" como el bonus de rol.
- **Recuperación física** (`renderResultadoCarrera`, solo si la carrera dejó
  la `forma` en negativo): amortigua ese pozo en vez de esperar el
  decaimiento natural (`FORMA_DECAY` en `rating.js`) — multiplica la forma
  negativa por `RECUPERACION_FISICA_FACTOR`.
- **Gestión de imagen** (`renderMercadoDePases`, solo si el equipo actual
  renovaba): si la contratás, fichar en otro equipo NO paga el costo de -8
  idolatría por "traición" — ver `aceptarOferta(save, equipoDestinoId,
  aplicarPenalizacion)`.
- **Representante premium** (mismo lugar): versión paga de "llamar al
  representante" — misma segunda tirada con mejor suerte sobre los equipos
  que no habían ofertado, pero no depende de `save.llamadaRepresentanteUsada`
  (sirve aunque ya se haya usado, o nunca, la gratuita). Limitada a una vez
  por VISITA a esta pantalla (flag local, no persiste en el save) para no
  convertirla en "pagá lo suficiente y conseguís a todo el grid".
- **Intento extra** (solo en El Telemetrista): si al confirmar un slider el
  resultado queda "Frío" (diff > `UMBRAL_REINTENTO`, hoy 18), se ofrece pagar
  para repetir ESE slider en vez de seguir con un ajuste malo — una sola vez
  por partida de este minijuego (`intentoExtraUsado`). Acotado a El
  Telemetrista a propósito — los que comparten `renderBarraTiming` (Pit
  Stop, Vuelta de Pole, Adelantamiento Perfecto, Tyre Whisperer, La Frenada)
  juegan cada segmento una sola vez sin un punto de re-confirmación propio, y
  meterle un retry ahí habría requerido threadear el save actualizado a
  través de closures anidadas con riesgo real de perder el gasto en el viaje
  (ver el comentario largo en `resolverResultadoMinijuego` sobre
  `gastoExtra`).
- **Casco** (`renderPretemporada`): puramente cosmético, sin efecto en el
  motor. 3 diseños al azar de un pool de 8 (`CASCO_DESIGNS` en
  `interactiveMoments.js`, servidor — mismo patrón que
  `ARCHETYPE_CARDS`/`UPGRADE_CARDS` pero sin `atributo`/`campo`/`bonus`), se
  elige 1 y se guarda en `jugador.cascoDiseno` (string, el nombre del
  diseño), mostrado en `renderFichaPiloto` si está seteado.

**Patrón `gastoExtra`**: cualquier plata gastada DENTRO de un minijuego (hoy
solo el intento extra de El Telemetrista) viaja en `resultado.gastoExtra` y
se descuenta en `resolverResultadoMinijuego`, no en el propio minijuego —
mismo motivo que `idolatriaDelta`/`economiaDelta` ya se resolvían ahí: el
`save` que tiene el minijuego en su clausura es una copia que nunca vuelve a
subir sola, así que descontar plata ahí adentro y no en `resolverResultadoMinijuego`
haría que el round-trip por `/simular-carrera` pisara el descuento con el
saldo viejo.

**Importante**: `ejecutarCarrera` **no** toca `idolatria` — los resultados en
pista (victorias, podios, puntos) no suman fama por sí solos. Toda la
idolatría sale de las decisiones narrativas/minijuegos (`RANDOM_EVENTS`,
`WALL_DECISIONS`, y los 2 minijuegos narrativos con delta propio: Evolución
de Cascos y Ta-Te-Ti). A pedido del usuario, esos deltas se rebalancearon
para que sea más difícil ser querido: antes varias opciones "positivas"
pagaban +4 a +6 con casi ninguna opción bajando más de -3, así que jugando
seguido se llegaba a Referente/Leyenda (60-80) en un par de temporadas sin
haber ganado una carrera. Ahora el techo positivo por decisión es +3 (antes
hasta +6) y varias opciones antes neutras o poco negativas pasan a -2/-3, así
que el promedio esperado por decisión ronda 0 en vez de ~+1.5 — subir de
tier requiere elegir consistentemente las opciones más "de fama" (a costa de
`bonusCarrera`/`economiaDelta`), no simplemente acumular por jugar.

### Visualización constante de atributos (a pedido del usuario)

`renderFichaPiloto` ahora también muestra los 6 atributos del motor (ritmo
de clasificación/carrera, agresividad, consistencia, gestión de neumáticos,
feedback técnico) como una tira de barras siempre visible en la pantalla de
temporada (`renderAtributosStrip`, `ATTRIBUTE_LABELS` en el cliente) — el
equivalente de la fila de stats constante de "El Ídolo". Antes solo se veían
indirectamente (afectando el tamaño de zona de un minijuego, sin mostrar el
número).

Dos lugares más donde ahora se ve el número, no solo su efecto:

- **Dentro del minijuego, antes de jugar**: los 5 minijuegos que escalan su
  dificultad con un atributo (La Frenada, Pit Stop Challenge, La Vuelta de
  Pole, El Adelantamiento Perfecto, Tyre Whisperer) muestran ese atributo y
  su valor en el subtítulo (`etiquetaAtributo`) — ej. "Tu Agresividad: 62".
- **En el resultado, después de jugar**: `lineaPuntosMinijuego` arma una
  línea explícita con el número que se sumó/restó — "🔺 +14 a Carrera en
  esta carrera" para los minijuegos de efecto `carrera`/`quali`, o
  "🔺 +5 de idolatría" / "+US$ 4K" para los narrativos — en vez de depender
  de que el mensaje de sabor de cada minijuego mencione el número a mano.
- **Antes de que exista la carrera** (dado de arquetipo, backstory de F2): el
  cliente pide `GET /atributos-rookie` y muestra el resultado con
  `renderAtributosPreview` (misma `renderAtributosStrip`, envuelta en un
  `.ep-sticky-top--preview` para que se sienta igual de "siempre visible" que
  la ficha real, aunque acá no haya HUD ni save todavía). Esos mismos
  atributos se mandan de vuelta en `POST /nueva-carrera` (`atributosBase`) —
  ver `generarAtributosRookie`/`iniciarCarrera` en `careerSetup.js` — para que
  la carrera arranque con los números que el jugador ya vio, en vez de tirar
  un rookie nuevo por atrás. Si `atributosBase` no viene (o viene incompleto),
  el server genera uno como antes — la preview es un agregado, no un
  requisito.
- **Arranque deliberadamente bajo** (a pedido del usuario): el jugador tira
  con `POTENCIAL_ROOKIE_JUGADOR = 40` en vez del `TIER_PROFILES.rookie.potencial`
  compartido (60) — que sigue intacto porque también alimenta a los rookies
  de IA que reemplazan retiros (`driverGenerator.js`), y no tiene sentido
  debilitarlos a ellos. Además hay un tope duro (`TOPE_ATRIBUTO_ROOKIE_JUGADOR
  = 59`) sobre el resultado, porque el ruido gaussiano no tiene techo natural.
  Con potencial 40 y el mismo ruido de siempre (desvío 8), los atributos
  típicos del jugador arrancan entre ~25 y ~55, con consistencia/gestión de
  neumáticos más bajas todavía por la penalización de poca experiencia — deja
  margen real de progreso vía el arquetipo del dado inicial y el dado de
  mejoras de cada pretemporada.

### Cierre de temporada: resumen narrativo + mercado de pases

Al terminar las 24 carreras (`procesarCierreTemporada`):

1. Si el jugador salió campeón, pantalla de campeón (suma 1 a
   `titulosCareer`) antes de seguir.
2. `POST /cerrar-temporada` (retiros/reemplazos de IA — sin cambios).
3. **Resumen de temporada** estilo "Potrero deportivo" (`renderResumenTemporada`):
   título de sabor al azar, una "nota" calculada a ojo a partir de los
   puntos de la temporada, y 2 líneas de recap (puntos/posición, comparación
   de victorias contra el rival eterno).
4. Si el jugador llegó a su `edadRetiro`, pantalla final de retiro. Si no,
   **mercado de pases** (`renderMercadoDePases`): ni la renovación con el
   equipo actual ni las ofertas de otros equipos están garantizadas — se
   calcula una `cotizacion` 0-100 (mitad puntos de la última temporada, mitad
   idolatría, ver `evaluarMercado`) que define `probRenovacion` y, para cada
   equipo rival por separado, `probOferta`. Con cotización baja el equipo
   actual puede no renovar y puede no aparecer ninguna oferta externa — la
   "silla vacía" del modo carrera. Para que la carrera nunca quede sin salida,
   si no hay renovación NI ofertas se fuerza una oferta de "mercy" (preferido
   un equipo de fondo de parrilla). El costo de idolatría de irse (-8) solo
   se aplica si HABÍA renovación y el jugador eligió irse igual (se lee como
   traición); si lo descartaron, fichar en otro lado no cuesta idolatría.
   "Llamar al representante" (**una sola vez en toda la carrera**,
   `save.llamadaRepresentanteUsada`) ahora hace una segunda tirada, con mejor
   suerte, solo sobre los equipos que no habían ofertado — tiene sentido
   incluso (sobre todo) con el mercado vacío.
5. Pretemporada: dado de mejoras (ver arriba) y arranque de la siguiente
   temporada con un nuevo calendario y un nuevo sorteo de momentos.

### HUD y banner

- **HUD sticky** arriba de toda pantalla de temporada: Temporada · Victorias
  · Poles · Títulos (contadores de carrera completa en el jugador, nunca se
  resetean entre temporadas). Se mantiene liviano a propósito — la
  información más pesada (economía, idolatría, rival) vive en la ficha del
  piloto, mostrada solo en la pantalla de temporada.
- **Banner de temporada**: color de la escudería, nombre, rol, temporada.

### Retiro y pantalla final

Sin cambios respecto al rediseño anterior: la edad de retiro del jugador se
sortea una vez al arrancar la carrera (28-32 años) y se chequea al cerrar
cada temporada. La pantalla final muestra un badge (LEYENDA con 3+ títulos,
CAMPEÓN con 1+, DESTACADO con 10+ victorias sin título, PILOTO DE F1 por
defecto), las stats totales (incluyendo valor de mercado y dinero ganado),
una comparación cualitativa con una leyenda histórica (deliberadamente vaga
— no se afirman datos puntuales inventados sobre gente real) y un timeline
temporada por temporada armado en `save.historialTemporadas`.

Límite conocido: si el rival eterno se retira, `rivalEternoId` queda
apuntando a un piloto que ya no está en `pilotos` — no rompe nada, la ficha
del piloto simplemente no muestra el head-to-head con el rival.

## Cómo probarlo

```bash
cd server
node src/services/elPiloto/demo.js
```

Corre una temporada de ejemplo con el motor puro (sin lo del cliente:
roster, eventos, minijuego) — imprime clasificación, resultado, eventos y
cómo se mueve el rating/forma de cada uno. El proyecto no tiene framework
de tests configurado todavía.

## Decisión de diseño central (sin cambios entre rediseños)

El rating **no** se deriva de estadísticas históricas reales (eso fue
explícitamente descartado — así estaba planteado el modo simulación
abandonado de `feature/arma-grid`). En su lugar:

- Cada piloto tiene **atributos** (0-100, ver `attributes.js`): ritmo de
  clasificación, ritmo de carrera, agresividad, consistencia, gestión de
  neumáticos, feedback técnico.
- Un **rating dinámico tipo Elo** (`rating.js`) que arranca de una semilla
  razonable por tier (figura/sólido/promesa/rookie/en caída — percepción
  gruesa, no una tabla de puntos) y después solo se mueve por lo que pasa
  **dentro** de las carreras simuladas.
- Una **forma** de corto plazo (-20..20) que decae con el tiempo y empuja
  según el último resultado.
- El **auto/equipo** es una entidad de rendimiento separada del piloto
  (`rendimientoAuto`, `fiabilidad`).
- **Caos por evento**: lluvia, safety car, fallas mecánicas y errores propios
  (`raceSimulator.js`) evitan que el resultado sea determinista.

## Piezas

- `attributes.js`, `weightedRandom.js`, `rating.js`, `driverGenerator.js`,
  `tiers.js`, `seasonEngine.js` — **sin cambios en ningún rediseño**, ver
  comentarios de cada archivo.
- `raceSimulator.js` — **`PESO_PILOTO`/`PESO_AUTO` recalibrados** de 0.5/0.5
  a 0.35/0.65 (ver "Por qué el peor auto podía salir campeón").
- `realGridSeed.js` — **`teamSeedForName()` nuevo**: rendimientoAuto/
  fiabilidad reales por tier de escudería (antes todos los equipos caían en
  el mismo default neutral). `REAL_DRIVER_SEEDS` sigue vacío (pendiente).
- `rosterFromDb.js` — `buildRealGrid()` ahora prueba `teamSeedForName()`
  como fallback antes del default neutral.
- `calendar.js` — 24 circuitos reales (nombre + bandera emoji + tipo de
  pista) en orden fijo.
- `careerSetup.js` — `iniciarCarrera` recibe `rol`, `arquetipo` (carta del
  dado inicial) y `tierEquipo` (define el valor de mercado inicial); arranca
  al jugador a los 21 años, sortea `edadRetiro` (28-32), y agrega
  `idolatria` (50 inicial), `valorDeMercado`/`dineroGanado`/
  `saldoDisponible`, `llamadaRepresentanteUsada` y los contadores de carrera
  (`victoriasCareer`, `polesCareer`, `podiosCareer`, `titulosCareer`,
  `puntosCareerTotal`) al piloto del jugador.
- `interactiveMoments.js` — `ARCHETYPE_CARDS`/`UPGRADE_CARDS` (dado de
  cartas), `RANDOM_EVENTS` (8 tipos × 3 opciones, categorizados en
  `equipo`/`prensa`), `MINIGAME_CONTEXTS` (3 contextos de "La Frenada"),
  `WALL_DECISIONS` (6 escenas de 2 opciones para "Muro de Boxes"),
  `TRIVIA_F1` (10 preguntas reales para "Ta-Te-Ti", variante Grid Trivia),
  `PADDOCK_PAIRS` (10 parejas conceptuales para "Paddock Match") y
  `CASCO_DESIGNS` (8 diseños de casco, puramente cosméticos, para la compra
  de pretemporada).
- Rutas (`elPiloto.routes.js`, propio archivo — ver la nota de siempre sobre
  por qué no vive en `game.routes.js`):
  - `GET /api/el-piloto/roster?year=2026`
  - `GET /api/el-piloto/calendario?carreras=24`
  - `POST /api/el-piloto/nueva-carrera` — body: `{ year, equipoId, nombreJugador?, numeroJugador, rol, arquetipo?, tierEquipo?, atributosBase? }`
  - `GET /api/el-piloto/atributos-rookie` — preview de atributos para el dado
    de arquetipo/backstory de F2, antes de que exista la carrera
  - `GET /api/el-piloto/cartas-arquetipo`
  - `GET /api/el-piloto/cartas-mejora`
  - `GET /api/el-piloto/cartas-casco` — 3 diseños al azar, puramente
    cosmético (ver "En qué se gasta `saldoDisponible`" más arriba)
  - `GET /api/el-piloto/contexto-minijuego`
  - `GET /api/el-piloto/decision-muro-boxes`
  - `POST /api/el-piloto/resolver-decision-muro-boxes` — body: `{ decisionId, opcionId }`
  - `GET /api/el-piloto/trivia-f1?cantidad=9`
  - `GET /api/el-piloto/paddock-pairs?cantidad=8`
  - `POST /api/el-piloto/simular-carrera` — body: `{ pilotos, equipos, calendario, carreraIndex, tablaPuntos }` (sin cambios; el cliente arma los modificadores del jugador antes de llamarlo)
  - `POST /api/el-piloto/cerrar-temporada` — body: `{ pilotos, equipos }`
  - `GET /api/el-piloto/evento-aleatorio?categoria=equipo|prensa`
  - `POST /api/el-piloto/resolver-evento` — body: `{ eventoId, opcionId }`

Los minijuegos de reflejos/sincronización (Lights Out, Pit Stop Challenge,
La Vuelta de Pole, El Adelantamiento Perfecto, Tyre Whisperer) y El
Telemetrista son 100% client-side — no tienen endpoint propio, solo leen
atributos del piloto que ya están en el save.

El backstory de F2 (2 temporadas con stats al azar), el sorteo de momentos
de temporada, el resumen narrativo y el mercado de pases son 100% del lado
del cliente — no tienen endpoint propio.

## Contrato de estado (cliente = fuente de verdad de SU partida)

Igual que el resto de los mini-juegos del hub (streak/score en localStorage,
sin cuenta de usuario — ver CLAUDE.md), acá el server **no guarda nada** de
una partida en curso. Forma real del estado guardado en `localStorage`
(clave `f1hub:elPiloto:save`, ver `elPiloto.js`):

```js
{
  pilotos: [ /* incluye jugador, rival eterno, real + ficticios — misma forma para todos */ ],
  equipos: { /* [equipoId]: { rendimientoAuto, fiabilidad, ... } */ },
  calendario: [ /* 24 circuitos, ver calendar.js */ ],
  carreraIndex: 0,
  tablaPuntos: {},
  jugadorId: 'jugador',
  rivalEternoId: 'rival-eterno',
  temporadaNumero: 1,
  bonusEventoPendiente: 0,       // one-shot, se limpia después de cada carrera
  historialTemporadas: [],       // { temporada, equipo, posicionCampeonato, puntos } por temporada cerrada
  momentos: [],                  // { carreraIndex, categoria } — sorteados al arrancar cada temporada
  llamadaRepresentanteUsada: false, // se puede usar 1 sola vez en TODA la carrera
}
```

El piloto del jugador, además de lo que ya usa el motor (atributos, rating,
forma, racesCompleted), lleva: `numero`, `edad`, `edadRetiro`, `rol`,
`idolatria`, `valorDeMercado`, `dineroGanado`, `saldoDisponible`,
`victoriasCareer`, `polesCareer`, `podiosCareer`, `titulosCareer`,
`puntosCareerTotal`, y opcionalmente `bonusLluvia` (solo si tocó esa carta
de mejora en alguna pretemporada).

## Por qué `realGridSeed.js` está vacío

Sin cambios — ver el archivo. El tier/edad de un piloto real no se deriva de
sus stats, y la tabla `drivers` no tiene fecha de nacimiento real para tirar
de ahí.

## Pendiente / a calibrar jugando

- **Nada de esto se probó como HTTP/UI real todavía** — ni el segundo
  rediseño (temporada híbrida, La Frenada, dado de arquetipo/mejoras,
  idolatría/economía, mercado de pases multi-oferta) ni la ampliación a 11
  minijuegos se escribieron con sandbox de shell disponible en la sesión —
  revisado a mano línea por línea, pero falta jugarlo de verdad en el
  navegador. Los minijuegos con mecánicas de timing real (Lights Out, Tyre
  Whisperer) son los que más conviene probar primero, ya que dependen de
  `performance.now()`/`setInterval` y son más difíciles de revisar solo
  leyendo el código.
- **Balance de pesos** (`PESO_PILOTO`/`PESO_AUTO`) y **probabilidades de
  caos** en `raceSimulator.js` siguen sin recalibrar — ver constantes al
  principio del archivo.
- **Balance de los bonos nuevos**: rol (+2/+3), los bonus de los 11
  minijuegos (rango aproximado -10 a +18 antes de pasar por
  `CAP_MODIFICADOR_TOTAL`), los `idolatriaDelta`/`bonusCarrera` de los 8
  eventos aleatorios y de las 6 escenas de Muro de Boxes, los bonus de las
  cartas de arquetipo/mejora, y la conversión plata→tiradas extra son todos
  "a ojo" — falta sentir el balance jugando varias temporadas. En
  particular, con 11 minijuegos en el mismo sorteo, conviene revisar que
  ninguno quede sistemáticamente más fácil (o más difícil) de acertar que el
  resto, porque eso se traduciría en una ventaja o penalización oculta según
  a quién le toque jugar.
- **`PESO_PILOTO`/`PESO_AUTO` (0.35/0.65) y `CAP_MODIFICADOR_TOTAL` (14)**
  son la primera corrección al bug de "campeón con el peor auto" (ver "Por
  qué el peor auto podía salir campeón" más arriba) — resuelve el caso
  reportado, pero los números concretos son otra vez "a ojo": si ahora el
  auto pesa DEMASIADO y ganar con un equipo medio se siente imposible pase
  lo que pase, aflojar `PESO_AUTO` un poco o subir el tope de
  `CAP_MODIFICADOR_TOTAL` son los primeros diales a tocar.
- **7 destinos nuevos de `saldoDisponible` sin probar en navegador** (mismo
  límite de siempre — sin sandbox de shell en la sesión, revisado a mano):
  ojo particular con `renderMomentoDecisivo` (seguro mecánico/entrenador,
  ahora con estado mutable de `save`/`saldo` y re-render) y con el flujo de
  `gastoExtra` en El Telemetrista → `resolverResultadoMinijuego` →
  `ejecutarCarrera`, que depende de que `saldoDisponible` sobreviva el
  round-trip por `/simular-carrera` sin que el servidor lo pise.
- **Intento extra acotado a El Telemetrista**: los otros minijuegos de
  timing (Pit Stop, Vuelta de Pole, Adelantamiento Perfecto, Tyre Whisperer,
  La Frenada) comparten `renderBarraTiming` y juegan cada segmento una sola
  vez sin contador propio — extenderles la compra de intento extra es
  posible pero requiere manejar el mismo problema de "el save actualizado no
  vuelve a subir solo" con más cuidado (más callsites, closures anidadas).
- **Gestión de imagen / Representante premium sin lógica de tier**: igual que
  las ofertas del mercado en general, no miran si el equipo al que vas es
  mejor o peor que el actual — ver el bullet de "Mercado de pases" más abajo.
- **Ta-Te-Ti sin dificultad seleccionable**: la IA juega siempre con 25% de
  jugada al azar (nivel "competitivo" fijo) — el spec mencionaba niveles
  tipo "Piloto Novato"/"Leyenda" como ejemplo, no implementados todavía.
- **Frecuencia y categoría de los momentos** (4-5 por temporada, categoría al
  azar entre las 3) es la primera aproximación — si se siente muy denso o
  muy vacío, es el primer dial para tocar (`generarMomentos` en el cliente).
- **Backstory de F2 puramente narrativo**: las 2 temporadas generadas antes
  de arrancar en F1 (solo para escuderías de fondo de parrilla) no tienen
  ningún efecto mecánico en los atributos iniciales del jugador — es
  flavor. Si se siente vacío, la idea más simple es que un buen backstory
  (muchas victorias) dé un pequeño empujón al `potencial` inicial.
- **Mercado de pases: cotización sí, pero sin lógica de "mejor oferta"**:
  desde el rebalance de renovación/ofertas (`evaluarMercado`), CUÁNTAS
  ofertas aparecen y si hay renovación depende de puntos + idolatría, pero
  QUÉ equipos ofertan sigue siendo un sorteo simple sin mirar su nivel/tier
  — un piloto con cotización alta puede terminar con una oferta solo de un
  equipo de fondo de parrilla. El costo de -8 (cuando aplica) también es fijo
  para cualquier equipo al que se cambie, sin diferenciar por tier.
- **`realGridSeed.js` — falta la parte de PILOTOS, no de equipos**: los
  equipos ya tienen `rendimientoAuto`/`fiabilidad` reales por tier vía
  `teamSeedForName()` (ver arriba). Los pilotos reales siguen cayendo todos
  en `DEFAULT_DRIVER_SEED` (tier 'solido', edad 27) hasta que se cure
  `REAL_DRIVER_SEEDS` a mano — eso sigue pendiente.
- **Categorías inferiores y draft** siguen sin mecánica — la partida arranca
  directo en F1 (con el flavor de F2 previo para backmarkers).
- **rivalEternoId puede quedar obsoleto** si ese piloto se retira — ver
  "Estado actual" más arriba.
