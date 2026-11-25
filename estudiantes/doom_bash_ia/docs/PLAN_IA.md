# Plan de IA: DOOM BIN BASH

Este documento es la base de la propuesta para el profesor y la guía de trabajo del proyecto.
Dice qué IA tiene hoy el juego, qué se agrega, con qué unidad del curso se conecta cada pieza,
cómo se mide y en qué orden se construye. Lo marcado como "confirmar" depende del temario y de
lo que el profesor autorice.

> **Estado al 25 de noviembre de 2026.** Hechos: M0, M1, M2, M3 y el panel de IA en el juego. No se hicieron: M4 (bot
> con Q-learning), M5 (narrador con estado estructurado), MCTS con UCT, la coordinación por anillo de aproximación y el
> dibujo de rutas de A\* en el juego. Resultados, cifras y límites en [`INFORME.md`](../INFORME.md). Lo que sigue es el
> plan original, sin reescribir.

## 1. Punto de partida: qué es heredado y qué es nuevo

El juego base viene de un proyecto de equipo de años anteriores (créditos en `LICENSE`). Lo que
ya trae, y por tanto no cuenta como aporte de este proyecto:

- `EnemyFSM`: tres estados (aparecer, perseguir, atacar) con un umbral de distancia.
- `RaycastEnemyTactics`: perfiles fijos por tipo de enemigo (distancia ideal, peso de rodeo, separación).
- `GameDirector`: máquina de ritmo con reglas (calma, presión, emboscada, recuperación).
- `RaycastBossAI`: reglas para elegir ataques del jefe según banderas (jugador quieto, huyendo, acorralado).
- Narrador con Ollama (`server/src/gameMaster.ts`), con respuesta de respaldo si falla.

Todo eso es "IA de videojuego" clásica: reglas y números puestos a mano. El aporte del proyecto
final es reemplazar o complementar cada pieza con un algoritmo de IA del curso, y demostrar con
medición que funciona mejor o distinto. Conviene decirlo así de claro en la presentación.

Dato técnico que hace viable el plan: las piezas de lógica (`RaycastBossAI`, `RaycastEnemyTactics`,
`RaycastEnemySystem`, `GameDirector`, `RaycastMap`) no importan Phaser, y el servidor co-op ya
importa `updateRaycastEnemies` del cliente. Por eso se puede simular partidas sin navegador, y la
IA nueva puede vivir en un solo lugar que usen el modo solo y el co-op.

## 2. La idea que une todo: un banco de pruebas sin navegador (M0)

Sin medición, "enemigos más inteligentes" es una opinión. El primer entregable es un simulador
que corre partidas completas en Node, a mucha velocidad, con un bot como jugador. Con él se puede:

- comparar la IA vieja contra la nueva en cientos de partidas con la misma semilla;
- entrenar al bot y al director sin abrir el juego;
- generar las tablas y gráficas de la presentación.

Es también lo que vuelve el proyecto "completo de punta a punta": hay algoritmo, hay experimento
y hay resultado.

## 3. Módulos

| Módulo | Qué entra | Unidad del curso | Cómo se mide |
|---|---|---|---|
| M0 Banco de pruebas | Simulador headless, semillas, bots de referencia (azar y guionado), registro de métricas | Simular partidas (Monte Carlo plano) | Partidas por segundo, reproducibilidad con semilla |
| M1 Enemigos | A* sobre el mapa de tiles, replanificación, coordinación para flanquear | Búsqueda (confirmar nombre de la unidad) | Tiempo hasta alcanzar al jugador, enemigos atorados, nodos expandidos por plan |
| M2 Jefe | Expectimax o MCTS con UCT sobre sus ataques, con nodos de azar | Juegos adversariales, "Cuando decide un dado", "MCTS con UCT" | Tasa de victoria y daño por segundo contra el jefe con reglas, en duelos simulados |
| M3 Director adaptativo | Bandido (Thompson sampling) sobre configuraciones de director; opcional MDP | Markov / agentes | Qué tan seguido el jugador termina en la banda de reto objetivo |
| M4 Bot que aprende | Q-learning jerárquico sobre acciones de alto nivel | Markov y aprendizaje por refuerzo | Curva de aprendizaje, tasa de nivel completado frente a los bots de referencia |
| M5 Narrador | Prompt con estado estructurado del juego, validación de la salida, métricas | Aplicación de LLM (heredado, mejorado) | Latencia, tasa de respaldo, fidelidad a los hechos del evento |

### M1. Enemigos con A* y coordinación

Hoy los enemigos van hacia el jugador con dirección directa y esquivan paredes con una heurística
de rumbo abierto (`pickOpenRoamHeadingToward`). Se reemplaza por:

