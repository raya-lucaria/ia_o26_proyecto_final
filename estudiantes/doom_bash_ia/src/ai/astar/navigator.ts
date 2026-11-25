/**
 * Navegador de enemigos con A* (M1). Implementa `RaycastEnemyNavigator`, la interfaz que el juego acepta
 * como modificador opcional.
 *
 * Cada enemigo guarda su ruta y la recalcula cada `replanMs` o cuando la meta se mueve de celda.
 * Con `flank: true`, las celdas por las que ya van los demás enemigos cuestan más, así que A* reparte
 * a los perseguidores por rutas distintas cuando hay alternativa razonable (flanqueo).
 * El estado vive en un `WeakMap` por enemigo: el juego no se entera y no hay estado global compartido.
 */
import type { MovementVector } from '../../game/systems/MovementSystem';
import type { RaycastEnemy } from '../../game/raycast/RaycastEnemy';
import type { RaycastEnemyNavigator } from '../../game/raycast/RaycastEnemyNavigator';
import type { RaycastMap } from '../../game/raycast/RaycastMap';
import { findPathAStar, type Waypoint } from './search';

export interface AStarNavigatorOptions {
  /** Cada cuánto se recalcula la ruta de un enemigo, en ms de juego. */
  replanMs?: number;
  /** Si la meta se movió al menos esta distancia (celdas) desde el último plan, se replanea de inmediato. */
  goalMoveReplan?: number;
  /** Cuántos waypoints adelante apunta el enemigo; más alto suaviza esquinas. */
  lookahead?: number;
  /** Reparte rutas entre enemigos (flanqueo). */
  flank?: boolean;
  /** Costo extra por celda ya usada por la ruta de otro enemigo. */
  flankPenalty?: number;
  /** Las celdas a esta distancia de la meta no se penalizan: todos convergen al final. */
  flankFreeRadius?: number;
  maxNodes?: number;
}

interface RouteState {
  route: Waypoint[];
  replanAt: number;
  goalX: number;
  goalY: number;
}

const DEFAULTS: Required<AStarNavigatorOptions> = {
  replanMs: 400,
  goalMoveReplan: 1.5,
  lookahead: 2,
  flank: false,
  flankPenalty: 2.5,
  flankFreeRadius: 2.5,
  maxNodes: 1500
};

const REACHED_WAYPOINT = 0.32;

export interface AStarNavigator extends RaycastEnemyNavigator {
  /** Ruta vigente de un enemigo (solo lectura; para pruebas y para pintar en el panel de IA). */
  routeOf(enemy: RaycastEnemy): readonly Waypoint[];
  /** Cuántas veces se planeó y cuántos nodos se expandieron en total; para medir costo. */
  readonly stats: { plans: number; expanded: number };
}

export function createAStarNavigator(options: AStarNavigatorOptions = {}): AStarNavigator {
  const config = { ...DEFAULTS, ...options };
  const states = new WeakMap<RaycastEnemy, RouteState>();
  const stats = { plans: 0, expanded: 0 };

  function claimedCells(enemy: RaycastEnemy, enemies: readonly RaycastEnemy[], cols: number): Map<number, number> {
    const claimed = new Map<number, number>();
    for (const other of enemies) {
      if (other === enemy || !other.alive) continue;
      const state = states.get(other);
      if (!state) continue;
      for (const point of state.route) {
        const key = Math.floor(point.y) * cols + Math.floor(point.x);
        claimed.set(key, (claimed.get(key) ?? 0) + 1);
      }
    }
    return claimed;
  }

  function plan(
    map: RaycastMap,
    enemy: RaycastEnemy,
    enemies: readonly RaycastEnemy[],
    goalX: number,
    goalY: number,
    time: number
  ): RouteState {
    let extraCost: ((cx: number, cy: number) => number) | undefined;
    if (config.flank) {
      const cols = map.grid[0]?.length ?? 0;
      const claimed = claimedCells(enemy, enemies, cols);
      if (claimed.size > 0) {
        const freeSq = config.flankFreeRadius * config.flankFreeRadius;
        extraCost = (cx, cy) => {
          const count = claimed.get(cy * cols + cx);
          if (!count) return 0;
          const dx = cx + 0.5 - goalX;
          const dy = cy + 0.5 - goalY;
          return dx * dx + dy * dy <= freeSq ? 0 : count * config.flankPenalty;
        };
      }
    }
    const result = findPathAStar(map, enemy.x, enemy.y, goalX, goalY, {
      radius: enemy.radius,
      maxNodes: config.maxNodes,
      extraCost
    });
    stats.plans += 1;
    stats.expanded += result.expanded;
    const state: RouteState = { route: result.path, replanAt: time + config.replanMs, goalX, goalY };
    states.set(enemy, state);
    return state;
  }

  return {
    stats,
    routeOf: (enemy) => states.get(enemy)?.route ?? [],
    steer(map, enemy, enemies, goalX, goalY, time): MovementVector | null {
      let state = states.get(enemy);
      const goalMoved = state ? Math.hypot(goalX - state.goalX, goalY - state.goalY) >= config.goalMoveReplan : true;
      if (!state || goalMoved || time >= state.replanAt) state = plan(map, enemy, enemies, goalX, goalY, time);

      const route = state.route;
      while (route.length > 1 && Math.hypot(route[0].x - enemy.x, route[0].y - enemy.y) < REACHED_WAYPOINT) route.shift();
      if (route.length === 0) return null;
      const target = route[Math.min(config.lookahead - 1, route.length - 1)];
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) return null;
      return { x: dx / length, y: dy / length };
    }
  };
}
