/**
 * Modelo abstracto del duelo jefe contra jugador (M2).
 *
 * Es el "mundo de juguete" sobre el que busca expectimax: lo bastante barato para evaluar miles de
 * ramas por decisión, y lo bastante fiel porque reutiliza el código real del juego para generar los
 * proyectiles de cada ataque, para la puntería con predicción y para los tiempos de aviso y recarga.
 *
 * Qué simplifica (y por qué es razonable):
 * - Los proyectiles viajan en línea recta a velocidad constante, así que el impacto se calcula con
 *   geometría, sin simular el juego completo.
 * - El jugador es un nodo de azar: elige una de cinco respuestas (quedarse, ir a un lado, al otro,
 *   acercarse, alejarse) y la mantiene hasta la siguiente decisión del jefe.
 * - El jefe se mueve hacia su distancia preferida entre ataques; la fase no cambia dentro del horizonte.
 */
import {
  cooldownMs,
  fireBossVolleyKind,
  getBossPelletColor,
  getBossProjectileDamage,
  telegraphMs,
  type RaycastBossState
} from '../../game/raycast/RaycastBoss';
import {
  getBossBaseMoveSpeed,
  getBossPreferredRange,
  predictPlayerAimPoint,
  type BossVolleyKind
} from '../../game/raycast/RaycastBossAI';
import { castRay, type RaycastMap } from '../../game/raycast/RaycastMap';
import { collides } from '../../game/raycast/RaycastMovement';

export type PlayerResponse = 'stand' | 'left' | 'right' | 'toward' | 'away';
export const PLAYER_RESPONSES: readonly PlayerResponse[] = ['stand', 'left', 'right', 'toward', 'away'];

/** Estado del duelo que cambia dentro de la búsqueda. La plantilla del jefe (fase, conducta) no cambia. */
export interface DuelState {
  bossX: number;
  bossY: number;
  playerX: number;
  playerY: number;
  playerVx: number;
  playerVy: number;
  playerStationaryMs: number;
  timeMs: number;
}

export interface DuelParams {
  /** Velocidad (celdas/s) con la que se modela que el jugador esquiva. La de desplazamiento lateral real es 6.5. */
  dodgeSpeed: number;
}

export const DEFAULT_DUEL_PARAMS: DuelParams = { dodgeSpeed: 6.5 };

const PROJECTILE_LIFETIME_S = 1.8;
const PLAYER_HIT_RADIUS = 0.28;
const PLAYER_BODY = 0.18;

export interface VolleyOutcome {
  /** Daño esperado de esta combinación (ya es determinista: la respuesta del jugador está fija). */
  damage: number;
  /** Cuántos proyectiles pegan. */
  hits: number;
  /** Estado del duelo en la siguiente decisión del jefe. */
  next: DuelState;
}

export function responseVelocity(
  response: PlayerResponse,
  state: Pick<DuelState, 'bossX' | 'bossY' | 'playerX' | 'playerY'>,
  speed: number
): { x: number; y: number } {
  if (response === 'stand') return { x: 0, y: 0 };
  const dx = state.playerX - state.bossX;
  const dy = state.playerY - state.bossY;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  switch (response) {
    case 'left':
      return { x: -uy * speed, y: ux * speed };
    case 'right':
      return { x: uy * speed, y: -ux * speed };
    case 'toward':
      return { x: -ux * speed, y: -uy * speed };
    default:
      return { x: ux * speed, y: uy * speed };
  }
}

/** Clasifica una velocidad observada en una de las cinco respuestas, relativa al jefe. */
export function classifyPlayerMotion(
  state: Pick<DuelState, 'bossX' | 'bossY' | 'playerX' | 'playerY' | 'playerVx' | 'playerVy'>
): PlayerResponse {
  const speed = Math.hypot(state.playerVx, state.playerVy);
  if (speed < 0.55) return 'stand';
  const dx = state.playerX - state.bossX;
  const dy = state.playerY - state.bossY;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const along = state.playerVx * ux + state.playerVy * uy; // positivo: se aleja del jefe
  const across = state.playerVx * -uy + state.playerVy * ux; // positivo: "izquierda"
  if (Math.abs(across) >= Math.abs(along)) return across >= 0 ? 'left' : 'right';
  return along >= 0 ? 'away' : 'toward';
}

