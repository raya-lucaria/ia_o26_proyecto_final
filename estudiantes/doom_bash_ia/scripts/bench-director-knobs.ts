/**
 * ¿Mueven las perillas del director de spawns la vida del jugador? (soporte de docs/DIRECTOR.md)
 *
 *   npm run bench:director-knobs
 *
 * Nivel access-node, 60 s, enemigos siempre alertados (escenario persecución). Barre el tope de enemigos vivos y el
 * ritmo de aparición del director real del juego, y después el daño y la velocidad de los enemigos, con un jugador
 * simulado torpe y uno hábil. Escribe resultados/bench-director-perillas.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skilledBotFactory } from '../src/ai/sim/bots';
import { runEpisode } from '../src/ai/sim/runEpisode';
import { summarize } from '../src/ai/sim/stats';
import { getRaycastLevelById } from '../src/game/raycast/RaycastLevel';
import { DEFAULT_DIRECTOR_CONFIG, type DirectorConfig } from '../src/game/systems/DirectorConfig';

const LEVEL = 'access-node';
const SEEDS = Array.from({ length: Number(process.argv[3] ?? 12) }, (_, i) => i + 1);
const SKILLS = [0.1, 0.9];
const level = getRaycastLevelById(LEVEL);
const base = { ...DEFAULT_DIRECTOR_CONFIG, ...level.director.config };
const COOLDOWNS = ['baseSpawnCooldownMs', 'buildUpSpawnCooldownMs', 'ambushSpawnCooldownMs', 'highIntensitySpawnCooldownMs'] as const;

function cell(skill: number, directorConfig: Partial<DirectorConfig>, enemyScaling?: { damage: number; speed: number }) {
  const runs = SEEDS.map((seed) =>
    runEpisode({ levelId: LEVEL, seed, bot: skilledBotFactory(skill), maxMs: 60_000, alertRefreshMs: 1500, directorConfig, enemyScaling })
  );
  const hp = summarize(runs.map((r) => r.healthRemaining));
  const spawns = summarize(runs.map((r) => r.directorSpawns));
  return `vida ${hp.mean.toFixed(0)} ± ${hp.ci95.toFixed(0)}, apariciones ${spawns.mean.toFixed(1)}, muertes ${runs.filter((r) => r.outcome === 'death').length}`;
}

const lines: string[] = ['# Perillas del director de spawns (soporte de docs/DIRECTOR.md)', ''];
lines.push(`Nivel ${LEVEL}, 60 s, ${SEEDS.length} semillas, enemigos alertados cada 1.5 s. Vida final media ± IC95 (0–100).`, '');

lines.push('## Tope de enemigos vivos × ritmo de aparición (presupuesto de apariciones 60)', '');
lines.push(`| Jugador | Tope ×1, ritmo ×1 | Tope ×2.5, ritmo ×1 | Tope ×1, ritmo ×0.4 | Tope ×2.5, ritmo ×0.4 | Tope ×1, ritmo ×0.15 | Tope ×2.5, ritmo ×0.15 |`);
lines.push('|---|---|---|---|---|---|---|');
for (const skill of SKILLS) {
  const cols: string[] = [];
  for (const cooldown of [1, 0.4, 0.15]) {
    for (const cap of [1, 2.5]) {
      const patch: Partial<DirectorConfig> = { maxEnemiesAlive: Math.round(base.maxEnemiesAlive * cap), maxTotalSpawns: 60 };
      for (const field of COOLDOWNS) patch[field] = Math.max(300, Math.round(base[field] * cooldown));
      cols.push(cell(skill, patch));
    }
  }
  // Orden de columnas: (tope 1, 2.5) por cada ritmo.
  lines.push(`| habilidad ${skill} | ${cols.join(' | ')} |`);
}
lines.push('', '## Daño y velocidad de los enemigos (director de fábrica)', '');
lines.push('| Jugador | Daño ×1, vel. ×1 | Daño ×2.5, vel. ×1 | Daño ×4, vel. ×1 | Daño ×4, vel. ×1.3 |');
lines.push('|---|---|---|---|---|');
for (const skill of SKILLS) {
  const scalings = [
    { damage: 1, speed: 1 },
    { damage: 2.5, speed: 1 },
    { damage: 4, speed: 1 },
    { damage: 4, speed: 1.3 }
  ];
  lines.push(`| habilidad ${skill} | ${scalings.map((s) => cell(skill, {}, s)).join(' | ')} |`);
}
lines.push('');

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resultados');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'bench-director-perillas.md'), lines.join('\n') + '\n');
console.log('Listo. Archivos en resultados/.');
