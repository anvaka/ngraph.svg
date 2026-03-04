/**
 * Creates a seeded pseudo-random number generator (xorshift32).
 * Produces deterministic sequences for reproducible layouts.
 *
 * @param {number} seed - Integer seed value (default 42)
 * @returns {{ next: () => number, nextDouble: () => number, seed: number }}
 */
export default function createRandom(seed = 42) {
  let state = seed >>> 0 || 1; // ensure non-zero unsigned 32-bit

  function next() {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state >>> 0;
  }

  /** Returns a float in [0, 1) */
  function nextDouble() {
    return next() / 0x100000000;
  }

  return { next, nextDouble, seed };
}
