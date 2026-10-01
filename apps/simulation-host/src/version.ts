import {createHash} from 'node:crypto';
import {readdirSync, readFileSync} from 'node:fs';
import manifest from '../../../packages/game-data/manifest.json' with {type: 'json'};

// Hash executable rules as well as content: a data manifest alone does not
// fence a code deployment. Evaluated once per worker, outside the hot loop.
const hash = createHash('sha256');
function addDirectory(directory: string) {
  const root = new URL(`../../../${directory}`, import.meta.url);
  for (const entry of readdirSync(root, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) addDirectory(directory + entry.name + '/');
    else if (/\.(js|ts)$/.test(entry.name)) {
      hash.update(directory + entry.name + '\0'); hash.update(readFileSync(new URL(entry.name, root))); hash.update('\0');
    }
  }
}
for (const directory of ['packages/game-domain/src/', 'packages/sim-core/src/', 'packages/combat-core/scheduling/', 'packages/bot-ai/src/', 'packages/protocol/src/']) addDirectory(directory);
for (const file of readdirSync(new URL('../../../packages/game-data/', import.meta.url)).filter(name => name.endsWith('.js')).sort()) {
  hash.update(file + '\0'); hash.update(readFileSync(new URL(`../../../packages/game-data/${file}`, import.meta.url)));
}
for (const file of ['./presence.ts', './dungeon-composition.ts', './dungeon-transfer.ts', './dungeon-input.ts', './dungeon-departure.ts', './dungeon-departure-transfer.ts', './npc-transfer.ts', './instance.ts', './worker.ts', './version.ts']) {
  hash.update(file + '\0'); hash.update(readFileSync(new URL(file, import.meta.url)));
}
export const runtimeVersion = {rulesetVersion: `owned-v1:${hash.digest('hex')}`, contentHash: manifest.contentVersion};
export type RuntimeVersion = typeof runtimeVersion;
