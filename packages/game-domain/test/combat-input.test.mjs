import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,advanceOwned,stats} from '../src/rules/engine.js';
import {startCombat,combatTick,commandCombatCast} from '../src/rules/combat.js';
import {newCharacter,spellInfo} from '../src/rules/character.js';
import {combatCommandView,combatCommandAction} from '../src/rules/combat-command.js';
import {companionTarget} from '../src/rules/companion-combat.js';
import {beginSpellTiming,cooldownUntil} from '../src/rules/spell-timing.js';
import {spells} from '../src/rules/catalog.js';

function fixture(classId=8,learned=[133,143]){
 const s=createGame('指令验证',747,0,{classId,raceId:classId===3?3:classId===7?2:classId===11?4:1});
 s.id='caster';s.level=60;s.learned=[...new Set([...s.learned,...learned])];s.rules=[];s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rage=1000;s.energy=100;s.ammunition={2512:1000,2516:1000};
 const ally=newCharacter('指定队友',1,60,1);ally.id='ally';ally.rules=[];ally.hp=Math.floor(stats(ally).maxHp*.95);ally.mana=stats(ally).maxMana;ally.nextSwing=100000;
 const injured=newCharacter('较低血队友',1,60,1);injured.id='injured';injured.rules=[];injured.hp=Math.floor(stats(injured).maxHp*.5);injured.nextSwing=100000;
 s.party=[ally,injured];startCombat(s,[636,636],true);delete s.combat.pull;
 for(const e of s.combat.enemies){e.hp=e.maxHp=1000000;e.nextSpell=e.nextAttack=100000;e.rootUntil=100000;e.position=20;e.positionY=0;e.threat={};}
 for(const c of [s,...s.party]){c.position=17;c.positionY=0;c.nextAction=0;c.nextSwing=100000;c.strategyPolicy={waitForTank:false};}
 return s;
}
function order(s,order,extra={}){return act(s,{type:'combatCommand',encounterId:s.combat.id,order,...extra},s.wallAt);}
function queue(s,spellId,targetId=s.combat.enemies[0].id){return order(s,'cast',{memberId:s.id,spellId,targetId});}

for(const [classId,id,friendly] of [[1,7386,false],[2,635,true],[3,3044,false],[4,1752,false],[5,2050,true],[7,403,false],[8,133,false],[9,686,false],[11,5185,true]])test(`class ${classId} accepts one explicit cast using ordinary timing and effects`,()=>{
 let s=fixture(classId,[id]);if(classId===3)s.position=5;
 const target=friendly?s.party[0]:s.combat.enemies[0],before={hp:target.hp,mana:s.mana,rage:s.rage,energy:s.energy};
 s=queue(s,id,target.id);assert.equal(s.combat.command.inputs.length,1);assert.equal(s.combat.casts,0);
 s=advance(s,100).state;assert.equal(s.combat.command.inputs.length,0);assert.equal(s.combat.command.results.at(-1).status,'started');
 assert.equal(s.logs.find(l=>l.kind==='cast'&&l.actorId===s.id)?.targetId,target.id);
 s=advance(s,4000).state;
 assert.equal(s.logs.filter(l=>l.kind==='cast'&&l.actorId===s.id&&l.spellId===id).length,1);
 assert.ok(['mana','rage','energy'].some(pool=>s[pool]<before[pool]));
 if(friendly)assert.ok(s.party[0].hp>before.hp,'heal the requested ally even above AI healing threshold');
});

test('requested downrank, recipient, GCD waiting and replacement survive JSON restoration',()=>{
 let s=fixture();s.globalCooldowns={133:500};s=queue(s,143);s=queue(s,133,s.combat.enemies[1].id);
 assert.equal(s.combat.command.inputs.length,1);assert.equal(s.combat.command.results.at(-1).status,'cancelled');
 s=advance(s,400).state;assert.equal(s.combat.casts,0);
 const restored=JSON.parse(JSON.stringify(s));const a=advance(s,1000).state,b=advance(restored,1000).state;
 assert.deepEqual(a,b);assert.equal(a.cast.spell,133);assert.equal(a.cast.target,s.combat.enemies[1].id);assert.equal(a.cast.startedAt,500);
 assert.equal(a.combat.command.results.at(-1).sequence,2);assert.equal(a.combat.casts,1);
});

test('invalid target/unknown skill/stale encounter rejects atomically without spending or creating an input',()=>{
 const s=fixture(),before=structuredClone(s);
 for(const extra of [{spellId:133,targetId:'ally'},{spellId:133,targetId:'missing'},{spellId:999999,targetId:s.combat.enemies[0].id},{spellId:133,targetId:s.combat.enemies[0].id,encounterId:'old'}]){
  assert.throws(()=>order(s,'cast',{memberId:s.id,...extra}));assert.deepEqual(s,before);
 }
});