1. A* en la rejilla de `RaycastMap` con vecindad de 8 casillas y distancia octil como heurística.
2. Replanificación solo cuando el jugador cambia de casilla o el camino queda bloqueado, para no
   gastar CPU por cuadro. Suavizado del camino con línea de vista.
3. Coordinación: cada enemigo recibe una casilla de aproximación distinta en un anillo alrededor
   del jugador, asignada por costo mínimo (voraz primero; húngaro si hace falta). Eso produce
   flanqueo sin que los enemigos se hablen entre sí.

Se conservan los perfiles por tipo (el RANGED mantiene distancia, el BRUTE embiste): el A* decide
por dónde ir, el perfil decide a qué distancia detenerse.

### M2. Jefe que decide simulando

El jefe elige hoy entre 11 tipos de ataque y 4 modos de movimiento con reglas. Se modela un duelo
abstracto jefe contra jugador:

- Estado: vida de ambos, distancia, fase, enfriamientos.
- Acciones del jefe: tipo de ataque y modo de movimiento (unas 44 combinaciones).
- Nodos de azar: la reacción del jugador (modelada como distribución según las banderas que el
  jefe ya detecta: quieto, huyendo, acorralado) y si el ataque conecta.
- Evaluación: diferencia de vida ponderada, con corte a profundidad fija.

Se implementa primero expectimax de profundidad 2 o 3 y después MCTS con UCT como comparación. El
presupuesto de decisión por cuadro es pequeño, así que decidir cada cierto intervalo es parte del
diseño y de la explicación ("hasta dónde mirar").

### M3. Director que aprende cuánto reto dar

`GameDirectorInput` ya es un vector de estado (vida, enemigos vivos, tiempo desde el último daño,
jugador quieto). El director actual lo usa con reglas. El cambio:

- Brazos del bandido: 8 a 12 configuraciones discretas (cooldown de aparición, máximo de enemigos
  vivos, patrón de encuentro).
- Recompensa: que el encuentro termine dentro de una banda de reto objetivo (por ejemplo, el
  jugador acaba entre 30 % y 70 % de vida y dentro de un rango de tiempo). Definir esta recompensa
  es la parte intelectual del módulo y la que hay que defender.
- Thompson sampling con distribuciones Beta, con contexto simple (nivel de habilidad estimado).
- Panel de depuración visible en el juego con las creencias del bandido, para la demo.

El MDP completo (estado discretizado, acciones de aparecer o esperar, aprendizaje en simulación)
queda como extensión.

### M4. Bot que aprende a jugar

Un Q-learning tabular directo sobre un FPS con control continuo no aprende bien. El diseño honesto
es jerárquico:

- Acciones de alto nivel: ir a la llave, ir a la salida, combatir al más cercano, retirarse a
  curarse, recoger objeto.
- Nivel bajo guionado: usa el A* de M1 para moverse y apunta con reglas.
- Estado discretizado: vida (3 niveles), enemigos cercanos (3), munición (2), tiene llave (2),
  distancia al objetivo (3). Unos 100 estados por 5 acciones: cabe en una tabla.
- Recompensa moldeada: avance y bajas suman, daño recibido y tiempo restan.

El bot cumple dos funciones: instrumento de medición para M2 y M3, y modo "mira cómo juega la IA"
en la demo. La tabla entrenada pesa unos pocos KB y puede ir en el repositorio.

### M5. Narrador con estado estructurado

El narrador ya existe. Lo que se agrega es rigor:

- El prompt recibe un resumen estructurado del momento (fase del jefe, estado del director,
  estilo del jugador si hay modelo) en vez de texto suelto.
- La salida se valida: longitud, idioma, y que solo mencione hechos presentes en el evento. Si no
  pasa, se usa el respaldo.
- Se mide latencia (mediana y percentil 95), tasa de respaldo y fidelidad a los hechos.

En la demo en línea el narrador usa las líneas de respaldo, salvo que se hospede el servidor del
Game Master; hay que decidirlo con el profesor.

## 4. Más ideas de IA, con recomendación

| Idea | Qué es | Conexión con el curso | Recomendación |
|---|---|---|---|
| A. Benchmark de búsqueda | Comparar BFS, Dijkstra, A* y voraz en los 13 mapas reales: nodos expandidos, tiempo, longitud del camino | Búsqueda; el profesor menciona benchmarks como tema válido | Sí, casi gratis una vez hecho M1 |
| B. Ajuste automático de parámetros | Recocido simulado o estrategia evolutiva sobre los perfiles tácticos (8 números por tipo de enemigo), con el bot como función de aptitud | Optimización (confirmar unidad) | Sí, es el mejor uso del banco de pruebas |
| C. Modelo del jugador | Inferir el estilo (agresivo, cauteloso, quedado) con Bayes o un HMM sencillo a partir de las banderas que ya existen | Markov | Si alcanza el tiempo; alimenta a M2 y M3 |
| D. Memoria de enemigos con filtro bayesiano | Creencia probabilística sobre dónde está el jugador tras perderlo de vista, con mapa de calor en el overlay | Probabilidad / filtrado | Si alcanza; muy visual en la demo |
| E. Niveles generados | Generar mapas y validar que se puedan resolver con A* y llaves | Búsqueda y optimización | Dejar fuera: pide arte y diseño nuevo |
| F. Árboles de comportamiento o GOAP | Alternativa a la máquina de estados | Poco ligado al curso | Dejar fuera |

