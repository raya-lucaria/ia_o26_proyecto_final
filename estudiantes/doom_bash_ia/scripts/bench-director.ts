/**
 * Benchmark del director adaptativo (M3): Thompson sampling contra referencias.
 *
 *   npm run bench:director                  # construye la tabla si no existe (varios minutos) y analiza
 *   npm run bench:director -- --rebuild     # fuerza reconstruir la tabla
 *   npm run bench:director -- --seeds 20    # semillas por celda de la tabla (60 por omisión)
 *
 * 1. Tabla de desenlaces: jugador × brazo × semilla, con el simulador (ver src/ai/bandit/table.ts).
 * 2. Sesiones: cada jugador juega 80 encuentros seguidos con un selector de brazos; se repite en muchas réplicas.
 * 3. Deriva: un jugador que mejora a mitad de sesión.
 * Escribe resultados/director-tabla.json, resultados/bench-director.md y resultados/director-sesiones.csv.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESSURE_ARMS } from '../src/ai/bandit/arms';
import {
  createEpsilonGreedySelector,
  createFixedSelector,
  createThompsonSelector,
  createUcb1Selector,
  createUniformSelector,
  populationPrior,
  type ArmSelector
} from '../src/ai/bandit/policies';
import { cumulativeRegret, runSession, telemetryCsv, type DirectorEpisodeRecord } from '../src/ai/bandit/session';
import { armProbability, bestArm, buildOutcomeTable, ruleProbability, type OutcomeTable, type TablePlayer } from '../src/ai/bandit/table';
import { idleBotFactory, randomBotFactory, skilledBotFactory } from '../src/ai/sim/bots';
import { summarize } from '../src/ai/sim/stats';

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? Number(process.argv[index + 1]) : fallback;
}

const PRIOR_STRENGTH = 4;
const LEVEL = 'ash-judge-seal';
const WINDOW_MS = 40_000;
const TABLE_SEEDS = arg('seeds', 60);
const REPLICAS = arg('replicas', 300);
const EPISODES = arg('episodes', 80);
const PLAYERS: TablePlayer[] = [
  { name: 'quieto', bot: idleBotFactory },
  { name: 'aleatorio', bot: randomBotFactory },
  { name: 'habilidad 0.2', bot: skilledBotFactory(0.2) },
  { name: 'habilidad 0.5', bot: skilledBotFactory(0.5) },
  { name: 'habilidad 0.9', bot: skilledBotFactory(0.9) }
];

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'resultados');
mkdirSync(outDir, { recursive: true });
const tablePath = join(outDir, 'director-tabla.json');

function loadOrBuildTable(): OutcomeTable {
  if (!process.argv.includes('--rebuild') && existsSync(tablePath)) {
    const cached = JSON.parse(readFileSync(tablePath, 'utf8')) as OutcomeTable;
    if (cached.seeds === TABLE_SEEDS && cached.levelId === LEVEL) return cached;
  }
  const started = Date.now();
  const table = buildOutcomeTable({
    levelId: LEVEL,
    windowMs: WINDOW_MS,
    players: PLAYERS,
    arms: PRESSURE_ARMS,
    seeds: TABLE_SEEDS,
    onProgress: (done, total) => {
      if (done % 200 === 0) console.log(`tabla ${done}/${total} (${Math.round((Date.now() - started) / 1000)} s)`);
    }
  });
  writeFileSync(tablePath, JSON.stringify(table));
  return table;
}

type SelectorFactory = (replica: number, player: number) => ArmSelector;

/** Probabilidad media por brazo entre todos los jugadores menos `player` (para no usar al jugador evaluado). */
function leaveOneOutMeans(table: OutcomeTable, player: number): number[] {
  const others = table.players.map((_, i) => i).filter((i) => i !== player);
  return table.arms.map((_, a) => others.reduce((sum, i) => sum + armProbability(table, i, a), 0) / others.length);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)} %`;
}

function pm(values: readonly number[], digits = 2): string {
  const s = summarize(values);
  return `${s.mean.toFixed(digits)} ± ${s.ci95.toFixed(digits)}`;
}

const table = loadOrBuildTable();
const nArms = table.arms.length;
const lines: string[] = [];
const csvRows: string[] = [];

lines.push('# Benchmark del director adaptativo (M3)');
lines.push('');
lines.push(
  `Nivel ${table.levelId}, ventana de ${table.windowMs / 1000} s. Recompensa 1 si el jugador sigue vivo y termina con entre ` +
    `${pct(table.band.low)} y ${pct(table.band.high)} de vida. Tabla de ${table.seeds} semillas por celda (jugador × brazo). ` +
    `Sesiones de ${EPISODES} encuentros, ${REPLICAS} réplicas por celda.`
);
lines.push('');

// 1. La tabla.
lines.push('## 1. Probabilidad de caer en la banda, por jugador y brazo');
lines.push('');
lines.push(`| Jugador | Regla original | ${table.arms.join(' | ')} | Mejor brazo |`);
lines.push(`|---|---|${table.arms.map(() => '---').join('|')}|---|`);
for (let p = 0; p < table.players.length; p += 1) {
  const probs = table.arms.map((_, a) => armProbability(table, p, a));
  const best = bestArm(table, p);
  lines.push(
    `| ${table.players[p]} | ${ruleProbability(table, p).toFixed(2)} | ${probs.map((x) => x.toFixed(2)).join(' | ')} | ${table.arms[best.arm]} (${best.probability.toFixed(2)}) |`
  );
}
lines.push('');

// Mejor brazo único (el que un diseñador fijaría sabiendo todo, un solo valor para todos).
const averageByArm = table.arms.map((_, a) => table.players.reduce((sum, _p, p) => sum + armProbability(table, p, a), 0) / table.players.length);
const bestSingle = averageByArm.indexOf(Math.max(...averageByArm));
const oracleAverage = table.players.reduce((sum, _p, p) => sum + bestArm(table, p).probability, 0) / table.players.length;
const ruleAverage = table.players.reduce((sum, _p, p) => sum + ruleProbability(table, p), 0) / table.players.length;
lines.push(
  `Promedio sobre jugadores: regla original ${ruleAverage.toFixed(2)}; mejor brazo único (${table.arms[bestSingle]}) ` +
    `${averageByArm[bestSingle].toFixed(2)}; mejor brazo para cada jugador (oráculo) ${oracleAverage.toFixed(2)}.`
);
lines.push('');

// 2. Sesiones.
const SELECTORS: Array<[string, SelectorFactory]> = [
  ['Thompson', (r) => createThompsonSelector({ arms: nArms, seed: 1000 + r })],
  [
    'Thompson, prior poblacional',
    (r, p) => {
      const prior = populationPrior(leaveOneOutMeans(table, p), PRIOR_STRENGTH);
      return createThompsonSelector({ arms: nArms, seed: 1500 + r, priorAlpha: prior.alpha, priorBeta: prior.beta, label: 'Thompson, prior poblacional' });
    }
  ],
  ['Thompson, olvido 0.95', (r) => createThompsonSelector({ arms: nArms, seed: 1000 + r, discount: 0.95 })],
  ['epsilon-voraz 0.1', (r) => createEpsilonGreedySelector({ arms: nArms, seed: 2000 + r, epsilon: 0.1 })],
  ['UCB1', () => createUcb1Selector({ arms: nArms })],
  [`fijo: ${table.arms[bestSingle]}`, () => createFixedSelector({ arms: nArms, arm: bestSingle })],
  ['azar uniforme', (r) => createUniformSelector({ arms: nArms, seed: 3000 + r })]
];

function sessionMetrics(records: DirectorEpisodeRecord[], bestArmIndex: number) {
  const rate = (slice: DirectorEpisodeRecord[]) => slice.reduce((s, r) => s + r.reward, 0) / slice.length;
  const last = records.slice(-20);
  return {
    all: rate(records),
    first20: rate(records.slice(0, 20)),
    last20: rate(last),
    regret: cumulativeRegret(records).at(-1) ?? 0,
    onBest: last.filter((r) => r.arm === bestArmIndex).length / last.length
  };
}

lines.push('## 2. Sesiones: ¿cuánto tarda cada selector en acertar la banda?');
lines.push('');
lines.push('"En banda" es la fracción de encuentros con recompensa 1. "Arrepentimiento" es la suma, a lo largo de la sesión, de lo que se pierde (en probabilidad de acertar) por no elegir el mejor brazo de ese jugador; menos es mejor. "En el mejor" es la fracción de los últimos 20 encuentros que usaron el mejor brazo.');
lines.push('');
lines.push('| Jugador | Selector | En banda (sesión) | Primeros 20 | Últimos 20 | Arrepentimiento | En el mejor (últimos 20) |');
lines.push('|---|---|---|---|---|---|---|');
const perSelectorLast20: Record<string, number[]> = {};
for (let p = 0; p < table.players.length; p += 1) {
  const best = bestArm(table, p);
  for (const [name, make] of SELECTORS) {
    const metrics = Array.from({ length: REPLICAS }, (_, replica) => {
      const records = runSession({ table, player: p, selector: make(replica, p), episodes: EPISODES, seed: 9000 + replica });
      if (replica === 0 && p === 0) csvRows.push(telemetryCsv(records));
      return sessionMetrics(records, best.arm);
    });
    (perSelectorLast20[name] ??= []).push(summarize(metrics.map((m) => m.last20)).mean);
    lines.push(
      `| ${table.players[p]} | ${name} | ${pm(metrics.map((m) => m.all))} | ${pm(metrics.map((m) => m.first20))} | ${pm(metrics.map((m) => m.last20))} | ${pm(metrics.map((m) => m.regret), 1)} | ${pm(metrics.map((m) => m.onBest))} |`
    );
  }
}
lines.push('');
lines.push('Promedio de "últimos 20" sobre los cinco jugadores:');
lines.push('');
lines.push('| Selector | En banda, últimos 20 |');
lines.push('|---|---|');
for (const [name] of SELECTORS) {
  const values = perSelectorLast20[name];
  lines.push(`| ${name} | ${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)} |`);
}
lines.push(`| regla original (sin bandido) | ${ruleAverage.toFixed(2)} |`);
lines.push(`| oráculo (mejor brazo por jugador) | ${oracleAverage.toFixed(2)} |`);
lines.push('');

// 3. Deriva.
const before = table.players.indexOf('quieto');
const after = table.players.indexOf('habilidad 0.9');
const SWITCH = EPISODES / 2;
lines.push('## 3. Un jugador que cambia de estilo');
lines.push('');
lines.push(
  `Cambia de estilo a mitad de sesión. Los primeros ${SWITCH} encuentros juega "${table.players[before]}" y desde ahí "${table.players[after]}". ` +
    `Mejor brazo antes: ${table.arms[bestArm(table, before).arm]}; después: ${table.arms[bestArm(table, after).arm]}.`
);
lines.push('');
lines.push('| Selector | En banda, antes del cambio | En banda, después | Últimos 20 | Arrepentimiento total |');
lines.push('|---|---|---|---|---|');
for (const [name, make] of SELECTORS) {
  const rows = Array.from({ length: REPLICAS }, (_, replica) => {
    const records = runSession({
      table,
      player: (episode) => (episode < SWITCH ? before : after),
      selector: make(replica, before),
      episodes: EPISODES,
      seed: 12_000 + replica
    });
    const rate = (slice: DirectorEpisodeRecord[]) => slice.reduce((s, r) => s + r.reward, 0) / slice.length;
    return {
      pre: rate(records.slice(0, SWITCH)),
      post: rate(records.slice(SWITCH)),
      last: rate(records.slice(-20)),
      regret: cumulativeRegret(records).at(-1) ?? 0
    };
  });
  lines.push(`| ${name} | ${pm(rows.map((r) => r.pre))} | ${pm(rows.map((r) => r.post))} | ${pm(rows.map((r) => r.last))} | ${pm(rows.map((r) => r.regret), 1)} |`);
}
lines.push('');

writeFileSync(join(outDir, 'bench-director.md'), lines.join('\n') + '\n');
writeFileSync(join(outDir, 'director-sesion-ejemplo.csv'), csvRows[0] + '\n');
console.log('Listo. Archivos en resultados/.');
