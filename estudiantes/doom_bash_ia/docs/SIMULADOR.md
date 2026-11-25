# Simulador sin cabeza (M0)

El simulador corre el núcleo real del juego (enemigos, jefe, arma, daño, niveles) sin Phaser y sin navegador. Es la base de todo lo demás: sin él no se puede medir si una IA nueva es mejor que la regla anterior.

## Para qué sirve

- Comparar la IA nueva contra la regla original con muchas semillas y un intervalo de confianza, no con "se sintió mejor".
- Correr miles de partidas por minuto (un episodio de 90 s de juego tarda del orden de 50 ms).
- Probar de forma automática que un cambio no rompe el juego (misma semilla, mismo resultado).

## Qué reutiliza y qué no

Reutiliza sin copiar: `RaycastEnemySystem`, `RaycastBoss`, `RaycastCombatSystem`, `RaycastMovement`, `RaycastLevel`, `RaycastDifficulty`. El orden de actualización por paso imita el de `RaycastScene.update`: combate, movimiento del jugador, jefe, enemigos, proyectiles, daño escalado por dificultad.

No reutiliza `RaycastPlayerController` (importa Phaser), así que el movimiento del jugador está reescrito con las mismas funciones de física (`moveWithWallSlide`, `updateRaycastVelocity`).

## Simplificaciones declaradas

| Qué | Cómo se simula | Consecuencia |
|---|---|---|
| Puertas | Abiertas desde el inicio (opción `openDoors`) | Los enemigos pueden verte antes que en el juego |
| Director de oleadas, eventos de nivel, pickups, ráfagas de exploders | No existen | Los niveles son más fáciles que jugando de verdad |
| Jefe | Un solo jefe por nivel | Igual que en el nivel del jefe actual |
| Aleatoriedad del núcleo | `Math.random` se sustituye por un generador con semilla durante cada paso | Reproducible sin tocar el código del juego |

El simulador es un banco de pruebas, no una fuente de datos de jugadores: las decisiones de IA que dependan de comportamiento humano (M3) se evaluaron con bots de distinta habilidad, no con personas; no hay datos de jugadores reales.

## Opciones para estudiar la IA

- `navigatorFactory`: crea el navegador de enemigos (A*) una vez por episodio. Sin él, rige la regla original.
- `alertRefreshMs`: escenario de persecución. Cada tantos ms todos los enemigos se enteran de dónde está el jugador.
- `invulnerable`: el daño se registra pero la vida no baja; sirve para medir presión sostenida.
- Métricas de contacto en cada resultado: `firstDamageMs`, `enemiesArrived`, `meanArrivalMs`.
- `bossPolicyFactory`: crea la política del jefe (expectimax u otra) con la semilla del episodio. Sin ella, rige la regla original. Ver `docs/JEFE.md`.
- Métrica de jefe en cada resultado: `bossVolleys` (salvas lanzadas).
- `directorConfig`: activa el `GameDirector` real del juego con esa configuración (solo en niveles con director). Sin él no hay spawns. Métrica: `directorSpawns`. No incluye variantes élite ni patrones de encuentro.
- `enemyScaling`: `{ damage, speed }` aplicado a todos los enemigos al crearlos.
- `skilledBotFactory(habilidad)`: jugador guionado con puntería, giro y esquiva que mejoran con la habilidad. La observación incluye `projectiles` para que los bots puedan esquivar. Ver `docs/DIRECTOR.md`.

## Determinismo

`runEpisode` calcula un `digest` (FNV-1a sobre posiciones y vida cada 10 pasos). Dos corridas con la misma semilla, bot, nivel y dificultad dan el mismo resultado completo, digest incluido. Lo verifica `src/tests/ai-sim.test.ts`. Si cambias el núcleo del juego, los digests cambian y el CSV de `resultados/` debe regenerarse.

Origen de la variación, por si algún día se rompe: la posición inicial del jugador (semilla), las decisiones del bot (semilla propia por bot) y el merodeo de enemigos (`gameRng` del mundo).

## Bots de referencia

| Bot | Qué hace | Para qué sirve |
|---|---|---|
| quieto | No hace nada | Mide cuánto daño llega a un blanco inmóvil |
| aleatorio | Acciones al azar sostenidas 250 a 700 ms | Piso: si tu IA no le gana a esto, hay un error |
| guionado | Ruta BFS hacia el objetivo, apunta, se mueve de lado y mantiene distancia | Referencia principal: jugador mediocre pero coherente |

La ruta BFS del bot guionado es una herramienta del banco de pruebas, no parte de la IA entregable (la IA entregable es la de los enemigos y el jefe).

## Cómo correrlo

```bash
npm run bench:sim                  # 100 semillas, 2 niveles, 3 dificultades (varios minutos)
npm run bench:sim -- --seeds 30    # unos 20 s
npm run bench:sim -- --seeds 30 --level volt-archon-pit --difficulty hard
npx vitest run src/tests/ai-sim.test.ts
```

Para jefes: `npm run bench:boss` (ver `docs/JEFE.md`).

Salida: `resultados/bench-sim.csv` (una fila por episodio) y `resultados/bench-sim.md` (tabla con IC95).

## Lecturas honestas de la primera tabla (30 semillas)

- Nivel 1 (`access-node`): el bot guionado lo limpia el 100 % de las veces en unos 25 s con 1 a 2 de daño. Contra ese bot los enemigos casi no hacen daño, así que **el daño recibido no sirve para distinguir una navegación mejor de una peor**. Para M1 hay que medir otras cosas (tiempo hasta el primer contacto, longitud de ruta, rodeos) o usar un escenario más exigente.
- Nivel del jefe (`volt-archon-pit`): el guionado muere cerca del 95 % de las veces y deja al jefe en promedio con 60 % de vida. Aquí sí hay margen para que M2 haga diferencia.
- Dificultad: afecta poco al guionado en el nivel 1 y bastante al daño en el nivel del jefe.
