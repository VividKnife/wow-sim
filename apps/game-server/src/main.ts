import {pathToFileURL} from 'node:url';
import {startGameServer} from './start.ts';

export async function main() {
  const game = await startGameServer();
  console.log(`Game server listening on http://${game.host}:${game.port}`);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await game.close();
  };
  process.once('SIGINT', () => void close().then(() => process.exit(0)));
  process.once('SIGTERM', () => void close().then(() => process.exit(0)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
