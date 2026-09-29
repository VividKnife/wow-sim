import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createMoltenCoreDemo,defaultRaidTactics} from '../packages/game-domain/src/molten-core-demo.ts';
import {prepareRaidTanks} from '../packages/game-domain/test/support/t1-tank-fixture.js';
import {advanceOwned} from '../packages/game-domain/src/rules/engine.js';
import {stats} from '../packages/game-domain/src/rules/character.js';
import {items,nameOf} from '../packages/game-domain/src/rules/catalog.js';
import {combatRole} from '../packages/game-domain/src/rules/combat-roles.js';
import {beginMoltenCoreBattle} from '../packages/game-domain/src/rules/molten-core-battle.js';
import {raidScaling} from '../packages/game-domain/src/rules/raid-scaling.js';

const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const bosses=arg('bosses','lucifron,magmadar').split(','),seeds=arg('seeds','60325').split(',').map(Number);
const profiles=arg('profiles','baseline,t1').split(','),output=arg('output','docs/research/t1-tank-benchmark.json');
const template=createMoltenCoreDemo().state;
const report={contentVersion:JSON.parse(readFileSync(new URL('../packages/game-data/manifest.json',import.meta.url))).contentVersion,
 scaling:raidScaling,method:'40 players: 3 tanks, 8 healers, 29 damage. Only tank gear differs between baseline and T1; both use the regular NPC tank strategy. Other actors retain demo gear and rules. Independent fresh pulls; no consumable/world-buff injection.',results:[]};
assert.equal(raidScaling.meleeDamage,1);
for(const seed of seeds)for(const profile of profiles)for(const boss of bosses){
 const s=structuredClone(template);s.rngState=seed;
 const tanks=prepareRaidTanks(s,profile);
 const tankInputs=tanks.map(c=>({id:c.id,name:c.name,stats:stats(c),rules:c.rules,
  equipment:Object.entries(c.equipment).map(([slot,e])=>({slot:Number(slot),id:e.id,name:nameOf('items',e.id),enchant:e.enchant??null,itemSet:items[e.id].itemset}))}));
 if(boss==='onyxia')s.goldRaid={raidId:'onyxias-lair'};
 const tactics={...defaultRaidTactics,focusAdds:boss!=='golemagg'};
 beginMoltenCoreBattle(s,boss,tactics);
 const incoming=Object.fromEntries(tanks.map(c=>[c.id,{total:0,maxHit:0,hits:0,crits:0,crushes:0,deathAt:null}]));
 let logId=0,firstDeath=null,maximumWall=performance.now();
 console.log(JSON.stringify({kind:'start',profile,boss,seed,tanks:tankInputs.map(t=>({name:t.name,hp:t.stats.maxHp,armor:t.stats.armor,defense:t.stats.defense,blockValue:t.stats.blockValue}))}));
 while(s.combat&&s.clock<=raidScaling.encounterLimitMs+1000){
  advanceOwned(s,s.wallAt+100,{stopWhen:state=>!state.combat});
  for(const l of s.logs)if(l.id>logId&&l.kind==='incoming'&&incoming[l.targetId]){
   const row=incoming[l.targetId];row.total+=l.amount;row.maxHit=Math.max(row.maxHit,l.amount);row.hits++;if(l.critical)row.crits++;if(l.crushing)row.crushes++;
  }
  logId=s.logSequence;
  for(const c of [s,...s.party])if(c.hp<=0){firstDeath??={name:c.name,role:combatRole(c),at:s.clock};if(incoming[c.id]&&incoming[c.id].deathAt==null)incoming[c.id].deathAt=s.clock;}
 }
 const battle=s.combat||s.lastCombat;
 const result={profile,boss,seed,tactics,won:!s.combat&&battle.enemies.every(e=>e.hp<=0||e.removed),durationMs:s.clock,wallMs:Math.round(performance.now()-maximumWall),
  alive:[s,...s.party].filter(c=>c.hp>0).length,firstDeath,tankInputs,tankIncoming:incoming,
  enemies:battle.enemies.map(e=>({name:e.name,hp:e.hp,maxHp:e.maxHp,remainingPercent:Math.round(e.hp/e.maxHp*10000)/100})),
  healers:[s,...s.party].filter(c=>combatRole(c)==='healer').map(c=>({name:c.name,hp:c.hp,mana:c.mana,maxMana:stats(c).maxMana})),
  failures:battle.raidEncounter.failures,support:battle.raidEncounter.support};
 report.results.push(result);writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({kind:'result',...result,tankInputs:undefined}));
}
