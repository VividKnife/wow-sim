import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,view} from '../src/rules/engine.js';
import {summonClassPet} from '../src/rules/class-spell-effects.js';
import {spellInfo} from '../src/rules/character.js';
import {projectClientSnapshot} from '../src/rules/client-snapshot.ts';

function hunter(){
 const s=createGame('兽栏测试',27,0,{classId:3,raceId:3});
 s.location='goldshire';s.level=20;s.money=60000;s.learned.push(883);
 s.hunterPet={entry:299,name:'小狼',level:20,learned:[17253],availableSkills:[17253],trainingPoints:7,loyalty:6};
 summonClassPet(s,s,spellInfo(s,883));
 return s;
}
const command=(s,operation,slot)=>act(s,{type:'petStable',operation,slot},0);

test('stable master is discoverable and hunter pet storage survives serialization',()=>{
 let s=hunter();
 assert.ok(view(s).interactions.some(n=>n.name==='艾玛'&&n.roles.includes('stable')));
 assert.equal(view(s).petStable.capacity,0);
 s=command(s,'buy',0);
 assert.equal(s.money,50000);
 s=command(s,'store',0);
 assert.equal(s.pet,null);assert.equal(s.hunterPet,null);
 assert.equal(s.stablePets[0].name,'小狼');assert.equal(s.stablePets[0].trainingPoints,7);
 s=structuredClone(JSON.parse(JSON.stringify(s)));
 assert.equal(view(s).petStable.slots[0].name,'小狼');
 s=command(s,'withdraw',0);
 assert.equal(s.pet.name,'小狼');assert.equal(s.pet.trainingPoints,7);
 assert.deepEqual(s.pet.learned,[17253]);
 assert.equal(s.stablePets[0],null);
 const snapshot=projectClientSnapshot(s,view(s));
 assert.equal(snapshot.view.petStable.current.name,'小狼');
 assert.equal(snapshot.player.pet.trainingPoints,7);
});

test('a second pet can replace the active pet while each stored profile stays separate',()=>{
 let s=hunter();s=command(s,'buy',0);s=command(s,'buy',1);assert.equal(s.money,0);
 s=command(s,'store',0);
 s.hunterPet={entry:113,name:'大熊',level:19,learned:[],availableSkills:[],trainingPoints:4,loyalty:6};
 summonClassPet(s,s,spellInfo(s,883));
 s=command(s,'withdraw',0);
 assert.equal(s.pet.name,'小狼');assert.equal(s.pet.trainingPoints,7);
 assert.equal(s.stablePets[0].name,'大熊');assert.equal(s.stablePets[0].trainingPoints,4);
 s=command(s,'withdraw',0);
 assert.equal(s.pet.name,'大熊');assert.equal(s.pet.trainingPoints,4);
 assert.equal(s.stablePets[0].name,'小狼');
});

test('stable actions require a stable master, a living pet, and an eligible hunter',()=>{
 const hunterState=hunter();
 assert.throws(()=>command({...hunterState,location:'fargodeep'},'buy',0),/兽栏管理员/);
 assert.throws(()=>command({...hunterState,classId:8},'buy',0),/只有猎人/);
 assert.throws(()=>command({...hunterState,money:9999},'buy',0),/铜币不足/);
 let s=command(hunterState,'buy',0);s.pet.hp=0;
 assert.throws(()=>command(s,'store',0),/复活宠物/);
});

test('stable masters serve hunters of either faction',()=>{
 const s=createGame('部落猎人',28,0,{classId:3,raceId:2});
 s.location='goldshire';s.money=10000;
 assert.ok(view(s).interactions.some(n=>n.roles.includes('stable')));
 assert.equal(command(s,'buy',0).stableCapacity,1);
});
