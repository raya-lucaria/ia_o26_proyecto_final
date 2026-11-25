/**
 * Benchmark de navegación (M1). Dos partes:
 *
 *  A. Algoritmos de ruta (BFS, Dijkstra, voraz, A*) sobre los mapas reales: nodos expandidos, longitud
 *     de ruta frente a la óptima y tiempo. Mismos pares de celdas para todos.
 *  B. Persecución: un blanco inmóvil e invulnerable, todos los enemigos alertados (se re-alertan cada 1 s,
 *     como si el jugador no dejara de disparar). Compara la regla original contra A* y A* con flanqueo,
 *     con las mismas semillas (comparación pareada).
 *
 *   npm run bench:nav                  # 200 pares por nivel, 50 semillas
 *   npm run bench:nav -- --pairs 50 --seeds 20
 *
 * Escribe resultados/bench-nav.md y resultados/bench-nav-persecucion.csv.
 * Nodos expandidos y longitudes son deterministas; los tiempos de reloj dependen de la computadora.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAStarNavigator } from '../src/ai/astar/navigator';
import { searchGrid, type SearchAlgorithm } from '../src/ai/astar/search';
import { idleBotFactory } from '../src/ai/sim/bots';
import { createSeededRng } from '../src/ai/sim/rng';
import { runBatch } from '../src/ai/sim/runEpisode';
import { createSimWorld } from '../src/ai/sim/SimWorld';
import { summarize } from '../src/ai/sim/stats';
import type { RaycastEnemyNavigator } from '../src/game/raycast/RaycastEnemyNavigator';

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? Number(process.argv[index + 1]) : fallback;
}

const pairCount = arg('pairs', 200);
const seedCount = arg('seeds', 50);
const LEVELS = [
  'access-node',
  'glass-cistern',
  'relay-catacomb',
  'shard-vault',
  'relay-heart',
  'rift-fracture',
  'signal-threshold',
  'sulfur-lattice',
  'meridian-ember-ramp',
  'meridian-gate-cut'
];
const ALGORITHMS: SearchAlgorithm[] = ['bfs', 'dijkstra', 'greedy', 'astar'];
const HORIZON_MS = 60_000;

// ---------- Parte A ----------
const partA: string[] = [
  '| Nivel | Algoritmo | Encuentra ruta | Nodos expandidos (media) | Longitud / óptima (media) | Rutas óptimas | µs por búsqueda |',
  '|---|---|---|---|---|---|---|'
];
for (const levelId of LEVELS) {
  const map = createSimWorld({ levelId, seed: 1 }).map;
  const open: Array<[number, number]> = [];
  map.grid.forEach((row, y) => row.forEach((value, x) => value === 0 && open.push([x, y])));
  const rng = createSeededRng(2026);
  const pairs = Array.from({ length: pairCount }, () => [
    open[Math.floor(rng() * open.length)],
    open[Math.floor(rng() * open.length)]
  ]);
  const baseline = pairs.map(([from, to]) =>
    searchGrid(map, from[0] + 0.5, from[1] + 0.5, to[0] + 0.5, to[1] + 0.5, {
      algorithm: 'dijkstra',
      maxNodes: 100_000
    })
  );
  for (const algorithm of ALGORITHMS) {
    const started = performance.now();
    const results = pairs.map(([from, to]) =>
      searchGrid(map, from[0] + 0.5, from[1] + 0.5, to[0] + 0.5, to[1] + 0.5, { algorithm, maxNodes: 100_000 })
    );
    const micros = ((performance.now() - started) * 1000) / pairs.length;
    const reachable = baseline.map((b) => b.found);
    const solved = results.filter((r, i) => reachable[i] && r.found);
    const ratios: number[] = [];
    let optimal = 0;
    results.forEach((r, i) => {
      if (!reachable[i] || !r.found || baseline[i].length === 0) return;
      const ratio = r.length / baseline[i].length;
      ratios.push(ratio);
      if (ratio <= 1 + 1e-9) optimal += 1;
    });
    const reachableCount = reachable.filter(Boolean).length;
    partA.push(
      `| ${levelId} | ${algorithm} | ${((solved.length / Math.max(1, reachableCount)) * 100).toFixed(0)} % | ${summarize(
        results.map((r) => r.expanded)
      ).mean.toFixed(1)} | ${summarize(ratios).mean.toFixed(3)} | ${((optimal / Math.max(1, ratios.length)) * 100).toFixed(0)} % | ${micros.toFixed(0)} |`
    );
  }
  console.log(`A: ${levelId} listo`);
}

// ---------- Parte B ----------
type Variant = { name: string; factory?: () => RaycastEnemyNavigator };
const VARIANTS: Variant[] = [
  { name: 'regla original' },
  { name: 'A*', factory: () => createAStarNavigator() },
  { name: 'A* + flanqueo', factory: () => createAStarNavigator({ flank: true }) }
];
const seeds = Array.from({ length: seedCount }, (_, i) => i + 1);
const csv: string[] = ['level,variant,seed,first_damage_ms,enemies_arrived,mean_arrival_ms,damage_taken'];
const partB: string[] = [
  `| Nivel | Variante | 1er daño, s (media ± IC95; sin daño cuenta ${HORIZON_MS / 1000} s) | Llegan al jugador (media) | Daño en ${HORIZON_MS / 1000} s (media) | Δ 1er daño vs regla original, s (pareada ± IC95) |`,
  '|---|---|---|---|---|---|'
];
for (const levelId of LEVELS) {
  let baselineFirst: number[] = [];
  for (const variant of VARIANTS) {
    const results = runBatch(
      {
        levelId,
        bot: idleBotFactory,
        navigatorFactory: variant.factory,
        alertRefreshMs: 1000,
        invulnerable: true,
        maxMs: HORIZON_MS
      },
      seeds
    );
    const first = results.map((r) => r.firstDamageMs ?? HORIZON_MS);
    if (variant.factory === undefined) baselineFirst = first;
    for (const r of results) {
      csv.push(
        [levelId, variant.name, r.seed, r.firstDamageMs ?? '', r.enemiesArrived, r.meanArrivalMs?.toFixed(0) ?? '', r.damageTaken.toFixed(1)].join(',')
      );
    }
    const s = summarize(first.map((ms) => ms / 1000));
    const diff = variant.factory
      ? (() => {
          const d = summarize(first.map((ms, i) => (ms - baselineFirst[i]) / 1000));
          return `${d.mean.toFixed(1)} ± ${d.ci95.toFixed(1)}`;
        })()
      : '—';
    partB.push(
      `| ${levelId} | ${variant.name} | ${s.mean.toFixed(1)} ± ${s.ci95.toFixed(1)} | ${summarize(results.map((r) => r.enemiesArrived)).mean.toFixed(2)} | ${summarize(
        results.map((r) => r.damageTaken)
      ).mean.toFixed(0)} | ${diff} |`
    );
  }
  console.log(`B: ${levelId} listo`);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resultados');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'bench-nav-persecucion.csv'), `${csv.join('\n')}\n`);
writeFileSync(
  join(outDir, 'bench-nav.md'),
  `# Benchmark de navegación (M1)

## A. Algoritmos de ruta en los mapas reales

${pairCount} pares de celdas libres por nivel (los mismos para los cuatro algoritmos). "Longitud / óptima" compara contra Dijkstra.
"Rutas óptimas" es el porcentaje de pares donde la longitud coincide con la óptima. Los µs dependen de la computadora; los nodos no.

${partA.join('\n')}

## B. Persecución: regla original contra A*

Blanco inmóvil e invulnerable, ${seedCount} semillas por celda, horizonte de ${HORIZON_MS / 1000} s. Los enemigos se re-alertan cada 1 s.
"Llegan" cuenta enemigos que quedan a menos de 1.2 celdas (los que atacan a distancia no suelen llegar).

${partB.join('\n')}
`
);
console.log('Listo. Archivos en resultados/.');
