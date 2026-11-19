// ==============================================================================
// Program: index.d.ts
// Programmer: Ethan-da-Tech-Wizard
// Last Modified: November 18, 2026
// Purpose: TypeScript type definitions for the calculator mathematical evaluator and tokens.
//
// How it fits: hand-written declarations for engine.js, wired up through the "types" field
// and the "." export in package.json. There is no TypeScript build in this repo; keep this
// file in sync with engine.js's three exports by hand (evaluate, formatValue, FUNCTIONS).
// ==============================================================================

// Value is what evaluate() returns: a scalar, a vector (1-16 numbers) or a matrix (up to
// 16x16). The engine never returns NaN or Infinity.
export type Value = number | number[] | number[][];
export type Angle = 'deg' | 'rad' | 'grad';

// angle defaults to 'rad' when omitted. Only `x` (scalar) and `ans` (any Value) are
// recognised variables; other keys are ignored.
export interface EvaluateOptions { angle?: Angle; variables?: {x?: number; ans?: Value} }
/** Throws Error for invalid expressions, unsupported domains, or exceeded limits. */
export function evaluate(expression: string, options?: EvaluateOptions): Value;

// Formats with `precision` significant digits (integer 1-100, default 12); throws Error
// for invalid precision or non-finite values.
export function formatValue(value: Value, precision?: number): string;

// Read-only help table, one entry per callable function; `example` is a valid expression.
export const FUNCTIONS: readonly Readonly<{name: string; syntax: string; description: string; example: string}>[];
