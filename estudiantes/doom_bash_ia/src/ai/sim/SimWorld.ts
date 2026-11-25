/**
 * Mundo simulado (M0): corre enemigos, proyectiles, jefe y combate sin Phaser.
 *
 * No reimplementa reglas del juego. Llama, en el mismo orden que `RaycastScene.update`, a las
 * funciones puras que el juego ya usa (`updateRaycastEnemies`, `tickRaycastBossVolleys`,
 * `RaycastCombatSystem.fire`, ...). Lo único propio es el jugador: su movimiento reutiliza
 * `moveWithWallSlide` y su "mando" es una `PlayerAction` en lugar de teclado y ratón.
 *
 * Simplificaciones declaradas (ver docs/SIMULADOR.md):
 * - Las puertas empiezan abiertas, así todos los enemigos son alcanzables sin recoger llaves.
 * - Sin `directorConfig` no hay director de spawns. Con él se usa el `GameDirector` real, pero sin variantes élite,
 *   rebalanceo de tipos ni resolución de puntos de aparición de la escena.
 * - No hay eventos de nivel, pickups, curación pasiva ni explosiones de enemigos suicidas.
 * - Un solo jefe (sin coordinación de jefes dobles).
 */
import {
  cloneRaycastEnemies,
  createTelegraphedRaycastEnemy,
  isRaycastEnemyTelegraphing,
  type RaycastEnemy
} from '../../game/raycast/RaycastEnemy';
import { DEFAULT_DIRECTOR_CONFIG, type DirectorConfig } from '../../game/systems/DirectorConfig';
import { GameDirector, type SpawnRequest } from '../../game/systems/GameDirector';
import {
  hasLineOfSight,
  updateRaycastEnemies,
  updateRaycastEnemyProjectiles,
  type RaycastEnemyProjectile
} from '../../game/raycast/RaycastEnemySystem';
import {
  computeRaycastBossWeaponDamage,
  countRaycastBossConnectingPellets,
  createRaycastBossState,
  damageRaycastBoss,
  tickRaycastBossArenaTwist,
  tickRaycastBossMovement,
  tickRaycastBossVolleys,
  type RaycastBossState
} from '../../game/raycast/RaycastBoss';
import type { RaycastBossPlayerContext } from '../../game/raycast/RaycastBossAI';
import { RaycastCombatSystem } from '../../game/raycast/RaycastCombatSystem';
import { scaleRaycastIncomingDamage } from '../../game/raycast/RaycastDifficulty';
import {
  cloneRaycastMap,
  getRaycastLevelById,
  getSafeDirectorSpawnPoints,
  openRaycastDoor,
  type RaycastLevel
} from '../../game/raycast/RaycastLevel';
import { propagateRaycastGroupAlert, RAYCAST_MEMORY_SEARCH_MS } from '../../game/raycast/RaycastEnemyTactics';
import type { RaycastBossPolicy } from '../../game/raycast/RaycastBossPolicy';
import type { RaycastEnemyNavigator } from '../../game/raycast/RaycastEnemyNavigator';
import type { RaycastMap } from '../../game/raycast/RaycastMap';
import {
  collides,
  getCameraRelativeInput,
  moveWithWallSlide,
  RAYCAST_MOVEMENT,
  updateRaycastVelocity
} from '../../game/raycast/RaycastMovement';
import type { RaycastPlayerState } from '../../game/raycast/RaycastPlayerController';
import type { PlayerAction, RaycastDifficultyId, SimBossView, SimEnemyView, SimObservation, SimOutcome } from '../types';
import { createSeededRng, SeededRng, symmetricNoise, withMathRandom, type Rng } from './rng';

/** Paso fijo de simulación: 50 Hz. La escena limita su delta a 50 ms, esto queda por debajo. */
export const SIM_DEFAULT_DT_MS = 20;
/** El reloj de la escena no arranca en 0; evita que `lastAttack = 0` parezca "recién atacó". */
const SIM_START_TIME_MS = 1000;
const PLAYER_MAX_HEALTH = 100;
/** Magnitud (en unidades de mapa) de la perturbación de posición inicial por semilla. */
const START_JITTER = 0.35;
const START_ANGLE_JITTER = 0.4;

export interface EnemyScaling {
  damage: number;
  speed: number;
}

