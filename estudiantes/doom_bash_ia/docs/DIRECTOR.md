# Director adaptativo con bandido (M3)

## Qué problema resuelve

El juego fija su reto con números puestos a mano: cuántos enemigos, con qué ritmo, qué tan duro pega el jefe. Un jugador
torpe y uno hábil reciben lo mismo. La idea de M3 es que el juego pruebe niveles de reto distintos con cada jugador y
aprenda cuál lo deja en una zona de reto adecuada. Ese es un problema de bandidos de varios brazos: hay varias opciones,
cada intento da una recompensa ruidosa y hay que repartir los intentos entre explorar y quedarse con lo que funciona.

## Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Brazos | `src/ai/bandit/arms.ts` | Nueve metas de presión para la política de ritmo del jefe (M2): 1, 1.5, 2, 3, 4, 5, 6, 8 y 12 puntos de daño por salva |
| Recompensa | `src/ai/bandit/reward.ts` | 1 si el jugador sigue vivo y termina el encuentro con entre 30 % y 70 % de vida; 0 en otro caso |
| Selectores | `src/ai/bandit/policies.ts` | Thompson sampling con Beta, y referencias: epsilon-voraz, UCB1, brazo fijo y azar uniforme |
| Entorno | `src/ai/bandit/table.ts` | Tabla de desenlaces del simulador por jugador, brazo y semilla |
| Sesiones | `src/ai/bandit/session.ts` | Un jugador juega encuentros seguidos; cada uno queda como registro de telemetría |
| Jugadores | `src/ai/sim/bots.ts` | `skilledBotFactory(habilidad)`: apunta, esquiva y retrocede mejor o peor según un parámetro en [0, 1] |

## Thompson sampling

Cada brazo tiene una creencia sobre su probabilidad de acertar la banda, una Beta(α, β) que arranca en Beta(1, 1)
(no sé nada). Para elegir, se saca una muestra de cada creencia y se juega el brazo con la muestra más alta. Tras el
encuentro, un acierto suma 1 a α del brazo jugado y un fallo suma 1 a β. Un brazo del que se sabe poco tiene una
creencia ancha y a veces saca una muestra alta, y así se explora solo; uno bueno y conocido gana la mayoría de las veces.
No hay un parámetro de exploración que afinar.

Dos variantes implementadas y medidas: **olvido** (cada actualización multiplica la evidencia acumulada por un factor
menor a 1, para seguir a un jugador que cambia) y **prior poblacional** (cada brazo arranca con lo que se vio en otros
jugadores, con el peso de 4 observaciones).

## La recompensa: la parte que hay que defender

"Que el encuentro termine con entre 30 % y 70 % de vida" es una definición de reto adecuado: ni un paseo ni una muerte.
No es monótona en la presión. Más presión no siempre es mejor ni peor, y por eso un jugador quieto y uno hábil tienen
brazos óptimos distintos (tabla de abajo). Los límites 30 % y 70 % son una decisión de diseño, no un hecho. Cambiarlos
mueve qué brazo es el mejor. Con una persona real habría que validarlos con encuesta o con datos de abandono.

## Por qué los brazos son metas de presión del jefe y no el director de spawns

La primera versión eran las perillas del director de spawns del juego (tope de enemigos vivos y ritmo de aparición).
Se integró el `GameDirector` real al simulador y se midió (`npm run bench:director-knobs`,
`resultados/bench-director-perillas.md`). **No mueven la vida del jugador**: con el tope ×1 o ×2.5 y los cooldowns en
×1, ×0.4 o ×0.15, la vida final y las apariciones salen idénticas o dentro del margen (92 ± 7 contra 97 ± 4 para el
jugador torpe; las columnas de tope ×1 y ×2.5 coinciden exactamente). Leyendo el código de `GameDirector.canSpawn`, la
causa es que el director solo hace aparecer enemigos en sus estados de presión y emboscada, y pausa en calma,
vigilancia, aviso y recuperación. Los tiempos de esos estados mandan, y las perillas probadas no los tocan. Escalar el
daño de los enemigos al ×4 sí baja la vida (77 ± 20 para el hábil), pero con intervalos amplios. Dos palancas quedan sin
probar: las duraciones de los estados del director y los encuentros por zona (`triggers`), que el simulador no ejecuta.

La meta de ritmo del jefe sí mueve la vida de forma clara, así que M3 se apoya en M2.

## Entorno de evaluación

Los jugadores son cinco bots del simulador: quieto, aleatorio y tres con habilidad 0.2, 0.5 y 0.9. El encuentro es un
duelo de 40 s contra `ash-judge-seal`. Cada episodio depende solo de (jugador, brazo, semilla), así que se simularon
una vez los 5 × 9 × 80 = 3600 episodios (más 400 de la regla original) y las sesiones sacan resultados de esa tabla
(`resultados/director-tabla.json`). El entorno del bandido es la distribución empírica del simulador, exacta para la
tabla. Con 80 semillas por celda, cada probabilidad de la tabla tiene un error de muestreo de unos ± 0.10, y no se
puede distinguir entre brazos de probabilidad parecida.

### Probabilidad de caer en la banda