/** Avanza una posición en línea recta y se detiene antes de una pared. */
function advance(
  map: RaycastMap,
  x: number,
  y: number,
  vx: number,
  vy: number,
  seconds: number
): { x: number; y: number } {
  if (seconds <= 0 || (vx === 0 && vy === 0)) return { x, y };
  const steps = Math.max(1, Math.ceil(seconds / 0.05));
  let cx = x;
  let cy = y;
  for (let i = 0; i < steps; i += 1) {
    const nx = cx + (vx * seconds) / steps;
    const ny = cy + (vy * seconds) / steps;
    if (collides(map, nx, cy, PLAYER_BODY)) {
      /* se desliza por el otro eje */
    } else {
      cx = nx;
    }
    if (!collides(map, cx, ny, PLAYER_BODY)) cy = ny;
  }
  return { x: cx, y: cy };
}

export interface ModelContext {
  map: RaycastMap;
  /** Estado del jefe del que se toman fase, conducta y vida; su posición se sustituye en cada nodo. */
  boss: RaycastBossState;
  params: DuelParams;
  /** Caché de distancias a pared por rayo; vive lo que dura una decisión. */
  wallCache: Map<string, number>;
  /** Lo que no depende del ataque (movimiento del jugador, puntería, siguiente estado) se calcula una vez por (estado, respuesta). */
  transitions: Map<DuelState, Map<PlayerResponse, Transition>>;
  /** Copia reutilizable del jefe para generar proyectiles sin reservar un objeto por evaluación. */
  shooter: RaycastBossState;
}

interface Transition {
  v: { x: number; y: number };
  atFire: { x: number; y: number };
  stationaryAtFire: number;
  fireTimeMs: number;
  base: number;
  playerRun: number;
  next: DuelState;
}

export function createModelContext(map: RaycastMap, boss: RaycastBossState, params: Partial<DuelParams> = {}): ModelContext {
  return { map, boss, params: { ...DEFAULT_DUEL_PARAMS, ...params }, wallCache: new Map(), transitions: new Map(), shooter: { ...boss } };
}

/**
 * Primer instante en [0, duration] en que un punto con posición relativa (ax, ay) y velocidad relativa (wx, wy)
 * entra en un círculo de radio `radius` centrado en el origen; null si no ocurre. Es exacto, no muestreado.
 */
function firstEntry(ax: number, ay: number, wx: number, wy: number, radius: number, duration: number): number | null {
  const c = ax * ax + ay * ay - radius * radius;
  if (c <= 0) return 0;
  const a = wx * wx + wy * wy;
  if (a < 1e-12) return null;
  const b = ax * wx + ay * wy;
  if (b >= 0) return null;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t >= 0 && t <= duration ? t : null;
}

function wallDistance(ctx: ModelContext, x: number, y: number, angle: number): number {
  const key = `${Math.round(angle * 120)}|${Math.round(x * 6)}|${Math.round(y * 6)}`;
  let distance = ctx.wallCache.get(key);
  if (distance === undefined) {
    distance = castRay(ctx.map, x, y, angle, angle).distance;
    ctx.wallCache.set(key, distance);
  }
  return distance;
}

