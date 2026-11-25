/**
 * Runtime de IA dentro del juego (Fase 3). Sin Phaser: la escena le da el tiempo y el estado del jugador y le pide
 * el navegador y la política de jefe que debe usar en ese instante.
 *
 * Por omisión todo está en modo original (`legacy` y `rule`): el juego se comporta como siempre. Los modos se cambian
 * con teclas, o con `?ia=astar,bandido` en la URL, y se recuerdan en el almacenamiento del navegador.
 *
 * Modo `bandit`: cada encuentro dura una ventana fija (40 s, la misma del simulador). Al iniciar, Thompson sampling
 * elige una meta de ritmo; al terminar la ventana, la muerte o la caída del jefe, la recompensa (¿terminó con 30–70 %
 * de vida?) actualiza su creencia y se elige otra. La evidencia se guarda para la siguiente sesión.
 */
import { createAStarNavigator, type AStarNavigator } from '../astar/navigator';
import { createArmBossPolicy, PRESSURE_ARMS } from '../bandit/arms';
import { createThompsonSelector, type ThompsonCounts, type ThompsonSelector } from '../bandit/policies';
import { challengeReward } from '../bandit/reward';
import type { ExpectimaxBossPolicy } from '../expectimax/policy';
import type { RaycastBossPolicy } from '../../game/raycast/RaycastBossPolicy';
import type { RaycastEnemyNavigator } from '../../game/raycast/RaycastEnemyNavigator';

export type NavigationMode = 'legacy' | 'astar';
export type BossDirectorMode = 'rule' | 'expectimax' | 'bandit';

export const NAVIGATION_MODES: readonly NavigationMode[] = ['legacy', 'astar'];
export const BOSS_DIRECTOR_MODES: readonly BossDirectorMode[] = ['rule', 'expectimax', 'bandit'];

export const NAVIGATION_LABELS: Record<NavigationMode, string> = { legacy: 'regla original', astar: 'A*' };
export const BOSS_DIRECTOR_LABELS: Record<BossDirectorMode, string> = {
  rule: 'regla original',
  expectimax: 'expectimax (ritmo 4)',
  bandit: 'bandido Thompson'
};

/** Duración de un encuentro del bandido; igual que en el simulador (`bench:director`). */
export const ENCOUNTER_WINDOW_MS = 40_000;
/** Meta de ritmo fija del modo expectimax: la del mejor brazo único medido en docs/DIRECTOR.md. */
export const EXPECTIMAX_MODE_TARGET = 4;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AiRuntimeOptions {
  /** Dónde recordar modos y creencias. `null` o ausente: no se recuerda nada. */
  storage?: KeyValueStorage | null;
  /** Cadena de consulta de la URL (con o sin `?`). `ia=astar,bandido` activa A* y el bandido. */
  query?: string;
  /** Semilla del bandido; por omisión se toma del reloj. */
  seed?: number;
}

export interface AiFrame {
  nowMs: number;
  bossAlive: boolean;
  playerAlive: boolean;
  health: number;
  maxHealth: number;
}

export interface EncounterResult {
  armId: string;
  reward: 0 | 1;
  healthFraction: number;
  reason: 'timeout' | 'death' | 'cleared';
}

const MODES_KEY = 'doom-bash-ia:modos:v1';
const BANDIT_KEY = 'doom-bash-ia:bandido:v1';

function isModeValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/** Interpreta `ia=astar,bandido`. Acepta nombres en español y en inglés y descarta lo que no reconoce. */
export function parseAiQuery(query: string): { navigation?: NavigationMode; boss?: BossDirectorMode } {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const result: { navigation?: NavigationMode; boss?: BossDirectorMode } = {};
  for (const token of (params.get('ia') ?? '').split(',').map((entry) => entry.trim().toLowerCase())) {
    if (token === 'astar' || token === 'a*') result.navigation = 'astar';
    else if (token === 'legacy' || token === 'original') result.navigation = 'legacy';
    else if (token === 'expectimax') result.boss = 'expectimax';
    else if (token === 'bandit' || token === 'bandido') result.boss = 'bandit';
    else if (token === 'rule' || token === 'regla') result.boss = 'rule';
  }
  return result;
}

function readJson(storage: KeyValueStorage | null | undefined, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: KeyValueStorage | null | undefined, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Almacenamiento lleno o bloqueado: el panel sigue funcionando sin recordar.
  }
}

