import {pathToFileURL} from 'node:url';
import {startGameWorker} from './start.ts';

export async function main() {
  const game = await startGameWorker();
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
