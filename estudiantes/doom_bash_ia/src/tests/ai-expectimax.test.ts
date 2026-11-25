import { describe, expect, it } from 'vitest';
import { createFixedKindPolicy, createRandomRepertoirePolicy } from '../ai/expectimax/baselines';
import {
  classifyPlayerMotion,
  createModelContext,
  evaluateVolley,
  PLAYER_RESPONSES,
  responseVelocity,
  type DuelState
} from '../ai/expectimax/model';
import { bossRepertoire, createExpectimaxBossPolicy } from '../ai/expectimax/policy';
import { scriptedBotFactory } from '../ai/sim/bots';
import { runEpisode } from '../ai/sim/runEpisode';
import { createSimWorld } from '../ai/sim/SimWorld';
import { tickRaycastBossVolleys, type RaycastBossState } from '../game/raycast/RaycastBoss';
import {
  isBossDesperation,
  pickBossVolleyKind,
  volleyCandidates,
  type BossVolleyKind,
  type RaycastBossPlayerContext
} from '../game/raycast/RaycastBossAI';
import { RAYCAST_LEVEL_BOSS } from '../game/raycast/RaycastLevel';

function arena() {
  const world = createSimWorld({ levelId: RAYCAST_LEVEL_BOSS.id, seed: 1 });
  const boss = world.bosses[0];
  const player: RaycastBossPlayerContext = {
    x: boss.x,
    y: boss.y + 3.4,
    alive: true,
    stationaryMs: 0,
    vx: 0,
    vy: 0,
    health: 100,
    damageTaken: 0
  };
  return { world, boss, player, map: world.map };
}

function duel(boss: RaycastBossState, player: RaycastBossPlayerContext, timeMs = 5000): DuelState {
  return {
    bossX: boss.x,
    bossY: boss.y,
    playerX: player.x,
    playerY: player.y,
    playerVx: player.vx ?? 0,
    playerVy: player.vy ?? 0,
    playerStationaryMs: player.stationaryMs ?? 0,
    timeMs
  };
}

const baseContext = {
  distance: 3.4,
  playerStationary: false,
  playerKiting: false,
  playerCornered: false,
  desperation: false,
  timeSinceLastVolleyMs: 800
};