function transitionFor(ctx: ModelContext, state: DuelState, response: PlayerResponse): Transition {
  let perState = ctx.transitions.get(state);
  if (!perState) {
    perState = new Map();
    ctx.transitions.set(state, perState);
  }
  const cached = perState.get(response);
  if (cached) return cached;

  const { boss, map } = ctx;
  const telegraphS = telegraphMs(boss) / 1000;
  const cooldownS = cooldownMs(boss) / 1000;
  const v = responseVelocity(response, state, ctx.params.dodgeSpeed);

  // El jugador se mueve durante el aviso y el jefe apunta con predicción al momento de disparar.
  const atFire = advance(map, state.playerX, state.playerY, v.x, v.y, telegraphS);
  const fireTimeMs = state.timeMs + telegraphS * 1000;
  const stationaryAtFire = response === 'stand' ? state.playerStationaryMs + telegraphS * 1000 : 0;
  const lead = boss.phase === 3 ? 0.2 : 0.14;
  const aim = predictPlayerAimPoint(
    { x: state.bossX, y: state.bossY },
    { x: atFire.x, y: atFire.y, alive: true, vx: v.x, vy: v.y },
    lead
  );
  const base = Math.atan2(aim.y - state.bossY, aim.x - state.bossX);

  // Cuánto puede avanzar el jugador en línea recta antes de topar con una pared.
  const speed = Math.hypot(v.x, v.y);
  const playerRun =
    speed > 0
      ? Math.max(0, wallDistance(ctx, atFire.x, atFire.y, Math.atan2(v.y, v.x)) - PLAYER_BODY - 0.05) / speed
      : Infinity;

  // Siguiente decisión del jefe: el jugador sigue con su velocidad y el jefe se acerca a su distancia preferida.
  const nextPlayer = advance(map, atFire.x, atFire.y, v.x, v.y, cooldownS);
  const toPlayerX = nextPlayer.x - state.bossX;
  const toPlayerY = nextPlayer.y - state.bossY;
  const distance = Math.hypot(toPlayerX, toPlayerY) || 1;
  const preferred = getBossPreferredRange(boss);
  const closing = Math.max(0, Math.min(distance - preferred, getBossBaseMoveSpeed(boss) * (telegraphS * 0.45 + cooldownS)));
  const next: DuelState = {
    bossX: state.bossX + (toPlayerX / distance) * closing,
    bossY: state.bossY + (toPlayerY / distance) * closing,
    playerX: nextPlayer.x,
    playerY: nextPlayer.y,
    playerVx: v.x,
    playerVy: v.y,
    playerStationaryMs: response === 'stand' ? stationaryAtFire + cooldownS * 1000 : 0,
    timeMs: state.timeMs + (telegraphS + cooldownS) * 1000
  };
  const transition: Transition = { v, atFire, stationaryAtFire, fireTimeMs, base, playerRun, next };
  perState.set(response, transition);
  return transition;
}

/** Resultado de lanzar `kind` cuando el jugador responde con `response`. */
export function evaluateVolley(
  ctx: ModelContext,
  state: DuelState,
  kind: BossVolleyKind,
  response: PlayerResponse
): VolleyOutcome {
  const { boss } = ctx;
  const { v, atFire, stationaryAtFire, fireTimeMs, base, playerRun, next } = transitionFor(ctx, state, response);
  ctx.shooter.x = state.bossX;
  ctx.shooter.y = state.bossY;
  const pellets = fireBossVolleyKind(
    ctx.shooter,
    kind,
    base,
    stationaryAtFire >= 1000,
    fireTimeMs,
    getBossPelletColor(boss),
    getBossProjectileDamage(boss)
  );

  let hits = 0;
  let damage = 0;
  for (const pellet of pellets) {
    const pelletSpeed = Math.hypot(pellet.vx, pellet.vy) || 1;
    const angle = Math.atan2(pellet.vy, pellet.vx);
    const reach = Math.min(PROJECTILE_LIFETIME_S, playerRun);
    // Tramo 1: el jugador se mueve con velocidad constante. Tramo 2: ya topó con una pared y está quieto.
    let hitAt = firstEntry(
      pellet.x - atFire.x,
      pellet.y - atFire.y,
      pellet.vx - v.x,
      pellet.vy - v.y,
      PLAYER_HIT_RADIUS,
      reach
    );
    if (hitAt === null && playerRun < PROJECTILE_LIFETIME_S) {
      const stopX = atFire.x + v.x * playerRun;
      const stopY = atFire.y + v.y * playerRun;
      const later = firstEntry(
        pellet.x + pellet.vx * playerRun - stopX,
        pellet.y + pellet.vy * playerRun - stopY,
        pellet.vx,
        pellet.vy,
        PLAYER_HIT_RADIUS,
        PROJECTILE_LIFETIME_S - playerRun
      );
      if (later !== null) hitAt = playerRun + later;
    }
    if (hitAt === null) continue;
    // La pared solo importa si el proyectil iba a pegar: se consulta una vez por impacto posible.
    if (pelletSpeed * hitAt > wallDistance(ctx, pellet.x, pellet.y, angle) - 0.1) continue;
    hits += 1;
    damage += pellet.damage;
  }

  return { damage, hits, next };
}
