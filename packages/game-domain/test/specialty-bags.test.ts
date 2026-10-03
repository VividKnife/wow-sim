import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createGame,view} from '../src/rules/engine.js';
import {items} from '../src/rules/catalog.js';
import {addItem,makeItem,countItem} from '../src/rules/character.js';
import {bagAccepts,bagFamily,bagLayout,bagSpaceFor,fitsBags,generalBagFree} from '../src/rules/bag-storage.js';
import {putInBag,receive,storageAction} from '../src/rules/inventory.js';
import {collectLoot} from '../src/rules/loot.js';
import {applyMailClaim} from '../src/mail.ts';
import {itemView} from '../src/rules/client-content.js';
import {projectClientSnapshot} from '../src/rules/client-snapshot.ts';

function hero(){const s:any=createGame('背包测试',731,0);s.level=60;s.money=100000;s.location='stormwind';s.bag=[];s.bags=[];return s;}
const pairs=[[2101,2512,2516],[2102,2516,2512],[21340,6265,10940],[22250,765,10940],[22246,10940,765]];
for(const [bagId,allowed,denied] of pairs)test(`${bagId} accepts only its catalog family when general storage is full`,()=>{
 const s=hero();s.bags=[makeItem(s,bagId)];s.bag=Array.from({length:16},()=>makeItem(s,25));
 assert.equal(generalBagFree(s),0);assert.equal(bagSpaceFor(s,denied),0);
 assert.ok(bagAccepts(items[bagId],items[allowed]));assert.ok(!bagAccepts(items[bagId],items[denied]));
 assert.ok(addItem(s,allowed,1,false));assert.equal(addItem(s,denied,1,false),false);
 const layout=bagLayout(s);assert.equal(layout.overflow.length,0);assert.equal(layout.containers[1].uids.length,1);assert.equal(s.pending.length,0);
});
test('all catalog containers have a defined type, including zero-family quivers and profession bags',()=>{
 for(const item of Object.values(items) as any[])if(item.ContainerSlots>0){assert.notEqual(bagFamily(item),null,`${item.entry}`);assert.equal(itemView(item.entry)!.bagSlots,item.ContainerSlots);}
 assert.equal(bagFamily(items[2101]),1);assert.equal(bagFamily(items[22246]),7);
 assert.ok(!bagAccepts(items[2101],items[1281]),'quivers cannot hold other quivers with an arrow family flag');
});
test('sorting merges stacks and places enchantments, herbs and ammunition in matching bags first',()=>{
 const s=hero();s.bags=[makeItem(s,22246),makeItem(s,22250),makeItem(s,2101),makeItem(s,2102)];
 for(const [id,count] of [[10940,3],[2516,20],[765,2],[25,1],[10940,4],[2512,80],[6265,1]])s.bag.push(makeItem(s,id,count));
 const total=Object.fromEntries([10940,2516,765,25,2512,6265].map(id=>[id,countItem(s,id)]));storageAction(s,{type:'sortBag'});
 const groups=bagLayout(s).containers;
 for(const [index,id] of [[1,10940],[2,765],[3,2512],[4,2516]])assert.ok(groups[index].uids.every(uid=>s.bag.find((i:any)=>i.uid===uid).id===id));
 assert.equal(s.bag.filter((i:any)=>i.id===10940).length,1);for(const [id,count] of Object.entries(total))assert.equal(countItem(s,Number(id)),count);
 const saved=JSON.parse(JSON.stringify(s));assert.deepEqual(bagLayout(saved),bagLayout(s));storageAction(saved,{type:'sortBag'});assert.deepEqual(saved.bag,s.bag);
});
test('full specialty bags spill into general storage, never a different specialty bag',()=>{
 const s=hero();s.bags=[makeItem(s,2101),makeItem(s,22246)];addItem(s,2512,1400,false);
 const layout=bagLayout(s);assert.equal(layout.containers[1].uids.length,6);assert.equal(layout.containers[0].uids.length,1);assert.equal(layout.containers[2].uids.length,0);
 assert.ok(fitsBags(s));
});
test('sorting preserves distinct locked, bound and enchanted stacks',()=>{
 const s=hero();s.bags=[makeItem(s,22246)];s.bag=[makeItem(s,10940,2),{...makeItem(s,10940,3),locked:true},{...makeItem(s,10940,4),bound:true}];
 storageAction(s,{type:'sortBag'});assert.equal(s.bag.length,3);assert.equal(s.bag.find((i:any)=>i.locked).count,3);assert.equal(s.bag.find((i:any)=>i.bound).count,4);
});
test('equipping, replacing and removing bags validate the resulting layout atomically',()=>{
 let s=hero();addItem(s,22246);const uid=s.bag[0].uid;s=act(s,{type:'equipBag',uid},0);assert.equal(s.bags[0].id,22246);
 s.bag=Array.from({length:15},()=>makeItem(s,25));addItem(s,10940,20,false);addItem(s,2101,1,false);const quiver=s.bag.find((i:any)=>i.id===2101),before=structuredClone(s);
 assert.throws(()=>act(s,{type:'equipBag',uid:quiver.uid,slot:0},0),/空间不足/);assert.deepEqual(s,before);
 assert.throws(()=>act(s,{type:'unequipBag',slot:0},0),/空间不足/);
 s.bag=s.bag.filter((i:any)=>i.id!==25);s=act(s,{type:'equipBag',uid:quiver.uid,slot:0},0);assert.equal(s.bags[0].id,2101);assert.ok(s.bag.some((i:any)=>i.uid===uid));
 s=act(s,{type:'unequipBag',slot:0},0);assert.equal(s.bags.length,0);assert.ok(s.bag.some((i:any)=>i.uid===quiver.uid));
});
test('bag equipment validates level, ownership and explicit slots',()=>{
 const s=hero();addItem(s,8217);const i=s.bag[0];s.level=1;assert.throws(()=>act(s,{type:'equipBag',uid:i.uid},0));s.level=60;
 i.locked=true;assert.throws(()=>act(s,{type:'equipBag',uid:i.uid},0));i.locked=false;i.ownerId='other';assert.throws(()=>act(s,{type:'equipBag',uid:i.uid},0));delete i.ownerId;
 for(const slot of [-1,4,1.5,3])assert.throws(()=>act(s,{type:'equipBag',uid:i.uid,slot},0));
});
test('buying and receiving cannot use empty specialty slots for unrelated items',()=>{
 let s=hero();s.bags=[makeItem(s,22246)];s.bag=Array.from({length:16},()=>makeItem(s,25));
 const before=structuredClone(s);assert.throws(()=>act(s,{type:'buy',id:159,count:1},0),/空间不足/);assert.deepEqual(s,before);
 assert.throws(()=>putInBag(s,makeItem(s,159)),/空间不足/);assert.throws(()=>receive(s,159,1),/空间不足/);assert.equal(countItem(s,159),0);
 receive(s,10940,5);assert.equal(countItem(s,10940),5);
});
test('loot keeps incompatible items pending and collects compatible materials',()=>{
 const s=hero();s.bags=[makeItem(s,22246)];s.bag=Array.from({length:16},()=>makeItem(s,25));s.pending=[makeItem(s,159,2),makeItem(s,10940,7)];
 collectLoot(s);assert.equal(countItem(s,10940),7);assert.equal(countItem(s,159),0);assert.equal(s.pending.length,1);assert.equal(s.pending[0].id,159);
});
test('bank withdrawal and instance mail attachments follow the same bag rules',()=>{
 const s=hero();s.bags=[makeItem(s,2101)];s.bag=Array.from({length:16},()=>makeItem(s,25));s.bank=[makeItem(s,159,1),makeItem(s,2512,20)];
 assert.throws(()=>storageAction(s,{type:'bankWithdraw',uid:s.bank[0].uid,count:1}),/空间不足/);assert.equal(s.bank[0].count,1);
 storageAction(s,{type:'bankWithdraw',uid:s.bank[1].uid,count:20});assert.equal(countItem(s,2512),20);
 const water=makeItem(s,159,1);assert.throws(()=>applyMailClaim(s,{copper:1,attachments:[{kind:'instance',id:159,count:1,name:'water',icon:null,item:water}]}),/空间不足/);
 const arrow=makeItem(s,2512,10);applyMailClaim(s,{copper:1,attachments:[{kind:'instance',id:2512,count:10,name:'arrow',icon:null,item:arrow}]});assert.equal(countItem(s,2512),30);
});
test('full ordinary storage blocks hunting despite spare quiver slots and publishes separate capacity',()=>{
 const s=hero();s.location='northwood';s.bags=[makeItem(s,2101)];s.bag=Array.from({length:16},()=>makeItem(s,25));
 const d=view(s);assert.equal(d.bagCapacity,22);assert.equal(d.generalBagFree,0);assert.equal(d.inventoryBags[1].free,6);
 const snapshot=projectClientSnapshot(s,d);assert.deepEqual(snapshot.view.inventoryBags,d.inventoryBags);
 assert.throws(()=>act(s,{type:'hunt',id:6},0),/背包/);
});

test('specialty overflow remains stable across repeated sorting and restored snapshots',()=>{
 const s=hero();s.bags=[makeItem(s,2101)];addItem(s,2512,1200,false);addItem(s,2515,200,false);
 storageAction(s,{type:'sortBag'});const expected=bagLayout(s),saved=structuredClone(s.bag);
 storageAction(s,{type:'sortBag'});assert.deepEqual(s.bag,saved);assert.deepEqual(bagLayout(s),expected);
 assert.deepEqual(bagLayout(JSON.parse(JSON.stringify(s))),expected);
});
