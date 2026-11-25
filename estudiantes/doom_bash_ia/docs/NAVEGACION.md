# Navegación de enemigos con A* (M1)

## El problema

Hoy los enemigos no planean rutas. Persiguen en línea recta hacia el jugador y, si se atoran contra una pared, prueban rumbos al azar (`RaycastEnemyRoam`, `computeTacticalMoveDirection`). Cuando el jugador queda detrás de una pared, el enemigo empuja contra ella y se queda ahí. En varios niveles esto se vuelve tan notorio que, con todos los enemigos alertados, ninguno llega al jugador en 60 s.

## Qué se agregó

| Pieza | Archivo | Papel |
|---|---|---|
| Buscador de rutas | `src/ai/astar/search.ts` | Un motor con cuatro estrategias (BFS, Dijkstra, voraz, A*) para compararlas con el mismo código |
| Navegador | `src/ai/astar/navigator.ts` | Guarda una ruta por enemigo, la recalcula cada 400 ms o si la meta se mueve, y entrega una dirección |
| Interfaz | `src/game/raycast/RaycastEnemyNavigator.ts` | Punto de inyección que el juego acepta como modificador opcional |
| Dos puntos de uso | `RaycastEnemySystem.ts`, `RaycastEnemyTactics.ts` | Persecución sin línea de visión y búsqueda del último punto conocido |

La lógica anterior queda intacta: sin `navigator` en los modificadores, el juego se comporta exactamente como antes (las pruebas originales del juego siguen pasando sin cambios). Esto es lo que permite comparar contra la regla original y lo que respalda el interruptor `AiFlags.enemyNavigation`.

Está conectado a la escena del juego a través de `AiRuntime` (`src/ai/runtime/AiRuntime.ts`): `RaycastScene` le pide el navegador y lo pasa en los modificadores de `updateRaycastEnemies`. Se activa con la tecla `U` o con `?ia=astar` en la URL; por omisión vale la regla original. Ver `docs/PANEL_IA.md`.

## Cómo funciona

- Cuadrícula de 8 vecinos. La diagonal exige las dos celdas ortogonales libres, para no cortar esquinas.
- Una celda es transitable si el cuerpo del enemigo (su `radius`) cabe centrado en ella.
- Heurística octil: `dx + dy + (√2 − 2)·min(dx, dy)`. Es admisible y consistente, así que A* devuelve la ruta más corta.
- Desempates por orden de inserción: la misma consulta da siempre la misma ruta.
- El enemigo apunta al segundo waypoint de su ruta (lookahead 2), lo que suaviza las esquinas.
- Sin ruta útil (ya está en la celda meta o es inalcanzable), el navegador devuelve `null` y el enemigo usa su regla de siempre.
- Flanqueo opcional (`flank: true`): las celdas que ya usan las rutas de otros enemigos cuestan más, salvo cerca de la meta.

## Resultados

Tablas completas con `npm run bench:nav` (escribe `resultados/bench-nav.md`).

**A. Comparación de algoritmos, mapas reales.** En los mapas del juego (de 16×13 a 28×18 celdas) las diferencias entre algoritmos son pequeñas:

- A* expande entre 35 y 55 % menos nodos que Dijkstra y encuentra siempre la ruta óptima.
- El voraz expande lo mínimo pero su ruta es entre 2 y 5 % más larga y solo es óptima en 54 a 88 % de los pares.
- BFS casi coincide con Dijkstra: en cuadrículas tan chicas ignorar el costo de la diagonal rara vez cambia la ruta.
- Cada búsqueda cuesta decenas de microsegundos en cualquiera. En este juego **la ventaja de A* sobre Dijkstra no es de rendimiento**; la ganancia está en pasar de "sin ruta" a "con ruta".

Nota: varios niveles comparten el mismo trazado (por ejemplo `access-node` y `meridian-ember-ramp`), por eso sus filas coinciden.

**B. Persecución, A* contra la regla original** (blanco inmóvil e invulnerable, enemigos alertados, 60 s, comparación pareada por semilla):

- En 8 de 10 niveles el primer daño llega antes con A* (en `shard-vault` solo 3 s antes; en el resto, entre 9 y 55 s). Por ejemplo, en `glass-cistern`, `relay-catacomb` y `rift-fracture` la regla original nunca logra dañar al blanco en 60 s y A* lo hace en 5 a 10 s.
- En `signal-threshold` y `sulfur-lattice` no hay diferencia (el camino ya era casi recto).
- **El flanqueo no mostró efecto medible.** Los mapas son sobre todo pasillos sin ruta alternativa razonable, y las rutas de los enemigos casi no se solapan fuera de la zona final. Queda como opción apagada y como resultado negativo documentado.

## Cuidado con la interpretación

- El escenario de persecución es una prueba de estrés, no una partida real: el blanco no se mueve, no pelea, y los enemigos alertados conocen su posición (así funciona la alerta del juego). Mide cuánto ayuda A* para **llegar**, no cuánto mejora la partida.
- Con A* los enemigos son notablemente más peligrosos. Antes de activarlo por defecto hay que revisar el balance con partidas humanas y, si hace falta, bajar velocidad o daño. Por eso la bandera arranca en `'legacy'`.
- El efecto en partidas reales con un jugador que dispara y se mueve no se midió: no hay datos de personas. Ver `INFORME.md`.

## Cómo reproducir

```bash
npm run bench:nav                          # 200 pares por nivel, 50 semillas
npm run bench:nav -- --pairs 50 --seeds 20 # versión rápida
npx vitest run src/tests/ai-astar-search.test.ts src/tests/ai-astar-navigator.test.ts
```
