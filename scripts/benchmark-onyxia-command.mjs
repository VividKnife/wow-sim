// Isolated fixtures: real equipment, buff casts and existing raid orders only.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createRaidChallenge,equipChallengeGear,challengeInputs} from './support/raid-challenge.mjs';
import {createNpcMember,companionSkills} from '../packages/game-domain/src/rules/party.js';
import {npcBuildPlan,allocateNpcTalents} from '../packages/game-domain/src/rules/npc-builds.js';
import {resetTalentGrants} from '../packages/game-domain/src/rules/talent-acquisition.js';
import {stats,knownRank} from '../packages/game-domain/src/rules/character.js';
import {combatRole} from '../packages/game-domain/src/rules/combat-roles.js';
import {enterGoldRaid,goldRaidAction} from '../packages/game-domain/src/rules/gold-raid.js';
import {beginPartyBuffs,partyBuffCheckView} from '../packages/game-domain/src/rules/party-buffs.js';
import {beginMoltenCoreBattle} from '../packages/game-domain/src/rules/molten-core-battle.js';
import {raidCommandAction,recommendedRaidPlan} from '../packages/game-domain/src/rules/raid-command.js';
import {combatCommandAction} from '../packages/game-domain/src/rules/combat-command.js';
import {defaultRaidTactics} from '../packages/game-domain/src/rules/molten-core-encounter.js';
import {advanceOwned} from '../packages/game-domain/src/rules/engine.js';
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const gear=arg('gear','fullEpic'),modes=arg('modes','normal,conserve,adaptive').split(','),seed=Number(arg('seed','60325'));
const tanks=Number(arg('tanks','3')),healers=Number(arg('healers','8'));
const output=arg('output','docs/research/onyxia-command-challenges.json');
const template=createRaidChallenge({gear,tanks,healers,seed}),roster=template.party;
const replacement=roster.findIndex(c=>combatRole(c)==='healer'&&c.classId===2);
if(replacement>=0){const druid=createNpcMember({...template,party:[]},'druid',{name:'激活与野性印记',role:'healer'});druid.id=roster[replacement].id;equipChallengeGear(druid,gear);roster[replacement]=druid;}
// One legal 21-point Discipline allocation supplies Divine Spirit; still 51 total points.
const priest=roster.find(c=>c.classId===5&&combatRole(c)==='healer');
if(priest){const plan=npcBuildPlan(priest,'healer');resetTalentGrants(priest);allocateNpcTalents(priest,{...plan,priorities:['Wand Specialization:5','Improved Power Word: Fortitude:2','Silent Resolve:3','Meditation:3','Inner Focus','Mental Agility:5','Improved Power Word: Shield','Divine Spirit',...plan.priorities]});priest.learned=companionSkills(priest);assert.ok(knownRank(priest,14752));assert.equal(Object.values(priest.talents).reduce((n,v)=>n+v,0),51);}
enterGoldRaid(template,'onyxias-lair');template.party=roster;template.goldRaid.phase='camp';template.goldRaid.seats=[template,...roster].map(c=>({id:c.id,name:c.name,role:combatRole(c)}));
// Test inventory is finite, identified real items. The preparation engine spends it.
for(const c of [template,...roster]){c.bag??=[];for(const [id,count]of [[17020,20],[17028,20],[17029,40],[17021,20],[17026,20],[21177,40],[8766,20],[13511,1],[13512,1],[13510,1],[18262,2]])c.bag.push({id,count,uid:`prep:${c.id}:${id}`});}
// Shared fixture inventory follows the same potion policy and two-minute cooldown as players.
for(const [id,count]of [[13444,120],[13446,120]])template.bag.push({id,count,uid:`raid-potions:${id}`});
for(const c of [template,...roster])c.potions={enabled:true,health:25,mana:40,healthItem:13446,manaItem:13444};
assert.equal(template.party.length,39);
const plan=recommendedRaidPlan(template,'onyxia');plan.focus='boss';plan.formation='spread';plan.movement='early';plan.dispelPolicy='assigned';
raidCommandAction(template,{type:'raidPlan',bossId:'onyxia',plan});
beginPartyBuffs(template);
while(template.activity.type==='partyBuffs'&&template.clock<600000){advanceOwned(template,template.wallAt+1000);if(template.clock%60000===0)console.log(JSON.stringify({event:'preparation',at:template.clock,remaining:template.activity.remaining,completed:template.activity.completed,next:template.activity.queue?.[0]}));}
assert.notEqual(template.activity.type,'partyBuffs','buff preparation must finish');
// Use the same ten-second raid recovery action as the camp UI, then verify buffs.
goldRaidAction(template,{type:'goldRecover'});advanceOwned(template,template.wallAt+10000);
const buffs=partyBuffCheckView(template);assert.equal(buffs.remainingCasts,0,'all available class buffs must cover every recipient at pull');assert.equal(buffs.missing,0,'all selected consumables must be present at pull');assert.equal(buffs.unavailable.length,0,'raid composition must supply every checklist buff');
for(const c of [template,...roster]){assert.equal(c.hp,stats(c).maxHp,'full health before pull');assert.equal(c.mana,stats(c).maxMana,'full mana before pull');}
const report={gear,tanks,healers,seed,method:'40 real characters; finite buff reagents, standard flasks and weapon stones; actual partyBuffs then goldRecover. Shared 120 Major Mana/120 Major Healing Potions with normal inventory and cooldowns. No boss edits or injected combat healing/mana. Published raidPlan; orders through raidCommandAction/combatCommandAction. Druid replaces one paladin for Mark/Thorns/Innervate; one priest uses legal 21 Discipline for Divine Spirit.',buffs:{present:buffs.present,total:buffs.total,unavailable:buffs.unavailable,preparedAt:template.clock},inputs:challengeInputs(template),results:[]};
for(const mode of modes){
 const s=structuredClone(template);s.rngState=seed;beginMoltenCoreBattle(s,'onyxia',defaultRaidTactics);s.goldRaid.phase='combat';s.goldRaid.activeBoss='onyxia';const start=s.clock;
 const orders=[],phases=[],healStats=Object.fromEntries(s.party.filter(c=>combatRole(c)==='healer').map(c=>[c.id,{name:c.name,casts:0,cancels:0,idleMs:0,fullRegenMs:0}]));let logId=s.logSequence,lastPhase=0,lastMode='normal';
 function order(value){raidCommandAction(s,{type:'raidOrder',encounterId:s.combat.id,order:value});orders.push({at:(s.clock-start)/1000,order:value});}
 if(mode!=='normal'){order('conserveMana');lastMode='conserve';}
 const wall=performance.now();
 while(s.combat&&s.clock-start<=901000){
  const r=s.combat.raidEncounter;
  if((r.phase||1)!==lastPhase){lastPhase=r.phase||1;phases.push({phase:lastPhase,at:(s.clock-start)/1000,bossHp:s.combat.enemies[0].hp,alive:[s,...s.party].filter(c=>c.hp>0).length});console.log(JSON.stringify({mode,event:'phase',...phases.at(-1)}));}
  if(mode==='controlled'){
   const adds=s.combat.enemies.filter(e=>e.summonedBy&&e.hp>0),aoe=r.phase===2&&adds.length>=4;
   if(aoe&&!r.tactics.focusAdds&&s.clock>=r.command.focusReadyAt){order('focusAdds');combatCommandAction(s,{order:'mode',encounterId:s.combat.id,mode:'aoe'});orders.push({at:(s.clock-start)/1000,order:'aoe'});}
   else if((r.phase!==2||adds.length<=1)&&r.tactics.focusAdds&&s.clock>=r.command.focusReadyAt){order('focusBoss');combatCommandAction(s,{order:'mode',encounterId:s.combat.id,mode:'single'});orders.push({at:(s.clock-start)/1000,order:'single'});}
  }
  if(mode==='adaptive'){
   const tank=s.party.find(c=>c.id===r.command.plan.mainTank),critical=[s,...s.party].filter(c=>c.hp>0&&c.hp/stats(c).maxHp<.35).length;
   const wanted=(tank?.hp>0&&tank.hp/stats(tank).maxHp<.5||critical>=4)?'normal':'conserve';
   if(wanted!==lastMode){order(wanted==='conserve'?'conserveMana':'normalHealing');lastMode=wanted;}
   const adds=s.combat.enemies.filter(e=>e.summonedBy&&e.hp>0);
   if(r.phase===2&&adds.length>=6&&!r.tactics.focusAdds&&s.clock>=r.command.focusReadyAt)order('focusAdds');
   else if((r.phase!==2||adds.length<=2)&&r.tactics.focusAdds&&s.clock>=r.command.focusReadyAt)order('focusBoss');
  }
  for(const c of s.party)if(healStats[c.id]&&c.hp>0){if(!c.cast)healStats[c.id].idleMs+=100;if(s.clock-(c.lastManaUse??-5000)>=5000)healStats[c.id].fullRegenMs+=100;}
  advanceOwned(s,s.wallAt+100,{stopWhen:x=>!x.combat});
  for(const l of s.logs)if(l.id>logId&&healStats[l.actorId]){if(l.kind==='cast')healStats[l.actorId].casts++;if(l.kind==='cancel')healStats[l.actorId].cancels++;}logId=s.logSequence;
 }
 const b=s.lastCombat||s.combat,boss=b.enemies[0],review=s.goldRaid.attempts.at(-1)?.review;
 const result={mode,won:!b.abandoned&&b.enemies.every(e=>e.hp<=0),seconds:(s.clock-start)/1000,alive:[s,...s.party].filter(c=>c.hp>0).length,bossRemaining:Math.round(boss.hp/boss.maxHp*10000)/100,phases,orders,healers:Object.entries(healStats).map(([id,row])=>({...row,alive:s.party.find(c=>c.id===id).hp>0,mana:s.party.find(c=>c.id===id).mana,maxMana:stats(s.party.find(c=>c.id===id)).maxMana})),review,failures:b.raidEncounter.failures,wallMs:Math.round(performance.now()-wall)};
 report.results.push(result);writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...result,healers:undefined,orders:undefined,review:undefined}));
}
