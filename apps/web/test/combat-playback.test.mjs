import test from 'node:test';
import assert from 'node:assert/strict';
import {createCombatPlayback,playbackPerspective,combatPollDelay} from '../lib/combat-playback.js';

const recording={id:'r',startsAt:1000,endsAt:2000,startClock:0,endClock:1000,serverNow:1300,
 initial:{player:{id:'hero',clock:0,hp:100,combat:{id:'fight'},logs:[]},view:{battleView:{actors:[{id:'hero',hp:100,stats:{maxHp:100}},{id:'helper',hp:50,stats:{maxHp:50}}],units:{hero:{resource:1},helper:{resource:2}}}}},
 frames:[{clock:200,operations:[{op:'set',path:['player','clock'],value:200}]},{clock:700,operations:[{op:'set',path:['player','clock'],value:700}]}]};
test('playback uses server time, catches up on resume, never reverses and clamps at the segment end',()=>{
 const cursor=createCombatPlayback(recording,500);
 assert.equal(cursor.read(500).snapshot.player.clock,200);
 assert.equal(cursor.read(800).clock,600);
 assert.equal(cursor.read(550).clock,600);
 const end=cursor.read(10000);assert.equal(end.ended,true);assert.equal(end.clock,1000);assert.equal(end.snapshot.player.clock,700);
 assert.equal(recording.initial.player.clock,0);
});
test('playback perspective preserves authoritative inventory and selected actor identity',()=>{
 const base={id:'helper',hp:12,bag:[{id:'item'}],money:30};
 const result=playbackPerspective(base,{stats:{maxHp:50}},recording.initial,1000);
 assert.equal(result.state.id,'helper');assert.equal(result.state.hp,50);assert.equal(result.state.money,30);
 assert.equal(result.state.bag,base.bag);assert.equal(result.data.battleView.playerId,'helper');
 assert.equal(result.state.playbackUntil,1000);
});
test('recorded combat uses only low frequency heartbeat polls',()=>{
 assert.equal(combatPollDelay(recording,true),2000);
 assert.equal(combatPollDelay(recording,false),2000);
 assert.equal(combatPollDelay(null,true),200);
});
