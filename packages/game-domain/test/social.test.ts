import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {SocialService} from '../src/social.ts';
import {PGlite} from '@electric-sql/pglite';
import {PostgresStore,type SqlPool} from '../../persistence/src/postgres.ts';
import type {Store} from '../../persistence/src/store.ts';
import {dungeonDefinitions} from '../src/rules/dungeon-registry.js';
function pool(db:PGlite):SqlPool{let tail=Promise.resolve();return {async connect(){const previous=tail;let release!:()=>void;tail=new Promise(r=>release=r);await previous;return {query:async(sql,values)=>sql.includes('CREATE TABLE')?(await db.exec(sql),{rows:[]}):db.query(sql,values),release};},end:()=>db.close()};}
async function fixture(store:Store=new MemoryStore()){
 let now=100000;const social=new SocialService(store,()=>now);
 await store.transaction(async tx=>{for(const [id,classId] of [['alice',8],['bob',5],['carol',1],['dave',4],['eve',9]] as const)await tx.insert('characters',{id,accountId:id,kind:'hero',rules:{name:id,level:20,classId,teamId:id==='alice'?469:67,money:99999,location:'home',bank:['secret']}});
 for(const [i,classId,role] of [[0,1,'tank'],[1,5,'healer'],[2,4,'melee'],[3,8,'ranged'],[4,1,'tank']] as const)await tx.insert('npc_characters',{id:`npc:alice:${i}`,ownerCharacterId:'alice',accountId:'alice',rules:{name:`NPC${i}`,level:i===4?40:20,classId,combatRole:role},profile:{}});
 });
 const cmd=(actor:string,body:Record<string,any>)=>social.command(actor,actor,{requestId:crypto.randomUUID(),...body});
 return {store,social,cmd,advance:(ms:number)=>{now+=ms;},now:()=>now};
}
for(const backend of ['memory','sql'])test(`${backend}: invite, role check, NPC proposal, durable membership and private chat`,async()=>{
 const store:Store=backend==='memory'?new MemoryStore():new PostgresStore(pool(new PGlite()));if(store instanceof PostgresStore)await store.initialize();
 try{
 const f=await fixture(store),{social,cmd}=f;
 const initial=await social.snapshot('alice','alice','bob');assert.equal(initial.players[0].id,'bob');assert.equal(JSON.stringify(initial).includes('secret'),false);
 await assert.rejects(social.snapshot('alice','bob'),/不属于/);
 await cmd('alice',{type:'friendRequest',targetId:'bob'});const b=await social.snapshot('bob','bob');assert.equal(b.incoming[0].kind,'friend');
 await cmd('bob',{type:'respond',inviteId:b.incoming[0].id,accept:true});assert.equal((await social.snapshot('alice','alice')).friends[0].id,'bob');
 await cmd('alice',{type:'partyInvite',targetId:'bob'});const invite=(await social.snapshot('bob','bob')).incoming[0];await cmd('bob',{type:'respond',inviteId:invite.id,accept:true});
 await cmd('alice',{type:'role',role:'dps'});await assert.rejects(cmd('bob',{type:'queue',dungeonId:'deadmines'}),/队长/);
 await assert.rejects(cmd('alice',{type:'queue',dungeonId:'deadmines'}),/职责/);await cmd('bob',{type:'role',role:'healer'});
 await cmd('alice',{type:'queue',dungeonId:'deadmines'});f.advance(8000);const matched=await social.snapshot('alice','alice');assert.equal(matched.group!.status,'proposal');assert.equal(matched.proposal!.members.length,5);
 assert.equal(matched.proposal!.members.filter((m:any)=>m.role==='tank').length,1);assert.equal(matched.proposal!.members.some((m:any)=>m.level===40),false);
 await cmd('alice',{type:'proposal',proposalId:matched.proposal!.id,accept:true});assert.equal((await social.snapshot('bob','bob')).group!.status,'proposal');
 await cmd('bob',{type:'proposal',proposalId:matched.proposal!.id,accept:true});const done=await new SocialService(store,f.now).snapshot('alice','alice');assert.equal(done.group!.status,'matched');assert.equal(done.policy.autoTeleport,false);assert.equal(done.group!.entry!.id,matched.proposal!.id);
 assert.equal((await store.read(tx=>tx.get('characters','alice')))!.rules.location,'home');
 await cmd('alice',{type:'chat',channel:'party',text:'队伍秘密'});assert.equal((await social.snapshot('bob','bob')).messages.party[0].text,'队伍秘密');assert.equal((await social.snapshot('carol','carol')).messages.party.length,0);
 await assert.rejects(cmd('carol',{type:'chat',channel:'party',text:'冒充队友'}),/加入队伍/);
 await cmd('bob',{type:'leave'});assert.equal((await social.snapshot('bob','bob')).messages.party.length,0);
 }finally{await store.close();}
});
test('five humans match without NPCs, declining preserves each premade and releases proposal reservations',async()=>{
 const {social,cmd,store}=await fixture();
 for(const [id,role] of [['alice','dps'],['bob','healer'],['carol','tank'],['dave','dps'],['eve','dps']]){await cmd(id,{type:'role',role});await cmd(id,{type:'queue',dungeonId:'deadmines'});}
 const p=(await social.snapshot('alice','alice')).proposal!;assert.equal(p.members.length,5);assert.ok(p.members.every((m:any)=>!m.npc));
 await cmd('dave',{type:'proposal',proposalId:p.id,accept:false});
 for(const id of ['alice','bob','carol','dave','eve'])assert.equal((await social.snapshot(id,id)).group!.members.length,1);
 assert.equal((await store.read(tx=>tx.list('social_proposals'))).length,0);
});
test('proposal timeout and leaving release NPC reservations; role changes and invitations cannot mutate pending proposal',async()=>{
 const {social,cmd,advance,store}=await fixture();await cmd('alice',{type:'role',role:'dps'});await cmd('alice',{type:'queue',dungeonId:'deadmines'});advance(8000);
 const before=await social.snapshot('alice','alice');assert.ok(before.proposal);await assert.rejects(cmd('alice',{type:'role',role:'dps'}),/取消匹配/);
 advance(40001);const expired=await social.snapshot('alice','alice');assert.equal(expired.group!.status,'forming');assert.equal(expired.proposal,null);assert.equal((await store.read(tx=>tx.list('social_members'))).length,1);
 await cmd('alice',{type:'queue',dungeonId:'deadmines'});advance(8000);await social.snapshot('alice','alice');await cmd('alice',{type:'leave'});assert.equal((await store.read(tx=>tx.list('social_members'))).length,0);
});
test('concurrent invitations, forged control, replay, rate limiting, and bounded chat',async()=>{
 const {social,cmd,store,advance}=await fixture();
 const invites=await Promise.allSettled([cmd('alice',{type:'partyInvite',targetId:'bob'}),cmd('carol',{type:'partyInvite',targetId:'bob'})]);assert.equal(invites.filter(r=>r.status==='fulfilled').length,1);
 const invite=(await social.snapshot('bob','bob')).incoming[0];await assert.rejects(cmd('dave',{type:'respond',inviteId:invite.id,accept:true}),/失效/);
 await cmd('bob',{type:'respond',inviteId:invite.id,accept:true});await assert.rejects(cmd('bob',{type:'kick',targetId:'alice'}),/队长/);
 const command={type:'chat',channel:'world',text:'<img src=x onerror=alert(1)>',requestId:'duplicate-message'};
 await cmd('alice',command);await cmd('alice',command);assert.equal((await social.snapshot('bob','bob')).messages.world.length,1);
 await assert.rejects(cmd('alice',{...command,text:'changed'}),/另一操作/);await assert.rejects(cmd('alice',{type:'chat',channel:'world',text:'spam'}),/太快/);
 for(let i=0;i<102;i++){advance(1001);await cmd('alice',{type:'chat',channel:'world',text:`message ${i}`});}
 const snapshot=await social.snapshot('alice','alice');assert.equal(snapshot.messages.world.length,100);assert.equal((await store.read(tx=>tx.get('social_people','alice')))!.receipts.length,64);
});
test('queue cancels when offline and rejects incompatible roles, levels and foreign NPCs',async()=>{
 const {social,cmd,advance}=await fixture();await assert.rejects(cmd('alice',{type:'role',role:'tank'}),/职业/);
 await assert.rejects(cmd('bob',{type:'npcInvite',targetId:'npc:alice:0'}),/找不到/);await assert.rejects(cmd('alice',{type:'npcInvite',targetId:'npc:alice:4'}),/等级差/);
 await cmd('alice',{type:'role',role:'dps'});await cmd('alice',{type:'npcInvite',targetId:'npc:alice:0'});await cmd('alice',{type:'queue',dungeonId:'deadmines'});
 advance(46000);await social.snapshot('bob','bob');assert.equal((await social.snapshot('alice','alice')).group!.status,'forming');
});
test('world recruitment is emitted once and supports direct role joining with stale/full/level checks',async()=>{
 const {social,cmd,store,advance}=await fixture();await cmd('alice',{type:'role',role:'dps'});
 const command={type:'queue',dungeonId:'deadmines',requestId:'queue-announcement'};await cmd('alice',command);await cmd('alice',command);
 const post=(await social.snapshot('bob','bob')).messages.world[0];assert.equal(post.kind,'recruitment');assert.equal(post.open,true);assert.equal(post.needed.healer,1);assert.equal((await social.snapshot('alice','alice')).messages.world.length,1);
 await cmd('bob',{type:'recruitJoin',groupId:post.groupId,recruitmentId:post.recruitmentId,role:'healer'});
 assert.equal((await social.snapshot('bob','bob')).group!.leaderId,'alice');assert.equal((await social.snapshot('bob','bob')).messages.world[0].needed.healer,0);
 await assert.rejects(cmd('carol',{type:'recruitJoin',groupId:post.groupId,recruitmentId:post.recruitmentId,role:'healer'}),/职业/);
 await store.transaction(async tx=>{const c=(await tx.get('characters','carol'))!;c.rules.level=40;await tx.put('characters',c);});
 await assert.rejects(cmd('carol',{type:'recruitJoin',groupId:post.groupId,recruitmentId:post.recruitmentId,role:'tank'}),/等级/);
 await cmd('alice',{type:'cancel'});assert.equal((await social.snapshot('bob','bob')).messages.world[0].open,false);
 await assert.rejects(cmd('dave',{type:'recruitJoin',groupId:post.groupId,recruitmentId:post.recruitmentId,role:'dps'}),/结束/);
 await assert.rejects(cmd('alice',{type:'queue',dungeonId:'deadmines'}),/15 秒/);advance(15000);await cmd('alice',{type:'queue',dungeonId:'deadmines'});
 await assert.rejects(cmd('dave',{type:'recruitJoin',groupId:post.groupId,recruitmentId:post.recruitmentId,role:'dps'}),/结束/);
});
test('NPCs in an active dungeon are not auto-matched or manually invited',async()=>{
 const {social,cmd,store,advance}=await fixture();
 await store.transaction(async tx=>{await tx.insert('simulation_characters',{id:'npc:alice:0',instanceId:'busy-room'});await tx.insert('simulation_checkpoints',{id:'busy-room',encodedCheckpoint:JSON.stringify({state:{dungeon:{id:'deadmines'},party:[{id:'npc:alice:0'}]}})});});
 await assert.rejects(cmd('alice',{type:'npcInvite',targetId:'npc:alice:0'}),/副本/);
 await cmd('alice',{type:'role',role:'dps'});await cmd('alice',{type:'queue',dungeonId:'deadmines'});advance(8000);assert.equal((await social.snapshot('alice','alice')).proposal,null);
});
test('explicit save deletion releases social claims and transfers leadership without deleting another player',async()=>{
 const {removeSocialCharacters}=await import('../src/social-cleanup.ts');const {social,cmd,store}=await fixture();
 await cmd('alice',{type:'partyInvite',targetId:'bob'});const invite=(await social.snapshot('bob','bob')).incoming[0];await cmd('bob',{type:'respond',inviteId:invite.id,accept:true});
 await cmd('alice',{type:'npcInvite',targetId:'npc:alice:0'});
 await store.transaction(tx=>removeSocialCharacters(tx,new Set(['alice','npc:alice:0'])));
 const survivor=await social.snapshot('bob','bob');assert.equal(survivor.group!.leaderId,'bob');assert.equal(survivor.group!.members.length,1);assert.equal(await store.read(tx=>tx.get('social_members','alice')),null);
});
test('matching finds a complete level window instead of letting the first tank block eligible teammates',async()=>{
 const {social,cmd,store,advance}=await fixture();
 await store.transaction(async tx=>{
  for(const npc of await tx.list('npc_characters')){npc.rules.level=npc.id==='npc:alice:0'?15:25;await tx.put('npc_characters',npc);}
 });
 await cmd('alice',{type:'role',role:'dps'});await cmd('alice',{type:'queue',dungeonId:'deadmines'});advance(8000);
 const result=await social.snapshot('alice','alice');assert.equal(result.proposal!.members.length,5);
 assert.ok(result.proposal!.members.every((m:any)=>m.level>=20));assert.ok(result.proposal!.members.some((m:any)=>m.id==='npc:alice:4'));
 assert.equal(await store.read(tx=>tx.get('social_members','npc:alice:0')),null,'incompatible candidates are not reserved');
});
test('supply derives dungeon minimum and premade interval from authoritative records',async()=>{
 const {social,cmd,store}=await fixture();const dungeon=Object.values(dungeonDefinitions).find(d=>d.minimumLevel>=20)!;
 await store.transaction(async tx=>{const row=(await tx.get('characters','alice'))!;row.rules.level=dungeon.minimumLevel;await tx.put('characters',row);});
 const supply=await social.supply('alice','alice',dungeon.id);assert.equal(supply.minimumLevel,dungeon.minimumLevel);
 await assert.rejects(social.supply('alice','alice','unreleased-dungeon'),/地下城/);
 await store.transaction(async tx=>{const row=(await tx.get('characters','alice'))!;row.rules.level=dungeon.minimumLevel-1;await tx.put('characters',row);});
 await assert.rejects(social.supply('alice','alice',dungeon.id),/最低等级/);
 await cmd('alice',{type:'partyInvite',targetId:'bob'});const invite=(await social.snapshot('bob','bob')).incoming[0];await cmd('bob',{type:'respond',inviteId:invite.id,accept:true});
 await store.transaction(async tx=>{const row=(await tx.get('characters','bob'))!;row.rules.level=60;await tx.put('characters',row);});
 await assert.rejects(social.supply('alice','alice'),/等级差/);
});
