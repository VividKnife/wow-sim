// Read-only audit. Run from the repository root; no game state or deployment is changed.
// node scripts/audit-local-simulation-payload.mjs [--shared-chunk path]
// node --expose-gc scripts/audit-local-simulation-payload.mjs --memory
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const read = name => JSON.parse(fs.readFileSync(`packages/game-data/data/${name}.json`, 'utf8'));
if (process.argv.includes('--memory')) {
  if (!global.gc) throw new Error('Use node --expose-gc for the isolated memory measurement');
  global.gc();
  const before = process.memoryUsage(), start = performance.now();
  await import('../packages/game-domain/src/rules/engine.js');
  const loadMs = performance.now() - start, afterImport = process.memoryUsage();
  global.gc();
  const afterGC = process.memoryUsage();
  const catalog = await import('../packages/game-domain/src/rules/catalog.js');
  console.log(JSON.stringify({runtime: process.version, loadMs, before, afterImport, afterGC,
    maxRSSKiB: process.resourceUsage().maxRSS,
    rows: Object.fromEntries(['items','spells','creatures','quests'].map(k => [k,Object.keys(catalog[k]).length])),
    caveat: 'Desktop Node source-module measurement, not browser/iPhone memory or a crash diagnosis.'}, null, 2));
} else {
  const {build} = await import('../apps/web/node_modules/esbuild/lib/main.js');
  const result = await build({entryPoints:['apps/web/lib/local-simulation.worker.ts'],bundle:true,
    platform:'browser',format:'iife',minify:true,write:false,metafile:true,plugins:[{name:'browser-content',setup(build){build.onResolve({filter:/runtime-content\.js$/},()=>({path:fileURLToPath(new URL('../packages/game-domain/src/rules/runtime-content.browser.js',import.meta.url))}));}}]});
  const output = Object.values(result.metafile.outputs)[0];
  const inputs = Object.entries(output.inputs).map(([path, value]) => ({path,bytes:value.bytesInOutput})).sort((a,b)=>b.bytes-a.bytes);
  const tables = {};
  for (const name of ['world-reference','classes-reference','classic-reference']) {
    const data = read(name);
    tables[name] = Object.entries(data.tableData || data.tables).map(([name, value]) => {
      const rows = typeof value === 'string' ? JSON.parse(value) : value;
      return {name, rows:rows.length, compactJSONBytes:bytes(rows)};
    }).sort((a,b)=>b.compactJSONBytes-a.compactJSONBytes);
  }
  const journal = read('dungeon-journal'), originalBytes = bytes(journal);
  for (const dungeon of journal.dungeons) for (const boss of dungeon.bosses) for (const item of boss.loot) delete item.source;
  const report = {method:'Standalone esbuild attribution, distinct from the production webpack shared chunk',
    totalBytes:output.bytes, offlineGzipBytes:gzipSync(result.outputFiles[0].contents).length,
    jsonBytes:inputs.filter(x=>x.path.endsWith('.json')).reduce((n,x)=>n+x.bytes,0),
    codeBytes:inputs.filter(x=>!x.path.endsWith('.json')).reduce((n,x)=>n+x.bytes,0), inputs, tables,
    journalExperiment:{originalCompactJSONBytes:originalBytes,withoutLootSourceBytes:bytes(journal),
      caveat:'Size experiment only: runtime uses source paths to classify shared drops; precompute that classification before removing provenance.'}};
  const flag = process.argv.indexOf('--shared-chunk');
  if (flag !== -1) {
    if (!process.argv[flag+1]) throw new Error('Missing shared chunk path');
    const code = fs.readFileSync(process.argv[flag+1], 'utf8'), context = {self:{}};
    vm.runInNewContext(code, context, {timeout:30000});
    const modules = context.self.webpackChunk_N_E?.[0]?.[1];
    if (!modules) throw new Error('Expected a locally built webpack registration chunk');
    // Registration creates functions only. Attribute their emitted UTF-8 size,
    // without executing module bodies or initializing the engine.
    report.webpack = {bytes:Buffer.byteLength(code), offlineGzipBytes:gzipSync(code).length,
      modules:Object.entries(modules).map(([id,fn])=>({id,bytes:Buffer.byteLength(fn.toString())})).sort((a,b)=>b.bytes-a.bytes)};
  }
  console.log(JSON.stringify(report, null, 2));
}
