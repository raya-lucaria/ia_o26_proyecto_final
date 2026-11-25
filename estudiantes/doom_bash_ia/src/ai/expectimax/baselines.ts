/**
 * Políticas simples para comparar contra expectimax. Si expectimax no les gana, la búsqueda no está aportando.
 */
import type { BossVolleyKind } from '../../game/raycast/RaycastBossAI';
import type { RaycastBossPolicy } from '../../game/raycast/RaycastBossPolicy';
import { createSeededRng } from '../sim/rng';
import { bossRepertoire } from './policy';

/** Lanza siempre el mismo ataque si el jefe lo tiene en su repertorio; si no, deja la regla original. */
export function createFixedKindPolicy(kind: BossVolleyKind): RaycastBossPolicy {
  return {
    pickVolley: (boss) => (bossRepertoire(boss.behavior).includes(kind) ? kind : null)
  };
}

/** Elige al azar uniforme entre todo el repertorio del jefe, con semilla. */
export function createRandomRepertoirePolicy(seed: number): RaycastBossPolicy {
  const rng = createSeededRng((seed ^ 0x51ed270b) >>> 0);
  return {
    pickVolley: (boss) => {
      const repertoire = bossRepertoire(boss.behavior);
      return repertoire[Math.floor(rng() * repertoire.length)] ?? null;
    }
  };
}
