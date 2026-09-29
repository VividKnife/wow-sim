import {writeFileSync} from 'node:fs';
import {createRaidChallenge,challengeInputs,challengeGearNames} from './support/raid-challenge.mjs';
import {raidCompositionPresets} from '../packages/game-domain/src/rules/raid-composition.js';
import {beginMoltenCoreBattle} from '../packages/game-domain/src/rules/molten-core-battle.js';
import {defaultRaidTactics} from '../packages/game-domain/src/rules/molten-core-encounter.js';
import {advanceOwned} from '../packages/game-domain/src/rules/engine.js';
import {raidScaling} from '../packages/game-domain/src/rules/raid-scaling.js';
import {stats} from '../packages/game-domain/src/rules/character.js';
import {combatRole} from '../packages/game-domain/src/rules/combat-roles.js';
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const bosses=arg('bosses','lucifron,magmadar,garr,golemagg,ragnaros,onyxia').split(','),seeds=arg('seeds','60325').split(',').map(Number);
const presets=arg('presets','steady,balanced,assault').split(','),gears=arg('gear','dungeon,halfEpic,fullEpic').split(',');
const report={scaling:raidScaling,method:'Independent fresh pulls, same regular NPC strategies and seeds across 40-player role/gear configurations. Real five-player dungeon rare drops and MC/Onyxia epic drops only; halfEpic replaces floor(occupied slots/2) armor/accessory slots. No synthetic stat multipliers, world buffs, enchants or consumable injection. Fixed original creature stats and current source-referenced mechanics; arena geometry remains simulated. Single seeds are cases, not win-rate estimates.',inputs:{},results:[]};
const output=arg('output','docs/research/classic-40-raid-challenges.json');
for(const gear of gears)for(const preset of presets){
 const composition=raidCompositionPresets[preset];if(!composition)throw new Error('Unknown composition');
 const template=createRaidChallenge({...composition,gear});report.inputs[`${gear}:${preset}`]=challengeInputs(template);
 for(const seed of seeds)for(const boss of bosses){
  const s=structuredClone(template);s.rngState=seed;
  if(boss==='onyxia')s.goldRaid={raidId:'onyxias-lair'};
  beginMoltenCoreBattle(s,boss,{...defaultRaidTactics,focusAdds:boss!=='golemagg'});
  const originalHp=s.combat.enemies.map(e=>({entry:e.entry,hp:e.maxHp}));
  let firstDeath=null;const started=performance.now();
  while(s.combat&&s.clock<=raidScaling.encounterLimitMs+1000){
   advanceOwned(s,s.wallAt+100,{stopWhen:x=>!x.combat});
   const c=[s,...s.party].find(c=>c.hp<=0);if(c)firstDeath??={at:s.clock,name:c.name,role:combatRole(c)};
  }
  const battle=s.combat||s.lastCombat,b=battle.enemies[0];
  const result={gear,preset,seed,boss,won:!battle.abandoned&&battle.enemies.every(e=>e.hp<=0||e.removed),timedOut:!!battle.raidEncounter.timedOut,seconds:s.clock/1000,alive:[s,...s.party].filter(c=>c.hp>0).length,bossRemaining:Math.round(Math.max(0,b.hp)/b.maxHp*10000)/100,firstDeath,originalHp,healerMana:Math.round(s.party.filter(c=>combatRole(c)==='healer').reduce((n,c)=>n+c.mana/Math.max(1,stats(c).maxMana),0)/composition.healers*100),failures:battle.raidEncounter.failures,support:battle.raidEncounter.support,wallMs:Math.round(performance.now()-started)};
  report.results.push(result);writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(result));
 }
}
