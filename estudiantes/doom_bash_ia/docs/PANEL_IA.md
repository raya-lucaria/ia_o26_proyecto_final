# Panel de IA dentro del juego

Las tres IA del proyecto (A*, expectimax y bandido) se pueden activar mientras se juega, sin tocar código. Por omisión
**todo está apagado**: el juego se comporta como el original (`legacy` para enemigos, `rule` para el jefe).

## Teclas

| Tecla | Qué hace |
|---|---|
| `I` | Muestra u oculta el panel de IA (esquina superior derecha). |
| `U` | Cambia la navegación de enemigos: regla original, A*. |
| `O` | Cambia el director del jefe: regla original, expectimax, bandido Thompson. |

También se pueden fijar desde la URL: `?ia=astar,bandido` (acepta `astar`, `legacy`, `expectimax`, `bandido`, `regla`).
La URL manda sobre lo guardado. Los modos y la creencia del bandido se recuerdan en `localStorage` del navegador.

## Qué muestra el panel

- **Navegación A\***: cuántos planes se han calculado y cuántos nodos se expandieron (costo de búsqueda).
- **Expectimax**: la última decisión del jefe, los tres ataques con mejor valor esperado y los milisegundos por decisión.
- **Bandido**: el brazo en juego (meta de daño por salva), cuánto va de la ventana de 40 s, la media y el número de veces
  de cada brazo, y el último resultado (brazo, recompensa, vida restante, motivo de cierre).

## Cómo se conecta

| Pieza | Dónde entra | Qué pasa si está apagada |
|---|---|---|
| `AiRuntime` (`src/ai/runtime/AiRuntime.ts`) | `RaycastScene` lo crea una vez y lo consulta cada cuadro | Devuelve `undefined` para navegador y política |
| Navegador A* | `updateRaycastEnemies(..., { navigator })` | Los enemigos usan su regla de siempre |
| Política del jefe | quinto parámetro de `tickRaycastBossVolleys` | El jefe usa `chooseBossVolleyKind` |
| Contexto del jefe | `buildBossPlayerCtx` agrega `health` y `damageTaken` | Campos opcionales; la regla original no los lee |

El runtime no depende de Phaser: recibe tiempo y estado del jugador en un `AiFrame` y se prueba con
`src/tests/ai-runtime.test.ts` (11 pruebas).

## Cómo aprende el bandido en el juego

1. Cuando el jefe aparece y el jugador está vivo, Thompson sampling elige un brazo y se crea la política de ritmo
   correspondiente.
2. El encuentro termina por: ventana de 40 s, muerte del jugador o muerte del jefe.
3. Recompensa 1 si el jugador sigue vivo y terminó con entre 30 % y 70 % de vida; 0 en otro caso.
4. La creencia se actualiza, se guarda y, si el jefe sigue vivo, empieza otra ventana.

Cambiar de modo a media pelea descarta ese encuentro: no cuenta como evidencia.

## Límites que hay que decir en la presentación

- La banda 30–70 % es una decisión de diseño, no una medida de diversión.
- En el simulador el bandido no superó al mejor brazo fijo (ver `DIRECTOR.md`); en el juego real hay un solo jugador y pocos
  encuentros, así que la creencia casi no se mueve en una sesión corta.
- `damageTaken` que ve la política es el daño ya escalado por dificultad; los brazos del simulador se calibraron con el
  daño sin ese escalado, así que en dificultades altas el ritmo efectivo es más severo que el nominal.
- Nadie ha medido todavía con humanos reales; el panel sirve para la demostración y para recolectar esa evidencia.
