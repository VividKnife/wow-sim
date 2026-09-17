import {cooldownUntil,beginSpellTiming} from '../../../packages/game-domain/src/rules/spell-timing.js';
import {spellInfo} from '../../../packages/game-domain/src/rules/character.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,stats,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';

function group(){let s=createGame('队长',29,0);s.level=18;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rules=[];for(const id of ['warrior','priest','rogue','mage'])s=act(s,{type:'recruit',id},0);startCombat(s,[636],true);const e=s.combat.enemies[0];e.hp=e.maxHp=100000;e.nextAttack=100000;e.rootUntil=100000;return s;}
const member=(s,id)=>s.party.find(c=>c.roleId===id);

test('Disarm suppresses weapon abilities and cancels a queued Heroic Strike without spending resources',()=>{
 const s=group(),tank=member(s,'warrior'),rogue=member(s,'rogue'),e=s.combat.enemies[0];e.position=23;e.target=tank.id;
 for(const c of [tank,rogue]){c.position=23;c.auras=[{spell:6713,effect:1,type:67,until:10000}];}
 tank.rage=500;tank.queuedStrike=284;rogue.energy=100;tank.nextSwing=rogue.nextSwing=0;
 combatTick(s);
 assert.equal(tank.queuedStrike,null);assert.equal(rogue.energy,100);
 assert.equal(s.logs.some(l=>l.kind==='cast'&&[tank.id,rogue.id].includes(l.actorId)),false);
 assert.ok(tank.rage>=500); // Unarmed auto attacks may still generate rage.
});

test('priest casts a real heal, spends mana, and adds threat for effective healing only',()=>{
 const s=group(),tank=member(s,'warrior'),priest=member(s,'priest');tank.hp=20;const mana=priest.mana;combatTick(s);
 assert.equal(priest.cast?.friendly,true);assert.equal(priest.cast.target,tank.id);assert.equal(priest.mana,mana);
 const finish=priest.cast.until;tank.hp=stats(tank).maxHp-7;priest.nextAction=finish+1500;s.clock=finish;combatTick(s);
 assert.ok(priest.mana<mana);const heal=s.logs.find(l=>l.kind==='heal');assert.equal(heal.amount,7);assert.equal(heal.targetId,tank.id);assert.equal(s.combat.enemies[0].threat[priest.id],3.5);
});

test('warrior taunts a lost target and spends earned rage on stacking armor reduction',()=>{
 const s=group(),tank=member(s,'warrior'),e=s.combat.enemies[0];e.position=23;e.threat[s.id]=500;e.target=s.id;tank.rage=500;combatTick(s);
 assert.equal(e.target,tank.id);assert.equal(e.tauntedBy,tank.id);assert.equal(e.tauntUntil,3000);assert.ok(cooldownUntil(tank,spellInfo(tank,355))>=10000);
 s.clock=1500;combatTick(s);assert.equal(e.sunder?.stacks,1);assert.ok(tank.rage<500);assert.equal(e.sunder.amount,90);
});

test('rogue consumes energy, builds target-specific combo points, and spends them on Eviscerate',()=>{
 const s=group(),rogue=member(s,'rogue'),e=s.combat.enemies[0];rogue.position=27;rogue.strategyPolicy={waitForTank:false};combatTick(s);
 assert.equal(rogue.energy,55);assert.equal(rogue.combo,1);assert.equal(rogue.comboTarget,e.id);
 rogue.energy=35;rogue.combo=4;rogue.nextAction=0;s.clock=1500;combatTick(s);
 assert.equal(rogue.energy,0);assert.equal(rogue.combo,0);assert.ok(s.logs.some(l=>l.kind==='cast'&&l.actorId===rogue.id&&l.spellId===6761));
 s.clock=2000;combatTick(s);assert.equal(rogue.energy,20);
});

test('party combat and resource regeneration are identical over differently sized advances',()=>{
 const s=group();member(s,'warrior').hp=100;const whole=advance(s,15000).state;let split=s;for(let t=1000;t<=15000;t+=1000)split=advance(split,t).state;
 assert.deepEqual(split,whole);assert.ok(whole.logs.some(l=>l.kind==='heal'));assert.ok(whole.logs.some(l=>l.spellId===1758));
});

