import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classicStopAction,webTabForClassic} from '../lib/classic-interface.js';
import {createGame,act,advance,view} from '../../../packages/game-domain/src/rules/engine.js';

test('Classic stop uses the real engine: finish the current fight without starting another',()=>{
 let s=createGame('Classic测试',1,0);
 s=act(s,{type:'hunt',id:299},0);
 s=advance(s,1000).state;
 assert.ok(s.combat);
 const action=classicStopAction(s,view(s));
 assert.equal(action.disabled,false);
 s=act(s,action.command,s.clock);
 assert.ok(s.combat,'stopping must not discard the running fight');
 assert.equal(s.activity.type,'idle');
 s=advance(s,s.clock+120000).state;
 assert.equal(s.combat,null);
 assert.ok(s.lastCombat);
 assert.equal(classicStopAction(s,view(s)).disabled,true);
});

test('stop honors ground travel, flight, death and uninterruptible cannon rules',()=>{
 const state=(activity,hp=100)=>({activity,hp});
 assert.equal(classicStopAction(state({type:'travel'}),{}).disabled,true);
 assert.equal(classicStopAction(state({type:'travel',flight:true}),{}).disabled,false);
 assert.equal(classicStopAction(state({type:'travel',flight:true,stopAtNext:true}),{}).disabled,true);
 assert.equal(classicStopAction(state({type:'dead'},0),{}).disabled,true);
 assert.equal(classicStopAction(state({type:'dungeonCannon'}),{}).disabled,true);
});

test('instance pause controls target the active controller',()=>{
 const s={hp:100,activity:{type:'hunt'},dungeon:{}};
 assert.equal(classicStopAction(s,{dungeon:{autoAdvance:true}}).command.type,'dungeonPause');
 assert.equal(classicStopAction(s,{dungeon:{autoAdvance:false}}).disabled,true);
 assert.equal(classicStopAction(s,{guildRaid:{active:true,map:{autoAdvance:true}}}).command.type,'raidPause');
 assert.equal(classicStopAction(s,{goldRaid:{active:true,map:{autoAdvance:true}}}).command.type,'goldPause');
 assert.equal(classicStopAction(s,{goldRaid:{active:true,map:{autoAdvance:false}}}).disabled,true);
});

test('switching maps open Classic panels to existing web destinations',()=>{
 for(const panel of ['character','bag','mounts'])assert.equal(webTabForClassic(panel),'character');
 for(const panel of ['party','dungeon','raid','pvp','log'])assert.equal(webTabForClassic(panel),panel);
 for(const panel of [null,'map','nearby','quests','activities','account'])assert.equal(webTabForClassic(panel),'world');
});
