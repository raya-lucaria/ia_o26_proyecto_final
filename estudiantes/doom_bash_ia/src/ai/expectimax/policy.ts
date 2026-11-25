/**
 * Política del jefe con expectimax (M2). Implementa `RaycastBossPolicy`.
 *
 * Árbol: nodo de MAX (el jefe elige un ataque) → nodo de AZAR (el jugador responde con una de cinco
 * maniobras, con probabilidades de un modelo del jugador) → siguiente nodo de MAX, hasta `depth` ataques.
 *
 *   V(s, d) = max_k  Σ_r  P(r | s) · [ daño(s, k, r) + γ · V(s', d − 1) ]
 *
 * Modelo del jugador, P(r | s): mezcla de dos fuentes.
 *  - Persistencia: si el jugador ya se mueve, lo más probable es que siga igual; si está quieto, que siga quieto.
 *  - Aprendizaje (opcional, `adaptive`): conteos con olvido de las maniobras observadas en decisiones previas,
 *    con peso creciente a medida que hay más observaciones.
 */
import type { BossVolleyPickContext, BossVolleyKind, RaycastBossPlayerContext } from '../../game/raycast/RaycastBossAI';
import { volleyCandidates } from '../../game/raycast/RaycastBossAI';
import type { RaycastBossState } from '../../game/raycast/RaycastBoss';
import type { RaycastBossPolicy } from '../../game/raycast/RaycastBossPolicy';
import type { RaycastMap } from '../../game/raycast/RaycastMap';
import {
  classifyPlayerMotion,
  createModelContext,
  evaluateVolley,
  PLAYER_RESPONSES,
  type DuelParams,
  type DuelState,
  type ModelContext,
  type PlayerResponse
} from './model';

export type CandidatePool = 'rule' | 'repertoire';

export interface ExpectimaxOptions {
  /** Cuántos ataques del jefe se miran hacia adelante (1 a 3). */
  depth?: number;
  /** Descuento por mirar más lejos. */
  discount?: number;
  /** Aprende las maniobras del jugador durante el combate. */
  adaptive?: boolean;
  /**
   * 'rule': solo los ataques que la regla original consideraría en ese momento (mismos movimientos, mejor elección).
   * 'repertoire': todos los ataques de ese jefe, de cualquier fase.
   */
  pool?: CandidatePool;
  params?: Partial<DuelParams>;
  /**
   * 'damage': maximiza el daño esperado (jefe lo más duro posible).
   * 'pacing': mantiene un ritmo de presión. Minimiza la desviación cuadrática entre el daño acumulado y
   * `targetDamage` por salva, de modo que si el jugador ha recibido de menos el jefe sube la presión y, si
   * ha recibido de más, la baja. El déficit acumulado hace que mirar más de una salva importe.
   */
  objective?: 'damage' | 'pacing';
  /** Daño meta por salva (solo 'pacing'). */
  targetDamage?: number;
}

const PRIOR: Record<PlayerResponse, number> = { stand: 0.06, left: 0.28, right: 0.28, toward: 0.17, away: 0.21 };
const PERSIST_MASS = 0.5;
const COUNT_DECAY = 0.82;
/** El déficit acumulado se acota para que una mala racha no domine el resto del combate. */
const DEFICIT_LIMIT = 100;

export interface ExpectimaxStats {
  decisions: number;
  /** Evaluaciones de (ataque, respuesta) acumuladas; mide el costo de búsqueda. */
  evaluations: number;
  /** Tiempo de reloj total en decisiones, en ms. Depende de la computadora. */
  wallMs: number;
}

export interface ExpectimaxDecision {
  kind: BossVolleyKind;
  /** Valor esperado (daño) de cada ataque candidato. */
  values: Array<{ kind: BossVolleyKind; value: number }>;
}

export interface ExpectimaxBossPolicy extends RaycastBossPolicy {
  readonly stats: ExpectimaxStats;
  /** Última decisión tomada, para depurar o mostrar en el panel de IA. */
  lastDecision(): ExpectimaxDecision | null;
  /** Probabilidades que el modelo asigna hoy a cada respuesta del jugador. */
  responseProbabilities(state: DuelState, bossId?: string): Record<PlayerResponse, number>;
}

