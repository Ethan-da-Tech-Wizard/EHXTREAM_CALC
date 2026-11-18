// Program: EHXTREAM_CALC - index.d.ts
// Programmer: Ethan-da-Tech-Wizard (written with Claude, an AI assistant)
// Last Modified: 2026-11-18
// Purpose: TypeScript type declarations for the math engine in engine.js (evaluate, formatValue, FUNCTIONS).
//
// A .d.ts file holds only types: it tells editors what the JavaScript exports look like.
//
// Value: what an expression can produce - a number, a vector (list of numbers) or a matrix (list of rows).
export type Value = number | number[] | number[][];
// Angle: the three angle units the engine understands - degrees, radians or gradians.
export type Angle = 'deg' | 'rad' | 'grad';
// EvaluateOptions: optional settings for evaluate(): the angle unit and the variables x and ans an expression may use.
export interface EvaluateOptions { angle?: Angle; variables?: {x?: number; ans?: Value} }
/** Throws Error for invalid expressions, unsupported domains, or exceeded limits. */
export function evaluate(expression: string, options?: EvaluateOptions): Value;
// formatValue: converts a result to text with the given number of significant digits (default 12).
export function formatValue(value: Value, precision?: number): string;
// FUNCTIONS: read-only list documenting every function (name, syntax, description, example).
export const FUNCTIONS: readonly Readonly<{name: string; syntax: string; description: string; example: string}>[];
