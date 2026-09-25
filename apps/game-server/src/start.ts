import pg from 'pg';
import {experienceMultiplier} from '../../../packages/game-domain/src/rules/experience.js';
import {PostgresStore} from '../../../packages/persistence/src/postgres.ts';
import {offlineLimit} from '../../../packages/game-domain/src/presence.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {CONTENT_VERSION} from '../../../packages/game-domain/src/rules/client-content.js';
import {createGameServer} from './server.ts';

export type ServerEnvironment = {
  DATABASE_URL?: string;
  GAME_XP_MULTIPLIER?: string;
  GAME_OFFLINE_LIMIT_MS?: string;
  GAME_SERVER_SECRET?: string;
  HOST?: string;
  PORT?: string;
};

function positivePort(value: string | undefined): number {
  const port = Number(value ?? 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer from 1 to 65535');
  return port;
}

export async function startGameServer(environment: ServerEnvironment = process.env) {
  if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!environment.GAME_SERVER_SECRET) throw new Error('GAME_SERVER_SECRET is required');
  const xpMultiplier = experienceMultiplier(environment.GAME_XP_MULTIPLIER);
  const pool = new pg.Pool({connectionString: environment.DATABASE_URL});
  const store = new PostgresStore(pool);
  try {
    await store.initialize();
    const service = new GameService(store, {contentVersion: CONTENT_VERSION, xpMultiplier, offlineLimitMs: offlineLimit(environment.GAME_OFFLINE_LIMIT_MS)});
    const game = createGameServer({service, secret: environment.GAME_SERVER_SECRET});
    const host = environment.HOST || '127.0.0.1';
    const port = positivePort(environment.PORT);
    await new Promise<void>((resolve, reject) => {
      game.server.once('error', reject);
      game.server.listen(port, host, () => {
        game.server.off('error', reject);
        resolve();
      });
    });
    return {
      ...game,
      host,
      port,
      async close() {
        await game.close();
        await store.close();
      },
    };
  } catch (error) {
    await store.close().catch(() => {});
    throw error;
  }
}