const REPERTOIRE_CACHE = new Map<string, BossVolleyKind[]>();

/** Todos los ataques que la regla original usa para esta conducta, en el orden en que aparecen. */
export function bossRepertoire(behavior: RaycastBossState['behavior']): BossVolleyKind[] {
  const cached = REPERTOIRE_CACHE.get(behavior);
  if (cached) return cached;
  const found = new Set<BossVolleyKind>();
  for (const phase of [1, 2, 3] as const) {
    for (const flags of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
      const context: BossVolleyPickContext = {
        distance: 3,
        playerStationary: (flags & 1) !== 0,
        playerKiting: (flags & 2) !== 0,
        playerCornered: (flags & 4) !== 0,
        desperation: (flags & 8) !== 0,
        timeSinceLastVolleyMs: 0
      };
      for (const kind of volleyCandidates(behavior, phase, context)) found.add(kind);
    }
  }
  const list = [...found];
  REPERTOIRE_CACHE.set(behavior, list);
  return list;
}

export function createExpectimaxBossPolicy(options: ExpectimaxOptions = {}): ExpectimaxBossPolicy {
  const depth = Math.max(1, Math.min(3, options.depth ?? 2));
  const discount = options.discount ?? 0.8;
  const adaptive = options.adaptive ?? false;
  const pool = options.pool ?? 'rule';
  const stats: ExpectimaxStats = { decisions: 0, evaluations: 0, wallMs: 0 };
  const counts = new Map<string, Record<PlayerResponse, number>>();
  const observations = new Map<string, number>();
  let last: ExpectimaxDecision | null = null;
  /** Valor de cada estado de la búsqueda en curso: varios ataques comparten el mismo estado siguiente. */
  let valueMemo = new Map<DuelState, Map<number, number>>();
  const objective = options.objective ?? 'damage';
  const target = options.targetDamage ?? 6;
  const damageSeen = new Map<string, number>();
  const lastHealth = new Map<string, number>();
  const deficits = new Map<string, number>();

  function probabilities(bossId: string, state: DuelState): Record<PlayerResponse, number> {
    const current = classifyPlayerMotion(state);
    const mixed = {} as Record<PlayerResponse, number>;
    let total = 0;
    for (const response of PLAYER_RESPONSES) {
      const persistence = response === current ? PERSIST_MASS : 0;
      mixed[response] = persistence + (1 - PERSIST_MASS) * PRIOR[response];
      total += mixed[response];
    }
    for (const response of PLAYER_RESPONSES) mixed[response] /= total;
    if (!adaptive) return mixed;

    const seen = counts.get(bossId);
    const n = observations.get(bossId) ?? 0;
    if (!seen || n <= 0) return mixed;
    const sum = PLAYER_RESPONSES.reduce((acc, r) => acc + seen[r], 0) || 1;
    const weight = Math.min(0.6, n / (n + 4));
    const out = {} as Record<PlayerResponse, number>;
    for (const response of PLAYER_RESPONSES) out[response] = (1 - weight) * mixed[response] + weight * (seen[response] / sum);
    return out;
  }

  function observe(bossId: string, state: DuelState): void {
    const response = classifyPlayerMotion(state);
    const row = counts.get(bossId) ?? { stand: 0, left: 0, right: 0, toward: 0, away: 0 };
    for (const r of PLAYER_RESPONSES) row[r] *= COUNT_DECAY;
    row[response] += 1;
    counts.set(bossId, row);
    observations.set(bossId, (observations.get(bossId) ?? 0) * COUNT_DECAY + 1);
  }

  /** Puntaje de un nodo: más alto es mejor. 'damage' suma daño; 'pacing' penaliza la desviación del ritmo. */
  function stepScore(deficit: number, damage: number): { score: number; nextDeficit: number } {
    if (objective === 'damage') return { score: damage, nextDeficit: 0 };
    const nextDeficit = Math.max(-DEFICIT_LIMIT, Math.min(DEFICIT_LIMIT, deficit + target - damage));
    return { score: -(nextDeficit * nextDeficit), nextDeficit };
  }

  function value(ctx: ModelContext, state: DuelState, deficit: number, candidates: BossVolleyKind[], remaining: number): number {
    if (remaining === 0) return 0;
    const key = Math.round(deficit);
    let perState = valueMemo.get(state);
    if (!perState) {
      perState = new Map();
      valueMemo.set(state, perState);
    }
    const memo = perState.get(key);
    if (memo !== undefined) return memo;
    const probs = probabilities(ctx.boss.id, state);
    let best = -Infinity;
    for (const kind of candidates) {
      best = Math.max(best, qValue(ctx, state, deficit, kind, candidates, remaining, probs));
    }
    perState.set(key, best);
    return best;
  }

  function qValue(
    ctx: ModelContext,
    state: DuelState,
    deficit: number,
    kind: BossVolleyKind,
    candidates: BossVolleyKind[],
    remaining: number,
    probs: Record<PlayerResponse, number>
  ): number {
    let q = 0;
    for (const response of PLAYER_RESPONSES) {
      const p = probs[response];
      if (p <= 0) continue;
      stats.evaluations += 1;
      const outcome = evaluateVolley(ctx, state, kind, response);
      const { score, nextDeficit } = stepScore(deficit, outcome.damage);
      const future = remaining > 1 ? discount * value(ctx, outcome.next, nextDeficit, candidates, remaining - 1) : 0;
      q += p * (score + future);
    }
    return q;
  }

  /** Actualiza el déficit con el daño que el jugador recibió desde la decisión anterior. */
  function updateDeficit(boss: RaycastBossState, player: RaycastBossPlayerContext): number {
    if (objective !== 'pacing') return 0;
    const id = boss.id;
    const known = deficits.get(id);
    let received = 0;
    if (player.damageTaken !== undefined) {
      received = Math.max(0, player.damageTaken - (damageSeen.get(id) ?? player.damageTaken));
      damageSeen.set(id, player.damageTaken);
    } else if (player.health !== undefined) {
      received = Math.max(0, (lastHealth.get(id) ?? player.health) - player.health);
      lastHealth.set(id, player.health);
    }
    // La primera decisión no tiene salva previa que contar.
    const next = known === undefined ? 0 : Math.max(-DEFICIT_LIMIT, Math.min(DEFICIT_LIMIT, known + target - received));
    deficits.set(id, next);
    return next;
  }

  return {
    stats,
    lastDecision: () => last,
    responseProbabilities(state, bossId = 'probe') {
      return probabilities(bossId, state);
    },
    pickVolley(
      boss: RaycastBossState,
      player: RaycastBossPlayerContext,
      map: RaycastMap,
      context: BossVolleyPickContext,
      time: number
    ): BossVolleyKind | null {
      const started = performance.now();
      const candidates =
        pool === 'repertoire'
          ? bossRepertoire(boss.behavior)
          : volleyCandidates(boss.behavior, boss.phase, context);
      if (candidates.length === 0) return null;

      const state: DuelState = {
        bossX: boss.x,
        bossY: boss.y,
        playerX: player.x,
        playerY: player.y,
        playerVx: player.vx ?? 0,
        playerVy: player.vy ?? 0,
        playerStationaryMs: player.stationaryMs ?? 0,
        timeMs: time
      };
      if (adaptive) observe(boss.id, state);

      const ctx = createModelContext(map, boss, options.params);
      valueMemo = new Map();
      const deficit = updateDeficit(boss, player);
      const probs = probabilities(boss.id, state);
      const values = candidates.map((kind) => ({
        kind,
        value: qValue(ctx, state, deficit, kind, candidates, depth, probs)
      }));

      // Mejor valor; en empate (o casi) se evita repetir el ataque anterior para no ser predecible.
      let chosen = values[0];
      for (const entry of values) {
        const better = entry.value > chosen.value + 1e-9;
        const tied = Math.abs(entry.value - chosen.value) <= 1e-9;
        if (better || (tied && chosen.kind === boss.lastVolleyKind && entry.kind !== boss.lastVolleyKind)) chosen = entry;
      }
      last = { kind: chosen.kind, values };
      stats.decisions += 1;
      stats.wallMs += performance.now() - started;
      return chosen.kind;
    }
  };
}
