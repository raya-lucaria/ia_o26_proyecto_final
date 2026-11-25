/**
 * Benchmark del simulador (M0): corre cada bot de referencia contra cada nivel con muchas semillas
 * y escribe una tabla con media e intervalo del 95 %.
 *
 *   npm run bench:sim                       # 100 semillas, ambos niveles, 3 dificultades
 *   npm run bench:sim -- --seeds 30         # más rápido
 *   npm run bench:sim -- --seeds 30 --level access-node --difficulty hard
 *
 * Escribe resultados/bench-sim.csv (episodios sueltos) y resultados/bench-sim.md (resumen).
 * Misma semilla, mismo resultado: el CSV se regenera idéntico en cualquier computadora.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REFERENCE_BOTS } from '../src/ai/sim/bots';
import { runBatch } from '../src/ai/sim/runEpisode';
import { proportion, summarize } from '../src/ai/sim/stats';
import type { SimEpisodeResult } from '../src/ai/types';
import { RAYCAST_LEVEL_1, RAYCAST_LEVEL_BOSS } from '../src/game/raycast/RaycastLevel';
import type { RaycastDifficultyId } from '../src/game/raycast/RaycastDifficulty';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const seedCount = Number(arg('seeds', '100'));
const levelIds = arg('level', `${RAYCAST_LEVEL_1.id},${RAYCAST_LEVEL_BOSS.id}`).split(',');
const difficulties = arg('difficulty', 'assist,standard,hard').split(',') as RaycastDifficultyId[];
const seeds = Array.from({ length: seedCount }, (_, i) => i + 1);

const csvRows: string[] = [
  'level,difficulty,bot,seed,outcome,duration_ms,health_remaining,damage_taken,enemies_killed,enemies_total,boss_health_fraction,digest'
];
const mdRows: string[] = [
  '| Nivel | Dificultad | Bot | Gana | Muere | Tiempo agotado | Daño recibido (media ± IC95) | Duración s (media ± IC95) |',
  '|---|---|---|---|---|---|---|---|'
];

const pct = (successes: number): string => {
  const { p, ci95 } = proportion(successes, seedCount);
  return `${(p * 100).toFixed(0)} % ± ${(ci95 * 100).toFixed(0)}`;
};
const pm = (values: number[], digits = 1): string => {
  const s = summarize(values);
  return `${s.mean.toFixed(digits)} ± ${s.ci95.toFixed(digits)}`;
};

const started = Date.now();
for (const levelId of levelIds) {
  for (const difficultyId of difficulties) {
    for (const bot of REFERENCE_BOTS) {
      const results: SimEpisodeResult[] = runBatch({ levelId, difficultyId, bot }, seeds);
      for (const r of results) {
        csvRows.push(
          [
            r.levelId,
            r.difficulty,
            r.bot,
            r.seed,
            r.outcome,
            r.durationMs,
            r.healthRemaining.toFixed(1),
            r.damageTaken.toFixed(1),
            r.enemiesKilled,
            r.enemiesTotal,
            r.bossHealthFraction === null ? '' : r.bossHealthFraction.toFixed(3),
            r.digest
          ].join(',')
        );
      }
      const count = (outcome: string): number => results.filter((r) => r.outcome === outcome).length;
      mdRows.push(
        `| ${levelId} | ${difficultyId} | ${results[0].bot} | ${pct(count('cleared'))} | ${pct(count('death'))} | ${pct(count('timeout'))} | ${pm(results.map((r) => r.damageTaken))} | ${pm(results.map((r) => r.durationMs / 1000))} |`
      );
      console.log(mdRows[mdRows.length - 1]);
    }
  }
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resultados');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'bench-sim.csv'), `${csvRows.join('\n')}\n`);
writeFileSync(
  join(outDir, 'bench-sim.md'),
  `# Benchmark del simulador (M0)\n\n${seedCount} semillas por celda (semillas 1..${seedCount}). "Gana" significa que el bot limpió el nivel; los porcentajes llevan IC95 de Wilson en puntos porcentuales.\n\n${mdRows.join('\n')}\n`
);
console.log(`\nListo en ${((Date.now() - started) / 1000).toFixed(1)} s. Archivos en resultados/.`);
