import { readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

async function checkDirectory(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = resolve(path, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') await checkDirectory(file);
    else if (entry.isFile() && ['.js', '.mjs'].includes(extname(file))) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit', windowsHide: true });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
  }
}
await checkDirectory('packages');
await checkDirectory('scripts');
console.log('JavaScript syntax checks passed.');
