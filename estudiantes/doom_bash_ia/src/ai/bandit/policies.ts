/**
 * Políticas de selección de brazos (M3): Thompson sampling con posteriores Beta y tres referencias.
 *
 * Todas implementan `ArmSelector`: `select()` elige un brazo y `update(brazo, recompensa)` reporta el resultado.
 * El azar viene de un generador con semilla; con la misma semilla y la misma secuencia de recompensas la selección
 * es idéntica.
 */
import { createSeededRng, type Rng } from '../sim/rng';

export interface ArmBelief {
  alpha: number;
  beta: number;
  mean: number;
  pulls: number;
}

export interface ArmSelector {
  readonly name: string;
  select(): number;
  update(arm: number, reward: 0 | 1): void;
  /** Creencia actual sobre cada brazo (para el panel de depuración). */
  beliefs(): ArmBelief[];
}

/**
 * Prior poblacional: Beta con media igual a la probabilidad media de cada brazo entre otros jugadores y un peso de
 * `strength` observaciones. Con strength = 0 equivale a no saber nada.
 */
export function populationPrior(meanByArm: readonly number[], strength: number): { alpha: number[]; beta: number[] } {
  const clamp = (p: number): number => Math.min(0.98, Math.max(0.02, p));
  return {
    alpha: meanByArm.map((p) => 1 + strength * clamp(p)),
    beta: meanByArm.map((p) => 1 + strength * (1 - clamp(p)))
  };
}

