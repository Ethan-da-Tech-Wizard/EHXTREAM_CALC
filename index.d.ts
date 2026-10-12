export type Value = number | number[] | number[][];
export type Angle = 'deg' | 'rad' | 'grad';
export interface EvaluateOptions { angle?: Angle; variables?: {x?: number; ans?: Value} }
/** Throws Error for invalid expressions, unsupported domains, or exceeded limits. */
export function evaluate(expression: string, options?: EvaluateOptions): Value;
export function formatValue(value: Value, precision?: number): string;
export const FUNCTIONS: readonly Readonly<{name: string; syntax: string; description: string; example: string}>[];
