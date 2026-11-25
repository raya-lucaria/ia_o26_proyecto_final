import { describe, expect, it } from 'vitest';
import { findGridRoute, idleBotFactory, randomBotFactory, REFERENCE_BOTS, scriptedBotFactory } from '../ai/sim/bots';
import { createAStarNavigator } from '../ai/astar/navigator';
import { createSeededRng } from '../ai/sim/rng';
import { runBatch, runEpisode } from '../ai/sim/runEpisode';
import { createSimWorld, isSimWorldDone, observeSimWorld, stepSimWorld } from '../ai/sim/SimWorld';
import { proportion, summarize } from '../ai/sim/stats';
import { IDLE_ACTION } from '../ai/types';
import { collides, RAYCAST_MOVEMENT } from '../game/raycast/RaycastMovement';
import { RAYCAST_LEVEL_1, RAYCAST_LEVEL_BOSS } from '../game/raycast/RaycastLevel';

const LEVELS = [RAYCAST_LEVEL_1.id, RAYCAST_LEVEL_BOSS.id];
/** Episodios cortos para que la prueba sea rápida; basta para que haya combate. */
const SHORT_MS = 25_000;

describe('createSeededRng', () => {
  it('repite la misma secuencia con la misma semilla', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    expect(Array.from({ length: 50 }, () => a())).toEqual(Array.from({ length: 50 }, () => b()));
  });

  it('produce valores en [0, 1) y secuencias distintas para semillas distintas', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    const first = Array.from({ length: 200 }, () => a());
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(first).not.toEqual(Array.from({ length: 200 }, () => b()));
  });
});

describe('simulador M0: determinismo', () => {
  for (const levelId of LEVELS) {
    for (const bot of REFERENCE_BOTS) {
      it(`misma semilla, misma partida: ${levelId} con bot ${bot(0).name}`, () => {
        const first = runEpisode({ levelId, seed: 7, bot, maxMs: SHORT_MS });
        const second = runEpisode({ levelId, seed: 7, bot, maxMs: SHORT_MS });
        expect(second).toEqual(first);
      });
    }
  }

  it('semillas distintas dan partidas distintas con el bot aleatorio', () => {
    const digests = runBatch({ levelId: RAYCAST_LEVEL_1.id, bot: randomBotFactory, maxMs: SHORT_MS }, [1, 2, 3, 4, 5]).map(
      (result) => result.digest
    );
    expect(new Set(digests).size).toBeGreaterThan(1);
  });

  it('bots distintos dan partidas distintas con la misma semilla', () => {
    const digests = [idleBotFactory, randomBotFactory, scriptedBotFactory].map(
      (bot) => runEpisode({ levelId: RAYCAST_LEVEL_1.id, seed: 3, bot, maxMs: SHORT_MS }).digest
    );
    expect(new Set(digests).size).toBe(3);
  });

  it('no modifica los datos compartidos del nivel entre episodios', () => {
    const before = JSON.stringify({
      grid: RAYCAST_LEVEL_1.map.grid,
      spawns: RAYCAST_LEVEL_1.initialSpawns,
      doors: RAYCAST_LEVEL_1.doors
    });
    runBatch({ levelId: RAYCAST_LEVEL_1.id, bot: scriptedBotFactory, maxMs: SHORT_MS }, [1, 2, 3]);
    const after = JSON.stringify({
      grid: RAYCAST_LEVEL_1.map.grid,
      spawns: RAYCAST_LEVEL_1.initialSpawns,
      doors: RAYCAST_LEVEL_1.doors
    });
    expect(after).toBe(before);
  });
});

describe('simulador con navegación A*', () => {
  const options = {
    levelId: RAYCAST_LEVEL_1.id,
    bot: idleBotFactory,
    alertRefreshMs: 1000,
    invulnerable: true,
    maxMs: 20_000,
    navigatorFactory: () => createAStarNavigator()
  };

  it('es determinista con navegador', () => {
    expect(runEpisode({ ...options, seed: 4 })).toEqual(runEpisode({ ...options, seed: 4 }));
  });

  it('el navegador cambia la partida y acerca más enemigos que la regla original', () => {
    const withAStar = runBatch(options, [1, 2, 3, 4, 5]);
    const legacy = runBatch({ ...options, navigatorFactory: undefined }, [1, 2, 3, 4, 5]);
    const total = (rs: typeof withAStar) => rs.reduce((sum, r) => sum + r.enemiesArrived, 0);
    expect(total(withAStar)).toBeGreaterThan(total(legacy));
    expect(withAStar[0].digest).not.toBe(legacy[0].digest);
  });

  it('un jugador invulnerable registra daño pero conserva la vida', () => {
    const result = runEpisode({ ...options, seed: 2, maxMs: 30_000 });
    expect(result.damageTaken).toBeGreaterThan(0);
    expect(result.healthRemaining).toBe(100);
    expect(result.firstDamageMs).not.toBeNull();
  });
});

