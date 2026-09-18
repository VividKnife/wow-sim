import {recruitForTest} from './support/party-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats,view} from '../../../packages/game-domain/src/rules/engine.js';
import {enterDungeon,dungeonRoute} from '../../../packages/game-domain/src/rules/dungeon.js';
import {addItem} from '../../../packages/game-domain/src/rules/character.js';

function group(){let s=createGame('副本界面测试',283,0);s.level=18;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;for(const id of ['warrior','priest','rogue','mage'])s=recruitForTest(s,{type:'recruit',id},0);s.location='deadmines';return s;}

test('entry view explains unmet requirements and reads saved progress without rolling new enemies',()=>{
 const low=createGame('新角色',283,0);assert.ok(view(low).dungeon.entryReason);
 const s=group(),before=structuredClone(s);assert.equal(view(s).dungeon.canEnter,true);assert.deepEqual(s,before);
 enterDungeon(s);const active=view(s).dungeon;assert.equal(active.total,58);assert.equal(active.current.enemies.reduce((n,e)=>n+e.count,0),2);assert.equal(active.canNext,true);
 const left=act(s,{type:'leaveDungeon'},0),saved=structuredClone(left);
 assert.equal(view(left).dungeon.saved,true);assert.equal(view(left).dungeon.active,false);assert.deepEqual(left,saved);
});

test('dungeon view gates combat, movement, corpses, full bags and interaction requirements',()=>{
 let s=group();enterDungeon(s);
 s=act(s,{type:'dungeonNext'},s.wallAt);assert.equal(view(s).dungeon.canNext,false);assert.equal(view(s).dungeon.canLeave,false);
 s.combat=null;s.activity={type:'idle'};s.party[0].hp=0;assert.equal(view(s).dungeon.canNext,false);assert.equal(view(s).recovery.canRevive,true);
 s.party[0].hp=stats(s.party[0]).maxHp;s.pending=[{id:25,count:1}];assert.equal(view(s).dungeon.canNext,false);s.pending=[];
 s.dungeon.cursor=dungeonRoute.findIndex(e=>e.id==='dm-cannon');let d=view(s).dungeon;assert.equal(d.canInteract,false);assert.match(d.interactionReason,/火药/);assert.equal(d.canNext,false);
 addItem(s,5397);d=view(s).dungeon;assert.equal(d.canInteract,true);assert.equal(d.interactionLabel,'装填火炮');
});

test('a dead leader can let the living priest recover before resurrecting them',()=>{
 let s=group();enterDungeon(s);s.hp=0;s.activity={type:'dead'};const priest=s.party.find(c=>c.classId===5);priest.mana=0;addItem(s,159,5);
 const status=view(s).recovery;assert.equal(status.canRest,true);assert.equal(status.fallen.find(c=>c.id===s.id).canResurrect,false);
 s=act(s,{type:'rest'},0);assert.ok(s.party.find(c=>c.classId===5).rest);
 s=advance(s,18000,{}).state;assert.equal(s.hp,0);assert.ok(s.party.find(c=>c.classId===5).mana>0);
});

test('completed and optional route states remain distinct instead of counting skips as kills',()=>{
 const s=group();enterDungeon(s);const optional=dungeonRoute.find(e=>e.optional);s.dungeon.skipped[optional.id]=true;s.dungeon.cleared[dungeonRoute[0].id]=true;s.dungeon.cursor=dungeonRoute.length;s.dungeon.completedAt=100;
 const d=view(s).dungeon;assert.equal(d.completed,true);assert.equal(d.canNext,false);assert.equal(d.canLeave,true);
 assert.equal(d.route.find(e=>e.id===optional.id).status,'skipped');assert.equal(d.route[0].status,'cleared');
});

test('resurrection controls require stopping outdoor hunting even between pulls',()=>{
 let s=group();s.location='northshire';s.party[0].hp=0;
 s=act(s,{type:'hunt',id:view(s).monsters[0].id},0);
 const fallen=view(s).recovery.fallen[0];assert.equal(fallen.canResurrect,false);assert.ok(fallen.reason);
 assert.throws(()=>act(s,{type:'resurrect',target:fallen.id},0),/当前活动/);
 s=act(s,{type:'stop'},0);assert.equal(view(s).recovery.fallen[0].canResurrect,true);
 s=act(s,{type:'resurrect',target:fallen.id},0);assert.equal(s.activity.type,'resurrect');
});
