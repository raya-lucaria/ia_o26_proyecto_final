/**
 * Generador pseudoaleatorio con semilla (mulberry32). Mismo valor de semilla, misma secuencia.
 * El estado es un solo entero, así que un generador se puede copiar (`clone`) a mitad de camino;
 * eso permitirá bifurcar un mundo simulado más adelante (MCTS).
 */
export type Rng = () => number;

export class SeededRng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Siguiente valor en [0, 1). Es una propiedad flecha para poder pasarla como `Rng` sin perder `this`. */
  readonly next: Rng = () => {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  clone(): SeededRng {
    const copy = new SeededRng(0);
    copy.state = this.state;
    return copy;
  }
}

export function createSeededRng(seed: number): Rng {
  return new SeededRng(seed).next;
}

/** Número en [-1, 1) con forma aproximadamente triangular, suficiente para ruido de puntería. */
export function symmetricNoise(rng: Rng): number {
  return rng() + rng() - 1;
}

/**
 * Ejecuta `fn` con `Math.random` sustituido por `rng` y lo restaura siempre al terminar.
 *
 * Por qué existe: algunas rutinas del juego (el merodeo de enemigos en `RaycastEnemyRoam`) usan
 * `Math.random` como valor por defecto. Sustituirlo aquí hace reproducible la simulación sin
 * modificar el código del juego, que es la línea base contra la que se compara la IA nueva.
 * Solo es válido en código síncrono.
 */
export function withMathRandom<T>(rng: Rng, fn: () => T): T {
  const original = Math.random;
  Math.random = rng;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}
