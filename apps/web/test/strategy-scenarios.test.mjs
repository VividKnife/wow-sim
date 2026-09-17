import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,stats,view} from '../../../packages/game-domain/src/rules/engine.js';
import {classDefinitions,classAbilities,spells} from '../../../packages/game-domain/src/rules/catalog.js';
import {strategyPresets} from '../../../packages/game-domain/src/rules/strategy-presets.js';
import {ruleMatches,validateRules,strategyAllows} from '../../../packages/game-domain/src/rules/combat-strategy.js';
import {spellInfo} from '../../../packages/game-domain/src/rules/character.js';
import {startCombat,combatTick,hurtPlayer} from '../../../packages/game-domain/src/rules/combat.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';

function scenario(classId,template,count=1,extra=[]){
 let s=createGame('模板实战',743,0,{classId,raceId:classDefinitions.find(c=>c.id===classId).races[0]});s.level=20;
 s.learned=[...new Set([...s.learned,...classAbilities[classId].filter(a=>a.requiredLevel<=20&&['trainer','weapon'].includes(a.acquisition)).map(a=>a.spellId),...extra])];
 s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s=act(s,{type:'recruit',id:'warrior'},0);
 const p=strategyPresets(s).find(p=>p.id===String(template));s.rules=p.rules;s.strategyPolicy={...p.policy,pullDelaySeconds:0}; // Rotation tests start after the configurable pull hold.
 startCombat(s,Array(count).fill(636),true);s.position=5;s.positionY=0;
 const tank=s.party[0];tank.position=28;tank.positionY=0;tank.rules=[];tank.nextAction=tank.nextSwing=1e6;
 for(const [i,e] of s.combat.enemies.entries()){e.position=30;e.positionY=i;e.hp=e.maxHp=100000;e.threat={[tank.id]:10000};e.target=tank.id;e.rootUntil=e.nextSpell=e.nextAttack=1e6;e.cast=null;}
 return s;
}
const casts=s=>s.logs.filter(l=>l.actorId===s.id&&l.kind==='cast').map(l=>spells[l.spellId]?.SpellName);
function tick(s,ms){const end=s.clock+ms;for(;s.clock<=end;s.clock+=100)combatTick(s);}

