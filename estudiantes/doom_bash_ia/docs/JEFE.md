# Jefe con expectimax (M2)

## Qué problema resuelve

Los tres jefes (`volt-archon`, `bloom-warden`, `ash-judge`) eligen su siguiente salva con una regla escrita a mano (`pickBossVolleyKind`): una lista de candidatos por fase y un par de condiciones ("el jugador está quieto", "está en una esquina"). La regla no mira hacia adelante ni sabe cuánto daño lleva el jugador. Este módulo la sustituye, de forma opcional, por una búsqueda expectimax y mide qué cambia.

El juego sigue funcionando igual si no se inyecta ninguna política: `tickRaycastBossVolleys` recibe un quinto parámetro opcional (`RaycastBossPolicy`) y, si no hay política o devuelve `null`, usa la regla original.

## El árbol

```
V(s, d) = max_k  Σ_r  P(r | s) · [ recompensa(s, k, r) + γ · V(s', d − 1) ]
```

- Nodo MAX: el jefe elige un ataque `k`.
- Nodo de AZAR: el jugador responde con una de cinco maniobras `r` (quedarse quieto, esquivar a la izquierda, a la derecha, acercarse, alejarse). No es un dado del juego: es la incertidumbre sobre lo que hará el humano.
- Transición: se simulan las balas de la salva con la misma función que usa el juego (`fireBossVolleyKind`) y se calcula de forma analítica en qué instante entra cada bala en el cuerpo del jugador, que se mueve con velocidad constante. Las paredes solo se revisan para balas que de otro modo pegarían.
- `P(r | s)`: mezcla de persistencia (si ya se mueve de cierta manera, seguirá así) con un a priori calibrado a mano. Con `adaptive` se añaden conteos con olvido de lo observado.
- Memoización: las transiciones se guardan por (estado, respuesta) y los valores por (estado, déficit). Una decisión de profundidad 2 cuesta cerca de 1.3 ms.

## Dos objetivos

| Objetivo | Qué maximiza |
|---|---|
| `damage` | daño esperado acumulado (el jefe más duro posible) |
| `pacing` | cercanía del daño acumulado a una meta de `T` puntos por salva |

El segundo existe por lo que mostró el primero (ver abajo). Con `pacing`, la recompensa es menos la desviación cuadrática entre el daño acumulado y `T` por el número de salvas. Si el jugador va por debajo de la meta, la política busca ataques más duros; si va por encima, más suaves. Ese déficit es parte del estado, y por eso mirar más de una salva puede importar.

Hay también dos conjuntos de ataques candidatos: `rule` (los mismos que consideraría la regla original en ese momento) y `repertoire` (todo el repertorio de ese jefe).

## Resultados (40 semillas por celda, `npm run bench:boss -- --seeds 40`)

Tabla completa en `resultados/bench-boss.md`. Jugador invulnerable 45 s; "daño por salva" es el daño recibido entre salvas lanzadas. "Error de ritmo" es la distancia absoluta a la meta `T = 6` en cada episodio. Valores medios; los intervalos de confianza al 95 % están en la tabla completa.

| Jefe | Jugador | Regla original | Siempre `fan_wide` | Expectimax daño (prof. 1 y 3) | Expectimax ritmo, repertorio (prof. 2) |
|---|---|---|---|---|---|
| volt-archon | guionado | 2.1 (error 3.9) | 13.5 (8.0) | 10.5 (5.2) | 6.1 (1.9) |
| volt-archon | aleatorio | 3.4 (2.9) | 17.7 (12.0) | 12.0 (7.4) | 9.1 (4.5) |
| volt-archon | quieto | 17.1 (11.4) | 27.3 (21.4) | 28.1 (22.3) | 14.0 (8.6) |
| bloom-warden | guionado | 5.0 (2.4) | 14.2 (8.2) | 12.6 (6.7) | 6.2 (1.6) |
| bloom-warden | aleatorio | 5.2 (2.5) | 16.0 (10.3) | 15.0 (9.3) | 7.5 (3.0) |
| bloom-warden | quieto | 10.0 (7.9) | 41.3 (35.3) | 42.5 (36.5) | 6.5 (4.7) |
| ash-judge | guionado | 7.2 (2.8) | 17.6 (11.6) | 14.2 (8.2) | 6.0 (1.6) |
| ash-judge | aleatorio | 4.7 (2.6) | 15.1 (9.4) | 11.3 (6.2) | 5.5 (2.3) |
| ash-judge | quieto | 2.1 (4.1) | 38.4 (32.4) | 40.5 (34.5) | 3.6 (2.6) |

Cada celda: daño por salva (error de ritmo entre paréntesis).

## Lo que sí se puede afirmar

