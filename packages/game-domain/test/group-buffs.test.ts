import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {createNpcMember} from '../src/rules/party.js';
import {spellInfo,knownRank,stats} from '../src/rules/character.js';
import {groupBuffRequests,groupBuffTargets,buffReagents} from '../src/rules/group-buffs.js';
import {beginPartyBuffs,partyBuffTick} from '../src/rules/party-buffs.js';
import {buildGameResponse} from '../src/rules/server-response.js';
import type {Rules} from '../src/model.ts';
function fixture(){
 const s:Rules=createGame('分组',491,0);s.level=60;
 const c:Rules=createNpcMember(s,'priest',{role:'healer'});c.money=100000;c.learned.push(21562,21564);c.bag=[{id:17029,count:5}];
 s.party=Array.from({length:24},(_,i)=>({...structuredClone(c),id:'member-'+i}));
 return {s,c:s.party[0]};
}
test('25 targets require five one-hour prayers and five real reagents',()=>{
 const {s,c}=fixture(),sp=spellInfo(c,knownRank(c,1243));
 const rows=groupBuffRequests(s,[s,...s.party].map(target=>({c,target,sp})));
 assert.equal(rows.length,5);
 for(const r of rows){assert.equal(r.targets.length,5);assert.equal(r.sp.Id,21564);assert.equal(r.sp.durationMs,3600000);assert.equal(buffReagents(c,r.sp,true),true);}
 assert.equal(c.bag.length,0);assert.equal(c.money,100000);
});
test('greater blessings follow class across squads; shadow prayer lasts twenty minutes',()=>{
 const {s,c}=fixture();s.party.forEach((c:Rules,i:number)=>c.classId=i%2?1:5);
 const targets=groupBuffTargets(s,c,spellInfo(c,25898));assert.equal(targets.length,12);assert.ok(targets.every(t=>t.classId===5));
 assert.equal(spellInfo(c,25898).durationMs,900000);assert.equal(spellInfo(c,27683).durationMs,1200000);
});
test('no group knowledge/materials uses single buffs; NPC purchases are charged once per cast',()=>{
 const {s,c}=fixture(),sp=spellInfo(c,knownRank(c,1243)),requests=[s,...s.party].slice(0,5).map(target=>({c,target,sp}));
 c.bag=[];c.npcPlayer=false;assert.equal(groupBuffRequests(s,requests).length,5);
 c.npcPlayer=true;const group=groupBuffRequests(s,requests);assert.equal(group.length,1);
 const before=c.money;assert.ok(buffReagents(c,group[0].sp,true));assert.ok(c.money<before);
 c.money=0;assert.equal(groupBuffRequests(s,requests).length,5);
 c.money=before;c.learned=c.learned.filter((id:number)=>![21562,21564].includes(id));assert.equal(groupBuffRequests(s,requests).length,5);
});
test('one group cast spends mana/material once, applies improved stats to one squad, and publishes one sound event',()=>{
 const {s,c}=fixture();s.party.forEach((actor:Rules)=>{if(actor!==c)actor.learned=[];});s.learned=[];
 s.goldRaid={active:true,phase:'camp'};c.mana=stats(c).maxMana;
 beginPartyBuffs(s);const row=s.activity.queue.find((r:Rules)=>r.spell===21564);s.activity.queue=[row];
 const before=c.mana,sp=spellInfo(c,21564);partyBuffTick(s);
 assert.equal(before-c.mana,sp.mana);assert.equal(c.bag[0].count,4);
 assert.equal([s,...s.party].filter(a=>a.classBuffs?.some((b:Rules)=>b.spell===21564)).length,5);
 assert.equal(s.logs.filter((l:Rules)=>l.spellId===21564).length,1);
 assert.equal(s.logs.at(-1).targetIds.length,5);
 // A single-target buff of the same family must not stack with the prayer.
 const first=[s,...s.party][0];assert.equal(first.classBuffs.filter((b:Rules)=>b.name==='Power Word: Fortitude').length,1);
 const snapshot=buildGameResponse(s,1,{view:{}}).snapshot!;const activity=snapshot.player.activity as Rules;assert.equal(activity.completed,1);assert.ok(!('queue' in activity));
});
