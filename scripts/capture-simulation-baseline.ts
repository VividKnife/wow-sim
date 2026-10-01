import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {captureBaseline} from '../packages/simulation-tests/support/baseline.ts';

const commit='d2d43b9041768603a0c52b8ce55c64b2a03fb6a2';
if(process.argv.includes('--current')){
 const reason=process.argv.find(arg=>arg.startsWith('--reason='))?.slice('--reason='.length);
 if(!process.argv.includes('--write')||!reason||reason.length<20)throw new Error('Current golden requires --write --current --reason=<reviewed change explanation>');
 const manifest=JSON.parse(readFileSync(new URL('../packages/game-data/manifest.json',import.meta.url),'utf8'));
 const {runtimeVersion}=await import('../apps/simulation-host/src/version.ts');
 const reference=JSON.parse(readFileSync(new URL('../packages/simulation-tests/fixtures/behavior.json',import.meta.url),'utf8'));
 const scenarios=captureBaseline();
 const summary=(s:any)=>({participants:s.participants,samples:s.samples.map(({hash,...sample}:any)=>sample)});
 writeFileSync(new URL('../packages/simulation-tests/fixtures/current.json',import.meta.url),JSON.stringify({
  schemaVersion:1,referenceCommit:commit,contentHash:manifest.contentVersion,capturedRuleset:runtimeVersion.rulesetVersion,
  reviewReason:reason,sampleMs:50,durationMs:15000,
  referenceSummaryMatches:Object.fromEntries(Object.entries(scenarios).map(([key,value])=>[key,JSON.stringify(summary(value))===JSON.stringify(summary(reference.scenarios[key]))])),
  scenarios,
 },null,2)+'\n');
 process.exit(0);
}
const reference=process.argv.find(arg=>arg.startsWith('--reference='))?.slice('--reference='.length);
if(!process.argv.includes('--write')||!reference)throw new Error('Requires --write --reference=/path/to/pinned-checkout; never capture new rules as the old baseline');
// An extracted git archive works too. Verify every tracked package file so an
// edited checkout cannot silently bless new behavior under the old commit SHA.
const rows=execFileSync('git',['ls-tree','-r','-z',commit,'--','packages'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const row of rows){
 const [entry,file]=row.split('\t'),[,kind,expected]=entry.split(' ');
 if(kind!=='blob')continue;
 const data=readFileSync(resolve(reference,file));
 const hash=createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
 if(hash!==expected)throw new Error(`Reference differs from ${commit}: ${file}`);
}
const source=(file:string)=>pathToFileURL(resolve(reference,file)).href;
const {localScenarios}=await import(source('packages/game-domain/test/support/local-scenarios.ts'));
const {advanceOwned}=await import(source('packages/game-domain/src/rules/engine.js'));
const manifest=JSON.parse(readFileSync(resolve(reference,'packages/game-data/manifest.json'),'utf8'));
const inputs={scenarios:localScenarios(),advance:advanceOwned};
writeFileSync(new URL('../packages/simulation-tests/fixtures/baseline.json',import.meta.url),JSON.stringify({
 sourceCommit:commit,contentHash:manifest.contentVersion,sampleMs:50,durationMs:15000,scenarios:captureBaseline(inputs),
},null,2)+'\n');
writeFileSync(new URL('../packages/simulation-tests/fixtures/behavior.json',import.meta.url),JSON.stringify({
 baselineCommit:commit,scenarios:captureBaseline({...inputs,behaviorOnly:true}),
},null,2)+'\n');
