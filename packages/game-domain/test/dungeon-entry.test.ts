import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {SocialService} from '../src/social.ts';
import {authorizeDungeonEntry,bindDungeonEntry,requestDungeonEntry} from '../src/dungeon-entry.ts';
import type {Group} from '../src/social-party.ts';

async function fixture(){
  let now=100000;
  const classes=[1,5,8,4,9],roles=['tank','healer','dps','dps','dps'],ids=['alice','bob','carol','dave','eve'];
  const store=new MemoryStore({characters:ids.map((id,index)=>({id,accountId:id,kind:'hero',rules:{id,name:id,classId:classes[index],level:20,location:'goldshire'}}))});
  const social=new SocialService(store,()=>now);
  const command=(actor:string,body:Record<string,unknown>)=>social.command(actor,actor,{requestId:crypto.randomUUID(),...body});
  for(const [index,id]of ids.entries()){
    await command(id,{type:'role',role:roles[index]});await command(id,{type:'queue',dungeonId:'deadmines'});now++;
  }
  const proposal=(await social.snapshot('alice','alice')).proposal!;
  const accept=async()=>{for(const id of ids)await command(id,{type:'proposal',proposalId:proposal.id,accept:true});};
  const request={accountId:'alice',actorId:'alice',groupId:proposal.groups[0],entryId:proposal.id};
  const actors=ids.map((id,index)=>({id,classId:classes[index],level:20}));
  const checkpoint={instanceId:'dungeon:finder',state:{...actors[0],party:actors.slice(1),dungeon:{id:'deadmines'},dungeonRoster:{groupId:request.groupId,dungeonId:'deadmines',leaderId:'alice',members:ids.map(id=>({id,npc:false}))},sharedParty:{leaderId:'alice',participantIds:ids}},controllers:ids.map(id=>({actorId:id,accountId:id}))};
  return {store,social,command,accept,proposal,request,checkpoint,advance:(ms:number)=>{now+=ms;}};
}

test('accepted finder proposals establish the destination but cannot replace each human manual entry intention',async()=>{
  const f=await fixture();
  await assert.rejects(f.store.transaction(tx=>authorizeDungeonEntry(tx,f.request)),/匹配队伍已改变/);
  await f.accept();
  const before=await f.store.read(tx=>tx.get<Group>('social_groups',f.request.groupId));
  assert.equal(before!.entry!.id,f.proposal.id);
  assert.deepEqual(before!.entry!.requested,[]);
  await assert.rejects(f.store.transaction(tx=>bindDungeonEntry(tx,f.request,f.checkpoint,100000,null)),/各自在副本入口/);
  await assert.rejects(f.store.transaction(tx=>requestDungeonEntry(tx,{...f.request,accountId:'bob'})),/不属于/);
  await assert.rejects(f.store.transaction(tx=>authorizeDungeonEntry(tx,{...f.request,accountId:'bob'})),/不属于/);
  await assert.rejects(f.store.transaction(tx=>authorizeDungeonEntry(tx,{...f.request,entryId:'another-proposal'})),/匹配队伍已改变/);
  assert.ok(await f.store.transaction(tx=>authorizeDungeonEntry(tx,{...f.request,accountId:'eve',actorId:'eve'})));
  await assert.rejects(f.command('bob',{type:'proposal',proposalId:f.proposal.id,accept:true}),/失效/);
  assert.deepEqual(await f.store.read(tx=>tx.get('social_groups',f.request.groupId)),before);
  assert.equal((await f.store.read(tx=>tx.get('characters','alice')))!.rules.location,'goldshire');
  await f.command('eve',{type:'leave'});
  assert.equal((await f.social.snapshot('alice','alice')).group!.entry,undefined);
  await assert.rejects(f.store.transaction(tx=>authorizeDungeonEntry(tx,f.request)),/匹配队伍已改变/);
  await f.command('alice',{type:'partyInvite',targetId:'eve'});
  const invite=(await f.social.snapshot('eve','eve')).incoming[0];
  await f.command('eve',{type:'respond',inviteId:invite.id,accept:true});
  assert.equal((await f.social.snapshot('eve','eve')).group!.entry,undefined,'ordinary invitation grants no finder entry');
});

