/**
 * Tabla de desenlaces (M3): el entorno del bandido.
 *
 * Cada episodio del simulador es caro (un duelo de 40 s) y su resultado depende solo de (jugador, brazo, semilla).
 * Se simulan una vez todas las combinaciones y se guarda la recompensa y la vida final. Una sesión del bandido
 * "juega" sacando, para el brazo elegido, el resultado de una semilla al azar de esa tabla. Así el entorno es la
 * distribución empírica del simulador (exacta para la tabla) y miles de sesiones salen casi gratis.
 */
import type { SimBotFactory } from '../types';
import { runEpisode } from '../sim/runEpisode';
import { createArmBossPolicy, type PressureArm } from './arms';
import { challengeReward, DEFAULT_CHALLENGE_BAND, type ChallengeBand } from './reward';

export const PLAYER_MAX_HEALTH = 100;

export interface TablePlayer {
  name: string;
  bot: SimBotFactory;
}

export interface OutcomeTable {
  levelId: string;
  windowMs: number;
  band: ChallengeBand;
  players: string[];
  arms: string[];
  seeds: number;
  /** reward[jugador][brazo][semilla] */
  reward: number[][][];
  /** Vida final (0–100) con el mismo índice. */
  health: number[][][];
  /** Si el jugador murió, con el mismo índice (1 = murió). */
  died: number[][][];
  /** Referencia: recompensa con la regla original del jefe, ruleReward[jugador][semilla]. No es un brazo. */
  ruleReward: number[][];
}

export interface BuildTableOptions {
  levelId: string;
  windowMs: number;
  players: readonly TablePlayer[];
  arms: readonly PressureArm[];
  seeds: number;
  band?: ChallengeBand;
  onProgress?: (done: number, total: number) => void;
}

export function buildOutcomeTable(options: BuildTableOptions): OutcomeTable {
  const band = options.band ?? DEFAULT_CHALLENGE_BAND;
  const reward: number[][][] = [];
  const health: number[][][] = [];
  const died: number[][][] = [];
  const ruleReward: number[][] = [];
  const total = options.players.length * (options.arms.length + 1) * options.seeds;
  let done = 0;
  for (const player of options.players) {
    const rewardRows: number[][] = [];
    const healthRows: number[][] = [];
    const diedRows: number[][] = [];
    for (const arm of options.arms) {
      const r: number[] = [];
      const h: number[] = [];
      const d: number[] = [];
      for (let seed = 1; seed <= options.seeds; seed += 1) {
        const result = runEpisode({
          levelId: options.levelId,
          seed,
          bot: player.bot,
          maxMs: options.windowMs,
          bossPolicyFactory: () => createArmBossPolicy(arm)
        });
        r.push(challengeReward(result, PLAYER_MAX_HEALTH, band));
        h.push(result.healthRemaining);
        d.push(result.outcome === 'death' ? 1 : 0);
        done += 1;
        options.onProgress?.(done, total);
      }
      rewardRows.push(r);
      healthRows.push(h);
      diedRows.push(d);
    }
    const ruleRow: number[] = [];
    for (let seed = 1; seed <= options.seeds; seed += 1) {
      const result = runEpisode({ levelId: options.levelId, seed, bot: player.bot, maxMs: options.windowMs });
      ruleRow.push(challengeReward(result, PLAYER_MAX_HEALTH, band));
      done += 1;
      options.onProgress?.(done, total);
    }
    ruleReward.push(ruleRow);
    reward.push(rewardRows);
    health.push(healthRows);
    died.push(diedRows);
  }
  return {
    levelId: options.levelId,
    windowMs: options.windowMs,
    band,
    players: options.players.map((p) => p.name),
    arms: options.arms.map((a) => a.id),
    seeds: options.seeds,
    reward,
    health,
    died,
    ruleReward
  };
}

/** Probabilidad verdadera (para la tabla) de que el brazo dé recompensa 1 con ese jugador. */
export function armProbability(table: OutcomeTable, player: number, arm: number): number {
  const row = table.reward[player][arm];
  return row.reduce((sum, value) => sum + value, 0) / row.length;
}

export function bestArm(table: OutcomeTable, player: number): { arm: number; probability: number } {
  let best = 0;
  let bestP = -1;
  for (let arm = 0; arm < table.arms.length; arm += 1) {
    const p = armProbability(table, player, arm);
    if (p > bestP) {
      bestP = p;
      best = arm;
    }
  }
  return { arm: best, probability: bestP };
}

/** Probabilidad de recompensa con la regla original del jefe. */
export function ruleProbability(table: OutcomeTable, player: number): number {
  const row = table.ruleReward[player];
  return row.reduce((sum, value) => sum + value, 0) / row.length;
}
