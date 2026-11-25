export interface Summary {
  n: number;
  mean: number;
  /** Desviación estándar muestral (n - 1). */
  sd: number;
  /** Semiancho del intervalo de confianza del 95 % para la media (aproximación normal). */
  ci95: number;
}

export function summarize(values: readonly number[]): Summary {
  const n = values.length;
  if (n === 0) return { n: 0, mean: Number.NaN, sd: Number.NaN, ci95: Number.NaN };
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  if (n === 1) return { n, mean, sd: 0, ci95: 0 };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  return { n, mean, sd, ci95: (1.96 * sd) / Math.sqrt(n) };
}

/** Proporción de verdaderos con intervalo de Wilson del 95 %. Devuelve el semiancho de forma simétrica aproximada. */
export function proportion(successes: number, total: number): { p: number; ci95: number } {
  if (total === 0) return { p: Number.NaN, ci95: Number.NaN };
  const p = successes / total;
  const z = 1.96;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / (1 + (z * z) / total);
  return { p, ci95: half };
}
