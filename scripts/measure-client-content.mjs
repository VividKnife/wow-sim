import {gzipSync} from 'node:zlib';
import {clientContent} from '../packages/game-domain/src/rules/client-content.js';
import {contentPack} from '../packages/game-domain/src/rules/content-packs.js';
import {createGame,view} from '../packages/game-domain/src/rules/engine.js';
import {projectClientSnapshot} from '../packages/game-domain/src/rules/client-snapshot.ts';
import {referencedItemIds} from '../apps/web/lib/content-loader.js';

const catalog=clientContent(),state=createGame('容量基准',23,0);
const snapshot=projectClientSnapshot(state,view(state));
const ids=referencedItemIds(snapshot).filter(id=>catalog.items[id]);
const core=contentPack(catalog,new URLSearchParams({pack:'core'}));
const rows={
 'server aggregate (not downloaded)':catalog,
 'bootstrap core':core,
 'starter referenced items':{items:Object.fromEntries(ids.map(id=>[id,catalog.items[id]]))},
 'starter snapshot':snapshot,
 'market on demand':contentPack(catalog,new URLSearchParams({pack:'market'})),
 'one boss on demand':contentPack(catalog,new URLSearchParams({pack:core.dungeonJournal[0].bosses[0].lootPack})),
};
for(const [name,value] of Object.entries(rows)){
 const bytes=Buffer.from(JSON.stringify(value));
 console.log(`${name}: ${bytes.length.toLocaleString('en-US')} bytes raw; ${gzipSync(bytes).length.toLocaleString('en-US')} bytes gzip`);
}
console.log(`Starter items: ${ids.length} / ${Object.keys(catalog.items).length}. Compression figures are estimates; HTTP compression depends on the deployment.`);
if(Buffer.byteLength(JSON.stringify(core))>150_000)throw new Error('Bootstrap exceeds 150 KB. Split new feature data into an on-demand pack.');
