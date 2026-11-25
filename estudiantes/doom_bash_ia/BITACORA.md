# Bitácora

Una fila por entrada. La evidencia es un link (https://…) o un archivo de esta carpeta
(por ejemplo `evidencia/2026-11-20-prueba.png`). Sin evidencia, la fila no cuenta.
Lo que ya queda en GitHub (commits, PRs, issues) no hace falta copiarlo aquí.
No subas caras ni datos personales: el repo es público.

| fecha | login | qué hice | evidencia |
|---|---|---|---|
| 2026-11-24 | josemalfavaun | Simulador sin cabeza determinista del juego (misma semilla, misma partida) con bots de referencia y benchmark con intervalos de confianza | docs/SIMULADOR.md |
| 2026-11-24 | josemalfavaun | Navegación de enemigos con A* detrás de una interfaz opcional; benchmark de BFS, Dijkstra, voraz y A* en mapas reales y de persecución contra la regla original | docs/NAVEGACION.md |
| 2026-11-24 | josemalfavaun | Jefes con expectimax (objetivos de daño y de ritmo) detrás de una interfaz opcional; benchmark contra la regla original y contra políticas triviales, con resultado negativo documentado | docs/JEFE.md |
| 2026-11-24 | josemalfavaun | Director adaptativo con Thompson sampling sobre metas de presión del jefe; comparación contra epsilon-voraz, UCB1 y brazo fijo en 5 tipos de jugador simulados, con resultado mixto documentado | docs/DIRECTOR.md |
| 2026-11-24 | josemalfavaun | Fase 3: runtime de IA en el juego (teclas I/U/O, panel, ?ia=), persistencia del bandido y demo en línea en Vercel | docs/PANEL_IA.md |
| 2026-11-25 | josemalfavaun | README e informe con resultados honestos por módulo y límites; corregidos docs que decían que la IA no estaba conectada al juego | INFORME.md |