function validCounts(value: unknown, arms: number): ThompsonCounts | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const lists = [record.successes, record.failures, record.pulls];
  for (const list of lists) {
    if (!Array.isArray(list) || list.length !== arms) return null;
    if (!list.every((entry) => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0)) return null;
  }
  return value as ThompsonCounts;
}

export interface AiRuntime {
  readonly navigationMode: NavigationMode;
  readonly bossMode: BossDirectorMode;
  /** Navegador para pasar a `updateRaycastEnemies`, o `undefined` en modo original. */
  navigator(): RaycastEnemyNavigator | undefined;
  /** Política para pasar a `tickRaycastBossVolleys`, o `undefined` en modo original. */
  bossPolicy(): RaycastBossPolicy | undefined;
  cycleNavigation(): NavigationMode;
  cycleBossDirector(): BossDirectorMode;
  /** Llamar una vez por cuadro de juego, antes de pedir la política. */
  update(frame: AiFrame): void;
  /** Líneas del panel de depuración. */
  panelLines(frame: AiFrame): string[];
  /** Resultado del último encuentro cerrado del bandido. */
  lastEncounter(): EncounterResult | null;
  /** Borra lo aprendido por el bandido (también del almacenamiento). */
  resetBandit(): void;
}

interface Episode {
  arm: number;
  startedAtMs: number;
  policy: RaycastBossPolicy;
}