test('frost uses Blizzard for clustered packs, Frostbolt for singles and sheep for pairs',()=>{
 for(const [n,want] of [[3,'Blizzard'],[1,'Frostbolt'],[2,'Polymorph']]){
  const s=scenario(8,61,n);combatTick(s);assert.equal(casts(s)[0],want);
  if(n===3){tick(s,2100);assert.equal(s.cast?.channel,true);assert.equal(new Set(s.logs.filter(l=>l.actorId===s.id&&l.periodic&&spells[l.spellId]?.SpellName==='Blizzard').map(l=>l.targetId)).size,3);}
 }
});
test('AoE needs real clustering and preserves existing crowd control',()=>{
 const s=scenario(8,61,4),enemies=s.combat.enemies;enemies[3].polyUntil=10000;enemies[3].polyCaster='other';combatTick(s);
 assert.equal(casts(s)[0],'Frostbolt');
 const spread=scenario(8,61,3);spread.combat.enemies[1].positionY=15;spread.combat.enemies[2].positionY=30;combatTick(spread);assert.equal(casts(spread)[0],'Frostbolt');
});
test('Blizzard finishes all eight ticks after pulling aggro without switching spells',()=>{
 const s=scenario(8,61,3);combatTick(s);const cast=s.cast;
 assert.equal(spells[cast.spell].SpellName,'Blizzard');
 const enemy=s.combat.enemies[1];enemy.threat[s.id]=20000;enemy.target=s.id;
 for(s.clock=100;s.clock<cast.until;s.clock+=100){combatTick(s);assert.equal(s.cast,cast);}
 combatTick(s);
 assert.deepEqual(casts(s),['Blizzard']);
 assert.ok(!s.logs.some(l=>l.actorId===s.id&&l.kind==='cancel'));
 for(const e of s.combat.enemies)assert.equal(s.logs.filter(l=>l.actorId===s.id&&l.targetId===e.id&&l.periodic&&l.spellId===cast.spell).length,8);
});
test('Blizzard does not re-evaluate crowd control while already channeling',()=>{
 const s=scenario(8,61,3);combatTick(s);const cast=s.cast;
 s.combat.enemies[1].polyUntil=10000;s.clock=100;combatTick(s);
 assert.equal(s.cast,cast);
});
test('Blizzard holds its original area until the last enemy leaves',()=>{
 const s=scenario(8,61,3);combatTick(s);const cast=s.cast;
 s.combat.enemies[0].hp=0;s.combat.enemies[1].positionY=20;
 s.clock=100;combatTick(s);assert.equal(s.cast,cast);
 s.combat.enemies[2].positionY=20;s.clock=200;combatTick(s);
 assert.equal(s.cast,null);
 assert.ok(s.logs.some(l=>l.actorId===s.id&&l.spellId===cast.spell&&l.kind==='cancel'&&l.reason==='emptyArea'));
});
test('direct damage interrupts Blizzard immediately but periodic and absorbed damage do not',()=>{
 for(const detail of [{},{spellId:133,school:2},{periodic:true}]){
  const s=scenario(8,61,3);combatTick(s);const cast=s.cast;
  s.clock=100;hurtPlayer(s,s.combat.enemies[0],s,10,'测试攻击',detail);
  assert.equal(s.cast,detail.periodic?cast:null);
  if(!detail.periodic){assert.equal(s.nextAction,s.clock);assert.ok(s.logs.some(l=>l.kind==='cancel'&&l.reason==='damage'));}
 }
 const s=scenario(8,61,3);combatTick(s);const cast=s.cast;s.absorb={until:10000,amount:100};
 hurtPlayer(s,s.combat.enemies[0],s,10);assert.equal(s.cast,cast);
});
test('frost restores mana with Evocation and never treats failed generic abilities as mage damage',()=>{
 const s=scenario(8,61,3);s.mana=stats(s).maxMana*.15;combatTick(s);assert.equal(casts(s)[0],'Evocation');
 const mana=s.mana;tick(s,2100);assert.ok(s.mana>mana);
});
test('fire lays Flamestrike once then casts Fireball during the ground effect',()=>{
 const s=scenario(8,41,3,[11366]);tick(s,7000);
 assert.equal(casts(s)[0],'Flamestrike');assert.equal(casts(s).filter(x=>x==='Flamestrike').length,1);assert.ok(casts(s).includes('Fireball'));assert.ok(!casts(s).includes('Pyroblast'));
});
test('mixed mage handlers honor list order instead of preferring every generic spell',()=>{
 const s=scenario(8,61,3);s.mana=stats(s).maxMana*.15;
 const nova=s.rules.find(r=>spells[r.spell].SpellName==='Frost Nova');const evocation=s.rules.find(r=>spells[r.spell].SpellName==='Evocation');
 s.rules=[{...nova,condition:'always',value:0},{...evocation,and:[]}];s.position=25;s.rootUntil=10000;combatTick(s);assert.equal(casts(s)[0],'Frost Nova');
});
test('hunter Multi-Shot hits several nearby enemies and refuses a protected secondary target',()=>{
 const s=scenario(3,363,3);s.rules=s.rules.filter(r=>spells[r.spell].SpellName==='Multi-Shot');tick(s,1000);
 const hits=s.logs.filter(l=>l.actorId===s.id&&l.kind==='damage'&&spells[l.spellId]?.SpellName==='Multi-Shot');assert.equal(new Set(hits.map(l=>l.targetId)).size,3);
 const safe=scenario(3,363,3);safe.combat.enemies[2].polyUntil=10000;const rule=safe.rules.find(r=>spells[r.spell].SpellName==='Multi-Shot');assert.equal(strategyAllows(safe,safe,safe.combat.enemies[0],spellInfo(safe,rule.spell),rule),false);
});
test('rogue spends four combo points before lower-priority generic Backstab',()=>{
 const s=scenario(4,182);s.position=27;const e=s.combat.enemies[0];e.hp=e.maxHp*.3;s.combo=4;s.comboTarget=e.id;s.energy=100;combatTick(s);assert.equal(casts(s)[0],'Eviscerate');
});
test('cat preserves combo points until a worthwhile Rip and does not refresh an active bleed',()=>{
 const s=scenario(11,281);s.position=27;s.form='cat';s.energy=100;const e=s.combat.enemies[0];s.combo=2;s.comboTarget=e.id;s.rules=s.rules.filter(r=>spells[r.spell].SpellName!=="Tiger's Fury");combatTick(s);assert.equal(casts(s)[0],'Claw');
 tick(s,1600);s.combo=4;s.energy=100;tick(s,1600);assert.ok(casts(s).includes('Rip'));
 const count=casts(s).filter(x=>x==='Rip').length;s.combo=5;s.energy=100;tick(s,1600);assert.equal(casts(s).filter(x=>x==='Rip').length,count);
});
test('healers distinguish critical, heavy and light wounds with healthy mana reserves',()=>{
 for(const [classId,template,checks] of [[2,382,[[.15,'Lay on Hands'],[.35,'Holy Light'],[.7,'Flash of Light']]],[5,202,[[.3,'Flash Heal'],[.5,'Heal'],[.8,'Renew']]],[7,262,[[.3,'Lesser Healing Wave'],[.6,'Healing Wave']]],[11,282,[[.3,'Regrowth'],[.5,'Healing Touch'],[.8,'Rejuvenation']]]]){
  for(const [health,want] of checks){const s=scenario(classId,template);s.party[0].hp=Math.floor(stats(s.party[0]).maxHp*health);combatTick(s);assert.equal(casts(s)[0],want,`${classId} at ${health}`);}
 }
});
test('warlock maintains DoTs instead of refreshing them every global cooldown',()=>{
 const s=scenario(9,302);s.rules=s.rules.filter(r=>['Corruption','Shadow Bolt'].includes(spells[r.spell].SpellName));tick(s,9000);assert.equal(casts(s).filter(x=>x==='Corruption').length,1);assert.ok(casts(s).includes('Shadow Bolt'));
});
test('conjunctions validate, evaluate and survive action/client projections',()=>{
 const s=scenario(8,61,3),rule=s.rules.find(r=>spells[r.spell].SpellName==='Blizzard'),e=s.combat.enemies[0];
 assert.equal(ruleMatches(s,s,e,rule,spellInfo(s,rule.spell)),true);s.mana=1;assert.equal(ruleMatches(s,s,e,rule,spellInfo(s,rule.spell)),false);
 for(const and of [null,{},Array(4).fill({condition:'manaAbove',value:10}),[{condition:'comboAtLeast',value:6}],[{condition:'healthAbove',value:NaN}]])assert.throws(()=>validateRules(s,[{...rule,and}]),/阈值/);
 const saved=act(s,{type:'strategy',rules:s.rules},0);const projected=projectClientSnapshot(saved,view(saved));assert.deepEqual(projected.view.strategyMembers[0].rules,s.rules);
});

