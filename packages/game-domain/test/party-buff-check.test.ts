import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {createNpcMember} from '../src/rules/party.js';
import {beginPartyBuffs,partyBuffTick,partyBuffCheckView} from '../src/rules/party-buffs.js';
import {stats} from '../src/rules/character.js';
import {buildGameResponse} from '../src/rules/server-response.js';
import type {Rules} from '../src/model.ts';
function fixture(){
 const s:Rules=createGame('团长',667,0);s.level=60;s.learned=[];s.dungeon={};
 const priest:Rules=createNpcMember(s,'priest',{role:'healer'});priest.id='priest';priest.npcPlayer=true;priest.money=100000;priest.mana=0;
 priest.learned=[1243,21562,21564];
 s.party=[priest,...Array.from({length:3},(_,i)=>({...structuredClone(priest),id:'ally'+i,name:'队员'+i,classId:4,learned:[]}))];
 return {s,priest};
}
test('read-only checklist shows missing recipients, the actual caster and mana wait before the first cast',()=>{
 const {s}=fixture();beginPartyBuffs(s);const before=JSON.stringify(s),check=partyBuffCheckView(s)!;
 assert.equal(JSON.stringify(s),before);assert.equal(check.completed,0);assert.equal(check.remainingCasts,1);assert.equal(check.missing,5+check.members.flatMap(m=>m.entries).filter(e=>e.itemId&&e.status!=='ready').length);
 assert.ok(check.unavailable.some(b=>b.name.includes('智慧')));
 for(const m of check.members){const sta=m.entries.find(e=>e.spellId===21564)!;assert.equal(sta.status,'mana');assert.match(sta.reason,/等待回蓝/);assert.ok(sta.caster);}
 assert.equal(s.activity.remaining,1);
});
test('one prayer clears five member gaps, exposes progress through the snapshot, and expires again',()=>{
 const {s,priest}=fixture();beginPartyBuffs(s);priest.mana=stats(priest).maxMana;partyBuffTick(s);
 const check=partyBuffCheckView(s)!;assert.equal(check.present,5);assert.equal(check.missing,check.members.flatMap(m=>m.entries).filter(e=>e.itemId&&e.status!=='ready').length);assert.equal(check.completed,1);assert.equal(check.remainingCasts,0);
 assert.match(check.lastCast!,/5人/);
 const snapshot=buildGameResponse(s,1,{view:{partyBuffCheck:check}}).snapshot!;
 assert.equal((snapshot.view.partyBuffCheck as Rules).members.length,5);assert.equal((snapshot.player.activity as Rules).completed,1);
 assert.ok(!JSON.stringify(snapshot).includes('"queue"'));
 s.clock=3600001;assert.equal(partyBuffCheckView(s)!.missing,5+check.missing);
});
test('dead members are identified separately and inspection remains available after stopping',()=>{
 const {s}=fixture();s.party[1].hp=0;
 const check=partyBuffCheckView(s)!;assert.equal(check.members[2].dead,true);assert.ok(check.members[2].entries.every(e=>e.status==='dead'));assert.equal(check.missing,4+check.members.filter(m=>!m.dead).flatMap(m=>m.entries).filter(e=>e.itemId&&e.status!=='ready').length);assert.equal(check.active,false);
 s.combat={};assert.equal(partyBuffCheckView(s),null);
});
