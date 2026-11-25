/**
 * Búsqueda de rutas sobre la cuadrícula del nivel (M1).
 *
 * Un solo motor con cuatro estrategias para poder compararlas con el mismo código:
 * - bfs: cola FIFO, cada paso cuesta 1 (ignora que la diagonal mide √2). Rápido pero no óptimo en distancia real.
 * - dijkstra: costo acumulado g, sin heurística. Óptimo, expande muchos nodos.
 * - greedy: solo heurística h. Expande poco, pero la ruta puede ser mala.
 * - astar: g + h con heurística octil (admisible y consistente en 8 vecinos). Óptimo y expande menos que Dijkstra.
 *
 * Movimiento: 8 vecinos, la diagonal exige las dos celdas ortogonales libres (no corta esquinas).
 * Una celda es transitable si un cuerpo de radio `radius` centrado en ella no choca con paredes.
 * Supone `tileSize === 1` (coordenadas en celdas), como todos los niveles del juego.
 * Sin Phaser, sin aleatoriedad: mismo mapa y mismos extremos dan siempre la misma ruta.
 */
import { collides } from '../../game/raycast/RaycastMovement';
import type { RaycastMap } from '../../game/raycast/RaycastMap';

export type SearchAlgorithm = 'bfs' | 'dijkstra' | 'greedy' | 'astar';

export interface Waypoint {
  x: number;
  y: number;
}

export interface SearchOptions {
  algorithm: SearchAlgorithm;
  /** Radio del cuerpo que debe caber en cada celda. Por defecto 0.2. */
  radius?: number;
  /** Tope de nodos expandidos; al pasarlo la búsqueda se rinde (`found: false`). */
  maxNodes?: number;
  /** Costo extra no negativo por entrar a una celda. Sirve para repartir rutas entre enemigos. */
  extraCost?: (cx: number, cy: number) => number;
}

export interface SearchResult {
  found: boolean;
  /** Centros de celda desde el primer paso hasta la celda meta; vacío si no hay ruta o si ya estás en la meta. */
  path: Waypoint[];
  /** Longitud euclidiana de la ruta desde el punto de origen, pasando por los centros de celda. */
  length: number;
  /** Costo acumulado g de la meta (con extraCost); para bfs es el número de pasos. */
  cost: number;
  /** Nodos sacados de la frontera. Es la medida de trabajo que se compara entre algoritmos. */
  expanded: number;
}

const SQRT2 = Math.SQRT2;
const DEFAULT_RADIUS = 0.2;
const DEFAULT_MAX_NODES = 4000;
const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2]
];

/** Heurística octil: distancia en 8 direcciones con diagonal √2. */
export function octileDistance(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return ax + ay + (SQRT2 - 2) * Math.min(ax, ay);
}

/** Montículo binario mínimo con desempate por orden de inserción, para que los empates sean deterministas. */
class MinHeap {
  private readonly nodes: number[] = [];
  private readonly priorities: number[] = [];
  private readonly sequence: number[] = [];
  private counter = 0;

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, priority: number): void {
    let index = this.nodes.length;
    this.nodes.push(node);
    this.priorities.push(priority);
    this.sequence.push(this.counter);
    this.counter += 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.less(index, parent)) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  pop(): number {
    const top = this.nodes[0];
    const lastNode = this.nodes.pop() as number;
    const lastPriority = this.priorities.pop() as number;
    const lastSequence = this.sequence.pop() as number;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.priorities[0] = lastPriority;
      this.sequence[0] = lastSequence;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.nodes.length && this.less(left, smallest)) smallest = left;
        if (right < this.nodes.length && this.less(right, smallest)) smallest = right;
        if (smallest === index) break;
        this.swap(index, smallest);
        index = smallest;
      }
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    if (this.priorities[a] !== this.priorities[b]) return this.priorities[a] < this.priorities[b];
    return this.sequence[a] < this.sequence[b];
  }

  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
    [this.priorities[a], this.priorities[b]] = [this.priorities[b], this.priorities[a]];
    [this.sequence[a], this.sequence[b]] = [this.sequence[b], this.sequence[a]];
  }
}