test('execution revalidates death, distance, resource, silence, stun and school lockout',()=>{
 for(const change of [s=>{s.combat.enemies[0].hp=0;},s=>{s.position=-100;},s=>{s.mana=0;},s=>{s.silenceUntil=10000;},s=>{s.stunUntil=10000;},s=>{s.schoolLockouts={2:10000};}]){
  let s=queue(fixture(),133);change(s);const mana=s.mana,lastManaUse=s.lastManaUse;s=advance(s,5100).state;
  assert.equal(s.combat.casts,0);assert.equal(s.combat.command.inputs.length,0);
  assert.ok(['rejected','expired'].includes(s.combat.command.results.at(-1).status));assert.ok(s.mana>=mana);assert.equal(s.lastManaUse,lastManaUse);
 }
});

test('stop cast cancels pending input and uncommitted damage without clearing GCD or existing effects',()=>{
 let s=fixture();commandCombatCast(s,s,133,s.combat.enemies[0].id);const mana=s.mana,gcd=s.globalCooldowns[133];
 s=queue(s,143);s=order(s,'stopCast',{memberId:s.id});assert.equal(s.cast,null);assert.equal(s.combat.command.inputs.length,0);assert.equal(s.mana,mana);assert.equal(s.globalCooldowns[133],gcd);
 s=advance(s,5000).state;assert.ok(!s.logs.some(l=>l.kind==='damage'&&l.actorId===s.id));
});

test('hold fire cancels damage casts/queued swings but keeps healing, DoTs and launched projectiles',()=>{
 let s=fixture(5,[2050,589]);const target=s.combat.enemies[0];
 const sp=spellInfo(s,2050);s.cast={spell:2050,target:'ally',classSpecial:true,friendly:true,until:2000,timing:beginSpellTiming(s,sp,0)};
 s.combat.projectiles=[{id:'flight',actorId:s.id,targetId:target.id,spellId:589,impactAt:999999}];target.dots=[{remaining:3,next:999999,caster:s.id,spell:589}];s.queuedStrike=78;
 s=queue(s,589);s=order(s,'holdFire',{enabled:true});assert.ok(s.cast);assert.equal(s.queuedStrike,null);assert.equal(s.combat.command.inputs.length,0);assert.equal(s.combat.projectiles.length,1);assert.equal(s.combat.enemies[0].dots[0].remaining,3);
 s=order(s,'holdFire',{enabled:false});assert.equal(s.combat.command.holdFire,false);
});

test('defensive cooldown input is legal at full health and rejects absent shield/incorrect stance',()=>{
 let s=fixture(8,[11958]);commandCombatCast(s,s,11958,s.id);assert.ok(cooldownUntil(s,spellInfo(s,11958))>s.clock);assert.ok(s.auras?.length||s.iceBlockUntil);
 s=fixture(1,[871]);delete s.equipment[17];const before=structuredClone(s);assert.throws(()=>commandCombatCast(s,s,871,s.id),/姿态/);assert.deepEqual(s,before);
});

test('forty-player commands target DPS while preserving tank assignments and have bounded receipts',()=>{
 const s=fixture();while(s.party.length<39){const c=newCharacter('队员'+s.party.length,8,60,1);c.id='member-'+s.party.length;c.hp=1000;c.learned=[133];s.party.push(c);s.combat.participantIds.push(c.id);}
 s.combat.raidEncounter={};const [first,focus]=s.combat.enemies;s.raidTargetId=first.id;
 combatCommandAction(s,{order:'focus',encounterId:s.combat.id,targetId:focus.id});assert.equal(companionTarget(s,s,s.combat.enemies).id,focus.id);
 const tank=s.party[0];tank.raidTargetId=first.id;assert.equal(companionTarget(s,tank,s.combat.enemies).id,first.id);
 assert.equal(combatCommandView(s).members.length,40);
 for(let i=0;i<50;i++)combatCommandAction(s,{order:'cast',encounterId:s.combat.id,memberId:s.id,spellId:133,targetId:focus.id});
 assert.equal(s.combat.command.inputs.length,1);assert.equal(s.combat.command.results.length,40);
});

test('fixed command timeline has identical results for coarse, fine and owned advancement',()=>{
 const initial=fixture(5,[2050,589]),timeline=[{at:175,order:'cast',spellId:2050,targetId:'ally',memberId:'caster'},{at:825,order:'stopCast',memberId:'caster'},{at:1600,order:'cast',spellId:589,memberId:'caster',targetId:initial.combat.enemies[0].id},{at:1900,order:'holdFire',enabled:true}];
 function run(step,owned){let s=structuredClone(initial);for(const command of [...timeline,{at:5000}]){while(s.wallAt<command.at)s=(owned?advanceOwned:advance)(s,Math.min(command.at,s.wallAt+step)).state;if(command.order)s=order(s,command.order,command);}return s;}
 assert.deepEqual(run(5000,false),run(25,false));assert.deepEqual(run(5000,false),run(50,true));
});