export interface SimWorldOptions {
  levelId: string;
  seed: number;
  difficultyId?: RaycastDifficultyId;
  /** Por omisión true: abre todas las puertas para que el nivel sea completamente alcanzable. */
  openDoors?: boolean;
  /** Navegación de enemigos por rutas. Sin ella, los enemigos se mueven con la regla original. */
  navigator?: RaycastEnemyNavigator;
  /**
   * Escenario "persecución": cada tantos ms todos los enemigos se enteran de dónde está el jugador,
   * como si no dejara de disparar. 0 o ausente: sin alertas artificiales.
   */
  alertRefreshMs?: number;
  /** Política de elección de ataques del jefe. Sin ella, rige la regla original. */
  bossPolicy?: RaycastBossPolicy;
  /**
   * Activa el director de spawns del juego con esta configuración encima de la del nivel. Es lo que el bandido
   * (M3) elige. Ignorado si el nivel no tiene director.
   */
  directorConfig?: Partial<DirectorConfig>;
  /**
   * Escala el daño y la velocidad de todos los enemigos (los del nivel y los del director). El juego ya trae esos
   * campos por enemigo (`damageMultiplier`, `speedMultiplier`); aquí se fijan una vez al crearlos.
   */
  enemyScaling?: EnemyScaling;
  /** El daño se registra pero la vida no baja: sirve para medir presión sostenida sin que el episodio termine. */
  invulnerable?: boolean;
}

/** Un enemigo "llega" cuando queda a esta distancia (en celdas) del jugador. */
export const SIM_ARRIVAL_RADIUS = 1.2;

export interface SimStats {
  damageTaken: number;
  enemiesKilled: number;
  pelletsFired: number;
  pelletsHit: number;
  /** Tiempo (desde el inicio del episodio) del primer daño recibido; null si nunca hubo. */
  firstDamageMs: number | null;
  /** Tiempo de llegada de cada enemigo distinto que alcanzó al jugador, en orden de llegada. */
  arrivalTimesMs: number[];
  /** Cuántas salvas lanzaron los jefes. */
  bossVolleys: number;
  /** Enemigos que el director hizo aparecer. */
  directorSpawns: number;
}

export interface SimWorld {
  readonly level: RaycastLevel;
  readonly map: RaycastMap;
  readonly seed: number;
  readonly difficultyId: RaycastDifficultyId;
  readonly enemiesTotal: number;
  readonly combat: RaycastCombatSystem;
  /**
   * Aleatoriedad del núcleo del juego (merodeo de enemigos, etc.). Se instala como `Math.random`
   * solo durante un paso. Es parte del estado del mundo.
   */
  readonly gameRng: SeededRng;
  readonly navigator: RaycastEnemyNavigator | null;
  readonly alertRefreshMs: number;
  readonly invulnerable: boolean;
  readonly bossPolicy: RaycastBossPolicy | null;
  readonly enemyScaling: EnemyScaling;
  readonly director: GameDirector | null;
  /** Presupuesto total de apariciones del director (con la configuración ya mezclada). */
  readonly directorBudget: number;
  lastDamageAtMs: number;
  nextAlertAtMs: number;
  readonly arrivedIds: Set<string>;
  enemies: RaycastEnemy[];
  projectiles: RaycastEnemyProjectile[];
  bosses: RaycastBossState[];
  player: RaycastPlayerState;
  health: number;
  alive: boolean;
  timeMs: number;
  stationaryMs: number;
  stats: SimStats;
}

