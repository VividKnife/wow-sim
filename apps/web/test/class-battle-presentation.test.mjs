import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,view,act} from '../lib/game/engine.js';
import {stats,spellInfo,newCharacter,addItem} from '../lib/game/character.js';
import {classDefinitions} from '../lib/game/catalog.js';
import {startCombat} from '../lib/game/combat.js';
import {finishCombat} from '../lib/game/combat-metrics.js';
import {classEffect} from '../lib/game/class-mechanics.js';
import {ruleMatches} from '../lib/game/combat-strategy.js';

const game=id=>{const def=classDefinitions.find(c=>c.id===id),s=createGame('职业战斗',93,0,{classId:id,raceId:def.races[0]});s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rules=[];startCombat(s,[299]);return s;};
test('all nine classes expose distinct portraits and their real combat resource',()=>{
 const frames=new Set();for(const id of [1,2,3,4,5,7,8,9,11]){const s=game(id);s.rage=370;s.energy=64;const ui=view(s).battleView?.units[s.id];assert.ok(ui,`class ${id}`);frames.add(ui.portrait.frame.join(','));assert.equal(ui.resource.name,id===1?'怒气':id===4?'能量':'法力');if(id===1)assert.equal(ui.resource.value,37);if(id===4)assert.equal(ui.resource.value,64);assert.ok(ui.mode);}
 assert.equal(frames.size,9);
});
test('druid forms show their actual resource and preserve the mana pool in animal forms',()=>{
 const s=game(11);s.form='cat';s.energy=42;s.mana=831;let ui=view(s).battleView?.units.player;assert.equal(ui.resource.value,42);assert.equal(ui.secondaryResource.value,831);assert.equal(ui.mode,'猎豹形态');
 s.form='bear';s.rage=720;ui=view(s).battleView.units.player;assert.equal(ui.resource.value,72);assert.equal(ui.mode,'熊形态');s.form='moonkin';ui=view(s).battleView.units.player;assert.equal(ui.resource.name,'法力');assert.equal(ui.secondaryResource,null);
});
test('combo points name their actual target and disappear when it dies',()=>{
 const s=game(4),e=s.combat.enemies[0];s.combo=4;s.comboTarget=e.id;const ui=view(s).battleView?.units.player;assert.equal(ui.combo.value,4);assert.equal(ui.combo.targetId,e.id);assert.equal(ui.combo.targetName,e.name);e.hp=0;assert.equal(view(s).battleView.units.player.combo.value,0);
});
test('paladin seals, priest shields, mage armor and rogue enchants expose source icons and lifetimes',()=>{
 for(const [id,spell]of [[2,20154],[5,17],[8,6117]]){const s=game(id);classEffect(s,s,s,spellInfo(s,spell),[s],{});const effects=view(s).battleView?.units.player.effects;assert.ok(effects?.some(a=>a.spellId===spell&&a.name&&a.icon&&a.until>s.clock));}
 const s=game(4);s.weaponEnchants={16:{spell:8681,name:'Instant Poison',until:60000,charges:20}};const a=view(s).battleView.units.player.effects.find(a=>a.spellId===8681);assert.equal(a.charges,20);assert.match(a.detail,/主手/);
});
test('hunter pet focus and warlock mana are distinct and player pet commands remain executable',()=>{
 for(const [id,spell]of [[3,883],[9,688]]){let s=game(id);if(id===3)s.hunterPet={entry:299,level:10,learned:[]};classEffect(s,s,s,spellInfo(s,spell),[s],{});s.pet.focus=41;const ui=view(s).battleView?.units[s.pet.id];assert.equal(ui.resource.name,id===3?'集中值':'法力');if(id===3)assert.equal(ui.resource.value,41);assert.equal(ui.canCommand,true);s=act(s,{type:'petCommand',command:'passive'},0);assert.equal(view(s).battleView.units[s.pet.id].petMode,'被动');}
});
test('shaman totems expose four slots with real identity, health, remaining life and expiration',()=>{
 const s=game(7);classEffect(s,s,s,spellInfo(s,3599),[s],{});const ui=view(s).battleView?.units.player;assert.equal(ui.totems.length,4);const fire=ui.totems.find(t=>t.element==='fire');assert.equal(fire.spellId,3599);assert.ok(fire.maxHp>0);assert.ok(fire.until>s.clock);s.clock=fire.until;assert.equal(view(s).battleView.units.player.totems.find(t=>t.element==='fire').spellId,null);
});
test('target debuffs and cooldowns use simulation time without mutating game state',()=>{
 const s=game(9),e=s.combat.enemies[0];addItem(s,6265,3);e.dots=[{caster:s.id,spellId:172,next:2000,interval:2000,remaining:3}];s.cooldowns[6789]=120000;s.absorb={spell:17,amount:9,until:5000};const before=structuredClone(s),ui=view(s).battleView;assert.equal(ui.units.player.shards,3);assert.ok(ui.units[e.id].effects.some(a=>a.spellId===172&&a.until===6000));assert.equal(ui.units.player.cooldowns.find(c=>c.spellId===6789).readyAt,120000);assert.deepEqual(s,before);
});
test('finished battle keeps resource, class mechanisms and pet identity from its snapshot',()=>{
 const s=game(11);s.form='cat';s.energy=23;s.mana=455;classEffect(s,s,s,spellInfo(s,1126),[s],{});const battle=finishCombat(s);s.lastCombat=battle;s.combat=null;s.form=null;s.energy=100;s.mana=999;s.clock=90000;const ui=view(s).battleView;assert.equal(ui.live,false);assert.equal(ui.units.player.mode,'猎豹形态');assert.equal(ui.units.player.resource.value,23);assert.equal(ui.units.player.secondaryResource.value,455);assert.ok(ui.units.player.effects.some(a=>a.spellId===1126));
});
test('strategy resource thresholds read rage, energy and form resource instead of hidden mana',()=>{
 for(const [id,patch,pass]of [[1,{rage:600},true],[4,{energy:30},false],[11,{form:'cat',energy:60,mana:0},true],[11,{form:'bear',rage:300,mana:99999},false]]){const s=game(id);Object.assign(s,patch);assert.equal(ruleMatches(s,s,s.combat.enemies[0],{condition:'manaAbove',value:50}),pass);}
});

