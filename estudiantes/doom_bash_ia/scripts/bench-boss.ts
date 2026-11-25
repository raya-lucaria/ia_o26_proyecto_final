/**
 * Benchmark de la política del jefe (M2): regla original contra expectimax y contra políticas simples.
 *
 *   npm run bench:boss                  # 40 semillas
 *   npm run bench:boss -- --seeds 15    # rápido
 *
 * Dos mediciones por celda (jefe × jugador de prueba × política), con las mismas semillas:
 *  - Presión: jugador invulnerable, 45 s. Daño por salva = daño que habría recibido / salvas lanzadas.
 *  - Combate: jugador normal. Porcentaje en que el jugador vence al jefe y tiempo que sobrevive.
 * Escribe resultados/bench-boss.md y resultados/bench-boss.csv.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFixedKindPolicy, createRandomRepertoirePolicy } from '../src/ai/expectimax/baselines';
import { createExpectimaxBossPolicy } from '../src/ai/expectimax/policy';
import { idleBotFactory, randomBotFactory, scriptedBotFactory } from '../src/ai/sim/bots';
import { runBatch } from '../src/ai/sim/runEpisode';
import { proportion, summarize } from '../src/ai/sim/stats';
import type { SimBotFactory } from '../src/ai/types';
import type { RaycastBossPolicy } from '../src/game/raycast/RaycastBossPolicy';

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? Number(process.argv[index + 1]) : fallback;
}

const seedCount = arg('seeds', 40);
const seeds = Array.from({ length: seedCount }, (_, i) => i + 1);
const BOSSES = ['volt-archon-pit', 'bloom-warden-pit', 'ash-judge-seal'];
const PLAYERS: Array<[string, SimBotFactory]> = [
  ['guionado', scriptedBotFactory],
  ['aleatorio', randomBotFactory],
  ['quieto', idleBotFactory]
];
const TARGET = 6;
const POLICIES: Array<[string, ((seed: number) => RaycastBossPolicy) | undefined]> = [
  ['regla original', undefined],
  ['azar (repertorio)', (seed) => createRandomRepertoirePolicy(seed)],
  ['siempre fan_wide', () => createFixedKindPolicy('fan_wide')],
  ['expectimax daño, prof. 1', () => createExpectimaxBossPolicy({ depth: 1, pool: 'repertoire' })],
  ['expectimax daño, prof. 3', () => createExpectimaxBossPolicy({ depth: 3, pool: 'repertoire' })],
  [
    `expectimax ritmo ${TARGET}, mismos ataques, prof. 2`,
    () => createExpectimaxBossPolicy({ depth: 2, pool: 'rule', objective: 'pacing', targetDamage: TARGET })
  ],
  [
    `expectimax ritmo ${TARGET}, repertorio, prof. 1`,
    () => createExpectimaxBossPolicy({ depth: 1, pool: 'repertoire', objective: 'pacing', targetDamage: TARGET })
  ],
  [
    `expectimax ritmo ${TARGET}, repertorio, prof. 2`,
    () => createExpectimaxBossPolicy({ depth: 2, pool: 'repertoire', objective: 'pacing', targetDamage: TARGET })
  ],
  [
    `expectimax ritmo ${TARGET}, repertorio, prof. 3`,
    () => createExpectimaxBossPolicy({ depth: 3, pool: 'repertoire', objective: 'pacing', targetDamage: TARGET })
  ]
];

const rows: string[] = [
  `| Jefe | Jugador | Política | Daño por salva (media ± IC95) | Error de ritmo vs meta ${TARGET} (media ± IC95) | Jugador vence al jefe | Sobrevive, s (media ± IC95) | Vida del jefe al final |`,
  '|---|---|---|---|---|---|---|---|'
];
const csv: string[] = ['boss,player,policy,seed,pressure_damage,pressure_volleys,outcome,survival_ms,boss_health_fraction'];

for (const boss of BOSSES) {
  for (const [playerName, bot] of PLAYERS) {
    for (const [policyName, factory] of POLICIES) {
      const pressure = runBatch(
        { levelId: boss, bot, bossPolicyFactory: factory, invulnerable: true, maxMs: 45_000 },
        seeds
      );
      const combat = runBatch({ levelId: boss, bot, bossPolicyFactory: factory, maxMs: 90_000 }, seeds);
      seeds.forEach((seed, i) => {
        csv.push(
          [
            boss,
            playerName,
            policyName,
            seed,
            pressure[i].damageTaken.toFixed(1),
            pressure[i].bossVolleys,
            combat[i].outcome,
            combat[i].durationMs,
            (combat[i].bossHealthFraction ?? 0).toFixed(3)
          ].join(',')
        );
      });
      const perVolley = pressure.map((r) => r.damageTaken / Math.max(1, r.bossVolleys));
      const paceError = perVolley.map((x) => Math.abs(x - TARGET));
      const wins = combat.filter((r) => r.outcome === 'cleared').length;
      const winRate = proportion(wins, seedCount);
      rows.push(
        `| ${boss} | ${playerName} | ${policyName} | ${summarize(perVolley).mean.toFixed(1)} ± ${summarize(perVolley).ci95.toFixed(1)} | ${summarize(paceError).mean.toFixed(1)} ± ${summarize(paceError).ci95.toFixed(1)} | ${(winRate.p * 100).toFixed(0)} % ± ${(winRate.ci95 * 100).toFixed(0)} | ${summarize(
          combat.map((r) => r.durationMs / 1000)
        ).mean.toFixed(1)} ± ${summarize(combat.map((r) => r.durationMs / 1000)).ci95.toFixed(1)} | ${summarize(
          combat.map((r) => r.bossHealthFraction ?? 0)
        ).mean.toFixed(2)} |`
      );
    }
    console.log(`${boss} / ${playerName} listo`);
  }
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resultados');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'bench-boss.csv'), `${csv.join('\n')}\n`);
writeFileSync(
  join(outDir, 'bench-boss.md'),
  `# Benchmark de la política del jefe (M2)

${seedCount} semillas por celda. "Daño por salva": jugador invulnerable 45 s, daño recibido entre salvas lanzadas (la presión que crea la política). "Error de ritmo": distancia absoluta entre ese daño por salva y la meta (${TARGET}) en cada episodio.
"Jugador vence al jefe" y "Sobrevive": jugador normal, hasta 90 s; IC95 de Wilson en puntos porcentuales para las proporciones.

${rows.join('\n')}
`
);
console.log('Listo. Archivos en resultados/.');