export function createSimWorld(options: SimWorldOptions): SimWorld {
  const level = getRaycastLevelById(options.levelId);
  if (level.id !== options.levelId) {
    throw new Error(`Nivel desconocido: "${options.levelId}" (el catálogo devolvió "${level.id}")`);
  }
  const map = cloneRaycastMap(level.map);
  if (options.openDoors ?? true) {
    for (const door of level.doors) openRaycastDoor(map, door);
  }
  const player = createStartingPlayer(level, map, createSeededRng(options.seed));
  const enemyScaling = options.enemyScaling ?? { damage: 1, speed: 1 };
  const enemies = cloneRaycastEnemies(level);
  for (const enemy of enemies) scaleEnemy(enemy, enemyScaling);
  const directorActive = options.directorConfig !== undefined && level.director.enabled;
  const mergedDirector = { ...DEFAULT_DIRECTOR_CONFIG, ...level.director.config, ...options.directorConfig };
  const director = directorActive
    ? new GameDirector({ config: mergedDirector, spawnPoints: level.director.spawnPoints })
    : null;
  const bosses = level.bossConfig
    ? [createRaycastBossState(level.bossConfig, SIM_START_TIME_MS, { arenaLevelId: level.id })]
    : [];
  const world: SimWorld = {
    level,
    map,
    seed: options.seed,
    difficultyId: options.difficultyId ?? 'standard',
    enemiesTotal: enemies.length + bosses.length,
    combat: new RaycastCombatSystem(),
    gameRng: new SeededRng((options.seed ^ 0xa5a5a5a5) >>> 0),
    navigator: options.navigator ?? null,
    alertRefreshMs: options.alertRefreshMs ?? 0,
    invulnerable: options.invulnerable ?? false,
    bossPolicy: options.bossPolicy ?? null,
    enemyScaling,
    director,
    directorBudget: director ? mergedDirector.maxTotalSpawns : 0,
    lastDamageAtMs: SIM_START_TIME_MS,
    nextAlertAtMs: SIM_START_TIME_MS,
    arrivedIds: new Set(),
    enemies,
    projectiles: [],
    bosses,
    player,
    health: PLAYER_MAX_HEALTH,
    alive: true,
    timeMs: SIM_START_TIME_MS,
    stationaryMs: 0,
    stats: { damageTaken: 0, enemiesKilled: 0, pelletsFired: 0, pelletsHit: 0, firstDamageMs: null, arrivalTimesMs: [], bossVolleys: 0, directorSpawns: 0 }
  };
  if (director) for (const spawn of director.createOpeningSpawns()) spawnDirectorEnemy(world, spawn);
  return world;
}

function createStartingPlayer(level: RaycastLevel, map: RaycastMap, rng: Rng): RaycastPlayerState {
  const start = level.playerStart;
  const x = start.x + symmetricNoise(rng) * START_JITTER;
  const y = start.y + symmetricNoise(rng) * START_JITTER;
  const angle = start.angle + symmetricNoise(rng) * START_ANGLE_JITTER;
  const free = !collides(map, x, y, RAYCAST_MOVEMENT.collisionRadius);
  return { x: free ? x : start.x, y: free ? y : start.y, angle, velocity: { x: 0, y: 0 } };
}

export function isSimWorldDone(world: SimWorld): SimOutcome | null {
  if (!world.alive) return 'death';
  const enemiesLeft = world.enemies.some((enemy) => enemy.alive);
  const bossesLeft = world.bosses.some((boss) => boss.alive);
  const directorPending = world.director !== null && world.stats.directorSpawns < world.directorBudget;
  if (!enemiesLeft && !bossesLeft && !directorPending) return 'cleared';
  return null;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function observeSimWorld(world: SimWorld): SimObservation {
  const { player, map, timeMs } = world;
  const ammo = world.combat.getAmmoState();
  const enemies: SimEnemyView[] = world.enemies
    .filter((enemy) => enemy.alive && !isRaycastEnemyTelegraphing(enemy, timeMs))
    .map((enemy) => {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      return {
        id: enemy.id,
        kind: enemy.kind,
        x: enemy.x,
        y: enemy.y,
        health: enemy.health,
        distance: Math.hypot(dx, dy),
        bearing: Math.atan2(dy, dx),
        hasLineOfSight: hasLineOfSight(map, { x: player.x, y: player.y }, { x: enemy.x, y: enemy.y })
      };
    })
    .sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : 1));
  const liveBoss = world.bosses.find((boss) => boss.alive);
  let boss: SimBossView | null = null;
  if (liveBoss) {
    const dx = liveBoss.x - player.x;
    const dy = liveBoss.y - player.y;
    boss = {
      x: liveBoss.x,
      y: liveBoss.y,
      health: liveBoss.health,
      maxHealth: liveBoss.maxHealth,
      phase: liveBoss.phase,
      distance: Math.hypot(dx, dy),
      bearing: Math.atan2(dy, dx),
      hasLineOfSight: hasLineOfSight(map, { x: player.x, y: player.y }, { x: liveBoss.x, y: liveBoss.y }),
      telegraphing: timeMs < liveBoss.telegraphUntil
    };
  }
  return {
    timeMs,
    map,
    player: {
      x: player.x,
      y: player.y,
      angle: player.angle,
      health: world.health,
      maxHealth: PLAYER_MAX_HEALTH,
      ammo: ammo.current,
      ammoCapacity: ammo.capacity,
      reloading: world.combat.isReloading(timeMs),
      stationaryMs: world.stationaryMs
    },
    enemies,
    boss,
    projectilesInFlight: world.projectiles.filter((projectile) => projectile.alive).length,
    projectiles: world.projectiles
      .filter((projectile) => projectile.alive)
      .map((projectile) => ({
        x: projectile.x,
        y: projectile.y,
        vx: projectile.vx,
        vy: projectile.vy,
        radius: projectile.radius
      }))
  };
}

