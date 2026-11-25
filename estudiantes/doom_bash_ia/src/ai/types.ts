/**
 * Tipos compartidos de la capa de IA (M0 en adelante).
 *
 * Regla de diseño: todo lo que vive en `src/ai/` son funciones puras que no importan Phaser.
 * Así el mismo código corre en el juego, en el servidor co-op y en el simulador sin navegador.
 */
import type { RaycastDifficultyId } from '../game/raycast/RaycastDifficulty';
import type { RaycastMap } from '../game/raycast/RaycastMap';
import type { EnemyKind } from '../game/types/game';

export type { RaycastDifficultyId };

/**
 * Banderas de comportamiento. Cada IA nueva se activa con una bandera y la regla vieja sigue
 * disponible: sin la línea base no hay comparación, y las comparaciones son el proyecto.
 */
export interface AiFlags {
  enemyNavigation: 'legacy' | 'astar';
  bossPolicy: 'rule' | 'expectimax' | 'mcts';
  director: 'fixed' | 'bandit';
}

export const DEFAULT_AI_FLAGS: AiFlags = {
  enemyNavigation: 'legacy',
  bossPolicy: 'rule',
  director: 'fixed'
};

/**
 * Acción del jugador en un paso de simulación.
 * `forward` y `strafe` van de -1 a 1 (strafe positivo = derecha); `turn` de -1 a 1
 * (1 = giro máximo a la derecha, en sentido horario visto desde arriba).
 */
export interface PlayerAction {
  forward: number;
  strafe: number;
  turn: number;
  fire: boolean;
  reload: boolean;
}

export const IDLE_ACTION: PlayerAction = { forward: 0, strafe: 0, turn: 0, fire: false, reload: false };

export interface SimEnemyView {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  health: number;
  distance: number;
  /** Ángulo absoluto desde el jugador hacia el enemigo, en radianes. */
  bearing: number;
  hasLineOfSight: boolean;
}

export interface SimBossView {
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  phase: number;
  distance: number;
  bearing: number;
  hasLineOfSight: boolean;
  telegraphing: boolean;
}

/** Lo que un bot puede ver del mundo en un paso. */
export interface SimObservation {
  timeMs: number;
  /** Mapa del nivel (solo lectura). Permite a un bot planear rutas; no cambia durante el episodio. */
  map: RaycastMap;
  player: {
    x: number;
    y: number;
    angle: number;
    health: number;
    maxHealth: number;
    ammo: number;
    ammoCapacity: number;
    reloading: boolean;
    stationaryMs: number;
  };
  /** Enemigos vivos y ya materializados, del más cercano al más lejano. */
  enemies: SimEnemyView[];
  boss: SimBossView | null;
  projectilesInFlight: number;
  /** Proyectiles hostiles en el aire, para bots que esquivan. */
  projectiles: SimProjectileView[];
}

export interface SimProjectileView {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface SimBot {
  readonly name: string;
  decide(observation: SimObservation): PlayerAction;
}

/** Cada episodio crea su bot desde la semilla para que dos corridas con la misma semilla coincidan. */
export type SimBotFactory = (seed: number) => SimBot;

export type SimOutcome = 'cleared' | 'death' | 'timeout';

export interface SimEpisodeResult {
  levelId: string;
  bot: string;
  seed: number;
  difficulty: RaycastDifficultyId;
  outcome: SimOutcome;
  /** Tiempo simulado, no de reloj. */
  durationMs: number;
  healthRemaining: number;
  damageTaken: number;
  enemiesTotal: number;
  enemiesKilled: number;
  bossHealthFraction: number | null;
  pelletsFired: number;
  pelletsHit: number;
  /** Tiempo del primer daño recibido; null si nunca recibió. */
  firstDamageMs: number | null;
  /** Cuántos enemigos distintos llegaron a menos de `SIM_ARRIVAL_RADIUS` del jugador. */
  enemiesArrived: number;
  /** Media del tiempo de llegada de los que llegaron; null si ninguno llegó. */
  meanArrivalMs: number | null;
  /** Salvas lanzadas por los jefes (0 en niveles sin jefe). */
  bossVolleys: number;
  /** Enemigos que hizo aparecer el director (0 si el episodio no lo usa). */
  directorSpawns: number;
  /** Huella del estado del mundo a lo largo del episodio (FNV-1a de 32 bits, en hexadecimal). */
  digest: string;
}
