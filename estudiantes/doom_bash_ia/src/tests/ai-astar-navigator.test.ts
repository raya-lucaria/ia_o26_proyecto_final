import { describe, expect, it } from 'vitest';
import { createAStarNavigator } from '../ai/astar/navigator';
import { createRaycastEnemy } from '../game/raycast/RaycastEnemy';
import { updateRaycastEnemies } from '../game/raycast/RaycastEnemySystem';
import { notifyRaycastGunfire } from '../game/raycast/RaycastEnemyTactics';
import type { RaycastMap } from '../game/raycast/RaycastMap';

function parse(rows: string[]): RaycastMap {
  return { tileSize: 1, grid: rows.map((row) => Array.from(row, (ch) => (ch === '#' ? 1 : 0))) };
}

/** Un muro largo separa al enemigo (izquierda) del jugador (derecha); el único paso está abajo. */
const WALLED = parse([
  '###########',
  '#....#....#',
  '#....#....#',
  '#....#....#',
  '#.........#',
  '###########'
]);

describe('navegador A*', () => {
  it('apunta primero hacia el paso libre, no hacia la pared', () => {
    const navigator = createAStarNavigator();
    const enemy = createRaycastEnemy({ id: 'e1', kind: 'GRUNT', x: 1.5, y: 1.5 });
    const direction = navigator.steer(WALLED, enemy, [enemy], 8.5, 1.5, 1000);
    expect(direction).not.toBeNull();
    // La recta al jugador iría en +x (contra el muro); la ruta debe bajar.
    expect(direction!.y).toBeGreaterThan(0.2);
    expect(Math.hypot(direction!.x, direction!.y)).toBeCloseTo(1, 9);
  });

  it('devuelve null cuando ya está en la celda meta o la meta es inalcanzable', () => {
    const navigator = createAStarNavigator();
    const enemy = createRaycastEnemy({ id: 'e1', kind: 'GRUNT', x: 1.5, y: 1.5 });
    expect(navigator.steer(WALLED, enemy, [enemy], 1.7, 1.7, 1000)).toBeNull();
    const sealed = parse(['#####', '#.#.#', '#####']);
    expect(navigator.steer(sealed, enemy, [enemy], 3.5, 1.5, 1000)).toBeNull();
  });

  it('replanea al moverse la meta y respeta el intervalo de replaneo', () => {
    const navigator = createAStarNavigator({ replanMs: 400 });
    const enemy = createRaycastEnemy({ id: 'e1', kind: 'GRUNT', x: 1.5, y: 1.5 });
    navigator.steer(WALLED, enemy, [enemy], 8.5, 1.5, 1000);
    navigator.steer(WALLED, enemy, [enemy], 8.5, 1.5, 1100);
    expect(navigator.stats.plans).toBe(1);
    navigator.steer(WALLED, enemy, [enemy], 8.5, 1.5, 1500);
    expect(navigator.stats.plans).toBe(2);
    navigator.steer(WALLED, enemy, [enemy], 8.5, 4.5, 1500);
    expect(navigator.stats.plans).toBe(3);
  });

  it('con alerta, el enemigo rodea el muro y llega al jugador; sin navegador se queda atorado', () => {
    const run = (withNavigator: boolean): number => {
      const enemy = createRaycastEnemy({ id: 'chaser', kind: 'GRUNT', x: 1.5, y: 1.5 });
      const player = { x: 8.5, y: 1.5, alive: true };
      const navigator = withNavigator ? createAStarNavigator() : undefined;
      let best = Infinity;
      for (let t = 1000; t < 25_000; t += 20) {
        if (t % 1000 === 0) notifyRaycastGunfire([enemy], player.x, player.y, t);
        updateRaycastEnemies(WALLED, [enemy], player, t, 20, { navigator });
        best = Math.min(best, Math.hypot(enemy.x - player.x, enemy.y - player.y));
      }
      return best;
    };
    expect(run(true)).toBeLessThan(2.5);
    expect(run(false)).toBeGreaterThan(run(true));
  });

  it('el estado de ruta es por enemigo, no global', () => {
    const navigator = createAStarNavigator();
    const a = createRaycastEnemy({ id: 'a', kind: 'GRUNT', x: 1.5, y: 1.5 });
    const b = createRaycastEnemy({ id: 'b', kind: 'GRUNT', x: 1.5, y: 3.5 });
    navigator.steer(WALLED, a, [a, b], 8.5, 1.5, 1000);
    expect(navigator.routeOf(b)).toEqual([]);
    navigator.steer(WALLED, b, [a, b], 8.5, 1.5, 1000);
    expect(navigator.routeOf(a)).not.toBe(navigator.routeOf(b));
  });

  it('flanqueo: el segundo enemigo evita la ruta del primero si hay una alternativa', () => {
    // Dos pasillos paralelos (arriba y abajo) alrededor de una isla; el jugador está al otro lado.
    const ring = parse([
      '#############',
      '#...........#',
      '#.#########.#',
      '#...........#',
      '#############'
    ]);
    const goal = { x: 11.5, y: 2.5 };
    const first = createRaycastEnemy({ id: 'f1', kind: 'GRUNT', x: 1.5, y: 2.5 });
    const second = createRaycastEnemy({ id: 'f2', kind: 'GRUNT', x: 1.5, y: 2.5 });
    const routeThrough = (flank: boolean): [number, number] => {
      const navigator = createAStarNavigator({ flank, flankPenalty: 6 });
      navigator.steer(ring, first, [first, second], goal.x, goal.y, 1000);
      navigator.steer(ring, second, [first, second], goal.x, goal.y, 1000);
      const midRow = (enemy: typeof first) =>
        navigator.routeOf(enemy).find((point) => Math.abs(point.x - 6.5) < 0.1)?.y ?? -1;
      return [midRow(first), midRow(second)];
    };
    const [a0, b0] = routeThrough(false);
    expect(a0).toBe(b0);
    const [a1, b1] = routeThrough(true);
    expect(a1).not.toBe(b1);
  });
});
