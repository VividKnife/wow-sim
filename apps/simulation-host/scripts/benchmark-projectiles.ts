import {cpus} from 'node:os';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {launchProjectile,takeImpacts} from '../../../packages/game-domain/src/rules/combat-projectiles.js';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import {runtimeVersion} from '../src/version.ts';

// Test-only reference for the replaced scan. No production alternate kernel.
function scannedImpacts(s:Rules,side:string){
 const projectiles=s.combat.projectiles,due=projectiles.filter((p:Rules)=>p.side===side&&p.landsAt<=s.clock);
 s.combat.projectiles=projectiles.filter((p:Rules)=>!(p.side===side&&p.landsAt<=s.clock));
 return due.filter((p:Rules)=>!p.presentationOnly);
}
const count=2000,rounds=12,warmups=3;
const quantile=(values:number[],p:number)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
function setup(speed:number){
 const s:Rules={clock:0,nextTick:100,logs:[],logSequence:0,combat:{id:'benchmark',projectiles:[]}};
 const from={id:'caster',position:0,positionY:0},to={id:'target',position:10,positionY:0};
 for(let i=0;i<count;i++)launchProjectile(s,from,to,{Id:1,Speed:speed,SpellName:'Benchmark',School:2},i%2?'enemy':'friendly');
 return s;
}
function run(s:Rules,take:(s:Rules,side:string)=>Rules[]){
 const started=performance.now(),cpu=process.cpuUsage(),ids:string[]=[];
 for(s.clock=100;s.clock<=10000;s.clock+=100)for(const side of ['friendly','enemy'])for(const p of take(s,side))ids.push(p.id);
 const used=process.cpuUsage(cpu);
 assert.equal(ids.length,count);assert.equal(s.combat.projectiles.length,0);
 return {wallMs:performance.now()-started,cpuMs:(used.user+used.system)/1000,ids};
}
const results=[];
for(const [name,speed] of [['sparse-flight',1],['single-burst',1000]] as const){
 const samples:{heap:{wallMs:number;cpuMs:number};scan:{wallMs:number;cpuMs:number}}[]=[];
 for(let i=0;i<rounds+warmups;i++){
  const heap=setup(speed),scan:Rules={clock:0,combat:{projectiles:structuredClone(heap.combat.projectiles)}};
  const a=i%2?run(heap,takeImpacts):run(scan,scannedImpacts),b=i%2?run(scan,scannedImpacts):run(heap,takeImpacts);
  const h=i%2?a:b,r=i%2?b:a;assert.deepEqual(h.ids,r.ids,'both paths must settle the identical ordered impacts');
  if(i>=warmups)samples.push({heap:{wallMs:h.wallMs,cpuMs:h.cpuMs},scan:{wallMs:r.wallMs,cpuMs:r.cpuMs}});
 }
 results.push({name,projectiles:count,steps:100,summary:Object.fromEntries(['heap','scan'].map(k=>[k,{
  medianWallMs:quantile(samples.map(s=>s[k as 'heap'|'scan'].wallMs),.5),p95WallMs:quantile(samples.map(s=>s[k as 'heap'|'scan'].wallMs),.95),
  medianCpuMs:quantile(samples.map(s=>s[k as 'heap'|'scan'].cpuMs),.5),
 }])),samples});
}
const report={scope:'Hot projectile scheduling only; excludes launch registration, combat effects, projection, IO and networking. Not a capacity benchmark.',...runtimeVersion,node:process.version,cpu:cpus()[0]?.model,rounds,warmups,results};
const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
if(output){const path=resolve(output);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({...report,results:results.map(({samples,...r})=>r)},null,2));
