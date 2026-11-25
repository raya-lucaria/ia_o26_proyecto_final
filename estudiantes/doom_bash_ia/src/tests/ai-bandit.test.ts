import { describe, expect, it } from 'vitest';
import { PRESSURE_ARMS } from '../ai/bandit/arms';
import {
  createEpsilonGreedySelector,
  createFixedSelector,
  createThompsonSelector,
  createUcb1Selector,
  createUniformSelector,
  populationPrior,
  sampleBeta,
  sampleGamma,
  type ArmSelector
} from '../ai/bandit/policies';
import { challengeReward } from '../ai/bandit/reward';
import { cumulativeRegret, runSession, telemetryCsv } from '../ai/bandit/session';
import { armProbability, bestArm, buildOutcomeTable, ruleProbability, type OutcomeTable } from '../ai/bandit/table';
import { createSeededRng } from '../ai/sim/rng';
import { DEFAULT_SCRIPTED_PARAMS, findDodgeDirection, idleBotFactory, skilledBotFactory } from '../ai/sim/bots';
import { runEpisode } from '../ai/sim/runEpisode';
import { createSimWorld } from '../ai/sim/SimWorld';
import type { SimObservation } from '../ai/types';
import { createExpectimaxBossPolicy } from '../ai/expectimax/policy';

/** Entorno sintético: brazo i da recompensa 1 con probabilidad probabilities[i]. */
function playSynthetic(selector: ArmSelector, probabilities: readonly number[], pulls: number, seed: number): number[] {
  const rng = createSeededRng(seed);
  const counts = new Array<number>(probabilities.length).fill(0);
  for (let i = 0; i < pulls; i += 1) {
    const arm = selector.select();
    selector.update(arm, rng() < probabilities[arm] ? 1 : 0);
    counts[arm] += 1;
  }
  return counts;
}

