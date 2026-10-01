import {seedCompanion} from './support/characters.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import type {Character,Rules,Item} from '../src/model.ts';

async function fixture(){let now=1000;const store=new MemoryStore(),service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>123});const primary=await service.createAccount('a',{name:'Payer',classId:8,raceId:1},'create');const payer=primary.account.primaryCharacterId;const add=async(name:string)=>{const result=await seedCompanion(service,'a',{type:'createCompanion',name,classId:8,raceId:1,requestId:name});return result.roster.find(c=>c.name===name)!.id;};return{store,service,payer,actor:await add('Actor'),recipient:await add('Recipient'),time:(value:number)=>{now=value;}};}
async function configure(f:Awaited<ReturnType<typeof fixture>>,profession:string,skill:number){await f.store.transaction(async tx=>{for(const id of [f.actor,f.payer,f.recipient]){const c=(await tx.get<Character>('characters',id))!;c.professionReadyAt={unrelated:90000};if(id===f.actor)c.rules.professions={[profession]:{skill,cap:300}};await tx.put('characters',c);}});}
async function asset(f:Awaited<ReturnType<typeof fixture>>,id:number,count:number,data:Rules={}){const uid=`${id}-asset`;await f.store.transaction(tx=>tx.insert('items',{id:uid,accountId:'a',ownerCharacterId:f.payer,container:'bag',position:100,data:{id,count,...data},source:'fixture'}));return uid;}
for(const recall of [false,true])test(`superior enchanting rod is reserved by UID and restored unchanged after ${recall?'recall':'completion'}`,async()=>{const f=await fixture();await configure(f,'enchanting',1);await asset(f,10940,1);const uid=await asset(f,6339,1,{bound:true,ownerId:f.payer,locked:true,durability:7,enchant:123,issued:false});const original=(await f.store.transaction(tx=>tx.get<Item>('items',uid)))!;
 const start=await f.service.command('a',{type:'craft',characterId:f.actor,payerId:f.payer,recipientId:f.recipient,id:'spell-7418',count:1,requestId:'craft'});assert.equal((await f.store.transaction(tx=>tx.get<Item>('items',uid)))!.container,'reservation');
 if(recall)await f.service.command('a',{type:'recall',activityId:start.activities[0].id,requestId:'recall'});f.time(4000);assert.deepEqual((await f.service.work()).errors,[]);await f.service.work();
 const restored=(await f.store.transaction(tx=>tx.get<Item>('items',uid)))!;assert.equal(restored.container,'bag');assert.deepEqual(restored.data,original.data);assert.equal(restored.ownerCharacterId,f.payer);
 const received=(await f.service.snapshot('a',f.recipient)).state.bag.filter((i:Rules)=>i.id===907418);assert.equal(received.length,recall?0:1);assert.equal((await f.service.snapshot('a')).state.bag.some((i:Rules)=>i.id===10940),recall);
});
test('craft cooldown updates actor only and does not extend unrelated payer/recipient deadlines',async()=>{const f=await fixture();await configure(f,'alchemy',225);await asset(f,3575,1);const uid=await asset(f,9149,1,{bound:true,ownerId:f.payer,durability:9});await f.service.command('a',{type:'craft',characterId:f.actor,payerId:f.payer,recipientId:f.recipient,id:'spell-11479',count:1,requestId:'craft'});f.time(10000);assert.deepEqual((await f.service.work()).errors,[]);
 for(const id of [f.actor,f.payer,f.recipient]){const c=(await f.store.transaction(tx=>tx.get<Character>('characters',id)))!;assert.equal(c.professionReadyAt.unrelated,90000);assert.equal(c.professionReadyAt['category-310'],id===f.actor?86404000:undefined);}assert.equal((await f.store.transaction(tx=>tx.get<Item>('items',uid)))!.data.durability,9);
});
test('bound craft output rejects other recipient before reserving assets',async()=>{const f=await fixture();await configure(f,'blacksmithing',285);await assert.rejects(f.service.command('a',{type:'craft',characterId:f.actor,payerId:f.payer,recipientId:f.recipient,id:'spell-15296',count:1,requestId:'bound'}),/绑定产物/);assert.equal((await f.store.transaction(tx=>tx.list('reservations'))).length,0);assert.equal((await f.store.transaction(tx=>tx.list('actor_leases'))).length,0);});

for(const whole of [false,true])for(const recall of [false,true])test(`${whole?'whole':'split'} material escrow retains identity through ${recall?'refund':'consumption'}`,async()=>{
 const f=await fixture();await configure(f,'firstaid',1);
 const uid=await asset(f,2589,whole?2:5,{enchant:123});
 const started=await f.service.command('a',{type:'craft',characterId:f.actor,payerId:f.payer,recipientId:f.recipient,id:'spell-3275',count:2,requestId:'craft'});
 const reservation=(await f.store.read(tx=>tx.list<Rules>('reservations')))[0],material=reservation.materials[0];
 assert.equal(material.count,2);assert.equal(material.data.enchant,123);
 assert.equal(material.assetId===uid,whole);
 assert.equal((await f.store.read(tx=>tx.get<Item>('items',material.assetId)))!.container,'reservation');
 assert.equal((await f.service.snapshot('a',f.payer)).state.bag.filter((i:Rules)=>i.id===2589).reduce((n:number,i:Rules)=>n+i.count,0),whole?0:3);
 if(recall)await f.service.command('a',{type:'recall',activityId:started.activities[0].id,requestId:'recall'});
 f.time(4000);assert.deepEqual((await f.service.work()).errors,[]);
 const rows=await f.store.read(tx=>tx.list<Item>('items'));
 assert.equal(rows.filter(row=>row.container==='reservation').length,0);
 const original=rows.find(row=>row.id===uid);
 if(recall){assert.equal(original!.data.count,whole?2:5);assert.equal(original!.data.enchant,123);assert.equal(original!.container,'bag');}
 else if(whole)assert.equal(original,undefined);
 else assert.equal(original!.data.count,3);
 const outputs=rows.filter(row=>row.ownerCharacterId===f.recipient&&row.data.id===1251);
 assert.equal(outputs.reduce((n,row)=>n+row.data.count,0),recall?0:2);
 const ledger=await f.store.read(tx=>tx.list<Rules>('ledger'));
 const clothDelta=ledger.filter(row=>row.itemId===2589).reduce((n,row)=>n+row.amount,0);
 assert.equal(clothDelta,recall?0:-2,'reserve, consume/refund and stack merging balance in the ledger');
 await f.service.work();assert.deepEqual(await f.store.read(tx=>tx.list<Item>('items')),rows);
});
