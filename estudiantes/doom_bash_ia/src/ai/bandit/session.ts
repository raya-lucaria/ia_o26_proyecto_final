/**
 * Sesiones del bandido (M3): un jugador juega `episodes` encuentros seguidos y el selector de brazos aprende de ellos.
 * Cada episodio queda registrado como telemetría (brazo, recompensa, vida final, si murió).
 */
import { createSeededRng } from '../sim/rng';
import type { ArmSelector } from './policies';
import { armProbability, bestArm, type OutcomeTable } from './table';

export interface DirectorEpisodeRecord {
  episode: number;
  player: string;
  arm: number;
  armId: string;
  reward: number;
  healthRemaining: number;
  died: boolean;
  /** Probabilidad de recompensa del brazo elegido y del mejor para ese jugador (para calcular arrepentimiento). */
  chosenProbability: number;
  bestProbability: number;
}

export interface SessionOptions {
  table: OutcomeTable;
  /** Índice de jugador por episodio. Una función permite jugadores que cambian de nivel a mitad de sesión. */
  player: number | ((episode: number) => number);
  selector: ArmSelector;
  episodes: number;
  seed: number;
}

export function runSession(options: SessionOptions): DirectorEpisodeRecord[] {
  const { table, selector } = options;
  const rng = createSeededRng(options.seed);
  const records: DirectorEpisodeRecord[] = [];
  for (let episode = 0; episode < options.episodes; episode += 1) {
    const player = typeof options.player === 'function' ? options.player(episode) : options.player;
    const arm = selector.select();
    const seedIndex = Math.floor(rng() * table.seeds);
    const reward = table.reward[player][arm][seedIndex] as 0 | 1;
    selector.update(arm, reward);
    records.push({
      episode,
      player: table.players[player],
      arm,
      armId: table.arms[arm],
      reward,
      healthRemaining: table.health[player][arm][seedIndex],
      died: table.died[player][arm][seedIndex] === 1,
      chosenProbability: armProbability(table, player, arm),
      bestProbability: bestArm(table, player).probability
    });
  }
  return records;
}

export function telemetryCsv(records: readonly DirectorEpisodeRecord[]): string {
  const header = 'episode,player,arm,reward,healthRemaining,died';
  const rows = records.map((r) => [r.episode, r.player, r.armId, r.reward, r.healthRemaining, r.died ? 1 : 0].join(','));
  return [header, ...rows].join('\n');
}

/** Arrepentimiento acumulado: lo que se pierde, en probabilidad de acertar la banda, por no haber elegido el mejor brazo. */
export function cumulativeRegret(records: readonly DirectorEpisodeRecord[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const record of records) {
    sum += record.bestProbability - record.chosenProbability;
    out.push(sum);
  }
  return out;
}
