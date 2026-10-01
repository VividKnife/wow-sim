import {runtimeVersion} from '../../simulation-host/src/version.ts';
import {GmService} from '../../../packages/game-domain/src/gm.ts';
import {AdminStore} from './admin-store.ts';
import {databasePool} from '../../../packages/persistence/src/pool.ts';
import {AccountStore} from './account-store.ts';
import {readFile} from 'node:fs/promises';
import {experienceMultiplier} from '../../../packages/game-domain/src/rules/experience.js';
import {PostgresStore} from '../../../packages/persistence/src/postgres.ts';
import {offlineLimit} from '../../../packages/game-domain/src/presence.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {CONTENT_VERSION} from '../../../packages/game-domain/src/rules/client-content.js';
import {createGameServer} from './server.ts';
import {ResidentGameService} from './resident-game-service.ts';
import {SimulationClient} from './simulation-client.ts';

export type ServerEnvironment = {
  DATABASE_URL?: string;
  GAME_DATABASE_SCHEMA?: string;
  GAME_XP_MULTIPLIER?: string;
  GAME_OFFLINE_LIMIT_MS?: string;
  APP_ORIGIN?: string;
  NODE_ENV?: string;
  AUTH_TRUST_PROXY_HOPS?: string;
  HOST?: string;
  PORT?: string;
  SIMULATION_URL?: string;
  SIMULATION_TOKEN?: string;
};

function positivePort(value: string | undefined): number {
  const port = Number(value ?? 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer from 1 to 65535');
  return port;
}

export async function startGameServer(environment: ServerEnvironment = process.env) {
  if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!environment.APP_ORIGIN) throw new Error('APP_ORIGIN is required');
  if (!environment.SIMULATION_TOKEN) throw new Error('SIMULATION_TOKEN is required');
  const simulation=new SimulationClient({url:environment.SIMULATION_URL??'http://127.0.0.1:8790',token:environment.SIMULATION_TOKEN});
  const xpMultiplier = experienceMultiplier(environment.GAME_XP_MULTIPLIER);
  const pool = await databasePool({connectionString: environment.DATABASE_URL,connectionTimeoutMillis:5000},environment.GAME_DATABASE_SCHEMA);
  const store = new PostgresStore(pool);
  try {
    await store.initialize();
    const domain = new GameService(store, {contentVersion: CONTENT_VERSION, xpMultiplier, offlineLimitMs: offlineLimit(environment.GAME_OFFLINE_LIMIT_MS)});
    const service=new ResidentGameService(domain,simulation);
    const accounts=new AccountStore(pool);await accounts.initialize();
    const admin=new AdminStore(pool,accounts);await admin.initialize();
    let publicAssetBase='',deployment:{commit?:string;buildId?:string}|undefined;
    try {const metadata=JSON.parse(await readFile(new URL('../../../packages/DEPLOYMENT.json',import.meta.url),'utf8'));publicAssetBase=metadata.publicAssetBase||'';deployment={commit:metadata.commit,buildId:metadata.buildId};}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    const trustProxyHops=Number(environment.AUTH_TRUST_PROXY_HOPS??(environment.NODE_ENV==='production'?'1':'0'));
    if(!Number.isSafeInteger(trustProxyHops)||trustProxyHops<0)throw new Error('AUTH_TRUST_PROXY_HOPS must be a nonnegative integer');
    const game = createGameServer({service,accounts,admin,gm:new GmService(store),appOrigin:environment.APP_ORIGIN,secureCookies:environment.NODE_ENV==='production',trustProxyHops,publicAssetBase,deployment,readiness:async()=>{
      const probe={text:'SELECT 1',query_timeout:1500};
      const [,health]=await Promise.all([pool.query(probe),simulation.inspect()]);
      return health.version.rulesetVersion===runtimeVersion.rulesetVersion&&health.version.contentHash===runtimeVersion.contentHash&&health.shards.length>0&&health.shards.every(shard=>shard.ready&&!shard.failed);
    }});
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
