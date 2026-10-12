import type {Angle, Value} from './index.js';
export interface HistoryEntry { expression: string; result: string; ok: boolean; kind: 'calculation' | 'graph'; angle: Angle; timestamp: string }
export class ExtremeCalculator extends HTMLElement {
  /** Submit and log an expression. Returns null on error. Only call after connection. */
  calculate(expression?: string): Value | null;
  setAngle(angle: Angle): void;
  setMode(mode: 'calculate' | 'graph' | 'matrix' | 'logic'): void;
  exportHistory(): {application: string; version: number; exportedAt: string; entries: HistoryEntry[]};
  history: HistoryEntry[];
}
declare global { interface HTMLElementTagNameMap {'extreme-calculator': ExtremeCalculator} }
