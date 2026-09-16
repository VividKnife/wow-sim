export interface WorkerService {
  work(now?: number, limit?: number): Promise<unknown>;
}

type WorkerOptions = {
  service: WorkerService;
  intervalMs?: number;
  limit?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
};

export function createGameWorker(options: WorkerOptions) {
  const intervalMs = options.intervalMs ?? 1_000;
  const limit = options.limit ?? 100;
  const now = options.now ?? Date.now;
  if (!Number.isFinite(intervalMs) || intervalMs < 1) throw new Error('intervalMs must be positive');
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer');
  let timer: NodeJS.Timeout | undefined;
  let active: Promise<unknown> | undefined;
  let started = false;

  const runOnce = async () => {
    const result = await options.service.work(now(), limit);
    if (result && typeof result === 'object' && 'errors' in result && Array.isArray(result.errors)) {
      for (const error of result.errors) options.onError?.(error);
    }
    return result;
  };
  const schedule = () => {
    if (!started) return;
    timer = setTimeout(() => {
      active = runOnce()
        .catch((error) => options.onError?.(error))
        .finally(() => {
          active = undefined;
          schedule();
        });
    }, intervalMs);
  };

  return {
    runOnce,
    start() {
      if (started) return;
      started = true;
      schedule();
    },
    async stop() {
      started = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
      await active;
    },
  };
}
