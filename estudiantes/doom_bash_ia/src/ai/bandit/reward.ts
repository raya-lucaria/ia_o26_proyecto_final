/**
 * Recompensa del director adaptativo (M3): ¿el reto fue el adecuado?
 *
 * Un episodio es un duelo de ventana fija contra el jefe. Recompensa 1 si el jugador sigue vivo al terminar y le queda
 * una fracción de vida dentro de la banda [low, high]; 0 si murió, o si terminó casi intacto (reto de menos) o casi
 * muerto sin llegar a morir (reto de más). No es monótona en la presión: por eso un bandido con una sola cantidad
 * "más difícil / más fácil" no basta y hay que aprender qué brazo cae en la banda para cada jugador.
 */
export interface ChallengeBand {
  low: number;
  high: number;
}

export const DEFAULT_CHALLENGE_BAND: ChallengeBand = { low: 0.3, high: 0.7 };

export function challengeReward(
  result: { outcome: 'death' | 'cleared' | 'timeout'; healthRemaining: number },
  maxHealth: number,
  band: ChallengeBand = DEFAULT_CHALLENGE_BAND
): 0 | 1 {
  if (result.outcome === 'death') return 0;
  const fraction = result.healthRemaining / maxHealth;
  return fraction >= band.low && fraction <= band.high ? 1 : 0;
}
