import pg from 'pg';
import {PostgresStore} from '../../../packages/persistence/src/postgres.ts';
import {offlineLimit} from '../../../packages/game-domain/src/presence.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {CONTENT_VERSION} from '../../../packages/game-domain/src/rules/client-content.js';
import {createGameWorker} from './worker.ts';
import {WORKER_INTERVAL_MS} from '../../../packages/game-domain/src/simulation-cadence.ts';

export type WorkerEnvironment = {
  DATABASE_URL?: string;
  GAME_OFFLINE_LIMIT_MS?: string;
  GAME_WORKER_INTERVAL_MS?: string;
  GAME_WORKER_LIMIT?: string;
};

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result < 1) throw new Error(`${name} must be a positive integer`);
  return result;
}

export async function startGameWorker(environment: WorkerEnvironment = process.env) {
  if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({connectionString: environment.DATABASE_URL});
  const store = new PostgresStore(pool);
  try {
    await store.initialize();
    const service = new GameService(store, {contentVersion: CONTENT_VERSION, offlineLimitMs: offlineLimit(environment.GAME_OFFLINE_LIMIT_MS)});
    const worker = createGameWorker({
      service,
      intervalMs: positiveInteger(environment.GAME_WORKER_INTERVAL_MS, WORKER_INTERVAL_MS, 'GAME_WORKER_INTERVAL_MS'),
      limit: positiveInteger(environment.GAME_WORKER_LIMIT, 100, 'GAME_WORKER_LIMIT'),
      onError: (error) => console.error('Game worker iteration failed', error),
    });
    worker.start();
    return {
      worker,
      async close() {
        await worker.stop();
        await store.close();
      },
    };
  } catch (error) {
    await store.close().catch(() => {});
    throw error;
  }
}
