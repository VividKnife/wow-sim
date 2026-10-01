import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats,view} from '../src/rules/engine.js';
import {enterDungeon,leaveDungeon} from '../src/rules/dungeon.js';
import {startCombat} from '../src/rules/combat.js';
import {instancePresentation} from '../src/rules/instance-presentation.js';
import {projectClientSnapshot} from '../src/rules/client-snapshot.ts';
function fixture(){const s=createGame('入本法师',283,0,{classId:8,raceId:1});s.id='hero';s.level=20;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.location='deadmines';s.party=Array.from({length:4},(_,i)=>({...structuredClone(s),id:'ally'+i,name:'队友'+i,party:[]}));return s;}

test('entry immediately exposes five current members without creating a fight or mutating rules',()=>{
 const s=fixture();assert.equal(instancePresentation(s),null);enterDungeon(s);const before=structuredClone(s),scene=instancePresentation(s);
 assert.equal(scene.memberCount,5);assert.equal(scene.kind,'dungeon');assert.equal(scene.id,s.dungeon.runId);assert.equal(scene.roomId,'entrance');assert.equal(scene.units.length,5);assert.equal(s.combat,null);assert.equal(s.activity.type,'idle');assert.deepEqual(s,before);
 assert.equal(new Set(scene.units.map(u=>`${u.position}:${u.positionY}`)).size,5);assert.ok(scene.units.every(u=>u.maxHp>0));
 const projected=projectClientSnapshot(s,view(s));assert.deepEqual(projected.view.instanceScene,scene);
 for(const u of scene.units)for(const key of ['money','bag','rngState','learned','simulationEvents','npcWorld','rules','talents'])assert.equal(key in u,false);
});
test('out-of-combat buffs update the resident scene without starting an encounter',()=>{
 let s=fixture();enterDungeon(s);const id=instancePresentation(s).id;s=act(s,{type:'cast',id:168},0);s=advance(s,1000).state;
 const scene=instancePresentation(s);assert.equal(scene.id,id);assert.equal(s.combat,null);assert.ok(scene.units[0].effects.some(e=>e.spellId===168));assert.equal(scene.units[0].mana,s.mana);
});
test('recovery uses current health, not a previous battle snapshot; leaving removes the tableau',()=>{
 const s=fixture();enterDungeon(s);s.lastCombat={actorsSnapshot:[{id:s.id,hp:0}]};s.hp=50;s.party[0].hp=0;s.rest={until:5000};
 const scene=instancePresentation(s);assert.equal(scene.phase,'队伍休整');assert.equal(scene.units[0].hp,50);assert.equal(scene.units[1].hp,0);const saved=JSON.parse(JSON.stringify(s));assert.deepEqual(instancePresentation(saved),scene);leaveDungeon(s);assert.equal(instancePresentation(s),null);
});
test('a live encounter replaces the preparation view without changing its underlying run',()=>{
 const s=fixture();enterDungeon(s);const run=s.dungeon.runId;startCombat(s,[299],true);assert.equal(instancePresentation(s),null);assert.equal(s.dungeon.runId,run);
});
test('public cast presentation includes resurrection and preparation actors, but never timing or input internals',()=>{
 const s=fixture();enterDungeon(s);s.activity={type:'resurrect',caster:'ally0',target:'ally1',spell:2006,startedAt:0,endsAt:10000,timing:{private:true}};
 const cast=instancePresentation(s).units.find(u=>u.id==='ally0').cast;assert.deepEqual(cast,{spell:2006,target:'ally1',startedAt:0,until:10000});
});