/** Normal estándar por Box-Muller. */
function sampleNormal(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape, 1) por Marsaglia-Tsang. Para shape < 1 usa el truco de elevar a 1/shape. */
export function sampleGamma(rng: Rng, shape: number): number {
  if (shape < 1) {
    const boosted = sampleGamma(rng, shape + 1);
    return boosted * Math.pow(Math.max(rng(), 1e-12), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = sampleNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(Math.max(u, 1e-12)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(rng: Rng, alpha: number, beta: number): number {
  const a = sampleGamma(rng, alpha);
  const b = sampleGamma(rng, beta);
  return a / (a + b);
}

export interface ThompsonOptions {
  arms: number;
  seed: number;
  /**
   * Creencia inicial de cada brazo, Beta(priorAlpha, priorBeta). Por omisión uniforme. Admite un valor por brazo, que
   * es como se arranca con lo aprendido de otros jugadores (prior poblacional).
   */
  priorAlpha?: number | readonly number[];
  priorBeta?: number | readonly number[];
  /** Nombre que se muestra en las tablas. */
  label?: string;
  /**
   * Factor de olvido en (0, 1]. En cada actualización, la evidencia acumulada de todos los brazos se multiplica por
   * este factor (sin bajar de la creencia inicial). 1 = no olvida; menos de 1 permite seguir a un jugador que cambia.
   */
  discount?: number;
  /** Evidencia con la que arrancar, por ejemplo la guardada en una sesión anterior. */
  initial?: ThompsonCounts;
}

export interface ThompsonCounts {
  successes: number[];
  failures: number[];
  pulls: number[];
}

export interface ThompsonSelector extends ArmSelector {
  /** Copia de la evidencia acumulada, para guardarla y restaurarla. */
  counts(): ThompsonCounts;
}

export function createThompsonSelector(options: ThompsonOptions): ThompsonSelector {
  const rng = createSeededRng(options.seed);
  const alpha0 = (arm: number): number => (typeof options.priorAlpha === 'number' ? options.priorAlpha : options.priorAlpha?.[arm] ?? 1);
  const beta0 = (arm: number): number => (typeof options.priorBeta === 'number' ? options.priorBeta : options.priorBeta?.[arm] ?? 1);
  const discount = options.discount ?? 1;
  const successes = options.initial ? [...options.initial.successes] : new Array<number>(options.arms).fill(0);
  const failures = options.initial ? [...options.initial.failures] : new Array<number>(options.arms).fill(0);
  const pulls = options.initial ? [...options.initial.pulls] : new Array<number>(options.arms).fill(0);
  return {
    counts: () => ({ successes: [...successes], failures: [...failures], pulls: [...pulls] }),
    name: options.label ?? (discount < 1 ? `Thompson (olvido ${discount})` : 'Thompson'),
    select() {
      let best = 0;
      let bestDraw = -1;
      for (let arm = 0; arm < options.arms; arm += 1) {
        const draw = sampleBeta(rng, alpha0(arm) + successes[arm], beta0(arm) + failures[arm]);
        if (draw > bestDraw) {
          bestDraw = draw;
          best = arm;
        }
      }
      return best;
    },
    update(arm, reward) {
      if (discount < 1) {
        for (let i = 0; i < options.arms; i += 1) {
          successes[i] *= discount;
          failures[i] *= discount;
        }
      }
      if (reward === 1) successes[arm] += 1;
      else failures[arm] += 1;
      pulls[arm] += 1;
    },
    beliefs() {
      return successes.map((s, arm) => {
        const alpha = alpha0(arm) + s;
        const beta = beta0(arm) + failures[arm];
        return { alpha, beta, mean: alpha / (alpha + beta), pulls: pulls[arm] };
      });
    }
  };
}

function empiricalBeliefs(successes: number[], pulls: number[]): ArmBelief[] {
  return successes.map((s, arm) => {
    const alpha = 1 + s;
    const beta = 1 + pulls[arm] - s;
    return { alpha, beta, mean: alpha / (alpha + beta), pulls: pulls[arm] };
  });
}

/** Epsilon-greedy: con probabilidad epsilon explora al azar; si no, el brazo de mejor media empírica. */
export function createEpsilonGreedySelector(options: { arms: number; seed: number; epsilon?: number }): ArmSelector {
  const rng = createSeededRng(options.seed);
  const epsilon = options.epsilon ?? 0.1;
  const successes = new Array<number>(options.arms).fill(0);
  const pulls = new Array<number>(options.arms).fill(0);
  return {
    name: `epsilon-voraz (${epsilon})`,
    select() {
      const untried = pulls.findIndex((n) => n === 0);
      if (untried >= 0) return untried;
      if (rng() < epsilon) return Math.floor(rng() * options.arms);
      let best = 0;
      for (let arm = 1; arm < options.arms; arm += 1) {
        if (successes[arm] / pulls[arm] > successes[best] / pulls[best]) best = arm;
      }
      return best;
    },
    update(arm, reward) {
      successes[arm] += reward;
      pulls[arm] += 1;
    },
    beliefs: () => empiricalBeliefs(successes, pulls)
  };
}

/** UCB1 (Auer et al.): media empírica más un margen de exploración que se achica con las visitas. */
export function createUcb1Selector(options: { arms: number }): ArmSelector {
  const successes = new Array<number>(options.arms).fill(0);
  const pulls = new Array<number>(options.arms).fill(0);
  let total = 0;
  return {
    name: 'UCB1',
    select() {
      const untried = pulls.findIndex((n) => n === 0);
      if (untried >= 0) return untried;
      let best = 0;
      let bestScore = -Infinity;
      for (let arm = 0; arm < options.arms; arm += 1) {
        const score = successes[arm] / pulls[arm] + Math.sqrt((2 * Math.log(total)) / pulls[arm]);
        if (score > bestScore) {
          bestScore = score;
          best = arm;
        }
      }
      return best;
    },
    update(arm, reward) {
      successes[arm] += reward;
      pulls[arm] += 1;
      total += 1;
    },
    beliefs: () => empiricalBeliefs(successes, pulls)
  };
}

/** Siempre el mismo brazo: la configuración fija de hoy. */
export function createFixedSelector(options: { arms: number; arm: number; name?: string }): ArmSelector {
  const pulls = new Array<number>(options.arms).fill(0);
  const successes = new Array<number>(options.arms).fill(0);
  return {
    name: options.name ?? `fijo (brazo ${options.arm})`,
    select: () => options.arm,
    update(arm, reward) {
      successes[arm] += reward;
      pulls[arm] += 1;
    },
    beliefs: () => empiricalBeliefs(successes, pulls)
  };
}

/** Brazo al azar, uniforme. Piso de comparación: no aprende nada. */
export function createUniformSelector(options: { arms: number; seed: number }): ArmSelector {
  const rng = createSeededRng(options.seed);
  const pulls = new Array<number>(options.arms).fill(0);
  const successes = new Array<number>(options.arms).fill(0);
  return {
    name: 'azar uniforme',
    select: () => Math.floor(rng() * options.arms),
    update(arm, reward) {
      successes[arm] += reward;
      pulls[arm] += 1;
    },
    beliefs: () => empiricalBeliefs(successes, pulls)
  };
}
