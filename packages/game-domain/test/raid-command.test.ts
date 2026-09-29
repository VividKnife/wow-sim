import {combatRole} from '../src/rules/combat-roles.js';
import {restoreRaidMember} from '../src/rules/raid-recovery.js';
import {addRaidField} from '../src/rules/raid-battlefield.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo} from '../src/molten-core-demo.ts';
import {enterGoldRaid,goldRaidAction} from '../src/rules/gold-raid.js';
import {beginMoltenCoreBattle} from '../src/rules/molten-core-battle.js';
import {moltenCoreTick} from '../src/rules/molten-core-encounter.js';
import {raidCommandAction,raidPlan,raidCommandView,raidCommandTick,raidAttemptReview,assignedRaidSupport} from '../src/rules/raid-command.js';
import {prepareClassAbility} from '../src/rules/class-spell-effects.js';
import {stats,spellInfo,knownRank} from '../src/rules/character.js';
import {advance,act} from '../src/rules/engine.js';
import {buildGameResponse} from '../src/rules/server-response.js';
import type {Rules} from '../src/model.ts';
function fixture(){const s=createMoltenCoreDemo().state;s.party=s.party.slice(0,4);s.growthPolicy='player';enterGoldRaid(s);for(const type of ['goldPublish','goldRecommend'])goldRaidAction(s,{type});
 // These scenarios exercise Shield Wall, so explicitly recruit warrior tanks.
 const g=s.goldRaid,warriors=g.applicants.filter((c:Rules)=>combatRole(c)==='tank'&&c.classId===1).slice(0,3);
 g.selected=[...warriors.map((c:Rules)=>c.id),...g.selected.filter((id:string)=>combatRole(g.applicants.find((c:Rules)=>c.id===id))!=='tank')].slice(0,39);
 goldRaidAction(s,{type:'goldLaunch'});return s;}
function start(s:Rules,id='magmadar'){for(const c of [s,...s.party])restoreRaidMember(c,s);beginMoltenCoreBattle(s,id,s.goldRaid.tactics);return s;}

test('plans validate actors, lock in combat and survive serialization per boss',()=>{
 const s=fixture(),plan=raidPlan(s,'magmadar');
 assert.throws(()=>raidCommandAction(s,{type:'raidPlan',bossId:'magmadar',plan:{...plan,offTank:plan.mainTank}}),/不能重复/);
 const wrong=structuredClone(plan);wrong.jobs.magic=[s.id];assert.throws(()=>raidCommandAction(s,{type:'raidPlan',bossId:'magmadar',plan:wrong}),/已掌握/);
 plan.movement='finishCast';plan.cooldowns.wall.trigger='manual';
 raidCommandAction(s,{type:'raidPlan',bossId:'magmadar',plan});
 assert.equal(raidPlan(JSON.parse(JSON.stringify(s)),'magmadar').movement,'finishCast');assert.equal(raidPlan(s,'lucifron').movement,'early');
 start(s);assert.equal(s.combat.raidEncounter.command.plan.movement,'finishCast');
 assert.throws(()=>raidCommandAction(s,{type:'raidPlan',bossId:'magmadar',plan}),/营地/);
 const response=buildGameResponse(s,1);assert.ok((response.snapshot!.view as Rules).raidCommand.live.encounterId);
});

