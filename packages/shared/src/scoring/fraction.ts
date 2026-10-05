/**
 * Exact non-negative rational number. Scoring keeps correctness and speed
 * factor as fractions so that no uncontrolled floating point error leaks into
 * stored points; rounding happens only once, when converting for storage or
 * display.
 */
export interface Fraction {
  readonly num: number;
  readonly den: number;
}

export const ZERO: Fraction = { num: 0, den: 1 };
export const ONE: Fraction = { num: 1, den: 1 };

/** Creates a fraction from non-negative integers (`den > 0`). */
export function fraction(num: number, den: number): Fraction {
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || num < 0 || den <= 0) {
    throw new RangeError(`Invalid fraction ${num}/${den}`);
  }
  return { num, den };
}

/** Integer division of non-negative bigints rounded half up. */
export function roundDivBig(n: bigint, d: bigint): bigint {
  return (2n * n + d) / (2n * d);
}

/** Converts a fraction to a number rounded half up to `decimals` places. */
export function fractionToNumber(f: Fraction, decimals = 3): number {
  const scale = 10n ** BigInt(decimals);
  const scaled = roundDivBig(BigInt(f.num) * scale, BigInt(f.den));
  return Number(scaled) / Number(scale);
}

export function isZero(f: Fraction): boolean {
  return f.num === 0;
}