export function searchGrid(
  map: RaycastMap,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  options: SearchOptions
): SearchResult {
  const rows = map.grid.length;
  const cols = map.grid[0]?.length ?? 0;
  const radius = options.radius ?? DEFAULT_RADIUS;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const extraCost = options.extraCost;
  const algorithm = options.algorithm;
  const unweighted = algorithm === 'bfs';

  const startCx = Math.floor(fromX);
  const startCy = Math.floor(fromY);
  const goalCx = Math.floor(toX);
  const goalCy = Math.floor(toY);
  const inBounds = (cx: number, cy: number): boolean => cx >= 0 && cy >= 0 && cx < cols && cy < rows;
  const empty: SearchResult = { found: false, path: [], length: 0, cost: 0, expanded: 0 };
  if (!inBounds(startCx, startCy) || !inBounds(goalCx, goalCy)) return empty;
  if (startCx === goalCx && startCy === goalCy) return { ...empty, found: true };

  const startKey = startCy * cols + startCx;
  const goalKey = goalCy * cols + goalCx;
  // 0 = sin calcular, 1 = libre, 2 = bloqueada. Inicio y meta se aceptan aunque queden pegados a una pared.
  const walkCache = new Uint8Array(rows * cols);
  const walkable = (cx: number, cy: number): boolean => {
    if (!inBounds(cx, cy)) return false;
    const key = cy * cols + cx;
    if (key === startKey || key === goalKey) return true;
    if (walkCache[key] === 0) walkCache[key] = collides(map, cx + 0.5, cy + 0.5, radius) ? 2 : 1;
    return walkCache[key] === 1;
  };

  const gScore = new Float64Array(rows * cols).fill(Infinity);
  const cameFrom = new Int32Array(rows * cols).fill(-1);
  const closed = new Uint8Array(rows * cols);
  gScore[startKey] = 0;

  const heuristic = (cx: number, cy: number): number => octileDistance(goalCx - cx, goalCy - cy);
  const priorityOf = (g: number, cx: number, cy: number): number => {
    if (algorithm === 'dijkstra') return g;
    if (algorithm === 'greedy') return heuristic(cx, cy);
    if (algorithm === 'astar') return g + heuristic(cx, cy);
    return 0;
  };

  // BFS usa un arreglo como cola; el resto usa el montículo.
  const queue: number[] = [startKey];
  let queueHead = 0;
  const heap = new MinHeap();
  heap.push(startKey, priorityOf(0, startCx, startCy));

  let expanded = 0;
  let reached = false;
  while (unweighted ? queueHead < queue.length : heap.size > 0) {
    const key = unweighted ? queue[queueHead++] : heap.pop();
    if (closed[key] === 1) continue;
    closed[key] = 1;
    expanded += 1;
    if (key === goalKey) {
      reached = true;
      break;
    }
    if (expanded >= maxNodes) break;

    const cx = key % cols;
    const cy = (key - cx) / cols;
    for (const [dx, dy, stepCost] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!walkable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;
      const nKey = ny * cols + nx;
      if (closed[nKey] === 1) continue;
      const step = unweighted ? 1 : stepCost + (extraCost ? Math.max(0, extraCost(nx, ny)) : 0);
      const tentative = gScore[key] + step;
      if (tentative >= gScore[nKey]) continue;
      gScore[nKey] = tentative;
      cameFrom[nKey] = key;
      if (unweighted) queue.push(nKey);
      else heap.push(nKey, priorityOf(tentative, nx, ny));
    }
  }

  if (!reached) return { ...empty, expanded };
  const path: Waypoint[] = [];
  for (let cursor = goalKey; cursor !== startKey && cursor !== -1; cursor = cameFrom[cursor]) {
    path.push({ x: (cursor % cols) + 0.5, y: Math.floor(cursor / cols) + 0.5 });
  }
  path.reverse();
  let length = 0;
  let px = fromX;
  let py = fromY;
  for (const point of path) {
    length += Math.hypot(point.x - px, point.y - py);
    px = point.x;
    py = point.y;
  }
  return { found: true, path, length, cost: gScore[goalKey], expanded };
}

export function findPathAStar(
  map: RaycastMap,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  options: Omit<SearchOptions, 'algorithm'> = {}
): SearchResult {
  return searchGrid(map, fromX, fromY, toX, toY, { ...options, algorithm: 'astar' });
}
