# Informe: IA medida en un FPS de raycasting

Proyecto final de Inteligencia Artificial (ITAM, otoño 2026). Juego: DOOM BIN BASH EDITION.
Demo: <https://doom-bash-ia-mu.vercel.app/?ia=astar,bandido>. Código y mediciones: esta carpeta.

## 1. Resumen

El juego base ya traía "IA de videojuego" clásica: reglas escritas a mano para los enemigos, el jefe y el director de
ritmo. Este proyecto sustituye, de forma opcional y apagada por omisión, tres de esas piezas por algoritmos del curso y,
sobre todo, **las mide**:

| Pieza | Algoritmo | Contra qué se compara |
|---|---|---|
| Rutas de los enemigos | A\* con vecindad de 8 casillas | La regla original (línea recta y rumbos al azar) |
| Ataques del jefe | Expectimax con nodos de azar | La regla original y políticas triviales |
| Reto del encuentro con el jefe | Thompson sampling (bandido de nueve brazos) | Epsilon-voraz, UCB1, brazo fijo, azar y la regla original |

Todo se evalúa en un simulador determinista (M0) que corre el núcleo real del juego sin navegador. Cada cifra de este
informe sale de un episodio simulado con semilla fija, con intervalo de confianza donde aplica.

**Resultado en una línea por módulo.** A* sí ayuda a que los enemigos lleguen al jugador. Expectimax con el objetivo de
daño es un resultado negativo (no le gana a "siempre el mismo ataque"); con el objetivo de ritmo sí acerca el daño a una
meta. El bandido le gana a la regla original y al azar, pero no a un brazo fijo bien escogido ni a epsilon-voraz.
**Nada de esto se ha probado con personas.**

## 2. Qué se hizo y qué no

| Módulo | Estado |
|---|---|
| M0 Simulador determinista con bots de referencia | Hecho, con pruebas |
| M1 Navegación con A\* | Hecho, medido, conectado al juego |
| M2 Jefe con expectimax | Hecho, medido, conectado al juego |
| M3 Director adaptativo con Thompson sampling | Hecho, medido, conectado al juego |
| Panel de IA en el juego y demo en línea | Hecho |
| Coordinación de enemigos con anillo de aproximación y húngaro (plan de M1) | **No se hizo.** Se probó un flanqueo por penalización de rutas y no mostró efecto |
| Dibujar las rutas de A\* en el juego (plan de la demo) | **No se hizo** |
| MCTS con UCT para el jefe (plan de M2) | **No se hizo**; solo expectimax |
| M4 Bot que aprende con Q-learning | **No se hizo.** Los bots son guionados, no aprenden |
| M5 Narrador con estado estructurado | **No se hizo.** El narrador sigue como en el juego base |

El plan original ([`docs/PLAN_IA.md`](docs/PLAN_IA.md)) ya decía que M4 era lo primero que se recortaba si faltaba tiempo.

## 3. Método común (M0)

- El simulador reutiliza sin copiar los módulos del juego (enemigos, jefe, combate, movimiento, niveles, dificultad).
  No reutiliza el controlador del jugador porque importa Phaser; ahí el movimiento se reescribió con las mismas
  funciones de física.
- Determinismo: cada episodio calcula un resumen FNV-1a de posiciones y vida; misma semilla, mismo bot, mismo nivel y
  misma dificultad dan el mismo resultado completo. Lo verifica `src/tests/ai-sim.test.ts`.
- Comparaciones pareadas por semilla, con intervalo de confianza al 95 %.
- Bots de referencia: quieto, aleatorio, guionado (ruta BFS, apunta, se mueve de lado) y, para M3, un guionado con
  habilidad parametrizable (0.2, 0.5, 0.9) que esquiva proyectiles.
- Simplificaciones declaradas (detalle en [`docs/SIMULADOR.md`](docs/SIMULADOR.md)): puertas abiertas, sin pickups ni
  eventos de nivel, un solo jefe por nivel. Los niveles simulados son más fáciles que jugar de verdad.

## 4. M1: A\* para los enemigos

**Problema.** Los enemigos persiguen en línea recta y, si se atoran, prueban rumbos al azar. Con el jugador detrás de una
pared se quedan empujando. Detalle en [`docs/NAVEGACION.md`](docs/NAVEGACION.md).

**Método.** A\* en la cuadrícula del mapa con 8 vecinos (la diagonal exige las dos celdas ortogonales libres),
heurística octil (admisible y consistente), desempates por orden de inserción y replanificación cada 400 ms o cuando la
meta cambia de celda. Se entrega detrás de una interfaz opcional: sin ella el juego usa la regla original y las pruebas
originales siguen pasando sin cambios.

