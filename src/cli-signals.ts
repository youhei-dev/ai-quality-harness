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
 * that instant would terminate the process.
 * During the swap both handlers are registered for an instant (R6-003): an ordinary OS signal is
 * dispatched asynchronously, so its listeners run only after this synchronous swap has completed,
 * i.e. with the *next* handler alone. Both handlers can run together only if something calls
 * `process.emit(signal)` synchronously from inside the swap (e.g. an internal test hook).
 */
export function swapSignalHandlers(from: SignalHandlers, to: SignalHandlers, options: SwapOptions = {}): void {
  for (const signal of CLI_SIGNALS) {
    process.on(signal, to[signal]);
    options.betweenAddAndRemove?.(signal);
    process.off(signal, from[signal]);
  }
}

/**
 * The CLI forces its exit this long after the kill grace period when the clean-up has not finished (src/cli.ts). By default the runner's own
 * bound (DEFAULT_CONFIRM_MS after SIGKILL, src/runner/execute.ts) is shorter; the backlog 16 test pins that relation of constants, not that the report comes first.
 */
export const SAFETY_VALVE_EXTRA_MS = 3_000;
