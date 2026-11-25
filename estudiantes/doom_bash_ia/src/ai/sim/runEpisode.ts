import type { DirectorConfig } from '../../game/systems/DirectorConfig';
import type { RaycastBossPolicy } from '../../game/raycast/RaycastBossPolicy';
import type { RaycastEnemyNavigator } from '../../game/raycast/RaycastEnemyNavigator';
import type { RaycastDifficultyId, SimBotFactory, SimEpisodeResult, SimOutcome } from '../types';
import { createSimWorld, observeSimWorld, type EnemyScaling, SIM_DEFAULT_DT_MS, stepSimWorld, type SimWorld } from './SimWorld';

export interface EpisodeOptions {
  levelId: string;
  seed: number;
  bot: SimBotFactory;
  difficultyId?: RaycastDifficultyId;
  /** Tiempo simulado máximo antes de declarar `timeout`. */
  maxMs?: number;
  dtMs?: number;
  openDoors?: boolean;
  /** Fábrica del navegador de enemigos; se llama una vez por episodio porque el navegador guarda estado. */
  navigatorFactory?: () => RaycastEnemyNavigator;
  /** Escenario persecución: ver `SimWorldOptions.alertRefreshMs`. */
  alertRefreshMs?: number;
  /** Ver `SimWorldOptions.invulnerable`. */
  invulnerable?: boolean;
  /** Escala daño y velocidad de los enemigos (ver `SimWorldOptions.enemyScaling`). */
  enemyScaling?: EnemyScaling;
  /** Director de spawns del juego con esta configuración (ver `SimWorldOptions.directorConfig`). */
  directorConfig?: Partial<DirectorConfig>;
  /** Fábrica de la política del jefe; se llama una vez por episodio porque la política puede guardar estado. */
  bossPolicyFactory?: (seed: number) => RaycastBossPolicy;
}

const DEFAULT_MAX_MS = 90_000;
/** Cada cuántos pasos se mezcla el estado del mundo en la huella. */
const DIGEST_EVERY_TICKS = 10;

/** FNV-1a de 32 bits sobre enteros; sirve para comprobar que dos corridas fueron idénticas. */
class Digest {
  private hash = 0x811c9dc5;

  add(value: number): void {
    const int = Math.round(value) | 0;
    for (let byte = 0; byte < 4; byte += 1) {
      this.hash ^= (int >>> (byte * 8)) & 0xff;
      this.hash = Math.imul(this.hash, 0x01000193) >>> 0;
    }
  }

  hex(): string {
    return this.hash.toString(16).padStart(8, '0');
  }
}

function mixWorld(digest: Digest, world: SimWorld): void {
  const { player } = world;
  digest.add(world.timeMs);
  digest.add(player.x * 1000);
  digest.add(player.y * 1000);
  digest.add(player.angle * 1000);
  digest.add(world.health);
  for (const enemy of world.enemies) {
    digest.add(enemy.x * 1000);
    digest.add(enemy.y * 1000);
    digest.add(enemy.health);
  }
  for (const boss of world.bosses) {
    digest.add(boss.x * 1000);
    digest.add(boss.y * 1000);
    digest.add(boss.health);
  }
  digest.add(world.projectiles.length);
}

export function runEpisode(options: EpisodeOptions): SimEpisodeResult {
  const dtMs = options.dtMs ?? SIM_DEFAULT_DT_MS;
  const maxMs = options.maxMs ?? DEFAULT_MAX_MS;
  const difficulty = options.difficultyId ?? 'standard';
  const world = createSimWorld({
    levelId: options.levelId,
    seed: options.seed,
    difficultyId: difficulty,
    openDoors: options.openDoors,
    navigator: options.navigatorFactory?.(),
    alertRefreshMs: options.alertRefreshMs,
    invulnerable: options.invulnerable,
    directorConfig: options.directorConfig,
    enemyScaling: options.enemyScaling,
    bossPolicy: options.bossPolicyFactory?.(options.seed)
  });
  const bot = options.bot(options.seed);
  const digest = new Digest();

  let outcome: SimOutcome | null = null;
  let elapsedMs = 0;
  let ticks = 0;
  while (outcome === null && elapsedMs < maxMs) {
    outcome = stepSimWorld(world, bot.decide(observeSimWorld(world)), dtMs);
    elapsedMs += dtMs;
    ticks += 1;
    if (ticks % DIGEST_EVERY_TICKS === 0) mixWorld(digest, world);
  }
  mixWorld(digest, world);

  const boss = world.bosses[0];
  return {
    levelId: options.levelId,
    bot: bot.name,
    seed: options.seed,
    difficulty,
    outcome: outcome ?? 'timeout',
    durationMs: elapsedMs,
    healthRemaining: world.health,
    damageTaken: world.stats.damageTaken,
    enemiesTotal: world.enemiesTotal,
    enemiesKilled: world.stats.enemiesKilled,
    bossHealthFraction: boss ? boss.health / boss.maxHealth : null,
    pelletsFired: world.stats.pelletsFired,
    pelletsHit: world.stats.pelletsHit,
    bossVolleys: world.stats.bossVolleys,
    directorSpawns: world.stats.directorSpawns,
    firstDamageMs: world.stats.firstDamageMs,
    enemiesArrived: world.stats.arrivalTimesMs.length,
    meanArrivalMs:
      world.stats.arrivalTimesMs.length > 0
        ? world.stats.arrivalTimesMs.reduce((sum, ms) => sum + ms, 0) / world.stats.arrivalTimesMs.length
        : null,
    digest: digest.hex()
  };
}

export function runBatch(base: Omit<EpisodeOptions, 'seed'>, seeds: readonly number[]): SimEpisodeResult[] {
  return seeds.map((seed) => runEpisode({ ...base, seed }));
}
