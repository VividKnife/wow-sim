// Online combat publishes at 5 Hz; background progress keeps its cheaper cadence.
export const WORKER_INTERVAL_MS = 100;
export function simulationInterval(combat: unknown, lastSeenAt: number, now: number) {
  return combat && now - lastSeenAt < 5_000 ? 200 : 1_000;
}

// Keep each simulation bounded so one owner cannot monopolize the worker.
// Background combat computes outside transactions; incomplete progress is committed
// as a checkpoint and resumed on the next iteration.
export function simulationTickBudget(lastSeenAt: number, now: number) {
  return now - lastSeenAt < 5_000 ? 20 : 20_000;
}