describe('muestreo Beta y Gamma', () => {
  it('la media de Beta(a, b) es a / (a + b)', () => {
    const rng = createSeededRng(7);
    for (const [a, b] of [[1, 1], [2, 5], [0.5, 0.5], [8, 2]] as const) {
      const n = 20000;
      let sum = 0;
      for (let i = 0; i < n; i += 1) sum += sampleBeta(rng, a, b);
      expect(sum / n).toBeCloseTo(a / (a + b), 1);
    }
  });

  it('la media de Gamma(k, 1) es k, también para k < 1', () => {
    const rng = createSeededRng(11);
    for (const k of [0.4, 1, 3.5]) {
      const n = 20000;
      let sum = 0;
      for (let i = 0; i < n; i += 1) sum += sampleGamma(rng, k);
      expect(sum / n).toBeGreaterThan(k * 0.95);
      expect(sum / n).toBeLessThan(k * 1.05);
    }
  });

  it('las muestras Beta quedan en (0, 1)', () => {
    const rng = createSeededRng(3);
    for (let i = 0; i < 2000; i += 1) {
      const x = sampleBeta(rng, 0.3, 0.3);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });
});

describe('selectores de brazos', () => {
  const probabilities = [0.2, 0.5, 0.8];

  it('Thompson concentra los tiros en el mejor brazo', () => {
    const counts = playSynthetic(createThompsonSelector({ arms: 3, seed: 1 }), probabilities, 400, 5);
    expect(counts[2]).toBeGreaterThan(counts[0] + counts[1]);
    expect(counts[2]).toBeGreaterThan(280);
  });

  it('con la misma semilla y las mismas recompensas, Thompson elige igual', () => {
    const a = playSynthetic(createThompsonSelector({ arms: 3, seed: 9 }), probabilities, 100, 4);
    const b = playSynthetic(createThompsonSelector({ arms: 3, seed: 9 }), probabilities, 100, 4);
    const c = playSynthetic(createThompsonSelector({ arms: 3, seed: 10 }), probabilities, 100, 4);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('las creencias de Thompson son Beta(1 + éxitos, 1 + fracasos)', () => {
    const selector = createThompsonSelector({ arms: 2, seed: 1 });
    selector.update(0, 1);
    selector.update(0, 1);
    selector.update(0, 0);
    const [first, second] = selector.beliefs();
    expect(first).toMatchObject({ alpha: 3, beta: 2, pulls: 3 });
    expect(first.mean).toBeCloseTo(0.6, 9);
    expect(second).toMatchObject({ alpha: 1, beta: 1, pulls: 0 });
  });

  it('un prior por brazo arranca la creencia donde se le dice', () => {
    const prior = populationPrior([0.9, 0.1], 10);
    const selector = createThompsonSelector({ arms: 2, seed: 1, priorAlpha: prior.alpha, priorBeta: prior.beta });
    const [good, bad] = selector.beliefs();
    expect(good.mean).toBeGreaterThan(0.8);
    expect(bad.mean).toBeLessThan(0.2);
  });

  it('el prior poblacional acota probabilidades extremas para no cerrar brazos', () => {
    const prior = populationPrior([0, 1], 10);
    const selector = createThompsonSelector({ arms: 2, seed: 1, priorAlpha: prior.alpha, priorBeta: prior.beta });
    for (const belief of selector.beliefs()) {
      expect(belief.mean).toBeGreaterThan(0.01);
      expect(belief.mean).toBeLessThan(0.99);
    }
  });

  it('con olvido, la evidencia vieja pesa menos', () => {
    const forgetful = createThompsonSelector({ arms: 2, seed: 1, discount: 0.5 });
    const plain = createThompsonSelector({ arms: 2, seed: 1 });
    for (let i = 0; i < 6; i += 1) {
      forgetful.update(0, 1);
      plain.update(0, 1);
    }
    for (let i = 0; i < 6; i += 1) {
      forgetful.update(1, 1);
      plain.update(1, 1);
    }
    expect(plain.beliefs()[0].alpha).toBe(7);
    expect(forgetful.beliefs()[0].alpha).toBeLessThan(plain.beliefs()[0].alpha);
  });

  it('epsilon-voraz y UCB1 prueban todos los brazos antes de elegir', () => {
    for (const selector of [createEpsilonGreedySelector({ arms: 4, seed: 1, epsilon: 0 }), createUcb1Selector({ arms: 4 })]) {
      const seen = new Set<number>();
      for (let i = 0; i < 4; i += 1) {
        const arm = selector.select();
        seen.add(arm);
        selector.update(arm, 0);
      }
      expect(seen.size).toBe(4);
    }
  });

  it('epsilon-voraz y UCB1 encuentran el mejor brazo en el entorno sintético', () => {
    const greedy = playSynthetic(createEpsilonGreedySelector({ arms: 3, seed: 2, epsilon: 0.1 }), probabilities, 400, 6);
    const ucb = playSynthetic(createUcb1Selector({ arms: 3 }), probabilities, 400, 6);
    expect(greedy[2]).toBeGreaterThan(greedy[0] + greedy[1]);
    expect(ucb[2]).toBeGreaterThan(ucb[0]);
  });

  it('el selector fijo no cambia de brazo y el uniforme visita todos', () => {
    const fixed = createFixedSelector({ arms: 5, arm: 3 });
    expect(Array.from({ length: 10 }, () => fixed.select())).toEqual(new Array(10).fill(3));
    const uniform = createUniformSelector({ arms: 5, seed: 1 });
    const seen = new Set(Array.from({ length: 200 }, () => uniform.select()));
    expect(seen.size).toBe(5);
  });
});

describe('recompensa de reto', () => {
  it('1 solo si sigue vivo y termina dentro de la banda, con bordes incluidos', () => {
    const alive = (healthRemaining: number) => challengeReward({ outcome: 'timeout', healthRemaining }, 100);
    expect(alive(50)).toBe(1);
    expect(alive(30)).toBe(1);
    expect(alive(70)).toBe(1);
    expect(alive(29)).toBe(0);
    expect(alive(71)).toBe(0);
    expect(alive(100)).toBe(0);
    expect(challengeReward({ outcome: 'death', healthRemaining: 0 }, 100)).toBe(0);
    expect(challengeReward({ outcome: 'cleared', healthRemaining: 55 }, 100)).toBe(1);
  });

  it('la banda se puede cambiar', () => {
    expect(challengeReward({ outcome: 'timeout', healthRemaining: 85 }, 100, { low: 0.8, high: 0.9 })).toBe(1);
  });
});

describe('tabla de desenlaces y sesiones', () => {
  const arms = PRESSURE_ARMS.slice(0, 2);
  const table: OutcomeTable = buildOutcomeTable({
    levelId: 'ash-judge-seal',
    windowMs: 6000,
    players: [{ name: 'quieto', bot: idleBotFactory }],
    arms,
    seeds: 3
  });

  it('tiene la forma jugador × brazo × semilla y es reproducible', () => {
    expect(table.reward).toHaveLength(1);
    expect(table.reward[0]).toHaveLength(2);
    expect(table.reward[0][0]).toHaveLength(3);
    expect(table.ruleReward[0]).toHaveLength(3);
    const again = buildOutcomeTable({
      levelId: 'ash-judge-seal',
      windowMs: 6000,
      players: [{ name: 'quieto', bot: idleBotFactory }],
      arms,
      seeds: 3
    });
    expect(again).toEqual(table);
  });

  it('las probabilidades están en [0, 1] y el mejor brazo es el de mayor probabilidad', () => {
    for (let arm = 0; arm < 2; arm += 1) {
      const p = armProbability(table, 0, arm);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    const best = bestArm(table, 0);
    expect(best.probability).toBe(Math.max(armProbability(table, 0, 0), armProbability(table, 0, 1)));
    expect(ruleProbability(table, 0)).toBeGreaterThanOrEqual(0);
  });

  it('una sesión es determinista, registra cada encuentro y el arrepentimiento nunca baja', () => {
    const play = () =>
      runSession({ table, player: 0, selector: createThompsonSelector({ arms: 2, seed: 4 }), episodes: 25, seed: 8 });
    const records = play();
    expect(play()).toEqual(records);
    expect(records).toHaveLength(25);
    expect(records.every((r) => r.arm === 0 || r.arm === 1)).toBe(true);
    const regret = cumulativeRegret(records);
    for (let i = 1; i < regret.length; i += 1) expect(regret[i]).toBeGreaterThanOrEqual(regret[i - 1]);
    const csv = telemetryCsv(records).split('\n');
    expect(csv[0]).toBe('episode,player,arm,reward,healthRemaining,died');
    expect(csv).toHaveLength(26);
  });

  it('un jugador dado por función cambia a mitad de sesión', () => {
    const two: OutcomeTable = { ...table, players: ['a', 'b'], reward: [table.reward[0], table.reward[0]], health: [table.health[0], table.health[0]], died: [table.died[0], table.died[0]], ruleReward: [table.ruleReward[0], table.ruleReward[0]] };
    const records = runSession({
      table: two,
      player: (episode) => (episode < 5 ? 0 : 1),
      selector: createFixedSelector({ arms: 2, arm: 0 }),
      episodes: 10,
      seed: 1
    });
    expect(records.slice(0, 5).every((r) => r.player === 'a')).toBe(true);
    expect(records.slice(5).every((r) => r.player === 'b')).toBe(true);
  });
});

describe('director de spawns y escalado en el simulador', () => {
  it('sin directorConfig no hay director; con él, aparecen enemigos', () => {
    const without = runEpisode({ levelId: 'access-node', seed: 1, bot: skilledBotFactory(0.5), maxMs: 30_000 });
    expect(without.directorSpawns).toBe(0);
    const withDirector = runEpisode({
      levelId: 'access-node',
      seed: 1,
      bot: skilledBotFactory(0.5),
      maxMs: 30_000,
      directorConfig: {}
    });
    expect(withDirector.directorSpawns).toBeGreaterThan(0);
  });

  it('el episodio con director es determinista', () => {
    const options = { levelId: 'access-node', seed: 3, bot: skilledBotFactory(0.5), maxMs: 20_000, directorConfig: {} };
    expect(runEpisode(options)).toEqual(runEpisode(options));
  });

  it('el escalado se fija en los enemigos al crearlos', () => {
    const world = createSimWorld({ levelId: 'access-node', seed: 1, enemyScaling: { damage: 2, speed: 1.5 } });
    expect(world.enemies.length).toBeGreaterThan(0);
    for (const enemy of world.enemies) {
      expect(enemy.damageMultiplier).toBe(2);
      expect(enemy.speedMultiplier).toBe(1.5);
    }
  });

  it('un nivel sin director ignora directorConfig', () => {
    const result = runEpisode({ levelId: 'volt-archon-pit', seed: 1, bot: idleBotFactory, maxMs: 5000, directorConfig: {} });
    expect(result.directorSpawns).toBe(0);
  });
});

describe('jugador con habilidad y esquiva', () => {
  const observation = (projectiles: SimObservation['projectiles']): SimObservation =>
    ({
      timeMs: 0,
      map: createSimWorld({ levelId: 'access-node', seed: 1 }).map,
      player: { x: 10, y: 10, angle: 0, health: 100, maxHealth: 100, ammo: 10, ammoCapacity: 10, reloading: false, stationaryMs: 0 },
      enemies: [],
      boss: null,
      projectilesInFlight: projectiles.length,
      projectiles
    }) as SimObservation;

  it('un proyectil que va hacia el jugador provoca una esquiva perpendicular y unitaria', () => {
    const direction = findDodgeDirection(observation([{ x: 8.5, y: 10.1, vx: 3, vy: 0, radius: 0.1 }]));
    expect(direction).not.toBeNull();
    expect(Math.hypot(direction!.x, direction!.y)).toBeCloseTo(1, 9);
    expect(Math.abs(direction!.x)).toBeLessThan(1e-9);
  });

  it('no esquiva proyectiles que se alejan, que pasan lejos o que llegan muy tarde', () => {
    expect(findDodgeDirection(observation([{ x: 12, y: 10, vx: 3, vy: 0, radius: 0.1 }]))).toBeNull();
    expect(findDodgeDirection(observation([{ x: 8, y: 14, vx: 3, vy: 0, radius: 0.1 }]))).toBeNull();
    expect(findDodgeDirection(observation([{ x: 2, y: 10, vx: 3, vy: 0, radius: 0.1 }]))).toBeNull();
    expect(findDodgeDirection(observation([]))).toBeNull();
  });

  it('el bot guionado original no esquiva y los hábiles esquivan más cuanta más habilidad', () => {
    expect(DEFAULT_SCRIPTED_PARAMS.dodgeReaction).toBe(0);
    const low = skilledBotFactory(0.1)(1).name;
    const high = skilledBotFactory(0.9)(1).name;
    expect(low).toBe('habilidad-0.10');
    expect(high).toBe('habilidad-0.90');
  });

  it('un episodio con política de brazo y jugador hábil es reproducible', () => {
    const options = {
      levelId: 'ash-judge-seal',
      seed: 2,
      bot: skilledBotFactory(0.5),
      maxMs: 8000,
      bossPolicyFactory: () => createExpectimaxBossPolicy({ depth: 1, pool: 'repertoire', objective: 'pacing', targetDamage: 3 })
    };
    expect(runEpisode(options)).toEqual(runEpisode(options));
  });
});
