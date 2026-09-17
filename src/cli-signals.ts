/**
 * Signal-handler helpers for the CLI (no side effects on import; the CLI wires them up).
 */
export type CliSignal = "SIGINT" | "SIGTERM";
export const CLI_SIGNALS: readonly CliSignal[] = ["SIGINT", "SIGTERM"];

export type SignalHandlers = Record<CliSignal, () => void>;

export interface SwapOptions {
  /**
   * Internal test hook, called for each signal between the two listener operations of the swap
   * (after the next handler was added, before the previous one is removed). Not reachable from the
   * config file or CLI arguments; the CLI never passes it.
   */
  betweenAddAndRemove?: (signal: CliSignal) => void;
}

/**
 * Replace the current handlers with the next ones for every CLI signal (R5-001).
 * The next handler is registered *before* the previous one is removed, so there is never an
 * instant with zero listeners — with no listener Node restores the default action and a signal in
 * that instant would terminate the process. Both operations happen in the same synchronous call
 * stack, so a signal callback observes either the previous or the next handler, never none.
 */
export function swapSignalHandlers(from: SignalHandlers, to: SignalHandlers, options: SwapOptions = {}): void {
  for (const signal of CLI_SIGNALS) {
    process.on(signal, to[signal]);
    options.betweenAddAndRemove?.(signal);
    process.off(signal, from[signal]);
  }
}