| Jugador | Regla original | ritmo-1 | ritmo-1.5 | ritmo-2 | ritmo-3 | ritmo-4 | ritmo-5 | ritmo-6 | ritmo-8 | ritmo-12 | Mejor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| quieto | 0.30 | 0.05 | 0.05 | 0.34 | 0.38 | 0.57 | 0.59 | 0.61 | 0.49 | 0.00 | ritmo-6 |
| aleatorio | 0.20 | 0.31 | 0.34 | 0.34 | 0.26 | 0.25 | 0.30 | 0.31 | 0.14 | 0.09 | ritmo-1.5 |
| habilidad 0.2 | 0.31 | 0.26 | 0.28 | 0.25 | 0.19 | 0.26 | 0.10 | 0.14 | 0.07 | 0.03 | ritmo-1.5 |
| habilidad 0.5 | 0.15 | 0.38 | 0.39 | 0.33 | 0.28 | 0.31 | 0.15 | 0.10 | 0.03 | 0.01 | ritmo-1.5 |
| habilidad 0.9 | 0.15 | 0.45 | 0.49 | 0.45 | 0.41 | 0.36 | 0.20 | 0.13 | 0.01 | 0.05 | ritmo-1.5 |

Promedios sobre jugadores: regla original 0.22; mejor brazo único (ritmo-4) 0.35; mejor brazo para cada jugador
(oráculo) 0.42. El jugador quieto necesita más presión (ritmo 4 a 8) y los que se mueven necesitan menos (1 a 3).

## Resultados de las sesiones (80 encuentros, 300 réplicas)

Fracción de encuentros en banda en los **últimos 20**, promedio sobre los cinco jugadores. Los intervalos de confianza
por celda, en `resultados/bench-director.md`, son de ± 0.01.

| Selector | En banda |
|---|---|
| Regla original (sin bandido) | 0.22 |
| Azar uniforme | 0.25 |
| UCB1 | 0.31 |
| Thompson con olvido 0.95 | 0.30 |
| Thompson | 0.34 |
| Thompson con prior poblacional | 0.35 |
| Brazo fijo ritmo-4 (elegido sabiendo la tabla) | 0.35 |
| Epsilon-voraz 0.1 | 0.37 |
| Oráculo (el mejor brazo de cada jugador) | 0.42 |

Con un jugador que cambia de estilo a mitad de sesión (de quieto a habilidad 0.9, donde el mejor brazo pasa de
ritmo-6 a ritmo-1.5), todos los selectores adaptativos bajan a 0.27 a 0.32 después del cambio y el brazo fijo ritmo-4
queda en 0.36. El olvido no ayudó de forma apreciable (0.31 contra 0.30 de Thompson sin olvido).

## Lo que sí se puede afirmar

1. **Cualquier bandido le gana a la regla original y al azar.** Thompson llega a 0.34 contra 0.22 de la regla original.
   La regla del jefe de hoy deja a los jugadores en la banda solo el 22 % de las veces; la política de ritmo con un
   brazo fijo (ritmo-4, escogido con la tabla a la vista) pasa de 0.22 a 0.35. Esa ganancia es principalmente de M2.
2. **Los selectores aprenden dentro de la sesión.** En casi todos los jugadores la fracción en banda sube de los primeros 20
   a los últimos 20 encuentros (por ejemplo 0.32 a 0.40 con habilidad 0.9), y el arrepentimiento acumulado es menor que el
   del azar uniforme (9.8 contra 16.3 en ese jugador).
3. **El bandido no necesita saber cuál es el brazo bueno.** Alcanza prácticamente el rendimiento de un brazo fijo
   (0.34 contra 0.35), que solo se conoce después de haber medido toda la tabla.

## Lo que no se puede afirmar

- **Thompson no le gana a un brazo fijo bien escogido ni a epsilon-voraz** en sesiones de 80 encuentros. El brazo fijo
  se eligió con información que un diseñador no tiene de antemano, y entre nueve brazos de probabilidades cercanas la
  exploración cuesta. Epsilon-voraz queda 0.03 arriba de Thompson, y eso supera el margen de error. No hay una razón
  teórica para que Thompson gane en un horizonte tan corto con diferencias tan pequeñas.
- **La personalización tiene un techo bajo en este entorno.** El oráculo por jugador es 0.42 y el mejor brazo único
  0.35. Lo máximo que podía ganar el bandido por adaptarse a cada jugador es 0.07, y en 80 encuentros recupera poco.
- **Con un jugador que cambia, el bandido recupera mal.** Después del cambio queda por debajo del brazo fijo.
- **Los jugadores son bots.** Las conclusiones valen para esos cinco perfiles. Ni siquiera hay certeza de que "habilidad"
  del simulador ordene a los jugadores como lo haría una persona. Falta validar con personas.
- **Un jugador real probablemente juegue pocas decenas de encuentros** (es una suposición, no un dato). Con 9 brazos y
  sesiones de 10 o 20 encuentros, el bandido casi no aprende. Para el juego real conviene el prior poblacional y pocos brazos.

## En el juego

La integración está hecha (`src/ai/runtime/AiRuntime.ts`, ver `docs/PANEL_IA.md`): el bandido elige un brazo cuando
aparece el jefe, cierra el encuentro a los 40 s, si el jugador muere o si el jefe cae, calcula la recompensa con la
vida final, guarda su creencia en el almacenamiento del navegador y empieza otra ventana. El panel muestra el brazo en
juego, la ventana y las creencias. Se activa con la tecla `O` o con `?ia=bandido`.

No está verificado en una partida larga con cierre de encuentro y guardado en el navegador (solo con pruebas unitarias),
y no hay datos de personas. El registro de telemetría con brazo y recompensa que usa el simulador (`telemetryCsv`) no se
exporta desde el juego.

## Cómo reproducirlo

```bash
npm run bench:director               # usa resultados/director-tabla.json si existe
npm run bench:director -- --rebuild  # vuelve a simular la tabla (poco más de un minuto)
npm run bench:director-knobs         # el resultado negativo del director de spawns (unos 20 s)
npx vitest run src/tests/ai-bandit.test.ts
```