**Resultados.**

- En mapas reales (de 16×13 a 28×18) A\* expande entre 35 y 55 % menos nodos que Dijkstra y siempre halla la ruta
  óptima. El algoritmo voraz expande lo mínimo, pero su ruta es entre 2 y 5 % más larga y solo es óptima entre 54 y 88 % de
  los pares. Cada búsqueda cuesta decenas de microsegundos con cualquiera. **En este juego la ventaja de A\* sobre
  Dijkstra no es de rendimiento**; la ganancia es pasar de "sin ruta" a "con ruta".
- Persecución de 60 s contra un blanco inmóvil e invulnerable (comparación pareada): en 8 de 10 niveles el primer daño
  llega antes con A\*. En `glass-cistern`, `relay-catacomb` y `rift-fracture` la regla original nunca daña al blanco en
  60 s y A\* lo hace en 5 a 10 s. En `signal-threshold` y `sulfur-lattice` no hay diferencia.
- **Resultado negativo:** el flanqueo (penalizar las celdas que ya usan otros enemigos) no mostró efecto medible. Los
  mapas son sobre todo pasillos sin alternativa razonable. Queda como opción apagada.

**Límites.** El escenario de persecución es una prueba de estrés, no una partida: el blanco no se mueve ni pelea y los
enemigos alertados conocen su posición. Mide cuánto ayuda A\* a **llegar**, no cuánto mejora la partida. Con A\* los
enemigos son notablemente más peligrosos; antes de activarlo por defecto haría falta revisar el balance con personas. Por
eso la bandera arranca en la regla original.

## 5. M2: expectimax para el jefe

**Problema.** Los tres jefes eligen su siguiente salva con una regla fija que no mira hacia adelante ni sabe cuánto daño
lleva el jugador. Detalle en [`docs/JEFE.md`](docs/JEFE.md).

**Método.** Árbol con nodos MAX (el jefe elige un ataque) y nodos de azar (el jugador responde con una de cinco
maniobras: quedarse quieto, esquivar a izquierda o derecha, acercarse, alejarse). La probabilidad de cada respuesta
mezcla persistencia con un a priori calibrado a mano. La transición simula las balas con la misma función que usa el juego
y calcula analíticamente cuándo entra cada una en el cuerpo del jugador. Una decisión de profundidad 2 cuesta cerca de
1.3 ms.

Dos objetivos: `damage` (maximizar el daño esperado) y `pacing` (acercar el daño acumulado a una meta de T = 6 puntos
por salva, con el déficit como parte del estado).

**Resultados** (40 semillas por celda; jugador invulnerable 45 s; entre paréntesis, error de ritmo contra la meta):

| Jefe | Jugador | Regla original | Siempre `fan_wide` | Expectimax daño | Expectimax ritmo |
|---|---|---|---|---|---|
| volt-archon | guionado | 2.1 (3.9) | 13.5 (8.0) | 10.5 (5.2) | 6.1 (1.9) |
| volt-archon | aleatorio | 3.4 (2.9) | 17.7 (12.0) | 12.0 (7.4) | 9.1 (4.5) |
| volt-archon | quieto | 17.1 (11.4) | 27.3 (21.4) | 28.1 (22.3) | 14.0 (8.6) |
| bloom-warden | guionado | 5.0 (2.4) | 14.2 (8.2) | 12.6 (6.7) | 6.2 (1.6) |
| ash-judge | guionado | 7.2 (2.8) | 17.6 (11.6) | 14.2 (8.2) | 6.0 (1.6) |

Tabla completa, con los demás casos e intervalos: [`resultados/bench-boss.md`](resultados/bench-boss.md).

- **Resultado negativo.** Con el objetivo de daño, expectimax produce más presión que la regla original pero no supera
  a la política trivial "siempre `fan_wide`". La razón es estructural: el ataque de ahora no cambia dónde estará el
  jugador después, así que cada salva es casi independiente y buscar más lejos no aporta información. Las filas de
  profundidad 1 y 3 son idénticas.
- Con el objetivo de ritmo, el error contra la meta baja con el jugador guionado (de 2.4 a 3.9 en la regla, a 1.5 a 1.9) y
  con el quieto (por ejemplo, 11.4 a 8.6 en volt-archon).
- Con el jugador aleatorio, el ritmo **no mejora** la regla en volt-archon (error 4.5 contra 2.9) ni en bloom-warden. El
  modelo del jugador es peor cuando este no persiste en ninguna maniobra.
