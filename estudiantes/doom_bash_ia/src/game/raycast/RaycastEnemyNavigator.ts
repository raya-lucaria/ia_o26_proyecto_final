import type { MovementVector } from '../systems/MovementSystem';
import type { RaycastEnemy } from './RaycastEnemy';
import type { RaycastMap } from './RaycastMap';

/**
 * Punto de inyección para navegación de enemigos. El juego no sabe cómo se planea la ruta:
 * si el modificador `navigator` no está presente, todo funciona exactamente como antes.
 */
export interface RaycastEnemyNavigator {
  /**
   * Dirección unitaria hacia (goalX, goalY) siguiendo una ruta planeada, o `null` si no hay ruta útil
   * (ya está en la celda meta, la meta es inalcanzable, etc.). Con `null` el enemigo usa su regla de siempre.
   */
  steer(
    map: RaycastMap,
    enemy: RaycastEnemy,
    enemies: readonly RaycastEnemy[],
    goalX: number,
    goalY: number,
    time: number
  ): MovementVector | null;
}