test('priest mana regeneration obeys the five-second rule during party combat',()=>{
 const s=group(),priest=member(s,'priest');priest.mana=0;priest.lastManaUse=0;
 assert.equal(member(advance(s,4000).state,'priest').mana,0);
 assert.equal(member(advance(s,6000).state,'priest').mana,Math.floor(stats(priest).spi/4+12.5));
});

test('caster attack power and low-level spell critical chance follow the pinned class formulas',()=>{
 const s=group(),priest=member(s,'priest');
 for(const c of [s,priest]){const st=stats(c);assert.equal(st.attackPower,st.str-10);const rate=c.classId===8?[3.70,14.77,.65]:[2.97,10.03,.82];assert.equal(st.spellCrit,(rate[0]+st.int/(rate[1]+rate[2]*c.level))/100);}
});

test('a fallen leader cannot use corpse recovery while the party is still fighting',()=>{
 const s=group();s.hp=0;
 assert.throws(()=>act(s,{type:'revive'},0),/战斗/);
});

test('a melee challenger can pull aggro even when a higher ranged challenger is below its threshold',()=>{
 const s=group(),tank=member(s,'warrior'),rogue=member(s,'rogue'),e=s.combat.enemies[0];
 for(const c of [s,...s.party]){c.nextAction=100000;c.nextSwing=100000;}
 e.position=23;tank.position=20;rogue.position=25;s.position=0;e.target=tank.id;e.threat={[tank.id]:100,[s.id]:120,[rogue.id]:115};
 combatTick(s);assert.equal(e.target,rogue.id);
});

test('companion attacks preserve polymorph when an uncontrolled enemy is available',()=>{
 const s=group();startCombat(s,[636,636],true);const [sheep,active]=s.combat.enemies;sheep.polyUntil=100000;sheep.position=30;active.position=30;member(s,'rogue').position=27;s.rules=[];for(const role of ['rogue','priest'])member(s,role).strategyPolicy={waitForTank:false};
 combatTick(s);s.clock=100;combatTick(s); // Priest first walks into legal 2D Smite range.
 for(const role of ['rogue','priest']){const c=member(s,role),cast=s.logs.find(l=>l.actorId===c.id&&l.kind==='cast');assert.equal(cast?.targetId,active.id);}
 assert.equal(sheep.polyUntil,100000);
});

test('warrior moves toward a loose enemy attacking the backline instead of the first tanked enemy',()=>{
 const s=group();startCombat(s,[636,636],true);s.rules=[];
 const tank=member(s,'warrior'),[held,loose]=s.combat.enemies;
 tank.position=20;tank.nextAction=100000;tank.nextSwing=100000;
 held.position=24;held.target=tank.id;held.threat={[tank.id]:100};
 loose.position=0;loose.target=s.id;loose.threat={[s.id]:100};
 for(const e of [held,loose]){e.rootUntil=100000;e.nextAttack=100000;}
 combatTick(s);assert.ok(tank.position<20,'tank must move back toward the endangered caster');
});

test('warrior follows a rescue taunt with an auto attack on that same enemy',()=>{
 const s=group();startCombat(s,[636,636],true);s.rules=[];
 const tank=member(s,'warrior'),[held,loose]=s.combat.enemies;
 tank.position=23;tank.nextSwing=0;tank.rage=0;
 for(const e of [held,loose]){e.position=23;e.rootUntil=100000;e.nextAttack=100000;e.hp=e.maxHp=100000;}
 held.target=tank.id;held.threat={[tank.id]:100};loose.target=s.id;loose.threat={[s.id]:100};
 combatTick(s);
 const hit=s.logs.find(l=>l.actorId===tank.id&&(l.kind==='damage'||l.kind==='miss'&&l.hand==='main'));
 assert.equal(loose.target,tank.id);assert.equal(hit?.targetId,loose.id);
 for(const c of [s,...s.party].filter(c=>c!==tank)){c.nextAction=100000;c.nextSwing=100000;}
 tank.rage=500;s.clock=1500;combatTick(s);
 const sunder=s.logs.findLast(l=>l.actorId===tank.id&&l.spellId===7386&&l.kind==='cast');
 assert.equal(sunder?.targetId,loose.id,'build threat on the taunted enemy before returning to the first enemy');
});