test('manual reserved shield wall applies the actual aura once, and rejects stale encounters or dead casters',()=>{
 const s=fixture(),plan=raidPlan(s,'magmadar');assert.ok(plan.cooldowns.wall.actorId);
 plan.cooldowns.wall.trigger='manual';raidCommandAction(s,{type:'raidPlan',bossId:'magmadar',plan});start(s);
 const c=[s,...s.party].find(c=>c.id===plan.cooldowns.wall.actorId)!,sp=spellInfo(c,knownRank(c,871));c.stance='defensive';c.hp=stats(c).maxHp*.3;
 assert.equal(prepareClassAbility(s,c,s.combat.enemies[0],sp,[s,...s.party]),null,'ordinary AI must not spend a reserved spell');
 raidCommandTick(s,[s,...s.party]);assert.equal(s.combat.raidEncounter.command.used.wall,undefined);
 assert.throws(()=>raidCommandAction(s,{type:'raidOrder',order:'wall',encounterId:'old'}),/已变化/);
 raidCommandAction(s,{type:'raidOrder',order:'wall',encounterId:s.combat.id});
 assert.ok(c.auras.some((a:Rules)=>a.spell===sp.Id&&a.type===87&&a.amount<0));
 assert.equal(s.combat.raidEncounter.command.used.wall,1);
 assert.throws(()=>raidCommandAction(s,{type:'raidOrder',order:'wall',encounterId:s.combat.id}),/冷却/);
 c.hp=0;assert.equal(raidCommandView(s)!.cooldowns.find(c=>c.id==='wall')!.reason,'负责人已倒下');
});

test('automatic emergency skills obey health thresholds and real resource costs',()=>{
 const s=start(fixture()),command=s.combat.raidEncounter.command,actors=[s,...s.party];
 const main=actors.find(c=>c.id===command.plan.mainTank)!;main.stance='defensive';main.hp=stats(main).maxHp*.2;
 const paladin=actors.find(c=>c.id===command.plan.cooldowns.rescue.actorId);assert.ok(paladin,'NPC roster has a paladin for Lay on Hands');
 paladin.position=main.position;paladin.positionY=main.positionY;paladin.cast={spell:1};
 const original=main.hp;raidCommandTick(s,actors);
 assert.equal(command.used.wall,1);assert.equal(command.used.rescue,1);assert.ok(main.hp>original);assert.equal(paladin.mana,0);assert.equal(paladin.cast,null);
});

test('scheduled shield wall covers the fear window and focus commands redirect actual damage targets',()=>{
 const s=fixture(),plan=raidPlan(s,'magmadar');plan.cooldowns.wall.trigger='fear';raidCommandAction(s,{type:'raidPlan',bossId:'magmadar',plan});start(s);
 const tank=[s,...s.party].find(c=>c.id===plan.mainTank)!;tank.stance='defensive';
 s.clock=s.combat.raidEncounter.nextFear-2100;raidCommandTick(s,[s,...s.party]);assert.equal(s.combat.raidEncounter.command.used.wall,undefined);
 s.clock+=200;raidCommandTick(s,[s,...s.party]);assert.equal(s.combat.raidEncounter.command.used.wall,1);
 const g=start(fixture(),'golemagg');moltenCoreTick(g,[g,...g.party],()=>{});assert.equal(g.raidTargetId,g.combat.raidEncounter.bossId);
 raidCommandAction(g,{type:'raidOrder',order:'focusAdds',encounterId:g.combat.id});moltenCoreTick(g,[g,...g.party],()=>{});assert.notEqual(g.raidTargetId,g.combat.raidEncounter.bossId);
 assert.throws(()=>raidCommandAction(g,{type:'raidOrder',order:'focusBoss',encounterId:g.combat.id}),/5秒/);
});

test('assigned dispellers are exclusive and leaving the mechanic unassigned produces observable failures',()=>{
 const s=fixture(),plan=raidPlan(s,'lucifron');plan.jobs.magic=[];plan.jobs.curse=[];
 raidCommandAction(s,{type:'raidPlan',bossId:'lucifron',plan});start(s,'lucifron');
 const priest=[s,...s.party].find(c=>c.classId===5)!;assert.equal(assignedRaidSupport(s,priest,'magic'),false);
 const r=s.combat.raidEncounter;r.nextDoom=s.clock;r.nextCurse=Infinity;r.nextShock=Infinity;
 const hurt=(_s:Rules,_a:Rules,t:Rules,n:number)=>{t.hp=Math.max(0,t.hp-n);};
 moltenCoreTick(s,[s,...s.party],hurt);const marked=[s,...s.party].filter(c=>c.auras.some((a:Rules)=>a.raidDoom)).length;assert.ok(marked>7);s.clock+=10000;moltenCoreTick(s,[s,...s.party],hurt);
 assert.equal(r.failures.doom,marked);
 const b={...s.combat,endedAt:s.clock};const review=raidAttemptReview(s,b)!;assert.equal(review.failures.doom,marked);assert.match(review.suggestions[0],/末日漏驱散/);
});

