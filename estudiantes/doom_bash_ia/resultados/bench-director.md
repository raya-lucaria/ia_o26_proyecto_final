# Benchmark del director adaptativo (M3)

Nivel ash-judge-seal, ventana de 40 s. Recompensa 1 si el jugador sigue vivo y termina con entre 30 % y 70 % de vida. Tabla de 80 semillas por celda (jugador × brazo). Sesiones de 80 encuentros, 300 réplicas por celda.

## 1. Probabilidad de caer en la banda, por jugador y brazo

| Jugador | Regla original | ritmo-1 | ritmo-1.5 | ritmo-2 | ritmo-3 | ritmo-4 | ritmo-5 | ritmo-6 | ritmo-8 | ritmo-12 | Mejor brazo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| quieto | 0.30 | 0.05 | 0.05 | 0.34 | 0.38 | 0.57 | 0.59 | 0.61 | 0.49 | 0.00 | ritmo-6 (0.61) |
| aleatorio | 0.20 | 0.31 | 0.34 | 0.34 | 0.26 | 0.25 | 0.30 | 0.31 | 0.14 | 0.09 | ritmo-1.5 (0.34) |
| habilidad 0.2 | 0.31 | 0.26 | 0.28 | 0.25 | 0.19 | 0.26 | 0.10 | 0.14 | 0.07 | 0.03 | ritmo-1.5 (0.28) |
| habilidad 0.5 | 0.15 | 0.38 | 0.39 | 0.33 | 0.28 | 0.31 | 0.15 | 0.10 | 0.03 | 0.01 | ritmo-1.5 (0.39) |
| habilidad 0.9 | 0.15 | 0.45 | 0.49 | 0.45 | 0.41 | 0.36 | 0.20 | 0.13 | 0.01 | 0.05 | ritmo-1.5 (0.49) |

Promedio sobre jugadores: regla original 0.22; mejor brazo único (ritmo-4) 0.35; mejor brazo para cada jugador (oráculo) 0.42.

## 2. Sesiones: ¿cuánto tarda cada selector en acertar la banda?

"En banda" es la fracción de encuentros con recompensa 1. "Arrepentimiento" es la suma, a lo largo de la sesión, de lo que se pierde (en probabilidad de acertar) por no elegir el mejor brazo de ese jugador; menos es mejor. "En el mejor" es la fracción de los últimos 20 encuentros que usaron el mejor brazo.

