// Controlled encounter comparison; never reads or writes a player's browser save.
// Run from repo root with two frozen runtime directories and a fresh report path.
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [beforePath,afterPath,outputPath,allowedFiles='lib/game/polymorph.js']=process.argv.slice(2);
if(!beforePath||!afterPath||!outputPath)throw new Error('Usage: node apps/web/scripts/benchmark-crowd-control.mjs BEFORE AFTER REPORT.json');
if(existsSync(outputPath))throw new Error('Choose a fresh report path to preserve prior evidence');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function manifest(root){
 const files={};
 function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())walk(path);else files[relative(root,path).replaceAll('\\','/')]=sha(readFileSync(path));}}
 for(const part of ['lib','data'])walk(resolve(root,part));
 return Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b,'en')));
}
const before=resolve(beforePath),after=resolve(afterPath),initialBytes=readFileSync(resolve(before,'initial.json'));
if(sha(initialBytes)!==sha(readFileSync(resolve(after,'initial.json'))))throw new Error('Starting states differ');
const initial=JSON.parse(initialBytes),sources={before:manifest(before),after:manifest(after)};
const changedFiles=[...new Set([...Object.keys(sources.before),...Object.keys(sources.after)])].filter(path=>sources.before[path]!==sources.after[path]);
const expected=allowedFiles.split(',').sort();
if(JSON.stringify([...changedFiles].sort())!==JSON.stringify(expected))throw new Error(`Uncontrolled source differences: ${changedFiles}`);
const seeds=[initial.rngState,123456789,283,817,192837,92341,1701,987654321];
const report={scope:'One legitimately earned encounter state, eight paired random seeds. Not a full dungeon or leveling run, nor a population win-rate estimate.',initialSha256:sha(initialBytes),seeds,changedFiles,sources,runs:[]};
for(const [variant,folder]of [['before',before],['after',after]]){
 const {advance}=await import(pathToFileURL(resolve(folder,'lib/game/engine.js')));
 for(const seed of seeds){
  let s=structuredClone(initial);s.rngState=seed;const began=s.clock;let ticks=0;
  while(s.combat&&ticks++<360){const now=s.wallAt+1000;let result;do{result=advance(s,now,{});s=result.state;}while(!result.complete);}
  const battle=s.combat||s.lastCombat;
  const row={variant,seed,won:!s.combat&&battle.enemies.every(e=>e.hp<=0||e.removed),timedOut:!!s.combat,seconds:(s.clock-began)/1000,alive:[s,...s.party].filter(c=>c.hp>0).length,remaining:battle.enemies.filter(e=>e.hp>0&&!e.removed).length,healing:battle.metrics.actors['companion-priest'].healing,mana:s.party.find(c=>c.classId===5).mana};
  report.runs.push(row);console.log(JSON.stringify(row));
 }
}
writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