test('published tank and movement choices change actual initial targets and danger avoidance',()=>{
 const s=fixture(),plan=raidPlan(s,'magmadar');[plan.mainTank,plan.offTank]=[plan.offTank,plan.mainTank];plan.cooldowns.wall.actorId=plan.mainTank;plan.movement='finishCast';
 raidCommandAction(s,{type:'raidPlan',bossId:'magmadar',plan});start(s);
 assert.equal(s.combat.enemies[0].target,plan.mainTank);
 const r=s.combat.raidEncounter,c=s;r.nextBomb=Infinity;r.nextFear=Infinity;r.nextFrenzy=Infinity;
 addRaidField(s,{center:{x:c.position,y:c.positionY},radius:6});c.cast={spell:133};
 moltenCoreTick(s,[s,...s.party],()=>{});assert.ok(c.cast,'greedy policy keeps casting before impact');
 r.command.plan.movement='early';moltenCoreTick(s,[s,...s.party],()=>{});assert.equal(c.cast,null,'early policy sacrifices the cast to move');
});

test('automatic traversal pauses before a boss and wipe review preserves the plan for the next attempt',()=>{
 let s=fixture();s.settings.autoLoot=true;goldRaidAction(s,{type:'goldNavigate',destination:'lucifron'});
 for(let i=0;i<4;i++){s.combat.enemies.forEach((e:Rules)=>e.hp=0);s=advance(s,s.wallAt+100).state;s=advance(s,s.wallAt+3000).state;}
 assert.equal(s.combat,null);assert.equal(s.goldRaid.autoAdvance,false);assert.match(s.activity.reason,/首领前/);
 s=act(s,{type:'goldNavigate',destination:'lucifron'},s.wallAt);assert.equal(s.combat.raidEncounter.id,'lucifron');
 s=act(s,{type:'abandonCombat',encounterId:s.combat.id},s.wallAt);const attempt=s.goldRaid.attempts.at(-1);assert.ok(attempt.review);assert.equal(attempt.won,false);assert.equal(attempt.review.bossRemaining,100);
 const review=structuredClone(attempt.review);goldRaidAction(s,{type:'goldRecover'});s=advance(s,s.wallAt+10000).state;
 assert.deepEqual(s.goldRaid.attempts.at(-1).review,review);
});

test('40-player camp buff order covers the assembled raid and resumes from a checkpoint',()=>{
 const original=fixture();let s=act(original,{type:'partyBuffs'},original.wallAt);
 s=advance(s,s.wallAt+1000).state;s=JSON.parse(JSON.stringify(s));
 s=advance(s,s.wallAt+600000,{stopWhen:(state:Rules)=>state.activity.type==='idle'}).state;
 assert.equal(s.activity.type,'idle',JSON.stringify(s.activity));
 const actors=[s,...s.party];assert.equal(actors.length,40);
 for(const c of actors){
  assert.ok(c.classBuffs.some((b:Rules)=>b.name==='Power Word: Fortitude'&&b.until>s.clock),c.name);
  if(stats(c).maxMana)assert.ok(c.buffs.int?.until>s.clock,c.name+' 智慧');
  if(actors.some(p=>knownRank(p,20217)))assert.ok(c.classBuffs.some((b:Rules)=>b.name==='Blessing of Kings'&&b.until>s.clock),c.name+' 王者');
 }
 const before=actors.map(c=>stats(c).sta);for(const c of actors)restoreRaidMember(c,s);
 assert.deepEqual(actors.map(c=>stats(c).sta),before);
});