## 5. Alcance recomendado y orden

Todo lo anterior junto es demasiado para el tiempo que queda antes del examen final, y más con
el resto de las materias en fin de semestre. Propongo separar un núcleo, que garantiza un proyecto
completo, de extensiones que se recortan sin dolor. Si el examen es en pocas semanas, el núcleo
real se reduce a M0, M1 y un solo módulo más (M2 o M3), con el resto como trabajo futuro.

Núcleo, en este orden porque cada pieza depende de la anterior:

1. M0 banco de pruebas y bots de referencia.
2. M1 enemigos con A*, con el benchmark A incluido.
3. M2 jefe con expectimax, y MCTS si hay tiempo.
4. M3 director con bandido.
5. M4 bot con Q-learning, que es lo primero que se recorta si falta tiempo: M2 y M3 se pueden
   medir con el bot guionado.

Extensiones, en este orden de prioridad: M5 mejorado, B ajuste de parámetros, D filtro bayesiano,
C modelo del jugador.

Cada módulo se da por terminado cuando cumple tres cosas: está en el juego, tiene pruebas
unitarias, y tiene una tabla o gráfica comparada contra la versión anterior.

## 6. Riesgos y decisiones abiertas

- Fecha del examen final: no la conozco y es lo que más pesa en el alcance. Hay que hablar con el
  profesor cuanto antes, porque la propuesta debe estar aceptada antes de empezar.
- Simulador (M0): hay que comprobar con un prototipo pequeño que el bucle de juego se pueda correr
  sin Phaser. La estructura del código lo hace probable, pero es la primera cosa a verificar.
- Modo co-op: la IA debe correr en el servidor (autoritativo, 20 Hz). El código nuevo de IA se
  escribe en módulos puros compartidos para que lo usen cliente y servidor. Si el co-op estorba,
  se puede dejar sin la IA nueva y decirlo.
- Presupuesto de CPU: A*, expectimax y MCTS corren dentro del cuadro; hay que medir y limitar.
- Demo en línea: el videojuego debe estar accesible en la web. El cliente es estático y se puede
  hospedar gratis; el Game Master y el co-op necesitan un servidor y es opcional.
- Tamaño: la carpeta pesa 26 MB y el tope es 50 MB. Las texturas ya se redujeron a 768 px.

## 7. Qué preguntarle al profesor

1. ¿Un juego existente con IA nueva cuenta como proyecto propio, si se declara con claridad qué es
   heredado y qué es nuevo y se mide la diferencia?
2. ¿Este núcleo (búsqueda, juegos adversariales, bandido y refuerzo) es suficiente y relevante
   para la clase, o prefiere recortar a un subconjunto?
3. ¿El proyecto es de una persona o de dos?
4. ¿La demo puede ser solo el cliente web, con el narrador en respaldo?

## 8. Cómo se cuenta en 8 a 12 minutos

Sigue el orden que pide el profesor:

1. Qué es (1 min): FPS cuyos enemigos, jefe y director dejaron de ser reglas fijas.
2. Cómo funciona (2 a 3 min): diagrama de los módulos y del banco de pruebas.
3. Lo difícil (1 a 2 min): definir la recompensa del director, el modelo abstracto del duelo con
   el jefe, y que todo corra dentro del presupuesto de cuadro.
4. Demo (3 a 4 min): enemigos flanqueando con el overlay de rutas, el jefe contra el bot, el panel
   del director aprendiendo.
5. El proceso (1 a 2 min): las gráficas del banco de pruebas, antes contra después.

## 9. Reglas de trabajo

- Cada integrante hace sus commits con su propia cuenta de GitHub. Esa es la evidencia principal.
- La `BITACORA.md` es para lo que no deja commits (entrenamientos largos, pruebas, decisiones de
  diseño), con enlace o archivo como evidencia.
- Cada algoritmo se tiene que poder explicar sin código en pantalla: qué problema resuelve, por
  qué se eligió y qué mostró la medición. El profesor pide que no sea trabajo hecho a la carrera.
- Datos, modelos grandes y llaves no se suben (`datos/`, `modelos/` y `.env` están ignorados).