export function createAiRuntime(options: AiRuntimeOptions = {}): AiRuntime {
  const storage = options.storage ?? null;
  const arms = PRESSURE_ARMS.length;
  const seed = options.seed ?? (Date.now() & 0x7fffffff);

  const storedModes = readJson(storage, MODES_KEY) as { navigation?: unknown; boss?: unknown } | null;
  const fromQuery = parseAiQuery(options.query ?? '');
  let navigationMode: NavigationMode =
    fromQuery.navigation ?? (isModeValue(storedModes?.navigation, NAVIGATION_MODES) ? storedModes.navigation : 'legacy');
  let bossMode: BossDirectorMode =
    fromQuery.boss ?? (isModeValue(storedModes?.boss, BOSS_DIRECTOR_MODES) ? storedModes.boss : 'rule');

  let navigator: AStarNavigator | null = null;
  let expectimax: (RaycastBossPolicy & ExpectimaxBossPolicy) | null = null;
  let selector: ThompsonSelector = createBandit(validCounts(readJson(storage, BANDIT_KEY), arms));
  let episode: Episode | null = null;
  let lastResult: EncounterResult | null = null;
  let previousBossAlive = false;
  let sessionEncounters = 0;

  function createBandit(initial: ThompsonCounts | null): ThompsonSelector {
    return createThompsonSelector({ arms, seed, initial: initial ?? undefined });
  }

  function saveModes(): void {
    writeJson(storage, MODES_KEY, { navigation: navigationMode, boss: bossMode });
  }

  function saveBandit(): void {
    writeJson(storage, BANDIT_KEY, selector.counts());
  }

  function startEpisode(nowMs: number): void {
    const arm = selector.select();
    episode = { arm, startedAtMs: nowMs, policy: createArmBossPolicy(PRESSURE_ARMS[arm]) };
  }

  function finishEpisode(frame: AiFrame, reason: EncounterResult['reason']): void {
    if (!episode) return;
    const healthFraction = frame.maxHealth > 0 ? frame.health / frame.maxHealth : 0;
    const reward = challengeReward(
      { outcome: reason, healthRemaining: healthFraction * 100 },
      100
    );
    selector.update(episode.arm, reward);
    saveBandit();
    sessionEncounters += 1;
    lastResult = { armId: PRESSURE_ARMS[episode.arm].id, reward, healthFraction, reason };
    episode = null;
  }

  function currentPolicy(): (RaycastBossPolicy & Partial<ExpectimaxBossPolicy>) | undefined {
    if (bossMode === 'expectimax') {
      expectimax ??= createArmBossPolicy({ id: 'expectimax', targetDamage: EXPECTIMAX_MODE_TARGET }) as RaycastBossPolicy & ExpectimaxBossPolicy;
      return expectimax;
    }
    if (bossMode === 'bandit') return episode?.policy as (RaycastBossPolicy & Partial<ExpectimaxBossPolicy>) | undefined;
    return undefined;
  }

  return {
    get navigationMode() {
      return navigationMode;
    },
    get bossMode() {
      return bossMode;
    },
    navigator() {
      if (navigationMode !== 'astar') return undefined;
      navigator ??= createAStarNavigator();
      return navigator;
    },
    bossPolicy: () => currentPolicy(),
    cycleNavigation() {
      navigationMode = NAVIGATION_MODES[(NAVIGATION_MODES.indexOf(navigationMode) + 1) % NAVIGATION_MODES.length];
      saveModes();
      return navigationMode;
    },
    cycleBossDirector() {
      bossMode = BOSS_DIRECTOR_MODES[(BOSS_DIRECTOR_MODES.indexOf(bossMode) + 1) % BOSS_DIRECTOR_MODES.length];
      // Un encuentro a medias de otro modo no cuenta como evidencia.
      episode = null;
      expectimax = null;
      saveModes();
      return bossMode;
    },
    update(frame) {
      // Cada pelea nueva empieza con una política limpia (el déficit de ritmo no cruza peleas).
      if (frame.bossAlive && !previousBossAlive) expectimax = null;
      if (bossMode !== 'bandit') {
        episode = null;
      } else {
        if (episode && !frame.playerAlive) finishEpisode(frame, 'death');
        else if (episode && previousBossAlive && !frame.bossAlive) finishEpisode(frame, 'cleared');
        else if (episode && frame.nowMs - episode.startedAtMs >= ENCOUNTER_WINDOW_MS) finishEpisode(frame, 'timeout');
        if (!episode && frame.bossAlive && frame.playerAlive) startEpisode(frame.nowMs);
      }
      previousBossAlive = frame.bossAlive;
    },
    lastEncounter: () => lastResult,
    resetBandit() {
      selector = createBandit(null);
      episode = null;
      lastResult = null;
      sessionEncounters = 0;
      saveBandit();
    },
    panelLines(frame) {
      const lines: string[] = [];
      lines.push('IA   I cierra · U navegación · O jefe');
      lines.push(`Navegación: ${NAVIGATION_LABELS[navigationMode]}`);
      if (navigationMode === 'astar' && navigator) {
        lines.push(`  planes ${navigator.stats.plans} · nodos ${navigator.stats.expanded}`);
      }
      lines.push(`Jefe: ${BOSS_DIRECTOR_LABELS[bossMode]}`);
      if (bossMode === 'bandit') {
        const beliefs = selector.beliefs();
        const elapsed = episode ? Math.min(ENCOUNTER_WINDOW_MS, frame.nowMs - episode.startedAtMs) : 0;
        lines.push(
          episode
            ? `  ${PRESSURE_ARMS[episode.arm].id} · ventana ${Math.floor(elapsed / 1000)}/${ENCOUNTER_WINDOW_MS / 1000} s`
            : '  esperando al jefe'
        );
        lines.push('  brazo        media  veces');
        beliefs.forEach((belief, arm) => {
          const marker = episode?.arm === arm ? '>' : ' ';
          lines.push(` ${marker}${PRESSURE_ARMS[arm].id.padEnd(11)} ${belief.mean.toFixed(2)}   ${belief.pulls}`);
        });
        if (lastResult) {
          lines.push(
            `  último: ${lastResult.armId} → ${lastResult.reward} (${Math.round(lastResult.healthFraction * 100)} % vida, ${lastResult.reason})`
          );
        }
        lines.push(`  encuentros esta sesión: ${sessionEncounters}`);
      }
      const policy = currentPolicy() as Partial<ExpectimaxBossPolicy> | undefined;
      const decision = policy?.lastDecision?.();
      if (decision && policy?.stats) {
        const ranked = [...decision.values].sort((a, b) => b.value - a.value).slice(0, 3);
        lines.push(`  decisión #${policy.stats.decisions}: ${decision.kind}`);
        lines.push(`  ${ranked.map((entry) => `${entry.kind} ${entry.value.toFixed(1)}`).join(' | ')}`);
        const perDecision = policy.stats.decisions > 0 ? policy.stats.wallMs / policy.stats.decisions : 0;
        lines.push(`  ${perDecision.toFixed(2)} ms por decisión`);
      }
      return lines;
    }
  };
}
