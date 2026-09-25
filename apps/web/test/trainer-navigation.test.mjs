import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../../../packages/game-domain/src/rules/engine.js';
import {canTrainAt} from '../../../packages/game-domain/src/rules/city.js';
import {canTrainProfession} from '../../../packages/game-domain/src/rules/professions.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {trainerNavigation} from '../lib/trainer-navigation.js';

test('nearest trainer uses reachable route time and the requested training service',()=>{
 const s=createGame('导航',8,0);
 const map=[{id:'unreachable',canTrain:true,travel:null},{id:'far',canTrain:true,travel:500},{id:'near',canTrain:true,travel:100},{id:'workshop',canTrainProfession:true,travel:20}];
 assert.equal(trainerNavigation(s,map,'class').target.id,'near');
 assert.equal(trainerNavigation(s,map,'profession').target.id,'workshop');
 assert.equal(trainerNavigation(s,[],'class').reason,'暂无可到达的训练师');
});

test('public snapshot supports navigation and arrival at usable class and profession trainers',()=>{
 for(const kind of ['class','profession']){
  let s=createGame('训练师导航',8,0);s.location='northwood';
  const snapshot=projectClientSnapshot(s,view(s));
  const navigation=trainerNavigation(snapshot.player,snapshot.view.map,kind);
  assert.equal(navigation.reason,'');
  assert.ok(navigation.target.travel>0);
  s=act(s,{type:'travel',to:navigation.target.id},s.clock);
  assert.equal(s.activity.type,'travel');
  s=advance(s,s.activity.endsAt).state;
  assert.equal(s.location,navigation.target.id);
  assert.ok((kind==='class'?canTrainAt:canTrainProfession)(s));
  assert.equal(trainerNavigation(s,view(s).map,kind).here,true);
 }
});

test('training destinations respect class availability and are shared across factions',()=>{
 const s=createGame('训练师',8,0);s.location='oldtown';
 const mageMap=view(s).map;
 assert.equal(mageMap.find(n=>n.id==='oldtown').canTrain,false);
 s.classId=1;
 assert.equal(view(s).map.find(n=>n.id==='oldtown').canTrain,true);
 s.raceId=2;
 assert.equal(view(s).map.find(n=>n.id==='oldtown').canTrain,true);
});

test('navigation handles arrival, an existing journey, and blocked player states',()=>{
 const s=createGame('导航',8,0),map=[{id:'goldshire',name:'闪金镇',canTrain:true,travel:100}];
 const reason=patch=>trainerNavigation({...s,...patch},map,'class').reason;
 assert.equal(reason({hp:0}),'请先复活');
 assert.equal(reason({combat:{}}),'战斗结束后可导航');
 assert.equal(reason({dungeon:{}}),'请先离开副本');
 assert.equal(reason({escort:{}}),'请先结束护送');
 assert.equal(reason({activity:{type:'craft'}}),'请先结束当前活动');
 assert.equal(reason({activity:{type:'travel',flight:true}}),'飞行结束后可导航');
 assert.equal(reason({activity:{type:'travel',to:'goldshire'}}),'正在前往训练师');
 assert.equal(reason({activity:{type:'travel',to:'echo'}}),'');
 assert.equal(reason({location:'goldshire'}),'已在训练师所在地');
});
