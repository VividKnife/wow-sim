// Online combat publishes at 5 Hz; background progress keeps its cheaper cadence.
export const WORKER_INTERVAL_MS = 100;
export function simulationInterval(combat: unknown, lastSeenAt: number, now: number) {
  return combat && now - lastSeenAt < 5_000 ? 200 : 1_000;
}

// Presence writes can invalidate a SERIALIZABLE settlement. Keep observed catch-up
// transactions short enough to commit between polls instead of replaying minutes.
// Offline jobs retain the larger budget; incomplete progress is persisted normally.
export function simulationTickBudget(lastSeenAt: number, now: number) {
  return now - lastSeenAt < 5_000 ? 20 : 20_000;
}
