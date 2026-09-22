import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../../../packages/game-domain/src/rules/engine.js';
import {nodes,route,edges,travelSpeedMultiplier,creatureLocations} from '../../../packages/game-domain/src/rules/catalog.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';

const player=(classId=8)=>{
 const s=createGame('主城访客',23,0,{classId,raceId:classId===7?2:1});
 s.location='stormwind';s.money=100000;s.level=10;return s;
};

test('city districts are reachable and travel only grants access after arrival',()=>{
 for(const id of ['dwarven','cathedral','park','keep'])assert.ok(nodes[id],`missing district ${id}`);
 let s=act(player(),{type:'travel',to:'cathedral'},0);
 assert.equal(s.location,'stormwind');assert.equal(view(s).city.canInteract,false);
 assert.ok(s.activity.endsAt>0);
 s=advance(s,s.activity.endsAt).state;
 assert.equal(s.location,'cathedral');assert.equal(view(s).city.current,'cathedral');
 assert.equal(view(s).city.canInteract,true);
 for(const id of ['dwarven','cathedral','park','keep','oldtown','magetower','bluerecluse'])assert.ok(route('stormwind',id).duration>0);
});

test('tram departs from dwarven district with the global travel boost',()=>{
 const tram=edges.find(e=>e.transport==='tram');
 assert.equal(tram.a,'dwarven');assert.equal(tram.b,'ironforge');
 const s=act({...player(),location:'dwarven'},{type:'travel',to:'ironforge'},0);
 const duration=Math.ceil(180000/travelSpeedMultiplier);
 assert.equal(s.activity.endsAt,duration);assert.equal(s.location,'dwarven');
 assert.equal(advance(s,duration).state.location,'ironforge');
});

test('cathedral trains priests but rejects mage training without charging them',()=>{
 const priest=player(5);priest.location='cathedral';
 const skill=view(priest).skills.find(a=>a.canTrain);
 assert.ok(skill);const trained=act(priest,{type:'train',id:skill.spellId},0);
 assert.ok(trained.learned.includes(skill.spellId));assert.ok(trained.money<priest.money);
 const mage=player();const mageSkill=view({...mage,location:'magetower'}).skills.find(a=>a.canTrain);
 mage.location='cathedral';assert.equal(view(mage).canTrain,false);
 assert.throws(()=>act(mage,{type:'train',id:mageSkill.spellId},0),/训练师/);
 assert.equal(mage.money,100000);
});

test('city services survive client projection and do not grant remote bank access',()=>{
 const s=player();const d=view(s);assert.ok(d.city);
 const projected=projectClientSnapshot(s,d);
 assert.equal(projected.view.city.current,'stormwind');
 assert.ok(projected.view.city.districts.find(x=>x.id==='stormwind').services.some(x=>x.id==='bank'));
 const elsewhere={...s,location:'park'};
 assert.equal(view(elsewhere).bankHere,false);
 assert.throws(()=>act(elsewhere,{type:'expandBank'},0),/银行/);
 assert.equal(view({...s,location:'goldshire'}).city,null);
});

test('city panels report blocked service use for dead characters and travelling players',()=>{
 assert.equal(view({...player(),hp:0}).city.canInteract,false);
 assert.match(view({...player(),hp:0}).city.blockedReason,/死亡/);
 const s=act(player(),{type:'travel',to:'magetower'},0);
 assert.equal(view(s).city.canInteract,false);
 assert.ok(view(s).city.blockedReason);
});

test('district services and quest destinations use their actual city NPC locations',()=>{
 assert.deepEqual(creatureLocations[1646],['cathedral']);
 assert.deepEqual(creatureLocations[1747],['keep']);
 assert.deepEqual(creatureLocations[5413],['dwarven']);
 assert.deepEqual(creatureLocations[12336],['cathedral']);
 assert.ok(view({...player(),location:'dwarven'}).shop.length>0);
 assert.equal(view(player()).hearthstone.hasInn,true);
 assert.equal(view({...player(),location:'magetower'}).quests.find(q=>q.id===1920).startLocations.includes('magetower'),true);
});
