import { describe, expect, it } from 'vitest';
import {
  createAiRuntime,
  ENCOUNTER_WINDOW_MS,
  parseAiQuery,
  type AiFrame,
  type KeyValueStorage
} from '../ai/runtime/AiRuntime';
import { PRESSURE_ARMS } from '../ai/bandit/arms';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    }
  };
}

const frame = (overrides: Partial<AiFrame> = {}): AiFrame => ({
  nowMs: 0,
  bossAlive: true,
  playerAlive: true,
  health: 100,
  maxHealth: 100,
  ...overrides
});

describe('runtime de IA del juego', () => {
  it('por omisión no inyecta nada: el juego se comporta como el original', () => {
    const runtime = createAiRuntime({ seed: 1 });
    expect(runtime.navigationMode).toBe('legacy');
    expect(runtime.bossMode).toBe('rule');
    expect(runtime.navigator()).toBeUndefined();
    runtime.update(frame());
    expect(runtime.bossPolicy()).toBeUndefined();
  });

  it('los modos rotan y se recuerdan en el almacenamiento', () => {
    const storage = memoryStorage();
    const runtime = createAiRuntime({ storage, seed: 1 });
    expect(runtime.cycleNavigation()).toBe('astar');
    expect(runtime.navigator()).toBeDefined();
    expect(runtime.cycleBossDirector()).toBe('expectimax');
    expect(runtime.bossPolicy()).toBeDefined();
    expect(runtime.cycleBossDirector()).toBe('bandit');
    expect(runtime.cycleBossDirector()).toBe('rule');
    runtime.cycleBossDirector();
    const reopened = createAiRuntime({ storage, seed: 2 });
    expect(reopened.navigationMode).toBe('astar');
    expect(reopened.bossMode).toBe('expectimax');
  });

  it('la URL manda sobre lo guardado y descarta lo desconocido', () => {
    expect(parseAiQuery('?ia=astar,bandido')).toEqual({ navigation: 'astar', boss: 'bandit' });
    expect(parseAiQuery('ia=foo,expectimax')).toEqual({ boss: 'expectimax' });
    expect(parseAiQuery('')).toEqual({});
    const storage = memoryStorage({ 'doom-bash-ia:modos:v1': JSON.stringify({ navigation: 'astar', boss: 'expectimax' }) });
    const runtime = createAiRuntime({ storage, query: '?ia=legacy,regla', seed: 1 });
    expect(runtime.navigationMode).toBe('legacy');
    expect(runtime.bossMode).toBe('rule');
  });

  it('un almacenamiento corrupto o que falla no rompe el runtime', () => {
    const broken: KeyValueStorage = {
      getItem: () => '{no es json',
      setItem: () => {
        throw new Error('lleno');
      }
    };
    const runtime = createAiRuntime({ storage: broken, seed: 1 });
    expect(() => runtime.cycleBossDirector()).not.toThrow();
    expect(runtime.navigationMode).toBe('legacy');
  });

  it('bandido: elige brazo al aparecer el jefe y aprende al cerrar la ventana', () => {
    const storage = memoryStorage();
    const runtime = createAiRuntime({ storage, query: '?ia=bandido', seed: 7 });
    runtime.update(frame({ nowMs: 1000 }));
    expect(runtime.bossPolicy()).toBeDefined();
    // Termina la ventana con 50 % de vida: dentro de la banda, recompensa 1.
    runtime.update(frame({ nowMs: 1000 + ENCOUNTER_WINDOW_MS, health: 50 }));
    const result = runtime.lastEncounter();
    expect(result).toMatchObject({ reward: 1, reason: 'timeout' });
    expect(PRESSURE_ARMS.map((arm) => arm.id)).toContain(result?.armId);
    const saved = JSON.parse(storage.data['doom-bash-ia:bandido:v1']) as { pulls: number[] };
    expect(saved.pulls.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('bandido: morir da recompensa 0 y fuera de banda también', () => {
    const runtime = createAiRuntime({ query: '?ia=bandido', seed: 3 });
    runtime.update(frame({ nowMs: 0 }));
    runtime.update(frame({ nowMs: 5000, playerAlive: false, health: 0 }));
    expect(runtime.lastEncounter()).toMatchObject({ reward: 0, reason: 'death' });
    runtime.update(frame({ nowMs: 6000 }));
    runtime.update(frame({ nowMs: 6000 + ENCOUNTER_WINDOW_MS, health: 95 }));
    expect(runtime.lastEncounter()).toMatchObject({ reward: 0, reason: 'timeout' });
  });

  it('bandido: matar al jefe cierra el encuentro con lo que quedaba de vida', () => {
    const runtime = createAiRuntime({ query: '?ia=bandido', seed: 3 });
    runtime.update(frame({ nowMs: 0 }));
    runtime.update(frame({ nowMs: 20_000, bossAlive: false, health: 60 }));
    expect(runtime.lastEncounter()).toMatchObject({ reward: 1, reason: 'cleared' });
  });

  it('la evidencia guardada se restaura en la sesión siguiente', () => {
    const storage = memoryStorage();
    const first = createAiRuntime({ storage, query: '?ia=bandido', seed: 9 });
    for (let i = 0; i < 3; i += 1) {
      first.update(frame({ nowMs: i * 100_000 }));
      first.update(frame({ nowMs: i * 100_000 + 10_000, bossAlive: false, health: 50 }));
    }
    const second = createAiRuntime({ storage, query: '?ia=bandido', seed: 10 });
    const lines = second.panelLines(frame()).join('\n');
    expect(lines).toContain('bandido Thompson');
    const saved = JSON.parse(storage.data['doom-bash-ia:bandido:v1']) as { pulls: number[] };
    expect(saved.pulls.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('cambiar de modo a media pelea descarta el encuentro sin contarlo', () => {
    const storage = memoryStorage();
    const runtime = createAiRuntime({ storage, query: '?ia=bandido', seed: 4 });
    runtime.update(frame({ nowMs: 0 }));
    runtime.cycleBossDirector();
    runtime.update(frame({ nowMs: 1000 }));
    expect(runtime.lastEncounter()).toBeNull();
    expect(storage.data['doom-bash-ia:bandido:v1']).toBeUndefined();
  });

  it('resetBandit borra la creencia', () => {
    const storage = memoryStorage();
    const runtime = createAiRuntime({ storage, query: '?ia=bandido', seed: 5 });
    runtime.update(frame({ nowMs: 0 }));
    runtime.update(frame({ nowMs: ENCOUNTER_WINDOW_MS, health: 50 }));
    runtime.resetBandit();
    const saved = JSON.parse(storage.data['doom-bash-ia:bandido:v1']) as { pulls: number[] };
    expect(saved.pulls.every((n) => n === 0)).toBe(true);
    expect(runtime.lastEncounter()).toBeNull();
  });

  it('el panel muestra las decisiones del jefe en modo expectimax', () => {
    const runtime = createAiRuntime({ query: '?ia=expectimax', seed: 1 });
    runtime.update(frame());
    const lines = runtime.panelLines(frame());
    expect(lines.join('\n')).toContain('expectimax');
    expect(lines.length).toBeGreaterThan(2);
  });
});