test('changes to role, leader or reservation invalidate accepted finder entry',async()=>{
  for(const mutation of ['role','leader','claim'] as const){
    const f=await fixture();await f.accept();
    if(mutation==='role')await f.command('alice',{type:'role',role:'dps'});
    else if(mutation==='leader')await f.command('alice',{type:'promote',targetId:'bob'});
    else await f.store.transaction(tx=>tx.put('social_members',{id:'eve',groupId:'other-group'}));
    await assert.rejects(f.store.transaction(tx=>authorizeDungeonEntry(tx,f.request)),/匹配队伍已改变|成员已改变/);
  }
});

test('the binding transaction checks live roster, roles, private controller accounts and target dungeon',async()=>{
  const f=await fixture();await f.accept();
  for(const actorId of ['alice','bob','carol','dave','eve'])await f.store.transaction(tx=>requestDungeonEntry(tx,{...f.request,accountId:actorId,actorId}));
  const mutations=[
    (c:typeof f.checkpoint)=>{c.state.party[0].id='outsider';},
    (c:typeof f.checkpoint)=>{c.controllers[1].accountId='alice';},
    (c:typeof f.checkpoint)=>{c.state.dungeon.id='wailingCaverns';},
    (c:typeof f.checkpoint)=>{c.state.party[0].level=1;},
    (c:typeof f.checkpoint)=>{c.state.classId=8;},
  ];
  for(const mutate of mutations){
    const checkpoint=structuredClone(f.checkpoint);mutate(checkpoint);
    await assert.rejects(f.store.transaction(tx=>bindDungeonEntry(tx,f.request,checkpoint,100000,null)),/不一致|等级|职责|roster|presence/);
    assert.equal((await f.store.read(tx=>tx.get('social_groups',f.request.groupId)))!.instanceId,undefined);
  }
  await assert.rejects(f.store.transaction(async tx=>{await bindDungeonEntry(tx,f.request,f.checkpoint,100000,null);throw new Error('rollback');}),/rollback/);
  assert.equal((await f.store.read(tx=>tx.get('social_groups',f.request.groupId)))!.entry.id,f.proposal.id);
  await f.store.transaction(tx=>bindDungeonEntry(tx,f.request,f.checkpoint,100000,null));
  assert.equal((await f.social.snapshot('bob','bob')).group!.instanceId,'dungeon:finder');
  for(const body of [{type:'leave'},{type:'role',role:'healer'},{type:'queue',dungeonId:'deadmines'}])
    await assert.rejects(f.command(body.type==='role'?'bob':'alice',body),/先离开副本/);
});

test('a timed-out matching proposal cannot be turned into an entry authorization',async()=>{
  const f=await fixture();f.advance(40001);
  await assert.rejects(f.command('alice',{type:'proposal',proposalId:f.proposal.id,accept:true}),/失效/);
  await f.social.snapshot('alice','alice');
  await assert.rejects(f.store.transaction(tx=>authorizeDungeonEntry(tx,f.request)),/匹配队伍已改变/);
});

test('human level differences do not block durable authorization or live entry',async()=>{
 const f=await fixture();await f.accept();
 await f.store.transaction(async tx=>{const row=(await tx.get('characters','bob'))!;row.rules.level=60;await tx.put('characters',row);});
 f.checkpoint.state.party[0].level=60;
 for(const actorId of ['alice','bob','carol','dave','eve'])await f.store.transaction(tx=>requestDungeonEntry(tx,{...f.request,accountId:actorId,actorId}));
 await f.store.transaction(tx=>bindDungeonEntry(tx,f.request,f.checkpoint,100000,null));
});