describe('simulador M0: invariantes', () => {
  it('el jugador nunca queda dentro de una pared y la vida se mantiene en [0, 100]', () => {
    for (const levelId of LEVELS) {
      const world = createSimWorld({ levelId, seed: 11 });
      const bot = scriptedBotFactory(11);
      for (let tick = 0; tick < 1500 && isSimWorldDone(world) === null; tick += 1) {
        stepSimWorld(world, bot.decide(observeSimWorld(world)));
        expect(collides(world.map, world.player.x, world.player.y, RAYCAST_MOVEMENT.collisionRadius)).toBe(false);
        expect(world.health).toBeGreaterThanOrEqual(0);
        expect(world.health).toBeLessThanOrEqual(100);
        expect(Number.isFinite(world.player.x) && Number.isFinite(world.player.y)).toBe(true);
      }
    }
  });

  it('el resultado de un episodio es coherente', () => {
    for (const levelId of LEVELS) {
      const result = runEpisode({ levelId, seed: 5, bot: scriptedBotFactory, maxMs: SHORT_MS });
      expect(result.enemiesKilled).toBeLessThanOrEqual(result.enemiesTotal);
      expect(result.pelletsHit).toBeLessThanOrEqual(result.pelletsFired + 8);
      expect(result.durationMs).toBeLessThanOrEqual(SHORT_MS);
      expect(result.damageTaken).toBeGreaterThanOrEqual(100 - result.healthRemaining);
      expect(['cleared', 'death', 'timeout']).toContain(result.outcome);
    }
  });

  it('un bot quieto recibe daño en el nivel del jefe y termina muriendo', () => {
    const result = runEpisode({ levelId: RAYCAST_LEVEL_BOSS.id, seed: 1, bot: idleBotFactory, maxMs: 120_000 });
    expect(result.outcome).toBe('death');
    expect(result.bossHealthFraction).toBe(1);
  });

  it('rechaza niveles que no existen en lugar de caer al nivel 1', () => {
    expect(() => createSimWorld({ levelId: 'no-existe', seed: 1 })).toThrow(/desconocido/i);
  });

  it('una acción inactiva no mueve al jugador', () => {
    const world = createSimWorld({ levelId: RAYCAST_LEVEL_1.id, seed: 2 });
    const { x, y } = world.player;
    stepSimWorld(world, IDLE_ACTION);
    expect(world.player.x).toBe(x);
    expect(world.player.y).toBe(y);
  });
});

describe('ruta por celdas del bot de prueba', () => {
  const map = {
    tileSize: 1,
    grid: [
      [1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1]
    ]
  };

  it('rodea una pared en lugar de atravesarla', () => {
    const route = findGridRoute(map, 1.5, 1.5, 5.5, 3.5);
    expect(route.length).toBeGreaterThan(3);
    expect(route[route.length - 1]).toEqual({ x: 5.5, y: 3.5 });
    for (const point of route) expect(map.grid[Math.floor(point.y)][Math.floor(point.x)]).toBe(0);
  });

  it('devuelve ruta vacía si ya está en la celda o si no hay camino', () => {
    expect(findGridRoute(map, 1.5, 1.5, 1.7, 1.7)).toEqual([]);
    const sealed = { tileSize: 1, grid: [[0, 1, 0]] };
    expect(findGridRoute(sealed, 0.5, 0.5, 2.5, 0.5)).toEqual([]);
  });
});

describe('estadísticas', () => {
  it('summarize calcula media, desviación e intervalo del 95 %', () => {
    const summary = summarize([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(summary.n).toBe(8);
    expect(summary.mean).toBeCloseTo(5, 10);
    expect(summary.sd).toBeCloseTo(Math.sqrt(32 / 7), 10);
    expect(summary.ci95).toBeCloseTo((1.96 * summary.sd) / Math.sqrt(8), 10);
  });

  it('proportion mantiene el intervalo dentro de un rango razonable', () => {
    const { p, ci95 } = proportion(30, 100);
    expect(p).toBeCloseTo(0.3, 10);
    expect(ci95).toBeGreaterThan(0.05);
    expect(ci95).toBeLessThan(0.12);
  });
});