- Con los mismos ataques que la regla, el ritmo casi no cambia nada. La ganancia viene de poder elegir entre más
  ataques, no de elegir mejor entre los de siempre.

**Límites.** La meta T = 6 es un parámetro de diseño, no un hecho: con ella, la supervivencia media del bot guionado en
volt-archon baja de unos 73 s a unos 39 s. Eso es un jefe más duro porque se pidió una meta más alta, no uno "mejor". El
modelo del jugador está calibrado a mano contra el mismo simulador, lo que introduce circularidad. Con profundidades
1, 2 y 3 los resultados quedan dentro del mismo intervalo de confianza, así que no se puede decir que mirar más lejos
mejora; solo que no empeora y cuesta poco. Con un jugador quieto en volt-archon ni el ataque más débil baja el daño a la
meta.

## 6. M3: bandido para el reto del encuentro

**Problema.** El reto del juego son números fijos; un jugador torpe y uno hábil reciben lo mismo. La idea es que el juego
pruebe niveles de reto con cada jugador y aprenda cuál lo deja en una zona adecuada. Detalle en
[`docs/DIRECTOR.md`](docs/DIRECTOR.md).

**Recompensa (la parte que hay que defender).** Un encuentro de 40 s contra `ash-judge-seal` da recompensa 1 si el
jugador sigue vivo y termina con entre 30 % y 70 % de vida, y 0 en otro caso. Los límites son **una decisión de diseño,
no un hecho**; cambiarlos mueve qué brazo es el mejor. No es monótona en la presión, y por eso un jugador quieto y uno
hábil tienen brazos óptimos distintos.

**Brazos.** Nueve metas de presión de la política de ritmo de M2 (1, 1.5, 2, 3, 4, 5, 6, 8 y 12 puntos de daño por salva).

**Resultado negativo previo.** La primera versión eran las perillas del director de spawns del juego (tope de enemigos y
ritmo de aparición). Se integró el director real al simulador y se midió: **no mueven la vida del jugador**
([`resultados/bench-director-perillas.md`](resultados/bench-director-perillas.md)). La causa, leyendo
`GameDirector.canSpawn`, es que solo hace aparecer enemigos en sus estados de presión y emboscada, y esos tiempos no
dependen de las perillas probadas. Por eso los brazos pasaron a ser metas de presión del jefe.

**Entorno.** Cinco bots (quieto, aleatorio y tres con habilidad 0.2, 0.5 y 0.9). Se simularon una sola vez 5 × 9 × 80 =
3600 episodios (más 400 de la regla original) y las sesiones de 80 encuentros extraen resultados de esa tabla. Con 80
semillas por celda, cada probabilidad tiene un error de muestreo de unos ± 0.10, así que no se distingue entre brazos de
probabilidad parecida.

**Resultados** (fracción de encuentros en banda en los últimos 20, promedio sobre los cinco jugadores; ± 0.01 por celda;
300 réplicas):

| Selector | En banda |
|---|---|
| Regla original (sin bandido) | 0.22 |
| Azar uniforme | 0.25 |
| Thompson con olvido 0.95 | 0.30 |
| UCB1 | 0.31 |
| Thompson | 0.34 |
| Thompson con prior poblacional | 0.35 |
| Brazo fijo ritmo-4 (escogido viendo la tabla) | 0.35 |
| Epsilon-voraz 0.1 | 0.37 |
| Oráculo (mejor brazo de cada jugador) | 0.42 |

Tablas completas: [`resultados/bench-director.md`](resultados/bench-director.md).

- Cualquier bandido le gana a la regla original y al azar. Esa ganancia es principalmente de M2: la política de ritmo
  con un brazo fijo ya pasa de 0.22 a 0.35.
- Los selectores aprenden dentro de la sesión (por ejemplo, 0.32 a 0.40 con habilidad 0.9 entre los primeros y los
  últimos 20 encuentros).
- **Thompson no le gana a un brazo fijo bien escogido ni a epsilon-voraz** en 80 encuentros. Epsilon-voraz queda 0.03 por
  encima, más que el margen de error. No hay razón teórica para que Thompson gane en un horizonte tan corto con
  diferencias tan pequeñas.
- **El techo de la personalización es bajo:** el oráculo por jugador es 0.42 y el mejor brazo único 0.35. Lo máximo que
  podía ganar el bandido por adaptarse a cada jugador es 0.07.
- **Con un jugador que cambia de estilo** (de quieto a habilidad 0.9) el bandido recupera mal: queda entre 0.27 y 0.32 y
  el brazo fijo en 0.36. El olvido no ayudó de forma apreciable.