describe('modelo del duelo', () => {
  it('las cinco respuestas tienen la velocidad pedida y son perpendiculares u opuestas al jefe', () => {
    const state = { bossX: 0, bossY: 0, playerX: 0, playerY: 4 };
    const left = responseVelocity('left', state, 6);
    const right = responseVelocity('right', state, 6);
    const toward = responseVelocity('toward', state, 6);
    const away = responseVelocity('away', state, 6);
    expect(Math.hypot(left.x, left.y)).toBeCloseTo(6, 9);
    expect(left.x).toBeCloseTo(-right.x, 9);
    expect(left.y).toBeCloseTo(-right.y, 9);
    expect(left.x * toward.x + left.y * toward.y).toBeCloseTo(0, 9);
    expect(toward.y).toBeLessThan(0);
    expect(away.y).toBeGreaterThan(0);
    expect(responseVelocity('stand', state, 6)).toEqual({ x: 0, y: 0 });
  });

  it('classifyPlayerMotion devuelve la respuesta que generó la velocidad', () => {
    const state = { bossX: 0, bossY: 0, playerX: 0, playerY: 4 };
    for (const response of PLAYER_RESPONSES) {
      const v = responseVelocity(response, state, 5);
      expect(classifyPlayerMotion({ ...state, playerVx: v.x, playerVy: v.y })).toBe(response);
    }
  });

  it('un jugador quieto recibe más daño de un abanico apuntado que uno que esquiva de lado', () => {
    const { boss, player, map } = arena();
    const ctx = createModelContext(map, boss);
    const state = duel(boss, player);
    const stand = evaluateVolley(ctx, state, 'fan_wide', 'stand');
    const dodge = evaluateVolley(ctx, state, 'fan_wide', 'left');
    expect(stand.damage).toBeGreaterThan(0);
    expect(stand.hits).toBeGreaterThan(dodge.hits);
  });

  it('el siguiente estado avanza el reloj y es el mismo para cualquier ataque', () => {
    const { boss, player, map } = arena();
    const ctx = createModelContext(map, boss);
    const state = duel(boss, player);
    const a = evaluateVolley(ctx, state, 'fan', 'left');
    const b = evaluateVolley(ctx, state, 'cross', 'left');
    expect(a.next).toBe(b.next);
    expect(a.next.timeMs).toBeGreaterThan(state.timeMs);
  });

  it('el daño nunca es negativo ni supera el máximo posible de la salva', () => {
    const { boss, player, map } = arena();
    const ctx = createModelContext(map, boss);
    const state = duel(boss, player);
    for (const kind of bossRepertoire(boss.behavior)) {
      for (const response of PLAYER_RESPONSES) {
        const outcome = evaluateVolley(ctx, state, kind, response);
        expect(outcome.damage).toBeGreaterThanOrEqual(0);
        expect(outcome.hits).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe('política expectimax', () => {
  it('elige un ataque del conjunto permitido y la misma entrada da la misma decisión', () => {
    const { boss, player, map } = arena();
    const pick = () =>
      createExpectimaxBossPolicy({ depth: 2 }).pickVolley(boss, player, map, baseContext, 5000);
    const first = pick();
    expect(volleyCandidates(boss.behavior, boss.phase, baseContext)).toContain(first);
    expect(pick()).toBe(first);
  });

  it('con repertorio completo el ataque elegido es el de mayor valor esperado de daño', () => {
    const { boss, player, map } = arena();
    const policy = createExpectimaxBossPolicy({ depth: 1, pool: 'repertoire' });
    const kind = policy.pickVolley(boss, player, map, baseContext, 5000);
    const decision = policy.lastDecision()!;
    const best = Math.max(...decision.values.map((entry) => entry.value));
    expect(decision.values.find((entry) => entry.kind === kind)!.value).toBeCloseTo(best, 9);
    expect(decision.values.length).toBe(bossRepertoire(boss.behavior).length);
  });

  it('la caché mantiene acotado el número de evaluaciones', () => {
    const { boss, player, map } = arena();
    const policy = createExpectimaxBossPolicy({ depth: 2, pool: 'repertoire' });
    policy.pickVolley(boss, player, map, baseContext, 5000);
    const k = bossRepertoire(boss.behavior).length;
    // Raíz: k·5. Segundo nivel: 5 estados siguientes compartidos por todos los ataques, cada uno k·5.
    expect(policy.stats.evaluations).toBeLessThanOrEqual(30 * k);
  });

  it('ritmo: con déficit alto elige más daño que con déficit negativo', () => {
    const { boss, player, map } = arena();
    const damageRank = createExpectimaxBossPolicy({ depth: 1, pool: 'repertoire' });
    damageRank.pickVolley(boss, player, map, baseContext, 5000);
    const valueOf = (kind: BossVolleyKind) => damageRank.lastDecision()!.values.find((e) => e.kind === kind)!.value;

    const decide = (damageBetween: number): BossVolleyKind => {
      const policy = createExpectimaxBossPolicy({
        depth: 1,
        pool: 'repertoire',
        objective: 'pacing',
        targetDamage: 40
      });
      policy.pickVolley(boss, { ...player, damageTaken: 0 }, map, baseContext, 5000);
      return policy.pickVolley(boss, { ...player, damageTaken: damageBetween }, map, baseContext, 7000)!;
    };
    const behind = decide(0); // no ha recibido nada: déficit +40
    const ahead = decide(120); // recibió mucho: déficit negativo
    expect(valueOf(behind)).toBeGreaterThan(valueOf(ahead));
  });

  it('ritmo: sin señal de daño no falla y el déficit queda en cero', () => {
    const { boss, player, map } = arena();
    const policy = createExpectimaxBossPolicy({ objective: 'pacing', targetDamage: 5 });
    const blind = { ...player, health: undefined, damageTaken: undefined };
    expect(policy.pickVolley(boss, blind, map, baseContext, 5000)).not.toBeNull();
    expect(policy.pickVolley(boss, blind, map, baseContext, 7000)).not.toBeNull();
  });

  it('aprendizaje: tras ver al jugador moverse a un lado, sube la probabilidad de esa respuesta', () => {
    const { boss, player, map } = arena();
    const standing = duel(boss, player);
    const velocity = responseVelocity('left', standing, 6);
    const strafing = { ...player, vx: velocity.x, vy: velocity.y };

    const learner = createExpectimaxBossPolicy({ adaptive: true });
    const fresh = createExpectimaxBossPolicy({ adaptive: true });
    for (let i = 0; i < 6; i += 1) learner.pickVolley(boss, strafing, map, baseContext, 5000 + i * 2000);

    const learned = learner.responseProbabilities(standing, boss.id);
    const prior = fresh.responseProbabilities(standing, boss.id);
    expect(learned.left).toBeGreaterThan(prior.left);
    const total = PLAYER_RESPONSES.reduce((sum, r) => sum + learned[r], 0);
    expect(total).toBeCloseTo(1, 9);
  });
});

describe('enganche con el jefe del juego', () => {
  it('sin política (o si devuelve null) el jefe usa su regla de siempre', () => {
    const a = arena();
    const b = arena();
    a.boss.nextVolleyReadyAt = 0;
    b.boss.nextVolleyReadyAt = 0;
    tickRaycastBossVolleys(a.boss, a.player, 5000, a.map);
    tickRaycastBossVolleys(b.boss, b.player, 5000, b.map, { pickVolley: () => null });
    expect(b.boss.pendingVolleyKind).toBe(a.boss.pendingVolleyKind);
    expect(a.boss.pendingVolleyKind).not.toBe('none');
  });

  it('con política, el ataque lanzado es el que ella elige', () => {
    const { boss, player, map } = arena();
    boss.nextVolleyReadyAt = 0;
    tickRaycastBossVolleys(boss, player, 5000, map, { pickVolley: () => 'zone_deny' });
    expect(boss.pendingVolleyKind).toBe('zone_deny');
  });

  it('la regla original no cambió: el ataque que elige coincide con pickBossVolleyKind', () => {
    const { boss } = arena();
    const kind = pickBossVolleyKind(boss, baseContext);
    expect(volleyCandidates(boss.behavior, boss.phase, baseContext)).toContain(kind);
    expect(isBossDesperation(boss)).toBe(false);
  });
});

describe('políticas base y simulador', () => {
  it('fija: siempre el mismo ataque si está en el repertorio; null si no', () => {
    const { boss, player, map } = arena();
    expect(createFixedKindPolicy('fan_wide').pickVolley(boss, player, map, baseContext, 0)).toBe('fan_wide');
    expect(createFixedKindPolicy('verdict_rush').pickVolley(boss, player, map, baseContext, 0)).toBeNull();
  });

  it('azar: reproducible con semilla y siempre dentro del repertorio', () => {
    const { boss, player, map } = arena();
    const sequence = (seed: number) => {
      const policy = createRandomRepertoirePolicy(seed);
      return Array.from({ length: 20 }, () => policy.pickVolley(boss, player, map, baseContext, 0));
    };
    expect(sequence(3)).toEqual(sequence(3));
    expect(sequence(3)).not.toEqual(sequence(4));
    for (const kind of sequence(3)) expect(bossRepertoire(boss.behavior)).toContain(kind);
  });

  it('episodio con política: determinista, cuenta salvas y cambia la partida', () => {
    const options = {
      levelId: RAYCAST_LEVEL_BOSS.id,
      bot: scriptedBotFactory,
      maxMs: 20_000,
      bossPolicyFactory: () => createExpectimaxBossPolicy({ depth: 2, pool: 'repertoire' })
    };
    const a = runEpisode({ ...options, seed: 2 });
    const b = runEpisode({ ...options, seed: 2 });
    expect(b).toEqual(a);
    expect(a.bossVolleys).toBeGreaterThan(3);
    const rule = runEpisode({ ...options, bossPolicyFactory: undefined, seed: 2 });
    expect(rule.digest).not.toBe(a.digest);
  });

  it('el repertorio de cada jefe es no vacío y contiene sus ataques de fase 1', () => {
    for (const behavior of ['volt-archon', 'bloom-warden', 'ash-judge'] as const) {
      const repertoire = bossRepertoire(behavior);
      expect(repertoire.length).toBeGreaterThan(2);
      for (const kind of volleyCandidates(behavior, 1, baseContext)) expect(repertoire).toContain(kind);
    }
  });
});
