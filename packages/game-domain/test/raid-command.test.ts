import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo} from '../src/molten-core-demo.ts';
import {enterGuildRaid,guildRaidAction,restoreRaidMember} from '../src/rules/guild-raid.js';
import {beginMoltenCoreBattle} from '../src/rules/molten-core-battle.js';
import {moltenCoreTick} from '../src/rules/molten-core-encounter.js';
import {raidCommandAction,raidPlan,raidCommandView,raidCommandTick,raidAttemptReview,assignedRaidSupport} from '../src/rules/raid-command.js';
import {prepareClassAbility} from '../src/rules/class-spell-effects.js';
import {stats,spellInfo,knownRank} from '../src/rules/character.js';
import {advance,act} from '../src/rules/engine.js';
import {buildGameResponse} from '../src/rules/server-response.js';
import type {Rules} from '../src/model.ts';
function fixture(){const s=createMoltenCoreDemo().state;s.party=s.party.slice(0,4);s.growthPolicy='player';enterGuildRaid(s);return s;}
function start(s:Rules,id='magmadar'){for(const c of [s,...s.party])restoreRaidMember(c,s);beginMoltenCoreBattle(s,id,s.guildRaid.tactics);return s;}

test('plans validate actors, lock in combat and survive serialization per boss',()=>{
 const s=fixture(),plan=raidPlan(s,'magmadar');
 assert.throws(()=>raidCommandAction(s,{type:'raidPlan',bossId:'magmadar',plan:{...plan,offTank:plan.mainTank}}),/两名不同/);
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
 const paladin=actors.find(c=>c.id===command.plan.cooldowns.rescue.actorId);assert.ok(paladin,'guild roster has a paladin for Lay on Hands');
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
 moltenCoreTick(s,[s,...s.party],hurt);s.clock+=9000;moltenCoreTick(s,[s,...s.party],hurt);
 assert.equal(r.failures.doom,7);
 const b={...s.combat,endedAt:s.clock};const review=raidAttemptReview(s,b)!;assert.equal(review.failures.doom,7);assert.match(review.suggestions[0],/末日漏驱散/);
});

test('published tank and movement choices change actual initial targets and danger avoidance',()=>{
 const s=fixture(),plan=raidPlan(s,'magmadar');[plan.mainTank,plan.offTank]=[plan.offTank,plan.mainTank];plan.cooldowns.wall.actorId=plan.mainTank;plan.movement='finishCast';
 raidCommandAction(s,{type:'raidPlan',bossId:'magmadar',plan});start(s);
 assert.equal(s.combat.enemies[0].target,plan.mainTank);
 const r=s.combat.raidEncounter,c=s;r.nextBomb=Infinity;r.nextFear=Infinity;r.nextFrenzy=Infinity;
 const fire={id:'test',position:c.position,positionY:c.positionY,radius:6,armedAt:s.clock+2500,next:s.clock+2500,until:s.clock+10000};r.fires=[fire];c.cast={spell:133};
 moltenCoreTick(s,[s,...s.party],()=>{});assert.ok(c.cast,'greedy policy keeps casting before impact');
 r.command.plan.movement='early';moltenCoreTick(s,[s,...s.party],()=>{});assert.equal(c.cast,null,'early policy sacrifices the cast to move');
});

test('automatic traversal pauses before a boss and wipe review preserves the plan for the next attempt',()=>{
 let s=fixture();guildRaidAction(s,{type:'raidNavigate',destination:'lucifron'});
 for(let i=0;i<4;i++){s.combat.enemies.forEach((e:Rules)=>e.hp=0);s=advance(s,s.wallAt+100).state;s=advance(s,s.wallAt+3000).state;}
 assert.equal(s.combat,null);assert.equal(s.guildRaid.autoAdvance,false);assert.match(s.activity.reason,/首领前/);
 s=act(s,{type:'raidNavigate',destination:'lucifron'},s.wallAt);assert.equal(s.combat.raidEncounter.id,'lucifron');
 s=act(s,{type:'abandonCombat',encounterId:s.combat.id},s.wallAt);const attempt=s.guildRaid.attempts.at(-1);assert.ok(attempt.review);assert.equal(attempt.won,false);assert.equal(attempt.review.bossRemaining,100);
 const review=structuredClone(attempt.review);guildRaidAction(s,{type:'raidRecover'});s=advance(s,s.wallAt+10000).state;
 assert.deepEqual(s.guildRaid.attempts.at(-1).review,review);
});