test('hunter auto shot meter tracks ranged timing and stops at invalid range or during casting',async()=>{
 const {classAttackStatus}=await import('../lib/combat-view.js');
 const s=game(3),e=s.combat.enemies[0];s.position=0;s.positionY=0;e.position=20;e.positionY=0;
 const attack={kind:'ranged',label:'自动射击',startedAt:1000,until:3000,minRange:8,range:35};
 let meter=classAttackStatus(s,s.combat,2000,attack);assert.equal(meter.progress,.5);assert.equal(meter.status.remaining,1000);assert.equal(meter.label,'自动射击');
 e.position=4;meter=classAttackStatus(s,s.combat,2000,attack);assert.equal(meter.label,'近战攻击');
 e.position=40;assert.equal(classAttackStatus(s,s.combat,2000,attack).progress,0);
 e.position=20;s.cast={until:4000};assert.equal(classAttackStatus(s,s.combat,2000,attack).status.kind,'casting');
 assert.equal(classAttackStatus(s,null,2000,attack).status.kind,'ended');
});

test('active talents, racial abilities and unlimited-charge auras remain visible',()=>{
 const s=game(8);classEffect(s,s,s,spellInfo(s,12043),[s],{});
 s.racialEffects={perception:{until:20000}};s.auras=[{spell:12579,type:271,charges:0,until:15000}];
 const effects=view(s).battleView.units.player.effects;
 assert.ok(effects.some(e=>e.spellId===12043&&e.detail==='天赋触发'));assert.ok(effects.some(e=>e.detail==='种族能力'));assert.ok(effects.some(e=>e.spellId===12579));
});

test('paladin judgement and persistent area share their actual target and coordinates with the battle UI',()=>{
 const s=game(2),e=s.combat.enemies[0];classEffect(s,s,s,spellInfo(s,20165),[s],{});classEffect(s,s,e,spellInfo(s,20271),[s],{lands:()=>true});
 assert.ok(view(s).battleView.units[e.id].effects.some(a=>a.spellId===20185&&a.until===10000));
 s.position=12;s.positionY=-4;e.position=12;e.positionY=-4;classEffect(s,s,e,spellInfo(s,26573),[s],{});
 const area=view(s).battleView.groundEffects.find(a=>a.spell===26573);assert.ok(area);assert.deepEqual(area.center,{x:12,y:-4});assert.equal(area.radius,spellInfo(s,26573).radius);assert.ok(area.until>s.clock);
});
