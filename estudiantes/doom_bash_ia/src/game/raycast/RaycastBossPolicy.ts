import type { BossVolleyPickContext, BossVolleyKind, RaycastBossPlayerContext } from './RaycastBossAI';
import type { RaycastBossState } from './RaycastBoss';
import type { RaycastMap } from './RaycastMap';

/**
 * Punto de inyección para la elección de ataques del jefe. Si `tickRaycastBossVolleys` no recibe una
 * política, o la política devuelve `null`, el jefe usa `pickBossVolleyKind`, su regla de siempre.
 */
export interface RaycastBossPolicy {
  pickVolley(
    state: RaycastBossState,
    player: RaycastBossPlayerContext,
    map: RaycastMap,
    context: BossVolleyPickContext,
    time: number
  ): BossVolleyKind | null;
}