| Jugador | Selector | En banda (sesión) | Primeros 20 | Últimos 20 | Arrepentimiento | En el mejor (últimos 20) |
|---|---|---|---|---|---|---|
| quieto | Thompson | 0.47 ± 0.01 | 0.41 ± 0.01 | 0.51 ± 0.01 | 11.0 ± 0.3 | 0.28 ± 0.03 |
| quieto | Thompson, prior poblacional | 0.46 ± 0.01 | 0.37 ± 0.01 | 0.52 ± 0.01 | 11.9 ± 0.3 | 0.27 ± 0.03 |
| quieto | Thompson, olvido 0.95 | 0.42 ± 0.01 | 0.39 ± 0.01 | 0.43 ± 0.01 | 14.7 ± 0.2 | 0.18 ± 0.01 |
| quieto | epsilon-voraz 0.1 | 0.51 ± 0.01 | 0.43 ± 0.01 | 0.54 ± 0.01 | 8.0 ± 0.4 | 0.30 ± 0.05 |
| quieto | UCB1 | 0.43 ± 0.01 | 0.38 ± 0.01 | 0.46 ± 0.01 | 14.8 ± 0.1 | 0.19 ± 0.01 |
| quieto | fijo: ritmo-4 | 0.57 ± 0.01 | 0.57 ± 0.01 | 0.57 ± 0.01 | 3.0 ± 0.0 | 0.00 ± 0.00 |
| quieto | azar uniforme | 0.34 ± 0.01 | 0.34 ± 0.01 | 0.34 ± 0.01 | 21.7 ± 0.3 | 0.12 ± 0.01 |
| aleatorio | Thompson | 0.28 ± 0.01 | 0.27 ± 0.01 | 0.28 ± 0.01 | 4.7 ± 0.1 | 0.16 ± 0.02 |
| aleatorio | Thompson, prior poblacional | 0.29 ± 0.01 | 0.29 ± 0.01 | 0.30 ± 0.01 | 3.7 ± 0.1 | 0.17 ± 0.02 |
| aleatorio | Thompson, olvido 0.95 | 0.27 ± 0.01 | 0.26 ± 0.01 | 0.27 ± 0.01 | 5.4 ± 0.1 | 0.14 ± 0.01 |
| aleatorio | epsilon-voraz 0.1 | 0.30 ± 0.01 | 0.29 ± 0.01 | 0.30 ± 0.01 | 3.3 ± 0.2 | 0.20 ± 0.04 |
| aleatorio | UCB1 | 0.28 ± 0.01 | 0.27 ± 0.01 | 0.28 ± 0.01 | 5.3 ± 0.0 | 0.13 ± 0.01 |
| aleatorio | fijo: ritmo-4 | 0.25 ± 0.01 | 0.25 ± 0.01 | 0.24 ± 0.01 | 7.0 ± 0.0 | 0.00 ± 0.00 |
| aleatorio | azar uniforme | 0.26 ± 0.01 | 0.26 ± 0.01 | 0.25 ± 0.01 | 6.2 ± 0.1 | 0.11 ± 0.01 |
| habilidad 0.2 | Thompson | 0.20 ± 0.01 | 0.18 ± 0.01 | 0.21 ± 0.01 | 6.1 ± 0.1 | 0.15 ± 0.01 |
| habilidad 0.2 | Thompson, prior poblacional | 0.21 ± 0.01 | 0.21 ± 0.01 | 0.21 ± 0.01 | 5.2 ± 0.1 | 0.18 ± 0.02 |
| habilidad 0.2 | Thompson, olvido 0.95 | 0.19 ± 0.00 | 0.18 ± 0.01 | 0.19 ± 0.01 | 7.0 ± 0.1 | 0.13 ± 0.01 |
| habilidad 0.2 | epsilon-voraz 0.1 | 0.23 ± 0.01 | 0.20 ± 0.01 | 0.24 ± 0.01 | 3.7 ± 0.3 | 0.23 ± 0.04 |
| habilidad 0.2 | UCB1 | 0.19 ± 0.01 | 0.18 ± 0.01 | 0.19 ± 0.01 | 6.9 ± 0.1 | 0.14 ± 0.01 |
| habilidad 0.2 | fijo: ritmo-4 | 0.26 ± 0.01 | 0.26 ± 0.01 | 0.26 ± 0.01 | 1.0 ± 0.0 | 0.00 ± 0.00 |
| habilidad 0.2 | azar uniforme | 0.18 ± 0.01 | 0.18 ± 0.01 | 0.17 ± 0.01 | 8.0 ± 0.1 | 0.11 ± 0.01 |
| habilidad 0.5 | Thompson | 0.28 ± 0.01 | 0.24 ± 0.01 | 0.30 ± 0.01 | 9.1 ± 0.1 | 0.21 ± 0.02 |
| habilidad 0.5 | Thompson, prior poblacional | 0.29 ± 0.01 | 0.27 ± 0.01 | 0.31 ± 0.01 | 8.2 ± 0.1 | 0.21 ± 0.02 |
| habilidad 0.5 | Thompson, olvido 0.95 | 0.25 ± 0.01 | 0.24 ± 0.01 | 0.26 ± 0.01 | 11.1 ± 0.1 | 0.14 ± 0.01 |
| habilidad 0.5 | epsilon-voraz 0.1 | 0.32 ± 0.01 | 0.28 ± 0.01 | 0.34 ± 0.01 | 5.9 ± 0.4 | 0.27 ± 0.04 |
| habilidad 0.5 | UCB1 | 0.26 ± 0.01 | 0.24 ± 0.01 | 0.26 ± 0.01 | 10.9 ± 0.1 | 0.16 ± 0.01 |
| habilidad 0.5 | fijo: ritmo-4 | 0.32 ± 0.01 | 0.32 ± 0.01 | 0.31 ± 0.01 | 6.0 ± 0.0 | 0.00 ± 0.00 |
| habilidad 0.5 | azar uniforme | 0.22 ± 0.01 | 0.22 ± 0.01 | 0.22 ± 0.01 | 13.5 ± 0.1 | 0.11 ± 0.01 |
| habilidad 0.9 | Thompson | 0.37 ± 0.01 | 0.32 ± 0.01 | 0.40 ± 0.01 | 9.8 ± 0.2 | 0.23 ± 0.02 |
| habilidad 0.9 | Thompson, prior poblacional | 0.38 ± 0.01 | 0.34 ± 0.01 | 0.40 ± 0.01 | 8.7 ± 0.2 | 0.24 ± 0.02 |
| habilidad 0.9 | Thompson, olvido 0.95 | 0.33 ± 0.01 | 0.32 ± 0.01 | 0.34 ± 0.01 | 12.5 ± 0.1 | 0.16 ± 0.01 |
| habilidad 0.9 | epsilon-voraz 0.1 | 0.41 ± 0.01 | 0.35 ± 0.01 | 0.44 ± 0.01 | 6.5 ± 0.3 | 0.29 ± 0.05 |
| habilidad 0.9 | UCB1 | 0.33 ± 0.01 | 0.30 ± 0.01 | 0.35 ± 0.01 | 12.3 ± 0.1 | 0.16 ± 0.01 |
| habilidad 0.9 | fijo: ritmo-4 | 0.36 ± 0.01 | 0.36 ± 0.01 | 0.36 ± 0.01 | 10.0 ± 0.0 | 0.00 ± 0.00 |
| habilidad 0.9 | azar uniforme | 0.28 ± 0.01 | 0.28 ± 0.01 | 0.28 ± 0.01 | 16.3 ± 0.2 | 0.11 ± 0.01 |

