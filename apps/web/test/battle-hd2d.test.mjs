import test from 'node:test';
import assert from 'node:assert/strict';
import * as hd from '../lib/battle-hd2d.js';
import {sceneLayout} from '../lib/battle-scene.js';
import {battleGrounds} from '../../../packages/game-data/battle-ground.js';

test('world positions and overlay anchors use the same metric floor',()=>{
 const layout=sceneLayout([{id:'a',position:4,positionY:3}],[],1,{minX:0,maxX:40,minY:-10,maxY:10});
 const p=hd.worldPoint(layout,{x:4,y:3});
 assert.deepEqual(p,hd.unitPoint(layout,'a'));
 assert.ok(Math.abs((hd.worldPoint(layout,{x:9,y:3})[0]-p[0])-5*layout.scale/25)<1e-9);
});
test('each shipped terrain preset has a dedicated local scene theme',()=>{
 for(const key of Object.keys(battleGrounds))assert.equal(hd.groundTheme(key).id,key);
 assert.equal(hd.groundTheme('missing').id,'grass');
});
test('animation respects death, control, casting and real attack events',()=>{
 const u={id:'a',hp:10},hit={actorId:'a',targetId:'b',kind:'damage',shownAt:1000};
 assert.equal(hd.unitAnimation(u,[hit],200,1100,true),'attack');
 assert.equal(hd.unitAnimation({...u,cast:{until:500}},[hit],200,1100,true),'cast');
 assert.equal(hd.unitAnimation({...u,stunUntil:500},[hit],200,1100,true),'stun');
 assert.equal(hd.unitAnimation({...u,hp:0},[hit],200,1100,true),'dead');
 assert.equal(hd.unitAnimation(u,[],200,1100,true),'walk');
 assert.equal(hd.unitAnimation(u,[hit],200,2000,false),'idle');
 assert.equal(hd.unitAnimation(u,[{...hit,shownAt:2000}],200,1100,false),'idle');
});
test('healing is not a melee attack and received damage produces a hit pose',()=>{
 const u={id:'a',hp:10};
 assert.equal(hd.unitAnimation(u,[{actorId:'a',kind:'heal',shownAt:1000}],100,1100,false),'cast');
 assert.equal(hd.unitAnimation(u,[{targetId:'a',kind:'incoming',amount:3,shownAt:1000}],100,1100,false),'hurt');
});
test('render clock never advances ended combat or beyond the available recording',()=>{
 assert.equal(hd.renderClock({clock:100,live:false,sampledAt:0},5000),100);
 assert.equal(hd.renderClock({clock:100,live:true,sampledAt:100,endClock:450},1000),450);
 assert.equal(hd.renderClock({clock:100,live:true,sampledAt:100},10000),1100);
});
test('class roles, creature bodies and transformations have explicit sprite choices',()=>{
 assert.equal(hd.spriteRole({classId:8}),'mage');
 assert.equal(hd.spriteRole({classId:5}),'priest');
 assert.equal(hd.spriteRole({classId:1}),'knight');
 assert.equal(hd.spriteRole({classId:11,form:'bear'}),'wolf');
 assert.equal(hd.spriteRole({creatureType:1}),'wolf');
 assert.equal(hd.spriteRole({foe:true}),'enemy');
});
test('decorative layout is repeatable and independent of gameplay RNG',()=>{
 const a=hd.sceneryLayout('cave'),b=hd.sceneryLayout('cave');
 assert.deepEqual(a,b);assert.notDeepEqual(a,hd.sceneryLayout('grass'));
 assert.ok(a.every(p=>Math.abs(p.x)>15||Math.abs(p.z)>10));
});
test('creature artwork and transformed bodies keep distinct silhouettes',()=>{
 const bear=hd.spriteAppearance({classId:11,form:'bear'},0),cat=hd.spriteAppearance({classId:11,form:'cat'},0),sheep=hd.spriteAppearance({classId:11,polyUntil:500},200);
 assert.equal(bear.src,'/battle/hd2d/forms.png');assert.equal(bear.row,0);assert.equal(cat.row,1);assert.equal(sheep.row,2);
 const enemy={visual:{kind:'npc-model-render',src:'/creatures/portraits/classic-display-447.webp'}};
 assert.equal(hd.spriteAppearance(enemy,0).src,enemy.visual.src);
 assert.equal(hd.spriteAppearance({classId:8},0).row,3);
});
test('manual zoom magnifies the camera while preserving world positions and sizes',()=>{
 const units=[{id:'a',position:0,positionY:0},{id:'b',position:30,positionY:0}];
 const a=sceneLayout(units,[],1),b=sceneLayout(units,[],3);
 const first=hd.cameraFit(a,units,{width:1200,height:600}),last=hd.cameraFit(b,units,{width:1200,height:600});
 assert.ok(Math.abs(last.zoom/first.zoom-3)<1e-9);
 assert.equal(hd.actorScale(b),hd.actorScale(a));
 assert.deepEqual(hd.unitPoint(a,'a'),hd.unitPoint(b,'a'));
 const p=hd.worldPoint(a,{x:10,y:2}),q=hd.worldPoint(b,{x:10,y:2});
 assert.ok(p.every((value,i)=>Math.abs(value-q[i])<1e-9));
 assert.equal(hd.worldRadius(a,5),hd.worldRadius(b,5));
});

test('humanoids, melee reach and spell distance share one yard scale in every room',()=>{
 const caster={id:'a',position:0,positionY:0,classId:8},enemy={id:'b',position:30,positionY:0};
 for(const span of [40,90,180])for(const zoom of [.5,1,3]){
  const layout=sceneLayout([caster],[enemy],zoom,{minX:-20,maxX:span-20,minY:-span/3,maxY:span/3});
  const height=hd.actorHeight(layout,caster),yard=hd.worldRadius(layout,1);
  assert.ok(Math.abs(height/yard-2.8)<1e-9);
  assert.ok(hd.worldRadius(layout,5)>height,'a normal actor must fit inside melee reach');
  const a=hd.unitPoint(layout,'a'),b=hd.unitPoint(layout,'b');
  assert.ok(Math.abs(Math.hypot(b[0]-a[0],b[2]-a[2])/height-30/2.8)<1e-9);
  assert.ok(hd.actorHeight(layout,{rank:3})>height);
  assert.ok(hd.actorHeight(layout,{petUnit:true})<height);
 }
});

test('auto framing preserves actor readability and distance ratios across room sizes',()=>{
 const units=[{id:'a',classId:8,position:0,positionY:0},{id:'b',position:30,positionY:4}];
 let reference;
 for(const span of [40,90,180]){
  const layout=sceneLayout(units,[],1,{minX:-20,maxX:span-20,minY:-span/3,maxY:span/3});
  const fit=hd.cameraFit(layout,units,{width:1200,height:390});
  const pixels=hd.actorHeight(layout,units[0])*fit.zoom;
  assert.ok(pixels>=40&&pixels<=60,`unexpected actor height ${pixels}px`);
  if(reference)assert.ok(Math.abs(pixels-reference)<1e-9);reference=pixels;
 }
});
