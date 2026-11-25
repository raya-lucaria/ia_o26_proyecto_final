/**
 * Bots de referencia (M0). Son el rival contra el que se mide cada mejora de IA:
 * - quieto: no hace nada. Mide cuánto daño hacen los enemigos a un blanco inmóvil.
 * - aleatorio: movimientos y disparos al azar, sin mirar el mundo.
 * - guionado: apunta al objetivo más cercano con línea de visión, se mueve de lado y mantiene
 *   distancia. Es un jugador mediocre pero coherente, y es la referencia principal.
 */
import { IDLE_ACTION, type PlayerAction, type SimBot, type SimBotFactory, type SimObservation } from '../types';
import { RAYCAST_MOVEMENT } from '../../game/raycast/RaycastMovement';
import type { RaycastMap } from '../../game/raycast/RaycastMap';
import { searchGrid, type Waypoint } from '../astar/search';
import { createSeededRng, symmetricNoise } from './rng';

function wrapAngle(angle: number): number {
  let wrapped = angle % (Math.PI * 2);
  if (wrapped > Math.PI) wrapped -= Math.PI * 2;
  if (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export const idleBotFactory: SimBotFactory = (): SimBot => ({
  name: 'quieto',
  decide: () => IDLE_ACTION
});

export const randomBotFactory: SimBotFactory = (seed: number): SimBot => {
  const rng = createSeededRng((seed ^ 0x9e3779b9) >>> 0);
  const pick = (): number => Math.floor(rng() * 3) - 1;
  let holdUntilMs = 0;
  let current: PlayerAction = IDLE_ACTION;
  return {
    name: 'aleatorio',
    decide(observation: SimObservation): PlayerAction {
      if (observation.timeMs >= holdUntilMs) {
        holdUntilMs = observation.timeMs + 250 + rng() * 450;
        current = { forward: pick(), strafe: pick(), turn: pick(), fire: rng() < 0.35, reload: false };
      }
      if (observation.player.ammo === 0 && !observation.player.reloading) {
        return { ...current, fire: false, reload: true };
      }
      return current;
    }
  };
};

interface Target {
  x: number;
  y: number;
  bearing: number;
  distance: number;
  hasLineOfSight: boolean;
}

/**
 * Ruta por celdas hacia (toX, toY) para el bot de prueba. Usa el mismo buscador que la IA (BFS), con el
 * radio de colisión del jugador. Devuelve [] si ya está en la celda o si no hay ruta.
 */
export function findGridRoute(map: RaycastMap, fromX: number, fromY: number, toX: number, toY: number): Waypoint[] {
  return searchGrid(map, fromX, fromY, toX, toY, { algorithm: 'bfs', radius: RAYCAST_MOVEMENT.collisionRadius }).path;
}

function pickTarget(observation: SimObservation): Target | null {
  const visibleEnemy = observation.enemies.find((enemy) => enemy.hasLineOfSight);
  const enemy = visibleEnemy ?? observation.enemies[0] ?? null;
  const boss = observation.boss;
  if (boss && (!enemy || (boss.hasLineOfSight && (!visibleEnemy || boss.distance <= visibleEnemy.distance)))) {
    return boss;
  }
  return enemy;
}

const ROUTE_REPLAN_MS = 350;
/** Cuántas celdas por delante de la ruta apunta el bot; más lejos suaviza las esquinas. */
const ROUTE_LOOKAHEAD = 2;

/** Parámetros que distinguen a un jugador hábil de uno torpe. Los valores por omisión son los del bot guionado. */
export interface ScriptedBotParams {
  /** Desviación del apuntado, en radianes (ruido uniforme en ±valor). */
  aimNoise: number;
  /** Cuánto corrige el giro por radian de error. Menos ganancia = apunta más lento. */
  turnGain: number;
  /** Error angular máximo con el que se anima a disparar. */
  fireTolerance: number;
  /** Distancia por debajo de la cual retrocede. */
  retreatDistance: number;
  /**
   * Probabilidad (por decisión) de reaccionar a un proyectil que va a pegar. 0 = no esquiva nunca,
   * que es el comportamiento del bot guionado original.
   */
  dodgeReaction: number;
  name: string;
}

export const DEFAULT_SCRIPTED_PARAMS: ScriptedBotParams = {
  aimNoise: 0.04,
  turnGain: 4,
  fireTolerance: 0.1,
  retreatDistance: 3.5,
  dodgeReaction: 0,
  name: 'guionado'
};

/** Tiempo máximo hacia adelante en que un proyectil cuenta como amenaza. */
const DODGE_HORIZON_S = 0.9;

/**
 * Dirección de esquiva (vector unitario en coordenadas del mapa) si algún proyectil pasará a menos de su radio
 * más el cuerpo del jugador dentro del horizonte. Se aleja del lado por el que pasaría la bala.
 */
export function findDodgeDirection(observation: SimObservation): { x: number; y: number } | null {
  const { player, projectiles } = observation;
  let best: { x: number; y: number; urgency: number } | null = null;
  for (const projectile of projectiles) {
    const speedSq = projectile.vx * projectile.vx + projectile.vy * projectile.vy;
    if (speedSq < 1e-6) continue;
    const rx = player.x - projectile.x;
    const ry = player.y - projectile.y;
    const t = (rx * projectile.vx + ry * projectile.vy) / speedSq;
    if (t < 0 || t > DODGE_HORIZON_S) continue;
    const missX = rx - projectile.vx * t;
    const missY = ry - projectile.vy * t;
    const miss = Math.hypot(missX, missY);
    if (miss > projectile.radius + 0.45) continue;
    // Se esquiva perpendicular a la trayectoria, hacia el lado en que ya está el jugador (o el derecho si está justo en medio).
    const speed = Math.sqrt(speedSq);
    let nx = -projectile.vy / speed;
    let ny = projectile.vx / speed;
    if (nx * missX + ny * missY < 0) {
      nx = -nx;
      ny = -ny;
    }
    if (best === null || t < best.urgency) best = { x: nx, y: ny, urgency: t };
  }
  return best ? { x: best.x, y: best.y } : null;
}

/**
 * Jugador guionado con habilidad `skill` en [0, 1]. 1 apunta con precisión y retrocede a tiempo;
 * 0 apunta mal, gira lento y dispara casi sin mirar. Es un modelo de público para el director adaptativo:
 * no pretende imitar a una persona.
 */
export function skilledBotFactory(skill: number): SimBotFactory {
  const t = Math.max(0, Math.min(1, skill));
  const lerp = (low: number, high: number): number => low + (high - low) * t;
  const params: ScriptedBotParams = {
    aimNoise: lerp(0.45, 0.02),
    turnGain: lerp(1.6, 5),
    fireTolerance: lerp(0.35, 0.07),
    retreatDistance: lerp(2.2, 4),
    dodgeReaction: lerp(0.03, 0.55),
    name: `habilidad-${t.toFixed(2)}`
  };
  return (seed: number) => createScriptedBot(seed, params);
}

export const scriptedBotFactory: SimBotFactory = (seed: number): SimBot => createScriptedBot(seed, DEFAULT_SCRIPTED_PARAMS);

export function createScriptedBot(seed: number, params: ScriptedBotParams): SimBot {
  const rng = createSeededRng((seed ^ 0x85ebca6b) >>> 0);
  let strafeSign = rng() < 0.5 ? -1 : 1;
  let flipAtMs = 0;
  let route: Waypoint[] = [];
  let replanAtMs = 0;
  let nextReactionAtMs = 0;
  let reacting = false;
  return {
    name: params.name,
    decide(observation: SimObservation): PlayerAction {
      const { player } = observation;
      if (observation.timeMs >= flipAtMs) {
        strafeSign = -strafeSign;
        flipAtMs = observation.timeMs + 700 + rng() * 900;
      }
      const needsReload = player.ammo === 0 && !player.reloading;
      const target = pickTarget(observation);
      if (!target) {
        return { ...IDLE_ACTION, reload: !player.reloading && player.ammo < player.ammoCapacity };
      }
      let dodge: { x: number; y: number } | null = null;
      if (params.dodgeReaction > 0) {
        const threat = findDodgeDirection(observation);
        if (threat) {
          if (observation.timeMs >= nextReactionAtMs) {
            nextReactionAtMs = observation.timeMs + 180;
            reacting = rng() < params.dodgeReaction;
          }
          if (reacting) dodge = threat;
        } else {
          reacting = false;
        }
      }
      if (target.hasLineOfSight) {
        route = [];
        const error = wrapAngle(target.bearing - player.angle + symmetricNoise(rng) * params.aimNoise);
        let forward = 1;
        if (target.distance < params.retreatDistance) forward = -1;
        else if (target.distance <= 7) forward = 0;
        let strafe = strafeSign;
        if (dodge) {
          // Descompone la dirección de esquiva en la base de la cámara: adelante y derecha.
          const right = { x: Math.cos(player.angle + Math.PI / 2), y: Math.sin(player.angle + Math.PI / 2) };
          const side = dodge.x * right.x + dodge.y * right.y;
          if (Math.abs(side) > 0.2) strafe = side > 0 ? 1 : -1;
          const ahead = dodge.x * Math.cos(player.angle) + dodge.y * Math.sin(player.angle);
          if (Math.abs(ahead) > 0.5) forward = ahead > 0 ? 1 : -1;
        }
        return {
          forward,
          strafe,
          turn: clampUnit(error * params.turnGain),
          fire: Math.abs(error) < params.fireTolerance && !needsReload,
          reload: needsReload
        };
      }
      // Sin línea de visión: sigue una ruta por celdas hacia el objetivo y recarga si le queda poco.
      if (observation.timeMs >= replanAtMs) {
        route = findGridRoute(observation.map, player.x, player.y, target.x, target.y);
        replanAtMs = observation.timeMs + ROUTE_REPLAN_MS;
      }
      while (route.length > 1 && Math.hypot(route[0].x - player.x, route[0].y - player.y) < 0.45) route.shift();
      const waypoint = route[Math.min(ROUTE_LOOKAHEAD - 1, route.length - 1)] ?? target;
      const bearing = Math.atan2(waypoint.y - player.y, waypoint.x - player.x);
      const error = wrapAngle(bearing - player.angle);
      return {
        forward: Math.abs(error) < 1.2 ? 1 : 0,
        strafe: 0,
        turn: clampUnit(error * 4),
        fire: false,
        reload: needsReload || (!player.reloading && player.ammo < player.ammoCapacity / 2)
      };
    }
  };
}

export const REFERENCE_BOTS: readonly SimBotFactory[] = [idleBotFactory, randomBotFactory, scriptedBotFactory];
