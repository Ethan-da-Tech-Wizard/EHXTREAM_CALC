// ==============================================================================
// Program: calculator.d.ts
// Programmer: Ethan-da-Tech-Wizard
// Last Modified: November 18, 2026
// Purpose: TypeScript declarations for ExtremeCalculator custom Web Component interface.
//
// How it fits: types for calculator.js, exposed as the "./element" export in package.json.
// Only the public methods and the history array are declared; internal members (render,
// bind, drawGraph, ...) are intentionally omitted. Hand-maintained; no TS build here.
// ==============================================================================
import type {Angle, Value} from './index.js';

// One log row. kind 'graph' entries come from plotting; ok=false rows record errors.
// timestamp is an ISO-8601 string; result is the formatted text that was displayed.
export interface HistoryEntry { expression: string; result: string; ok: boolean; kind: 'calculation' | 'graph'; angle: Angle; timestamp: string }
export class ExtremeCalculator extends HTMLElement {
  /** Submit and log an expression. Returns null on error. Only call after connection. */
  calculate(expression?: string): Value | null;

  // Switches the angle unit (also resets the graph window and persists the choice).
  // Throws for an unknown unit. Same connection requirement as calculate().
  setAngle(angle: Angle): void;

  // Switches tab: calculate, graph, matrix or logic. Throws for any other value.
  setMode(mode: 'calculate' | 'graph' | 'matrix' | 'logic'): void;

  // Triggers a JSON file download of the log and returns the same data.
  exportHistory(): {application: string; version: number; exportedAt: string; entries: HistoryEntry[]};
  history: HistoryEntry[];
}

// Lets document.createElement('extreme-calculator') and querySelector be typed.
declare global { interface HTMLElementTagNameMap {'extreme-calculator': ExtremeCalculator} }