Promedio de "últimos 20" sobre los cinco jugadores:

| Selector | En banda, últimos 20 |
|---|---|
| Thompson | 0.34 |
| Thompson, prior poblacional | 0.35 |
| Thompson, olvido 0.95 | 0.30 |
| epsilon-voraz 0.1 | 0.37 |
| UCB1 | 0.31 |
| fijo: ritmo-4 | 0.35 |
| azar uniforme | 0.25 |
| regla original (sin bandido) | 0.22 |
| oráculo (mejor brazo por jugador) | 0.42 |

## 3. Un jugador que cambia de estilo

Cambia de estilo a mitad de sesión. Los primeros 40 encuentros juega "quieto" y desde ahí "habilidad 0.9". Mejor brazo antes: ritmo-6; después: ritmo-1.5.

| Selector | En banda, antes del cambio | En banda, después | Últimos 20 | Arrepentimiento total |
|---|---|---|---|---|
| Thompson | 0.44 ± 0.01 | 0.30 ± 0.01 | 0.32 ± 0.01 | 14.4 ± 0.2 |
| Thompson, prior poblacional | 0.41 ± 0.01 | 0.32 ± 0.01 | 0.34 ± 0.01 | 14.4 ± 0.2 |
| Thompson, olvido 0.95 | 0.42 ± 0.01 | 0.31 ± 0.01 | 0.33 ± 0.01 | 14.6 ± 0.2 |
| epsilon-voraz 0.1 | 0.48 ± 0.01 | 0.27 ± 0.01 | 0.29 ± 0.02 | 13.9 ± 0.4 |
| UCB1 | 0.41 ± 0.01 | 0.32 ± 0.01 | 0.34 ± 0.01 | 15.4 ± 0.1 |
| fijo: ritmo-4 | 0.57 ± 0.01 | 0.36 ± 0.01 | 0.35 ± 0.01 | 6.5 ± 0.0 |
| azar uniforme | 0.35 ± 0.01 | 0.28 ± 0.01 | 0.27 ± 0.01 | 19.1 ± 0.2 |

