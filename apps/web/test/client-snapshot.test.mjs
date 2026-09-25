import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {enterDungeon} from '../../../packages/game-domain/src/rules/dungeon.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';

test('client snapshot exposes only the player and view allowlists',()=>{
 const state=createGame('边界',17,1000);
 state.rngState=123456;
 state.receipts=[{requestId:'secret-request'}];
 state.presence={lease:'secret-lease'};
 state.unknownAuthority={token:'secret-token'};
 const serverView=view(state);
 state.pet={id:'pet',name:'伙伴',rngState:44,presence:{owner:'hidden'},receipts:['hidden']};
 state.party=[{id:'ally',name:'同伴',rngState:55,presence:{owner:'hidden'},receipts:['hidden']}];
 state.dungeon={id:'run',metrics:{damage:{}},hiddenSpawns:[{entry:999}],rngState:66,receipts:['hidden']};
 const projected=projectClientSnapshot(state,{...serverView,serverSecret:'hidden'});
 assert.deepEqual(Object.keys(projected).sort(),['player','view']);
 assert.equal(projected.player.name,'边界');
 assert.equal(projected.view.className,'法师');
 const encoded=JSON.stringify(projected);
 const keys=[];const visit=value=>{if(value&&typeof value==='object')for(const [key,nested] of Object.entries(value)){keys.push(key);visit(nested);}};visit(projected);
 for(const secret of ['rngState','receipts','presence','unknownAuthority','hiddenSpawns','serverSecret'])assert.equal(keys.includes(secret),false,secret);
 for(const secret of ['secret-token','secret-request','secret-lease'])assert.equal(encoded.includes(secret),false,secret);
});

test('client snapshot retains the fields needed for active play and battle rendering',()=>{
 const state=createGame('可玩',19,1000);
 state.activity={type:'travel',to:'goldshire',startedAt:0,endsAt:5000,path:[{a:'northshire',b:'goldshire',distance:35,duration:5000,startProgress:.2}]};
 state.pet={id:'pet',name:'伙伴',hp:20,equipment:{},learned:[]};
 const projected=projectClientSnapshot(state,view(state));
 assert.equal(projected.player.activity.to,'goldshire');
 assert.deepEqual(projected.player.activity.path,state.activity.path);
 projected.player.activity.path[0].duration=1;
 assert.equal(state.activity.path[0].duration,5000);
 assert.ok(projected.player.bag.length>0);
 assert.equal(projected.player.pet.name,'伙伴');
 assert.ok(projected.view.stats.maxHp>0);
 state.activity={type:'mount',mount:5656,startedAt:0,endsAt:3000};
 assert.equal(projectClientSnapshot(state,view(state)).player.activity.mount,5656);
});

test('unlocked party candidates retain every selectable role',()=>{
 const state=createGame('队长',23,1000);
 state.level=18;
 state.location='stormwind';
 state.completed[900001]=true;
 const projected=projectClientSnapshot(state,view(state));
 assert.ok(projected.view.partyUnlocked);
 assert.ok(projected.view.candidates.length>0);
 for(const candidate of projected.view.candidates){
  assert.ok(Array.isArray(candidate.roles),candidate.id);
  assert.ok(candidate.roles.length>0,candidate.id);
 }
});

test('entered dungeons and battle actors expose no pre-rolled or whole-state internals',()=>{
 const state=createGame('副本边界',53,0);state.level=10;state.location='deadmines';
 state.party=Array.from({length:4},(_,index)=>({...structuredClone(state),id:`ally-${index}`,name:`同伴${index}`,party:[],level:10}));
 enterDungeon(state);
 assert.ok(Object.keys(state.dungeon.spawns).length>0);
 const dungeonSnapshot=projectClientSnapshot(state,view(state));
 assert.equal('spawns' in dungeonSnapshot.player.dungeon,false);
 assert.equal('phases' in dungeonSnapshot.player.dungeon,false);
 assert.deepEqual(Object.keys(dungeonSnapshot.player.dungeon).sort(),['cursor','id','position','runId','startedAt']);
 delete state.dungeon;state.party=[];state.internalPlan={nextBoss:999};startCombat(state,[299]);
 const combatSnapshot=projectClientSnapshot(state,view(state));
 for(const id of [state.id,...state.combat.enemies.map(enemy=>enemy.id)]){
  assert.ok(Number.isFinite(combatSnapshot.view.battleView.units[id].movement.speed));
  assert.ok(Number.isFinite(combatSnapshot.view.battleView.units[id].movement.baseSpeed));
 }
 assert.equal('bag' in combatSnapshot.view.battleView.actors[0],false);
 assert.equal('dungeon' in combatSnapshot.view.battleView.actors[0],false);
 assert.equal('internalPlan' in combatSnapshot.view.battleView.actors[0],false);
});

test('recruited companions retain replacement eligibility in the actual client projection',async()=>{
 const {act}=await import('../../../packages/game-domain/src/rules/engine.js');
 let state=createGame('队长',123,0);state.level=18;
 state=act(state,{type:'recruit',id:'priest'},0);
 const snapshot=projectClientSnapshot(state,view(state));
 assert.equal(snapshot.player.party[0].growthPolicy,'companion');
 const replaceable=snapshot.view.party.filter(c=>c.id!==snapshot.player.id&&c.growthPolicy==='companion');
 assert.equal(replaceable.length,1);assert.equal(replaceable[0].id,state.party[0].id);
 state.money=100000;
 state=act(state,{type:'recruit',id:'paladin',replaceId:replaceable[0].id},0);
 const replaced=projectClientSnapshot(state,view(state));
 assert.equal(replaced.view.party[0].growthPolicy,'companion');assert.equal(replaced.view.party[0].classId,2);
});