function damagePlayer(world: SimWorld, rawDamage: number): void {
  if (!world.alive || rawDamage <= 0) return;
  const applied = scaleRaycastIncomingDamage(rawDamage, world.difficultyId);
  if (!world.invulnerable) world.health = Math.max(0, world.health - applied);
  world.stats.damageTaken += applied;
  world.stats.firstDamageMs ??= world.timeMs - SIM_START_TIME_MS;
  world.lastDamageAtMs = world.timeMs;
  if (world.health === 0) world.alive = false;
}

function firePlayerWeapon(world: SimWorld): void {
  const result = world.combat.fire(world.player, world.enemies, world.map, world.timeMs);
  if (!result.fired) return;
  world.stats.pelletsFired += result.pelletCount;
  world.stats.pelletsHit += result.hitCount;
  world.stats.enemiesKilled += result.killCount;

  const boss = world.bosses
    .filter((candidate) => candidate.alive)
    .sort(
      (a, b) =>
        Math.hypot(a.x - world.player.x, a.y - world.player.y) - Math.hypot(b.x - world.player.x, b.y - world.player.y)
    )[0];
  if (!boss) return;
  const baseDamage = computeRaycastBossWeaponDamage(boss, world.player, world.map, result.weaponKind, 'raycast');
  if (baseDamage <= 0) return;
  const pellets = countRaycastBossConnectingPellets(boss, world.player, world.map, result.weaponKind, 'raycast');
  world.stats.pelletsHit += pellets;
  const killed = damageRaycastBoss(boss, Math.max(1, Math.round(baseDamage)), world.timeMs, {
    fromX: world.player.x,
    fromY: world.player.y,
    map: world.map
  });
  if (killed) world.stats.enemiesKilled += 1;
}

const DIRECTOR_SPAWN_TELEGRAPH_MS = 820;

function scaleEnemy(enemy: RaycastEnemy, scaling: EnemyScaling): void {
  enemy.damageMultiplier = (enemy.damageMultiplier ?? 1) * scaling.damage;
  enemy.speedMultiplier = (enemy.speedMultiplier ?? 1) * scaling.speed;
}

function spawnDirectorEnemy(world: SimWorld, spawn: SpawnRequest): void {
  const id = `director-${world.stats.directorSpawns}`;
  world.stats.directorSpawns += 1;
  const enemy = createTelegraphedRaycastEnemy(
    { id, kind: spawn.kind, x: spawn.x, y: spawn.y },
    { telegraphStartedAt: world.timeMs, telegraphDurationMs: DIRECTOR_SPAWN_TELEGRAPH_MS }
  );
  scaleEnemy(enemy, world.enemyScaling);
  world.enemies.push(enemy);
}

/** Equivale a `RaycastScene.updateGameDirector` sin patrones de encuentro. */
function tickDirector(world: SimWorld): void {
  const { director, player } = world;
  if (!director) return;
  const safePoints = getSafeDirectorSpawnPoints(world.level, player, null, {
    map: world.map,
    enemies: world.enemies,
    allowVisibleFrontSpawns: false
  });
  const decision = director.update({
    elapsedTime: world.timeMs,
    totalKills: world.stats.enemiesKilled,
    enemiesAlive: world.enemies.filter((enemy) => enemy.alive).length,
    p1Health: world.health,
    p2Health: world.health,
    p1Alive: world.alive,
    p2Alive: world.alive,
    currentWave: 1,
    timeSincePlayerDamagedMs: Math.max(0, world.timeMs - world.lastDamageAtMs),
    playerStationaryMs: world.stationaryMs,
    activeZoneId: null,
    activatedTriggerCount: 0,
    distanceToImportantPickup: null,
    spawnPoints: safePoints,
    encounterPattern: null
  });
  if (decision.spawn) spawnDirectorEnemy(world, decision.spawn);
  for (const extra of decision.extraSpawns) spawnDirectorEnemy(world, extra);
}

