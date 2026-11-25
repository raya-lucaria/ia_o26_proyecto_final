import { describe, expect, it } from 'vitest';
import { findPathAStar, octileDistance, searchGrid, type SearchAlgorithm } from '../ai/astar/search';
import { createSeededRng } from '../ai/sim/rng';
import { RAYCAST_LEVEL_1, RAYCAST_LEVEL_BOSS } from '../game/raycast/RaycastLevel';
import type { RaycastMap } from '../game/raycast/RaycastMap';

function parse(rows: string[]): RaycastMap {
  return { tileSize: 1, grid: rows.map((row) => Array.from(row, (ch) => (ch === '#' ? 1 : 0))) };
}

function randomMap(seed: number, size = 16, wallRate = 0.28): RaycastMap {
  const rng = createSeededRng(seed);
  const grid = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => (x === 0 || y === 0 || x === size - 1 || y === size - 1 || rng() < wallRate ? 1 : 0))
  );
  return { tileSize: 1, grid };
}

function openCells(map: RaycastMap): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  map.grid.forEach((row, y) => row.forEach((value, x) => value === 0 && cells.push([x, y])));
  return cells;
}

const run = (map: RaycastMap, algorithm: SearchAlgorithm, from: [number, number], to: [number, number]) =>
  searchGrid(map, from[0] + 0.5, from[1] + 0.5, to[0] + 0.5, to[1] + 0.5, { algorithm });

describe('octileDistance', () => {
  it('coincide con la distancia en 8 direcciones', () => {
    expect(octileDistance(3, 0)).toBe(3);
    expect(octileDistance(2, 2)).toBeCloseTo(2 * Math.SQRT2, 12);
    expect(octileDistance(-4, 1)).toBeCloseTo(3 + Math.SQRT2, 12);
  });
});

describe('searchGrid: casos pequeños', () => {
  const room = parse(['#######', '#.....#', '#.###.#', '#.....#', '#######']);

  it('rodea la pared y termina en la celda meta', () => {
    for (const algorithm of ['bfs', 'dijkstra', 'greedy', 'astar'] as const) {
      const result = run(room, algorithm, [1, 1], [5, 3]);
      expect(result.found).toBe(true);
      expect(result.path[result.path.length - 1]).toEqual({ x: 5.5, y: 3.5 });
      for (const point of result.path) expect(room.grid[Math.floor(point.y)][Math.floor(point.x)]).toBe(0);
    }
  });

  it('no corta esquinas en diagonal', () => {
    const corner = parse(['####', '#.##', '##.#', '####']);
    expect(run(corner, 'astar', [1, 1], [2, 2]).found).toBe(false);
    expect(run(corner, 'bfs', [1, 1], [2, 2]).found).toBe(false);
  });

  it('misma celda: found sin camino; extremos fuera del mapa: no found', () => {
    expect(run(room, 'astar', [1, 1], [1, 1])).toMatchObject({ found: true, path: [], expanded: 0 });
    expect(searchGrid(room, -3, 1.5, 2.5, 1.5, { algorithm: 'astar' }).found).toBe(false);
  });

  it('origen y meta se aceptan aunque el cuerpo no quepa en su celda; las intermedias no', () => {
    const narrow = parse(['#####', '#...#', '#####']);
    expect(searchGrid(narrow, 1.5, 1.5, 2.5, 1.5, { algorithm: 'astar', radius: 0.6 }).found).toBe(true);
    expect(searchGrid(narrow, 1.5, 1.5, 3.5, 1.5, { algorithm: 'astar', radius: 0.6 }).found).toBe(false);
  });

  it('maxNodes corta la búsqueda', () => {
    const result = searchGrid(room, 1.5, 1.5, 5.5, 3.5, { algorithm: 'astar', maxNodes: 2 });
    expect(result.found).toBe(false);
    expect(result.expanded).toBeLessThanOrEqual(2);
  });

  it('un costo extra desvía la ruta por el otro lado', () => {
    const hall = parse(['#######', '#.....#', '#.###.#', '#.....#', '#######']);
    const free = findPathAStar(hall, 1.5, 1.5, 5.5, 3.5);
    const blockedTop = findPathAStar(hall, 1.5, 1.5, 5.5, 3.5, { extraCost: (_cx, cy) => (cy === 1 ? 50 : 0) });
    expect(free.path.some((p) => p.y === 1.5 && p.x === 3.5)).toBe(true);
    expect(blockedTop.path.some((p) => p.y === 3.5 && p.x === 3.5)).toBe(true);
  });
});

describe('searchGrid: propiedades en mapas aleatorios', () => {
  it('A* y Dijkstra encuentran el mismo costo y A* no expande más', () => {
    let compared = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const map = randomMap(seed);
      const cells = openCells(map);
      const rng = createSeededRng(seed * 7919);
      for (let k = 0; k < 6; k += 1) {
        const from = cells[Math.floor(rng() * cells.length)];
        const to = cells[Math.floor(rng() * cells.length)];
        const a = run(map, 'astar', from, to);
        const d = run(map, 'dijkstra', from, to);
        expect(a.found).toBe(d.found);
        expect(run(map, 'bfs', from, to).found).toBe(d.found);
        if (!a.found) continue;
        compared += 1;
        expect(a.cost).toBeCloseTo(d.cost, 9);
        expect(a.expanded).toBeLessThanOrEqual(d.expanded);
        // BFS minimiza pasos, no distancia: su ruta nunca es más corta que la óptima.
        expect(run(map, 'bfs', from, to).length).toBeGreaterThanOrEqual(a.length - 1e-9);
      }
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('repetir la búsqueda da exactamente la misma ruta', () => {
    const map = randomMap(3);
    const cells = openCells(map);
    const a = run(map, 'astar', cells[0], cells[cells.length - 1]);
    const b = run(map, 'astar', cells[0], cells[cells.length - 1]);
    expect(b).toEqual(a);
  });
});

describe('searchGrid: niveles reales', () => {
  for (const level of [RAYCAST_LEVEL_1, RAYCAST_LEVEL_BOSS]) {
    it(`A* es óptimo (igual que Dijkstra) en ${level.id}`, () => {
      const map = level.map;
      const cells = openCells(map);
      const rng = createSeededRng(99);
      let found = 0;
      for (let k = 0; k < 40; k += 1) {
        const from = cells[Math.floor(rng() * cells.length)];
        const to = cells[Math.floor(rng() * cells.length)];
        const options = { radius: 0.2, maxNodes: 100_000 };
        const a = searchGrid(map, from[0] + 0.5, from[1] + 0.5, to[0] + 0.5, to[1] + 0.5, { algorithm: 'astar', ...options });
        const d = searchGrid(map, from[0] + 0.5, from[1] + 0.5, to[0] + 0.5, to[1] + 0.5, { algorithm: 'dijkstra', ...options });
        expect(a.found).toBe(d.found);
        if (a.found) {
          found += 1;
          expect(a.cost).toBeCloseTo(d.cost, 9);
          expect(a.expanded).toBeLessThanOrEqual(d.expanded);
        }
      }
      expect(found).toBeGreaterThan(5);
    });
  }
});
