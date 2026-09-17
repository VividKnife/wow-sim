const role = process.env.SERVICE_ROLE || 'api';
if (!['api', 'worker'].includes(role)) throw new Error('SERVICE_ROLE must be api or worker');
const {main} = await import(role === 'api'
  ? '../apps/game-server/src/main.ts' : '../apps/game-worker/src/main.ts');
await main();
