import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
const root=new URL('../apps/web/dist/',import.meta.url);
const metadata=JSON.parse(await readFile(new URL('__deployment.json',root),'utf8'));
const stamp=JSON.parse(await readFile(new URL('../game-version.json',import.meta.url),'utf8'));
assert.deepEqual(metadata.gameVersion,stamp,'deployed version must match the committed stamp');
const html=await readFile(new URL('index.html',root),'utf8');
assert.ok(Buffer.byteLength(html)<4096,'HTML must remain a tiny static shell');
assert.ok(!html.includes('_next/'));
const manifest=JSON.parse(await readFile(new URL('.vite/manifest.json',root),'utf8'));
for(const page of ['game','world','character','dungeon-page','raid-page','pvp','battle','party']){
 assert.ok(Object.values(manifest).some(entry=>entry.src===`app/${page}.tsx`&&entry.isDynamicEntry),`Lazy panel: ${page}`);
}
const assets=await readdir(new URL('assets/',root));
assert.ok(!assets.some(name=>/local-simulation|combat-policy(?:\.|-)/.test(name)),'browser simulation workers/runtimes must not be emitted');
assert.ok(!(await readdir(root)).includes('simulation-content'),'no browser rule packs');
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
console.log(`Web build verified: ${Buffer.byteLength(html)} B HTML; lazy panels, server-only simulation, no browser rule packs; mode=${metadata.assetMode}`);
