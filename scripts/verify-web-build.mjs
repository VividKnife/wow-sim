import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import version from '../packages/game-data/runtime/version.json' with {type:'json'};
const root=new URL('../apps/web/dist/',import.meta.url);
const metadata=JSON.parse(await readFile(new URL('__deployment.json',root),'utf8'));
const html=await readFile(new URL('index.html',root),'utf8');
assert.ok(Buffer.byteLength(html)<4096,'HTML must remain a tiny static shell');
assert.ok(!html.includes('_next/'));
const manifest=JSON.parse(await readFile(new URL('.vite/manifest.json',root),'utf8'));
for(const page of ['game','world','character','dungeon-page','raid-page','pvp','battle','party']){
 assert.ok(Object.values(manifest).some(entry=>entry.src===`app/${page}.tsx`&&entry.isDynamicEntry),`Lazy panel: ${page}`);
}
const assets=await readdir(new URL('assets/',root));
for(const name of ['local-simulation.worker','combat-policy.worker']){
 const file=assets.find(f=>f.startsWith(name+'-')&&f.endsWith('.js'));assert.ok(file,`${name} emitted`);
 const source=await readFile(new URL('assets/'+file,root),'utf8');
 assert.ok(Buffer.byteLength(source)<30000,'worker bootstrap must not contain full engine or catalog');
 assert.ok(source.includes('import('),'runtime is loaded separately');
 assert.ok(source.includes(metadata.assetBase+'simulation-content/'),'worker uses the build-specific data base');
}
const directory=new URL(`simulation-content/${version.version}/`,root);
for(const pack of ['boot',...[1,2,3,4,5,7,8,9,11].map(id=>`class-${id}`),...Array.from({length:Math.ceil(version.totalNodes/version.shardSize)},(_,i)=>String(i))]){
 assert.ok((await stat(new URL(pack+'.json.gz',directory))).size>0,pack);
}
if(metadata.assetMode==='r2'){
 assert.ok(html.includes(metadata.assetBase+'assets/'));
 assert.ok(html.includes(metadata.publicAssetBase+'/favicon.svg'));
 for(const file of assets.filter(name=>/\.(js|css)$/.test(name))){
  const source=await readFile(new URL('assets/'+file,root),'utf8');
  assert.ok(!/["'`(]\/(?:icons|battle|characters|creatures|interface|journal|maps|music|scenes|sounds)\//.test(source),`Unmapped public URL in ${file}`);
 }
 const viewer=await readFile(new URL('model-viewer/index.html',root),'utf8');
 assert.ok(viewer.includes(metadata.publicAssetBase+'/model-viewer/bridge.js'));
}
console.log(`Web build verified: ${Buffer.byteLength(html)} B HTML; lazy panels, split Worker runtimes, versioned boot/class/shard files; mode=${metadata.assetMode}`);
