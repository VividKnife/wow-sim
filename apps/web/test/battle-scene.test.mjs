import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneLayout,unitBody,createSceneMotion} from '../lib/battle-scene.js';
import {fieldPoint} from '../lib/combat-view.js';
import {creatureVisual} from '../lib/creature-visuals.js';
import {moveToward} from '../../../packages/game-domain/src/rules/combat-space.js';

test('miniatures preserve overlapping world feet and remain stable when the roster changes',()=>{
 const area={minX:0,maxX:40,minY:-10,maxY:10},units=[{id:'a',position:10,positionY:2},{id:'b',position:10,positionY:2}];
 const layout=sceneLayout(units,[],1,area),p=fieldPoint(layout,{x:10,y:2});
 assert.deepEqual(layout.units.a,layout.units.b);
 assert.deepEqual(layout.units.a,{left:p.x/10,top:p.y});
 assert.deepEqual(layout.units.a,sceneLayout(units.slice(0,1),[],1,area).units.a);
 assert.equal(layout.scaleY/layout.scale,.62);
});
test('snapshot movement interpolates continuously and resets on encounter changes',()=>{
 const motion=createSceneMotion(),layout=x=>({units:{a:{left:x,top:10}}});
 motion.update(layout(0),'one',0);motion.update(layout(18),'one',10);
 assert.equal(motion.read(layout(18),100).units.a.left,9);
 motion.update(layout(27),'one',100);
 assert.equal(motion.read(layout(27),100).units.a.left,9);
 assert.equal(motion.read(layout(27),190).units.a.left,18);
 assert.equal(motion.read(layout(27),1000).units.a.left,27);
 motion.update(layout(50),'two',1000);assert.equal(motion.read(layout(50),1000).units.a.left,50);
 motion.update(layout(60),'two',1001,true);assert.equal(motion.read(layout(60),1001).units.a.left,60);
});
test('species and relative sizes distinguish miniatures',()=>{
 assert.equal(unitBody({visual:creatureVisual({entry:636})},12).kind,'humanoid');
 assert.equal(unitBody({creatureType:1},12).kind,'beast');
 assert.equal(unitBody({visual:{species:'spider'}},12).kind,'spider');
 assert.ok(unitBody({rank:3},12).height>unitBody({},12).height);
});
function walkers(){const s={id:'a',hp:100,position:0,positionY:0,moveSpeed:7,party:[{id:'b',hp:100,position:1,positionY:0}],combat:{participantIds:['a','b'],area:{minX:-10,maxX:20,minY:-10,maxY:10}}};return s;}
test('walking gently steers around allies within the original speed budget',()=>{
 const s=walkers(),target={position:10,positionY:0};moveToward(s,s,target,0,0);
 assert.ok(s.positionY!==0);assert.ok(s.position>.6);assert.ok(Math.hypot(s.position,s.positionY)<=.7+1e-9);
});
test('spacing never starts a walk in range, changes a cast or overrides roots',()=>{
 const s=walkers();s.cast={spell:1,until:1000};const cast=structuredClone(s.cast);
 assert.equal(moveToward(s,s,{position:1},5,0),false);assert.deepEqual(s.cast,cast);assert.equal(s.positionY,0);
 s.rootUntil=1000;assert.equal(moveToward(s,s,{position:10},0,0),false);assert.equal(s.position,0);
});
