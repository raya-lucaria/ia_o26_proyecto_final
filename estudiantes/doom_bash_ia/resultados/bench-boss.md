# Benchmark de la política del jefe (M2)

40 semillas por celda. "Daño por salva": jugador invulnerable 45 s, daño recibido entre salvas lanzadas (la presión que crea la política). "Error de ritmo": distancia absoluta entre ese daño por salva y la meta (6) en cada episodio.
"Jugador vence al jefe" y "Sobrevive": jugador normal, hasta 90 s; IC95 de Wilson en puntos porcentuales para las proporciones.

| Jefe | Jugador | Política | Daño por salva (media ± IC95) | Error de ritmo vs meta 6 (media ± IC95) | Jugador vence al jefe | Sobrevive, s (media ± IC95) | Vida del jefe al final |
|---|---|---|---|---|---|---|---|
| volt-archon-pit | guionado | regla original | 2.1 ± 0.5 | 3.9 ± 0.5 | 0 % ± 4 | 73.2 ± 4.0 | 0.62 |
| volt-archon-pit | guionado | azar (repertorio) | 8.4 ± 1.2 | 3.5 ± 0.9 | 0 % ± 4 | 35.0 ± 4.7 | 0.82 |
| volt-archon-pit | guionado | siempre fan_wide | 13.5 ± 1.9 | 8.0 ± 1.7 | 0 % ± 4 | 24.5 ± 4.3 | 0.87 |
| volt-archon-pit | guionado | expectimax daño, prof. 1 | 10.5 ± 1.5 | 5.2 ± 1.3 | 0 % ± 4 | 27.4 ± 4.4 | 0.85 |
| volt-archon-pit | guionado | expectimax daño, prof. 3 | 10.5 ± 1.5 | 5.2 ± 1.3 | 0 % ± 4 | 27.4 ± 4.4 | 0.85 |
| volt-archon-pit | guionado | expectimax ritmo 6, mismos ataques, prof. 2 | 2.1 ± 0.5 | 3.9 ± 0.5 | 0 % ± 4 | 73.0 ± 3.8 | 0.62 |
| volt-archon-pit | guionado | expectimax ritmo 6, repertorio, prof. 1 | 6.2 ± 0.8 | 1.8 ± 0.5 | 0 % ± 4 | 38.7 ± 4.0 | 0.80 |
| volt-archon-pit | guionado | expectimax ritmo 6, repertorio, prof. 2 | 6.1 ± 0.8 | 1.9 ± 0.5 | 0 % ± 4 | 39.5 ± 4.3 | 0.79 |
| volt-archon-pit | guionado | expectimax ritmo 6, repertorio, prof. 3 | 6.3 ± 0.8 | 1.9 ± 0.5 | 0 % ± 4 | 38.9 ± 4.4 | 0.80 |
| volt-archon-pit | aleatorio | regla original | 3.4 ± 0.7 | 2.9 ± 0.6 | 0 % ± 4 | 69.6 ± 7.0 | 0.97 |
| volt-archon-pit | aleatorio | azar (repertorio) | 11.7 ± 2.1 | 6.7 ± 1.8 | 0 % ± 4 | 27.9 ± 5.7 | 0.99 |
| volt-archon-pit | aleatorio | siempre fan_wide | 17.7 ± 2.8 | 12.0 ± 2.7 | 0 % ± 4 | 20.9 ± 4.8 | 0.99 |
| volt-archon-pit | aleatorio | expectimax daño, prof. 1 | 12.0 ± 2.4 | 7.4 ± 2.0 | 0 % ± 4 | 31.2 ± 6.5 | 0.99 |
| volt-archon-pit | aleatorio | expectimax daño, prof. 3 | 12.0 ± 2.4 | 7.4 ± 2.0 | 0 % ± 4 | 31.2 ± 6.5 | 0.99 |
| volt-archon-pit | aleatorio | expectimax ritmo 6, mismos ataques, prof. 2 | 3.4 ± 0.7 | 3.0 ± 0.6 | 0 % ± 4 | 69.6 ± 7.0 | 0.97 |
| volt-archon-pit | aleatorio | expectimax ritmo 6, repertorio, prof. 1 | 9.1 ± 1.8 | 4.6 ± 1.5 | 0 % ± 4 | 36.5 ± 6.8 | 0.98 |
| volt-archon-pit | aleatorio | expectimax ritmo 6, repertorio, prof. 2 | 9.1 ± 1.8 | 4.5 ± 1.5 | 0 % ± 4 | 35.4 ± 6.5 | 0.99 |
| volt-archon-pit | aleatorio | expectimax ritmo 6, repertorio, prof. 3 | 9.1 ± 1.9 | 4.5 ± 1.5 | 0 % ± 4 | 35.4 ± 6.5 | 0.99 |
| volt-archon-pit | quieto | regla original | 17.1 ± 5.5 | 11.4 ± 5.5 | 0 % ± 4 | 16.3 ± 3.9 | 1.00 |
| volt-archon-pit | quieto | azar (repertorio) | 18.9 ± 5.6 | 13.1 ± 5.5 | 0 % ± 4 | 16.0 ± 3.9 | 1.00 |
| volt-archon-pit | quieto | siempre fan_wide | 27.3 ± 8.4 | 21.4 ± 8.4 | 0 % ± 4 | 14.6 ± 4.0 | 1.00 |
| volt-archon-pit | quieto | expectimax daño, prof. 1 | 28.1 ± 8.5 | 22.3 ± 8.4 | 0 % ± 4 | 14.1 ± 4.0 | 1.00 |
| volt-archon-pit | quieto | expectimax daño, prof. 3 | 28.1 ± 8.5 | 22.3 ± 8.4 | 0 % ± 4 | 14.1 ± 4.0 | 1.00 |
| volt-archon-pit | quieto | expectimax ritmo 6, mismos ataques, prof. 2 | 18.5 ± 5.6 | 12.7 ± 5.6 | 0 % ± 4 | 15.9 ± 3.9 | 1.00 |
| volt-archon-pit | quieto | expectimax ritmo 6, repertorio, prof. 1 | 12.8 ± 5.0 | 7.4 ± 4.9 | 0 % ± 4 | 26.1 ± 7.6 | 1.00 |
| volt-archon-pit | quieto | expectimax ritmo 6, repertorio, prof. 2 | 14.0 ± 5.2 | 8.6 ± 5.1 | 0 % ± 4 | 25.3 ± 7.7 | 1.00 |
| volt-archon-pit | quieto | expectimax ritmo 6, repertorio, prof. 3 | 14.0 ± 5.2 | 8.6 ± 5.1 | 0 % ± 4 | 25.3 ± 7.7 | 1.00 |
| bloom-warden-pit | guionado | regla original | 5.0 ± 0.8 | 2.4 ± 0.5 | 0 % ± 4 | 48.3 ± 5.8 | 0.75 |
| bloom-warden-pit | guionado | azar (repertorio) | 7.9 ± 1.1 | 3.1 ± 0.8 | 0 % ± 4 | 32.4 ± 4.1 | 0.82 |
| bloom-warden-pit | guionado | siempre fan_wide | 14.2 ± 1.4 | 8.2 ± 1.4 | 0 % ± 4 | 19.7 ± 2.8 | 0.88 |
| bloom-warden-pit | guionado | expectimax daño, prof. 1 | 12.6 ± 1.4 | 6.7 ± 1.3 | 0 % ± 4 | 22.9 ± 2.8 | 0.87 |
| bloom-warden-pit | guionado | expectimax daño, prof. 3 | 12.7 ± 1.4 | 6.7 ± 1.3 | 0 % ± 4 | 22.9 ± 2.8 | 0.87 |
| bloom-warden-pit | guionado | expectimax ritmo 6, mismos ataques, prof. 2 | 4.8 ± 0.7 | 2.3 ± 0.4 | 0 % ± 4 | 48.9 ± 5.7 | 0.75 |
| bloom-warden-pit | guionado | expectimax ritmo 6, repertorio, prof. 1 | 5.9 ± 0.6 | 1.7 ± 0.3 | 0 % ± 4 | 37.5 ± 3.7 | 0.79 |
| bloom-warden-pit | guionado | expectimax ritmo 6, repertorio, prof. 2 | 6.2 ± 0.6 | 1.6 ± 0.3 | 0 % ± 4 | 36.1 ± 3.8 | 0.80 |
| bloom-warden-pit | guionado | expectimax ritmo 6, repertorio, prof. 3 | 6.1 ± 0.6 | 1.5 ± 0.3 | 0 % ± 4 | 35.7 ± 3.8 | 0.81 |
| bloom-warden-pit | aleatorio | regla original | 5.2 ± 1.0 | 2.5 ± 0.6 | 0 % ± 4 | 46.7 ± 6.9 | 0.98 |
| bloom-warden-pit | aleatorio | azar (repertorio) | 9.9 ± 1.6 | 5.0 ± 1.3 | 0 % ± 4 | 30.6 ± 6.4 | 0.99 |
| bloom-warden-pit | aleatorio | siempre fan_wide | 16.0 ± 2.3 | 10.3 ± 2.2 | 0 % ± 4 | 21.5 ± 4.6 | 0.99 |
| bloom-warden-pit | aleatorio | expectimax daño, prof. 1 | 15.0 ± 2.2 | 9.3 ± 2.1 | 0 % ± 4 | 19.6 ± 4.4 | 0.99 |
| bloom-warden-pit | aleatorio | expectimax daño, prof. 3 | 15.0 ± 2.2 | 9.3 ± 2.1 | 0 % ± 4 | 19.6 ± 4.4 | 0.99 |
| bloom-warden-pit | aleatorio | expectimax ritmo 6, mismos ataques, prof. 2 | 5.2 ± 1.0 | 2.5 ± 0.6 | 0 % ± 4 | 46.7 ± 6.9 | 0.98 |
| bloom-warden-pit | aleatorio | expectimax ritmo 6, repertorio, prof. 1 | 7.1 ± 1.2 | 2.9 ± 0.9 | 0 % ± 4 | 35.5 ± 5.2 | 0.99 |
| bloom-warden-pit | aleatorio | expectimax ritmo 6, repertorio, prof. 2 | 7.5 ± 1.3 | 3.0 ± 0.9 | 0 % ± 4 | 33.3 ± 5.6 | 0.99 |
| bloom-warden-pit | aleatorio | expectimax ritmo 6, repertorio, prof. 3 | 7.5 ± 1.3 | 3.1 ± 0.9 | 0 % ± 4 | 33.3 ± 5.6 | 0.99 |
| bloom-warden-pit | quieto | regla original | 10.0 ± 4.3 | 7.9 ± 3.7 | 0 % ± 4 | 57.0 ± 12.1 | 1.00 |
| bloom-warden-pit | quieto | azar (repertorio) | 23.6 ± 9.9 | 17.7 ± 9.9 | 0 % ± 4 | 8.5 ± 0.6 | 1.00 |
| bloom-warden-pit | quieto | siempre fan_wide | 41.3 ± 17.1 | 35.3 ± 17.1 | 0 % ± 4 | 5.1 ± 0.0 | 1.00 |
| bloom-warden-pit | quieto | expectimax daño, prof. 1 | 42.5 ± 17.0 | 36.5 ± 17.0 | 0 % ± 4 | 5.0 ± 0.0 | 1.00 |
| bloom-warden-pit | quieto | expectimax daño, prof. 3 | 42.5 ± 17.0 | 36.5 ± 17.0 | 0 % ± 4 | 5.0 ± 0.0 | 1.00 |
| bloom-warden-pit | quieto | expectimax ritmo 6, mismos ataques, prof. 2 | 10.0 ± 4.3 | 7.9 ± 3.7 | 0 % ± 4 | 57.0 ± 12.1 | 1.00 |
| bloom-warden-pit | quieto | expectimax ritmo 6, repertorio, prof. 1 | 7.8 ± 2.7 | 5.0 ± 2.3 | 0 % ± 4 | 45.3 ± 12.2 | 1.00 |
| bloom-warden-pit | quieto | expectimax ritmo 6, repertorio, prof. 2 | 6.5 ± 2.3 | 4.7 ± 1.8 | 0 % ± 4 | 66.9 ± 10.6 | 1.00 |
| bloom-warden-pit | quieto | expectimax ritmo 6, repertorio, prof. 3 | 6.5 ± 2.3 | 4.6 ± 1.8 | 0 % ± 4 | 64.9 ± 10.9 | 1.00 |
| ash-judge-seal | guionado | regla original | 7.2 ± 1.1 | 2.8 ± 0.7 | 5 % ± 8 | 38.6 ± 3.3 | 0.33 |
| ash-judge-seal | guionado | azar (repertorio) | 8.5 ± 1.3 | 4.0 ± 0.8 | 3 % ± 6 | 32.0 ± 4.2 | 0.45 |
| ash-judge-seal | guionado | siempre fan_wide | 17.6 ± 1.7 | 11.6 ± 1.7 | 0 % ± 4 | 19.7 ± 2.6 | 0.67 |
| ash-judge-seal | guionado | expectimax daño, prof. 1 | 14.2 ± 1.4 | 8.2 ± 1.4 | 0 % ± 4 | 22.9 ± 2.6 | 0.61 |
| ash-judge-seal | guionado | expectimax daño, prof. 3 | 14.2 ± 1.4 | 8.2 ± 1.4 | 0 % ± 4 | 22.9 ± 2.6 | 0.61 |
| ash-judge-seal | guionado | expectimax ritmo 6, mismos ataques, prof. 2 | 6.3 ± 0.8 | 1.9 ± 0.5 | 8 % ± 9 | 40.3 ± 2.7 | 0.28 |
| ash-judge-seal | guionado | expectimax ritmo 6, repertorio, prof. 1 | 5.6 ± 0.6 | 1.7 ± 0.3 | 5 % ± 8 | 40.1 ± 3.2 | 0.30 |
| ash-judge-seal | guionado | expectimax ritmo 6, repertorio, prof. 2 | 6.0 ± 0.6 | 1.6 ± 0.4 | 3 % ± 6 | 36.6 ± 3.6 | 0.37 |
| ash-judge-seal | guionado | expectimax ritmo 6, repertorio, prof. 3 | 6.0 ± 0.6 | 1.6 ± 0.4 | 5 % ± 8 | 36.1 ± 3.7 | 0.38 |
| ash-judge-seal | aleatorio | regla original | 4.7 ± 0.9 | 2.6 ± 0.5 | 0 % ± 4 | 59.1 ± 8.8 | 0.96 |
| ash-judge-seal | aleatorio | azar (repertorio) | 7.1 ± 1.4 | 3.5 ± 0.9 | 0 % ± 4 | 39.8 ± 8.0 | 0.98 |
| ash-judge-seal | aleatorio | siempre fan_wide | 15.1 ± 2.6 | 9.4 ± 2.5 | 0 % ± 4 | 21.1 ± 4.5 | 0.99 |
| ash-judge-seal | aleatorio | expectimax daño, prof. 1 | 11.3 ± 2.1 | 6.2 ± 1.9 | 0 % ± 4 | 28.5 ± 6.6 | 0.98 |
| ash-judge-seal | aleatorio | expectimax daño, prof. 3 | 11.3 ± 2.1 | 6.2 ± 1.9 | 0 % ± 4 | 28.5 ± 6.6 | 0.98 |
| ash-judge-seal | aleatorio | expectimax ritmo 6, mismos ataques, prof. 2 | 4.0 ± 0.7 | 2.5 ± 0.6 | 0 % ± 4 | 60.7 ± 7.5 | 0.96 |
| ash-judge-seal | aleatorio | expectimax ritmo 6, repertorio, prof. 1 | 5.1 ± 0.8 | 2.2 ± 0.5 | 0 % ± 4 | 51.7 ± 6.2 | 0.97 |
| ash-judge-seal | aleatorio | expectimax ritmo 6, repertorio, prof. 2 | 5.5 ± 0.8 | 2.3 ± 0.4 | 0 % ± 4 | 51.0 ± 6.3 | 0.97 |
| ash-judge-seal | aleatorio | expectimax ritmo 6, repertorio, prof. 3 | 5.5 ± 0.8 | 2.2 ± 0.4 | 0 % ± 4 | 49.6 ± 6.2 | 0.97 |
| ash-judge-seal | quieto | regla original | 2.1 ± 0.6 | 4.1 ± 0.3 | 0 % ± 4 | 87.1 ± 4.1 | 1.00 |
| ash-judge-seal | quieto | azar (repertorio) | 22.0 ± 3.7 | 16.0 ± 3.7 | 0 % ± 4 | 10.6 ± 0.8 | 1.00 |
| ash-judge-seal | quieto | siempre fan_wide | 38.4 ± 5.6 | 32.4 ± 5.6 | 0 % ± 4 | 5.5 ± 0.1 | 1.00 |
| ash-judge-seal | quieto | expectimax daño, prof. 1 | 40.5 ± 5.6 | 34.5 ± 5.6 | 0 % ± 4 | 5.5 ± 0.1 | 1.00 |
| ash-judge-seal | quieto | expectimax daño, prof. 3 | 40.5 ± 5.6 | 34.5 ± 5.6 | 0 % ± 4 | 5.5 ± 0.1 | 1.00 |
| ash-judge-seal | quieto | expectimax ritmo 6, mismos ataques, prof. 2 | 2.1 ± 0.6 | 4.1 ± 0.3 | 0 % ± 4 | 87.1 ± 4.1 | 1.00 |
| ash-judge-seal | quieto | expectimax ritmo 6, repertorio, prof. 1 | 3.5 ± 0.4 | 2.8 ± 0.2 | 0 % ± 4 | 86.6 ± 4.7 | 1.00 |
| ash-judge-seal | quieto | expectimax ritmo 6, repertorio, prof. 2 | 3.6 ± 0.4 | 2.6 ± 0.2 | 0 % ± 4 | 86.6 ± 4.7 | 1.00 |
| ash-judge-seal | quieto | expectimax ritmo 6, repertorio, prof. 3 | 3.6 ± 0.4 | 2.6 ± 0.2 | 0 % ± 4 | 86.6 ± 4.7 | 1.00 |