1. **El objetivo de daño es un resultado negativo.** Maximizar el daño esperado produce más presión que la regla original, pero no supera a la política trivial "siempre `fan_wide`", que no mira nada. La razón es estructural: la elección de ataque no tiene dependencia secuencial. El ataque de ahora no cambia dónde estará el jugador después (el modelo no lo hace reaccionar al ataque), así que cada salva es casi un problema independiente y el ataque con mayor daño esperado es casi siempre el mismo. Buscar más lejos no aporta información.
2. **La profundidad no importa con el objetivo de daño.** Las filas de profundidad 1 y 3 son idénticas en todas las celdas. Es consecuencia del punto anterior, no un error de implementación: con el objetivo de ritmo, donde el estado cambia entre salvas, la misma búsqueda sí produce decisiones distintas (prueba `ritmo: con déficit alto elige más daño que con déficit negativo`).
3. **Con el objetivo de ritmo la profundidad sí es una decisión con sentido** (el déficit acumulado es parte del estado), aunque en las tablas profundidades 1, 2 y 3 quedan dentro del mismo intervalo de confianza en casi todas las celdas. No se debe decir que más profundidad mejora el resultado; lo único medido es que no empeora y cuesta poco.
4. **El ritmo reduce el error contra la meta en la mayoría de las celdas con jugador guionado y con jugador quieto.** Con el guionado, el error baja de 2.4–3.9 a 1.5–1.9 en los tres jefes. Con el quieto, baja en los tres jefes (por ejemplo 11.4 a 8.6 en volt-archon y 7.9 a 4.7 en bloom-warden).
5. **Con el jugador aleatorio el ritmo no mejora la regla original** en volt-archon (error 4.5 contra 2.9) ni en bloom-warden (3.0 contra 2.5); solo mejora en ash-judge (2.3 contra 2.6, dentro del margen). El modelo de respuesta del jugador es peor cuando este no persiste en ninguna maniobra, y se nota.
6. **Con los mismos ataques que la regla, el ritmo casi no cambia nada** (las filas "mismos ataques" son idénticas a la regla salvo en ash-judge con jugador guionado, 2.8 a 1.9). La ganancia viene de poder elegir entre más ataques, no de elegir mejor entre los de siempre.

## Limitaciones que hay que decir en la exposición

- **El suelo del efecto.** Con un jugador completamente quieto en `volt-archon`, ni el ataque más débil baja el daño a la meta: la política no puede dar menos presión que la mínima del repertorio. El ritmo se acerca a la meta, no la alcanza.
- **La meta `T = 6` es un parámetro de diseño, no un hecho.** La regla original, con el bot guionado, hace en `volt-archon` solo 2.1 por salva; la política de ritmo sube eso a 6 y la supervivencia media del bot baja de unos 73 s a unos 39 s. Eso no es "mejor": es un jefe más duro porque se pidió una meta más alta. Elegir `T` es una decisión de balance que debería salir de jugadores reales.
- **Los jugadores del simulador no son humanos.** El guionado, el aleatorio y el quieto son bots de referencia. Ningún bot derrota al jefe salvo `ash-judge` con el guionado en alrededor de 3–8 % de los episodios, así que las columnas de victoria casi no discriminan. Las conclusiones sobre ritmo valen para esos tres perfiles y no se pueden extrapolar a personas sin probar con personas.
- **El modelo del jugador está calibrado a mano** (`PRIOR`, `PERSIST_MASS`, `dodgeSpeed = 6.5`) contra el mismo simulador. Hay circularidad: el modelo y el banco de pruebas comparten supuestos de movimiento. La variante `adaptive` (conteos con olvido) está implementada y probada, pero no mostró ganancia medible, así que no se recomienda activarla.
- **Solo se midió en el simulador.** La política está conectada a `RaycastScene` a través de `AiRuntime` (tecla `O` o `?ia=expectimax`; ver `docs/PANEL_IA.md`), pero el modo "expectimax" del panel usa una meta fija de 4 puntos por salva y no se midió con personas.

## Pruebas

`src/tests/ai-expectimax.test.ts` (18 pruebas): velocidades de las respuestas, clasificación de movimiento, que un jugador quieto recibe más impactos de un abanico, daño acotado, determinismo de la decisión, que con repertorio completo el ataque elegido es el de mayor valor, cota de evaluaciones, comportamiento del déficit, aprendizaje adaptativo, enganche con `tickRaycastBossVolleys` (con política, con `null` y sin política) y determinismo del episodio completo con política.

## Cómo reproducirlo

```bash
npm run bench:boss -- --seeds 40     # varios minutos
npm run bench:boss -- --seeds 10     # prueba rápida
```

Salida: `resultados/bench-boss.csv` (una fila por episodio) y `resultados/bench-boss.md`.