test('priest cancels delayed Smite without spending mana and retains its original global cooldown',()=>{
 const s=group(),priest=member(s,'priest'),tank=member(s,'warrior');
 const timing=beginSpellTiming(priest,spellInfo(priest,598),0);priest.cast={timing,spell:598,target:s.combat.enemies[0].id,startedAt:0,until:6500,pushbacks:4};priest.nextAction=6500;
 tank.hp=100;const mana=priest.mana;s.clock=700;combatTick(s);
 assert.equal(priest.cast,null);assert.equal(priest.mana,mana);assert.equal(priest.globalCooldowns[133],1500);
 assert.ok(s.logs.some(l=>l.kind==='cancel'&&l.actorId===priest.id&&l.spellId===598));
 s.clock=1500;combatTick(s);assert.equal(priest.cast?.friendly,true);assert.equal(priest.cast.target,tank.id);assert.equal(priest.mana,mana);
});

test('priest keeps casting damage when no affordable heal is available',()=>{
 const s=group(),priest=member(s,'priest'),tank=member(s,'warrior');tank.hp=100;priest.mana=0;
 priest.cast={spell:598,target:s.combat.enemies[0].id,startedAt:0,until:6500};priest.nextAction=6500;s.clock=700;combatTick(s);
 assert.equal(priest.cast?.spell,598);assert.equal(priest.cast.until,6500);
});

test('a threatened priest uses its learned shield with real mana cost and weakened soul',()=>{
 const s=group(),priest=member(s,'priest'),e=s.combat.enemies[0];priest.hp=100;e.target=priest.id;e.threat={[priest.id]:100};
 assert.ok(priest.learned.includes(600));const mana=priest.mana;combatTick(s);
 assert.equal(priest.absorb?.spell,600);assert.equal(priest.absorb.amount,158);assert.equal(priest.weakenedSoulUntil,15000);assert.ok(priest.mana<mana);
 const count=s.logs.filter(l=>l.actorId===priest.id&&l.kind==='cast'&&l.spellId===600).length;
 priest.nextAction=0;s.clock=100;combatTick(s);
 assert.equal(s.logs.filter(l=>l.actorId===priest.id&&l.kind==='cast'&&l.spellId===600).length,count);
});

test('a priest in danger can abandon a pushed-back ally heal for an instant self shield',()=>{
 const s=group(),priest=member(s,'priest'),tank=member(s,'warrior'),e=s.combat.enemies[0];
 priest.hp=100;tank.hp=1;e.target=priest.id;e.threat={[priest.id]:100};priest.cast={spell:2053,target:tank.id,startedAt:0,until:6500,friendly:true};priest.nextAction=6500;
 s.clock=2000;combatTick(s);assert.equal(priest.cast,null);assert.equal(priest.absorb?.spell,600);
});

test('an already completed priest heal resolves before emergency interruption is considered',()=>{
 const s=group(),priest=member(s,'priest'),e=s.combat.enemies[0];priest.hp=100;e.target=priest.id;e.threat={[priest.id]:100};
 priest.cast={spell:2053,target:priest.id,startedAt:0,until:2000,friendly:true};priest.nextAction=3000;const mana=priest.mana;
 s.clock=2000;combatTick(s);assert.ok(priest.hp>100);assert.equal(priest.mana,mana);assert.equal(priest.absorb,undefined);
 assert.ok(s.logs.some(l=>l.kind==='heal'&&l.actorId===priest.id));
});

test('Fade reduces threatened priest aggro only when another living party member has threat',()=>{
 const s=group(),priest=member(s,'priest'),tank=member(s,'warrior'),e=s.combat.enemies[0];
 assert.ok(priest.learned.includes(586));e.target=priest.id;e.threat={[priest.id]:100,[tank.id]:90};
 tank.nextAction=tank.nextSwing=100000;combatTick(s);
 assert.equal(priest.fade?.amount,85);assert.ok(priest.fade.until>s.clock);assert.equal(e.target,tank.id); // Rank 1 scales from level 8 to 18.
});

test('a priest cannot shield while silenced and does not waste Fade on enemies with no alternative threat',()=>{
 const s=group(),priest=member(s,'priest'),e=s.combat.enemies[0];e.target=priest.id;e.threat={[priest.id]:100};
 priest.hp=100;priest.silenceUntil=10000;combatTick(s);assert.equal(priest.absorb,undefined);assert.equal(priest.fade,undefined);
 const t=group(),p=member(t,'priest'),foe=t.combat.enemies[0];foe.target=p.id;foe.threat={[p.id]:100};combatTick(t);assert.equal(p.fade,undefined);
});