**Límites.** Los jugadores son bots, y ni siquiera hay certeza de que "habilidad" del simulador ordene a los jugadores
como lo haría una persona. Un jugador real probablemente juegue pocas decenas de encuentros (es una suposición, no un
dato); con nueve brazos y 10 o 20 encuentros el bandido casi no aprende, y para el juego real convendría el prior
poblacional y pocos brazos.

## 7. Integración en el juego (Fase 3)

`RaycastScene` consulta un runtime de IA (`src/ai/runtime/AiRuntime.ts`, sin Phaser) que devuelve el navegador y la
política de jefe según el modo elegido. Con los modos por omisión devuelve `undefined`, y el juego usa la regla
original. Teclas `I`, `U`, `O` y parámetro `?ia=` de la URL; detalle y límites en [`docs/PANEL_IA.md`](docs/PANEL_IA.md).
El bandido en el juego elige un brazo cuando aparece el jefe, cierra el encuentro a los 40 s, si el jugador muere o si
el jefe cae, guarda su creencia en el navegador y empieza otra ventana.

**Qué se verificó.** Pruebas unitarias del runtime (11) y de todo el proyecto (714 en total). En el demo desplegado se
comprobó que A\* planifica rutas (8 planes y 74 nodos en los primeros segundos), que el bandido elige un brazo al aparecer
el jefe (se vio `ritmo-12`, ventana 6/40 s) y que expectimax muestra su decisión en vivo (1.15 ms por decisión).

**Qué no se verificó.**

- Un encuentro completo de 40 s en el navegador con el cierre y el guardado de la creencia: solo está cubierto por
  pruebas unitarias, no se observó en una partida larga.
- Ninguna sesión con personas. No hay datos de jugadores reales.
- El modo "expectimax" del panel usa una meta fija de 4 puntos por salva, que es el mejor brazo único de la tabla de M3,
  escogido con la tabla a la vista.
- La política de ritmo ve el daño ya escalado por la dificultad del juego, pero los brazos se calibraron con el daño sin
  ese escalado; en dificultades altas el ritmo efectivo es más severo que el nominal.
- Con el jugador quieto y metas altas, el modelo puede dar el mismo valor a varios ataques (se vio `fan`, `fan_wide` y
  `cross` empatados); en empate evita repetir el ataque anterior. No se consideró un error, pero tampoco se investigó
  más.

## 8. Límites globales

1. **Todos los jugadores son bots.** Cada conclusión vale para esos perfiles y no se extrapola a personas sin probar con
   personas.
2. **Circularidad.** El modelo del jugador de M2 y el banco de pruebas comparten supuestos de movimiento; las
   probabilidades de M3 salen del mismo simulador.
3. **Parámetros de diseño.** La banda de reto (30 a 70 %), la meta de ritmo (T = 6) y la elección de los brazos son
   decisiones, no medidas.
4. **El simulador es más fácil que el juego** (sin eventos, pickups ni oleadas, puertas abiertas).
5. **Balance.** Activar A\* o la política de ritmo vuelve el juego más duro. Por eso todo arranca apagado.
6. **Tamaño de muestra.** M3 tiene 80 semillas por celda (± 0.10) y 300 réplicas por sesión; las diferencias pequeñas
   entre selectores no son concluyentes.

## 9. Cómo reproducir

```bash
npm ci
npm test                             # 101 archivos, 714 pruebas
npm run bench:sim
npm run bench:nav
npm run bench:boss -- --seeds 40     # varios minutos
npm run bench:director -- --rebuild  # poco más de un minuto
npm run bench:director-knobs
```

## 10. Uso de asistentes de IA

El código de los módulos M0 a M3, el runtime y el panel, y los documentos de `docs/` y este informe se escribieron con
Claude (Anthropic) como asistente de programación. José Malfavaun definió el alcance y el diseño, pidió cada módulo,
revisó el código y los resultados, ejecutó las pruebas y los benchmarks en su máquina, y hizo los commits con su propia
cuenta. Las decisiones de qué reportar como resultado negativo (daño del jefe, perillas del director, flanqueo, bandido
frente a epsilon-voraz) se tomaron para no ajustar los parámetros hasta que saliera un resultado favorable.

## 11. Créditos

Juego base: José Malfavaun, ETurriza, Fr-C-S-08 y Francisco Emilio
([josemalfavaun/doom-bin-bash-edition](https://github.com/josemalfavaun/doom-bin-bash-edition)). Licencia MIT.