/** Avanza el mundo `dtMs` milisegundos con la acción dada. Devuelve el desenlace si el episodio terminó. */
export function stepSimWorld(world: SimWorld, action: PlayerAction, dtMs: number = SIM_DEFAULT_DT_MS): SimOutcome | null {
  return withMathRandom(world.gameRng.next, () => stepSimWorldInner(world, action, dtMs));
}

function stepSimWorldInner(world: SimWorld, action: PlayerAction, dtMs: number): SimOutcome | null {
  const done = isSimWorldDone(world);
  if (done) return done;

  const { player } = world;
  world.combat.tick(world.timeMs);

  // 1. Movimiento del jugador (equivale a RaycastPlayerController.update).
  const turn = clampUnit(action.turn);
  const angle = player.angle + turn * RAYCAST_MOVEMENT.turnSpeed * (dtMs / 1000);
  const input = getCameraRelativeInput(clampUnit(action.forward), clampUnit(action.strafe), angle);
  const velocity = updateRaycastVelocity(player.velocity, input, dtMs);
  const moved = moveWithWallSlide(world.map, { x: player.x, y: player.y, angle, velocity }, dtMs);
  player.x = moved.x;
  player.y = moved.y;
  player.angle = moved.angle;
  player.velocity = moved.velocity;
  world.stationaryMs = Math.hypot(player.velocity.x, player.velocity.y) > 0.05 ? 0 : world.stationaryMs + dtMs;

  // 2. Armas.
  if (action.reload) world.combat.tryReload(world.timeMs);
  if (action.fire) firePlayerWeapon(world);

  // 3. Jefes y enemigos (equivale a RaycastScene.updateEnemies).
  const target = { x: player.x, y: player.y, alive: world.alive };
  const bossContext: RaycastBossPlayerContext = {
    ...target,
    stationaryMs: world.stationaryMs,
    vx: player.velocity.x,
    vy: player.velocity.y,
    health: world.health,
    damageTaken: world.stats.damageTaken
  };
  for (const boss of world.bosses) {
    if (!boss.alive) continue;
    tickRaycastBossMovement(boss, world.map, bossContext, dtMs, world.timeMs);
    const volley = tickRaycastBossVolleys(boss, bossContext, world.timeMs, world.map, world.bossPolicy ?? undefined);
    if (volley.length > 0) world.stats.bossVolleys += 1;
    world.projectiles.push(...volley);
    tickRaycastBossArenaTwist(boss, world.timeMs);
  }
  if (world.alertRefreshMs > 0 && world.timeMs >= world.nextAlertAtMs) {
    propagateRaycastGroupAlert(
      world.enemies,
      world.player.x,
      world.player.y,
      world.timeMs,
      1_000_000,
      world.timeMs + RAYCAST_MEMORY_SEARCH_MS
    );
    world.nextAlertAtMs = world.timeMs + world.alertRefreshMs;
  }
  const enemyResult = updateRaycastEnemies(world.map, world.enemies, target, world.timeMs, dtMs, {
    speedMultiplier: 1,
    projectileSpeedMultiplier: 1,
    navigator: world.navigator ?? undefined
  });
  for (const enemy of world.enemies) {
    if (!enemy.alive || world.arrivedIds.has(enemy.id)) continue;
    if (Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y) <= SIM_ARRIVAL_RADIUS) {
      world.arrivedIds.add(enemy.id);
      world.stats.arrivalTimesMs.push(world.timeMs - SIM_START_TIME_MS);
    }
  }
  world.projectiles.push(...enemyResult.spawnedProjectiles);
  damagePlayer(world, enemyResult.meleeDamage);
  damagePlayer(world, updateRaycastEnemyProjectiles(world.map, world.projectiles, target, world.timeMs, dtMs));
  world.projectiles = world.projectiles.filter((projectile) => projectile.alive);
  tickDirector(world);

  world.timeMs += dtMs;
  return isSimWorldDone(world);
}
