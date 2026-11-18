// Program: EHXTREAM_CALC - calculator.d.ts
// Programmer: Ethan-da-Tech-Wizard (written with Claude, an AI assistant)
// Last Modified: 2026-11-18
// Purpose: TypeScript declarations for the <extreme-calculator> web component defined in calculator.js.
//
// Import the types the component needs from the engine declarations.
import type {Angle, Value} from './index.js';
// HistoryEntry: one saved row of the calculation log - what was typed, the result text, whether it worked, whether it was a calculation or a graph, the angle unit used and an ISO timestamp.
export interface HistoryEntry { expression: string; result: string; ok: boolean; kind: 'calculation' | 'graph'; angle: Angle; timestamp: string }
// ExtremeCalculator: the custom HTML element class (use it through the <extreme-calculator> tag).
export class ExtremeCalculator extends HTMLElement {
  /** Submit and log an expression. Returns null on error. Only call after connection. */
  calculate(expression?: string): Value | null;
  // setAngle: switch the angle unit shown and used for trig functions.
  setAngle(angle: Angle): void;
  // setMode: switch the visible tab (calculator, graph, matrix or logic).
  setMode(mode: 'calculate' | 'graph' | 'matrix' | 'logic'): void;
  // exportHistory: downloads the log as a JSON file and returns the same data.
  exportHistory(): {application: string; version: number; exportedAt: string; entries: HistoryEntry[]};
  // history: the list of log entries so far.
  history: HistoryEntry[];
}
// Teach TypeScript that document.createElement('extreme-calculator') returns an ExtremeCalculator.
declare global { interface HTMLElementTagNameMap {'extreme-calculator': ExtremeCalculator} }