test('frost can reset its emergency nova before attempting to retreat',()=>{
 const s=scenario(8,61,1,[classAbilities[8].find(a=>spells[a.spellId]?.SpellName==='Cold Snap').spellId]);s.position=24;s.hp=stats(s).maxHp*.4;s.cooldowns[122]=10000;s.combat.enemies[0].target=s.id;s.strategyPolicy.waitForTank=false;
 combatTick(s);assert.equal(casts(s)[0],'Cold Snap');assert.equal(s.cooldowns[122]||0,0);
});
test('warrior rescues a loose enemy without dropping its ready weapon swing',()=>{
 const s=scenario(1,163,1,[71,355]);s.position=27;s.stance='defensive';s.rage=100;s.nextSwing=0;const e=s.combat.enemies[0];combatTick(s);
 assert.equal(casts(s)[0],'Taunt');assert.equal(e.target,s.id);
 assert.ok(s.logs.some(l=>l.actorId===s.id&&l.targetId===e.id&&(l.kind==='damage'||l.kind==='miss')));
});
test('warrior selects Cleave for two nearby targets only when rage allows it',()=>{
 const s=scenario(1,164,2);s.position=27;s.stance='battle';s.nextSwing=10000;s.rage=500;s.rules=s.rules.filter(r=>spells[r.spell].SpellName==='Cleave');combatTick(s);
 assert.equal(spells[s.queuedStrike]?.SpellName,'Cleave');s.queuedStrike=null;s.rage=100;s.clock=100;combatTick(s);assert.equal(s.queuedStrike,null);
});
test('pet healing and safe Life Tap thresholds require all conditions',()=>{
 const hunter=scenario(3,361),mend=hunter.rules.find(r=>spells[r.spell].SpellName==='Mend Pet'),e=hunter.combat.enemies[0];hunter.pet={hp:50,maxHp:100};
 assert.equal(ruleMatches(hunter,hunter,e,mend,spellInfo(hunter,mend.spell)),true);hunter.position=25;assert.equal(ruleMatches(hunter,hunter,e,mend,spellInfo(hunter,mend.spell)),false);
 const lock=scenario(9,302),tap=lock.rules.find(r=>spells[r.spell].SpellName==='Life Tap');lock.mana=1;lock.hp=stats(lock).maxHp*.5;
 assert.equal(ruleMatches(lock,lock,lock.combat.enemies[0],tap,spellInfo(lock,tap.spell)),false);lock.hp=stats(lock).maxHp*.8;assert.equal(ruleMatches(lock,lock,lock.combat.enemies[0],tap,spellInfo(lock,tap.spell)),true);
});

test('destruction channels Rain of Fire into a pack and protects a sheep in its area',()=>{
 const s=scenario(9,301,3);s.rules=s.rules.filter(r=>spells[r.spell].SpellName==='Rain of Fire');tick(s,2100);
 assert.equal(casts(s)[0],'Rain of Fire');assert.ok(s.cast?.extendedChannel);
 assert.equal(new Set(s.logs.filter(l=>l.actorId===s.id&&l.periodic&&spells[l.spellId]?.SpellName==='Rain of Fire').map(l=>l.targetId)).size,3);
 const safe=scenario(9,301,4);safe.combat.enemies[3].polyUntil=10000;const rule=safe.rules.find(r=>spells[r.spell].SpellName==='Rain of Fire');assert.equal(strategyAllows(safe,safe,safe.combat.enemies[0],spellInfo(safe,rule.spell),rule),false);
});
