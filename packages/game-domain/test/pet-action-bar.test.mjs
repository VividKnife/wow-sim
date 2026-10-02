import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,view} from '../src/rules/engine.js';
import {petCommand,summonClassPet,selectPetSpell} from '../src/rules/class-spell-effects.js';
import {spellInfo,stats} from '../src/rules/character.js';
import {startCombat,executeCombatIntent} from '../src/rules/combat.js';
import {petStableAction} from '../src/rules/pet-stable.js';
import {projectClientSnapshot} from '../src/rules/client-snapshot.ts';
function hunter(){
 const s=createGame('宠物技能条',71,0,{classId:3,raceId:3});s.location='goldshire';s.level=20;s.money=100000;s.learned.push(883,5149);s.hp=stats(s).maxHp;
 s.hunterPet={entry:299,name:'冬狼',level:20,learned:[17253,17255,4187],availableSkills:[17253,17255,17256,4187],trainingPoints:40};
 summonClassPet(s,s,spellInfo(s,883));return s;
}
function fight(s){const target={id:'practice',name:'训练目标',hp:10000,maxHp:10000,armor:0,level:20,position:0,positionY:0,threat:{}};startCombat(s,[],false,[target]);s.pet.position=target.position=0;s.pet.positionY=target.positionY=0;s.pet.nextAction=0;return target;}
test('pet book exposes icons, effects, ranks, real training costs and current rank only',()=>{
 const s=hunter(),d=view(s),skills=d.petControls.skills;
 assert.equal(d.petControls.family,'狼');assert.equal(d.petControls.focus,100);assert.ok(d.petStable.current.nextXp>0);
 assert.deepEqual(skills.filter(p=>p.learned&&p.currentRank&&!p.passive).map(p=>p.id),[17255]);
 assert.ok(skills.every(p=>p.icon&&p.details.effects.length));assert.equal(skills.find(p=>p.id===17256).cost,3);assert.equal(skills.find(p=>p.id===4187).passive,true);
});
test('autocast setting survives stable roundtrip, JSON, client snapshot and rank upgrades',()=>{
 const s=hunter();petCommand(s,{command:'autocast',spellId:17255,enabled:false});
 assert.equal(view(s).petControls.skills.find(p=>p.id===17255).autocast,false);
 assert.deepEqual(projectClientSnapshot(s,view(s)).player.pet.autocastDisabled,s.pet.autocastDisabled);
 petStableAction(s,{operation:'buy',slot:0});petStableAction(s,{operation:'store',slot:0});
 assert.equal(view(s).petStable.slots[0].family,'狼');
 const restored=JSON.parse(JSON.stringify(s));petStableAction(restored,{operation:'withdraw',slot:0});petCommand(restored,{command:'train',spellId:17256});
 assert.equal(view(restored).petControls.skills.find(p=>p.id===17256).autocast,false);
 const target=fight(restored);assert.equal(selectPetSpell(restored,restored.pet,restored,target,[restored,restored.pet]),null);
 petCommand(restored,{command:'autocast',spellId:17256,enabled:true});assert.equal(selectPetSpell(restored,restored.pet,restored,target,[restored,restored.pet]).spellId,17256);
});
test('manual pet cast bypasses autocast preference but obeys real resource, cooldown and target validation',()=>{
 const s=hunter(),target=fight(s);petCommand(s,{command:'autocast',spellId:17255,enabled:false});
 assert.equal(executeCombatIntent(s,s.pet,{kind:'petCast',spellId:17255,targetId:target.id}).reason,'pet-autocast-disabled');
 assert.throws(()=>petCommand(s,{command:'cast',spellId:17255,targetId:s.id}),/敌对目标/);
 const hp=target.hp;petCommand(s,{command:'cast',spellId:17255,targetId:target.id});assert.ok(target.hp<hp);assert.equal(s.pet.focus,65);
 assert.throws(()=>petCommand(s,{command:'cast',spellId:17255,targetId:target.id}),/当前无法施放/);
 assert.throws(()=>petCommand(s,{command:'cast',spellId:17255,targetId:'missing'}),/当前无法施放/);
 s.pet.cooldowns={};s.pet.globalCooldowns={};s.pet.categoryCooldowns={};s.clock+=20000;s.pet.focus=0;
 assert.throws(()=>petCommand(s,{command:'cast',spellId:17255,targetId:target.id}),/当前无法施放/);
});
test('pet controls reject unknown skills, passives, dead pets and invalid autocast values',()=>{
 const s=hunter();
 for(const spellId of [999999,17256,4187])assert.throws(()=>petCommand(s,{command:'autocast',spellId,enabled:false}),/主动技能/);
 assert.throws(()=>petCommand(s,{command:'autocast',spellId:17255,enabled:'false'}),/状态无效/);
 s.pet.hp=0;assert.throws(()=>petCommand(s,{command:'autocast',spellId:17255,enabled:false}),/存活/);
});