test('healing orders persist for this encounter, reject stale orders and clear queued healer decisions',()=>{
 const s=start(fixture()),healer=s.party.find((c:Rules)=>combatRole(c)==='healer')!;
 assert.equal(raidCommandView(s)!.live!.healingMode,'normal');
 s.combat.policy={slots:{[healer.id]:{generation:2,queued:{intent:{}},inflight:s.clock}},timeline:[],receipts:[],metrics:{}};
 assert.throws(()=>raidCommandAction(s,{type:'raidOrder',order:'conserveMana',encounterId:'old'}),/已变化/);
 raidCommandAction(s,{type:'raidOrder',order:'conserveMana',encounterId:s.combat.id});
 assert.equal(s.combat.policy.slots[healer.id].queued,null);
 assert.equal(s.combat.policy.slots[healer.id].generation,3);
 assert.equal(raidCommandView(JSON.parse(JSON.stringify(s)))!.live!.healingMode,'conserve');
 assert.match(s.combat.raidEncounter.command.events.at(-1).text,/节约蓝量/);
 raidCommandAction(s,{type:'raidOrder',order:'normalHealing',encounterId:s.combat.id});
 assert.equal(raidCommandView(s)!.live!.healingMode,'normal');
 raidCommandAction(s,{type:'raidOrder',order:'conserveMana',encounterId:s.combat.id});
 s.combat=null;start(s);assert.equal(raidCommandView(s)!.live!.healingMode,'normal');
});

test('mana conservation reduces automatic healing for all healer classes while preserving rescue, tank safety and explicit casts',async()=>{
 const {selectClass}=await import('../src/rules/class-mechanics.js');
 const {strategyAllows}=await import('../src/rules/combat-strategy.js');
 const s=start(fixture()),actors=[s,...s.party],enemy=s.combat.enemies[0];
 for(const actor of actors)actor.hp=stats(actor).maxHp;
 const target=actors.find((c:Rules)=>combatRole(c)==='ranged')!,tank=actors.find((c:Rules)=>combatRole(c)==='tank')!;
 for(const [classId,base] of [[2,635],[5,2060],[7,1064],[11,5185]]){
  const healer:Rules={...structuredClone(actors.find((c:Rules)=>combatRole(c)==='healer')!),id:`test-healer-${classId}`,classId,raceId:classId===7?2:classId===11?4:1,talents:{},learned:[base],strategyPolicy:{role:'healer'},raidReservedSpells:[]};
  healer.hp=stats(healer).maxHp;healer.mana=stats(healer).maxMana;
  assert.ok(knownRank(healer,base));
  healer.position=target.position=tank.position=enemy.position;healer.positionY=target.positionY=tank.positionY=enemy.positionY;
  const rules=[{spell:base,enabled:true,condition:'always',value:0}];
  target.hp=stats(target).maxHp*.75;
  raidCommandAction(s,{type:'raidOrder',order:'normalHealing',encounterId:s.combat.id});
  assert.equal(selectClass(s,healer,enemy,actors,null,rules)?.targetId,target.id);
  raidCommandAction(s,{type:'raidOrder',order:'conserveMana',encounterId:s.combat.id});
  assert.ok(!selectClass(s,healer,enemy,actors,null,rules));
  const exact=[{...rules[0],spell:knownRank(healer,base)}];
  assert.equal(selectClass(s,healer,enemy,actors,null,exact,{target} as any)?.targetId,target.id);
  target.hp=stats(target).maxHp*.25;
  assert.equal(selectClass(s,healer,enemy,actors,null,rules)?.targetId,target.id);
  target.hp=stats(target).maxHp;tank.hp=stats(tank).maxHp*.75;
  assert.equal(selectClass(s,healer,enemy,actors,null,rules)?.targetId,tank.id);
  tank.hp=stats(tank).maxHp;
 }
 const priest=actors.find((c:Rules)=>c.classId===5&&combatRole(c)==='healer')!;
 const smite=spellInfo(priest,knownRank(priest,585));priest.strategyPolicy={...priest.strategyPolicy,waitForTank:false};
 assert.equal(strategyAllows(s,priest,enemy,smite),false);
 raidCommandAction(s,{type:'raidOrder',order:'normalHealing',encounterId:s.combat.id});
 assert.equal(strategyAllows(s,priest,enemy,smite),true);
});
