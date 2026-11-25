/**
 * Brazos del director adaptativo (M3).
 *
 * Cada brazo es una "meta de presión" para la política de ritmo del jefe (M2): cuántos puntos de daño por salva
 * debe producir en promedio. Es la perilla de reto que sí mueve la salud del jugador en el simulador; las perillas
 * del director de spawns (tope de enemigos, ritmo de aparición) no lo hacen (ver docs/DIRECTOR.md).
 */
import { createExpectimaxBossPolicy } from '../expectimax/policy';
import type { RaycastBossPolicy } from '../../game/raycast/RaycastBossPolicy';

export interface PressureArm {
  id: string;
  /** Daño por salva que la política de ritmo intenta sostener. */
  targetDamage: number;
}

const TARGETS = [1, 1.5, 2, 3, 4, 5, 6, 8, 12] as const;

export const PRESSURE_ARMS: readonly PressureArm[] = TARGETS.map((targetDamage) => ({
  id: `ritmo-${targetDamage}`,
  targetDamage
}));

export function createArmBossPolicy(arm: PressureArm): RaycastBossPolicy {
  return createExpectimaxBossPolicy({ depth: 1, pool: 'repertoire', objective: 'pacing', targetDamage: arm.targetDamage });
}
