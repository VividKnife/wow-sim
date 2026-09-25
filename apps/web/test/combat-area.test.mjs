import test from 'node:test';
import assert from 'node:assert/strict';
import reference from '../../../packages/game-data/data/deadmines-reference.json' with {type:'json'};
import definitions from '../../../packages/game-data/data/combat-areas.json' with {type:'json'};
import {createGame,stats,advance,view} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat,combatTick,hurtPlayer} from '../../../packages/game-domain/src/rules/combat.js';
import {sceneCombatArea,validateCombatArea} from '../../../packages/game-domain/src/rules/combat-area.js';
import {moveAway,moveToward} from '../../../packages/game-domain/src/rules/combat-space.js';
import {executeExtendedClassEffect,summonClassPet} from '../../../packages/game-domain/src/rules/class-spell-effects.js';
import {smiteTick} from '../../../packages/game-domain/src/rules/smite.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {battleLayout} from '../lib/combat-view.js';

const area={name:'测试房间',shape:'rectangle',minX:0,maxX:35,minY:-5,maxY:5};
function inside(unit,a=area){assert.ok(unit.position>=a.minX&&unit.position<=a.maxX&&unit.positionY>=a.minY&&unit.positionY<=a.maxY,`${unit.id}: ${unit.position}, ${unit.positionY}`);}
function fight(entry=299){const s=createGame('边界测试',283,0);s.level=20;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.learned=[116];s.rules=[{spell:116,condition:'always',value:0,enabled:true}];startCombat(s,[entry],false,null,area);return s;}

test('every Deadmines encounter has an explicitly configured valid area',()=>{
 for(const encounter of reference.encounters){assert.ok(definitions.encounters[encounter.id],encounter.id);validateCombatArea(sceneCombatArea({dungeon:true,routeId:encounter.id}));}
 assert.notDeepEqual(sceneCombatArea({dungeon:true,routeId:'dm-smite'}),sceneCombatArea({location:1}));
});
test('invalid bounds fail before changing the encounter; battle owns a copy of its area',()=>{
 const s=fight(),before=structuredClone(s);
 for(const invalid of [{...area,maxX:0},{...area,minY:NaN},{...area,shape:'circle'}])assert.throws(()=>startCombat(s,[299],false,null,invalid),/矩形/);
 assert.deepEqual(s,before);assert.notEqual(s.combat.area,area);
 for(const unit of [s,...s.combat.enemies])inside(unit);
});
test('walking and fleeing stop at all four walls, slide diagonally, and respect roots',()=>{
 const s={combat:{area}},u={position:0,positionY:0,moveSpeed:10};
 for(const [x,y] of [[-100,0],[100,0],[0,-100],[0,100]]){u.position=15;u.positionY=0;moveToward(s,u,{x,y},0,0,100000);inside(u);}
 u.position=0;u.positionY=0;assert.equal(moveAway(s,u,{x:2,y:0},0),false);
 assert.equal(moveAway(s,u,{x:2,y:2},0),true);assert.equal(u.position,0);assert.ok(u.positionY<0);
 u.rootUntil=1000;const before=structuredClone(u);assert.equal(moveToward(s,u,{x:30,y:0},0,0),false);assert.deepEqual(u,before);
});
test('blink, charge and summoned pets stay inside the encounter',()=>{
 const s=fight(),target=s.combat.enemies[0];s.position=34;s.positionY=5;s.rootUntil=1000;
 executeExtendedClassEffect(s,s,s,{Id:1953,SpellName:'Blink'});inside(s);assert.equal(s.position,35);assert.equal(s.rootUntil,0);
 target.position=0;executeExtendedClassEffect(s,s,target,{Id:100,SpellName:'Charge'});inside(s);assert.equal(s.position,0);
 summonClassPet(s,s,{Id:688,SpellName:'Summon Imp',EffectMiscValue1:416});inside(s.pet);assert.ok(s.combat.participantIds.includes(s.pet.id));
});
test('a mage against a wall casts at a rooted pursuer instead of endlessly trying to retreat',()=>{
 const s=fight(),e=s.combat.enemies[0];e.position=4;e.positionY=0;e.rootUntil=10000;e.nextAttack=1e9;
 combatTick(s);inside(s);assert.ok(s.cast,'blocked retreat must allow the selected spell');
});
test('fear movement and enemies remain bounded over sustained simulation and serialization',()=>{
 let s=fight(),e=s.combat.enemies[0];e.hp=e.maxHp=100000;e.nextAttack=1e9;s.auras=[{type:7,caster:e.id,until:10000}];
 const once=advance(s,10000).state;
 for(let i=0;i<100;i++){s=advance(s,s.wallAt+100).state;for(const u of [s,...s.combat.enemies])inside(u);if(i===49)s=JSON.parse(JSON.stringify(s));}
 assert.deepEqual(s,once);
 const projected=projectClientSnapshot(s,view(s));assert.deepEqual(projected.player.combat.area,area);
});
test('Smite reaches a bounded weapon chest even in a small custom room',()=>{
 const s=fight(646),e=s.combat.enemies[0];smiteTick(s,e,[s],hurtPlayer);e.hp=e.maxHp*.6;
 for(s.clock=100;s.clock<30000&&e.smite.phase!==2;s.clock+=100){smiteTick(s,e,[s],hurtPlayer);inside(e);}
 assert.equal(e.smite.phase,2);
});
test('camera remains fixed as units move and projected coordinates remain inside the boundary',()=>{
 const allies=[{id:'a',hp:1,position:1,positionY:0},{id:'b',hp:1,position:1,positionY:0}],first=battleLayout(allies,[],1,area);
 allies[0].position=34;const second=battleLayout(allies,[],1,area);assert.equal(first.scale,second.scale);assert.equal(first.originX,second.originX);assert.equal(first.originY,second.originY);
 for(const p of Object.values(second.units)){assert.ok(p.left*10>=second.originX+area.minX*second.scale&&p.left*10<=second.originX+area.maxX*second.scale);assert.ok(p.top>=second.originY+area.minY*second.scale&&p.top<=second.originY+area.maxY*second.scale);}
});
