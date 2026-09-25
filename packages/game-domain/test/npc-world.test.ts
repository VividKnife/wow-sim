import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {createGame,act,view,advance} from '../src/rules/engine.js';
import {stats} from '../src/rules/character.js';
import {items} from '../src/rules/catalog.js';
import {equipmentUpgrade} from '../src/rules/npc-equipment.js';
import {queueGroupLoot,resolveGroupLoot,groupLootView,tickGroupLoot} from '../src/rules/group-loot.js';
import {progressNpcWorld,syncNpcWorld,NPC_REFRESH_MS} from '../src/rules/npc-world.js';
import {projectClientSnapshot} from '../src/rules/client-snapshot.ts';
import {localEligible} from '../src/local-simulation.ts';
import type {Rules} from '../src/model.ts';

function world(){let s:Rules=createGame('旅人',1729,0);s.level=24;s.location='deadmines';const st=stats(s);s.hp=st.maxHp;s.mana=st.maxMana;s=act(s,{type:'npcVisit'},0);return act(s,{type:'npcRecommend'},0);}
test('level-60 damage warriors and rogues start with two usable weapons while tanks keep shields',()=>{
 let s:Rules=createGame('旅人',1729,0);s.level=60;s=act(s,{type:'npcVisit'},0);
 const fighters=s.npcWorld.residents.map((p:Rules)=>p.unit).filter((c:Rules)=>[1,4].includes(c.classId));
 for(const c of fighters){
  assert.ok(c.equipment[16],c.name);
  if(c.classId===1&&c.strategyPolicy.role==='tank')assert.equal(items[c.equipment[17]?.id]?.InventoryType,14,c.name);
  else {assert.equal(items[c.equipment[17]?.id]?.class,2,c.name);assert.ok(c.learned.includes(674),c.name);assert.notEqual(items[c.equipment[16].id].InventoryType,17,c.name);}
 }
});
function run(){let s=world();s=act(s,{type:'npcGroup',memberIds:[0,4,2,3].map(i=>s.npcWorld.residents[i].id)},0);return act(s,{type:'enterDungeon',contentId:'deadmines'},0);}
async function fixture(){
 let now=100000,sequence=0;const store=new MemoryStore();const options={contentVersion:'npc-test',now:()=>now,seed:()=>1729};let service=new GameService(store,options);
 const created=await service.createAccount('npc-world-test',{name:'旅人',classId:8,raceId:1},'create');const hero=created.account.primaryCharacterId;
 await store.transaction(async tx=>{const c:any=await tx.get('characters',hero);c.rules.level=24;c.rules.location='deadmines';c.rules.hp=2000;c.rules.mana=2000;await tx.put('characters',c);});
 const command=(type:string,extra:Rules={})=>service.command('npc-world-test',{type,requestId:`npc-${++sequence}`,...extra});
 await command('npcVisit');
 return {store,hero,command,snapshot:()=>service.snapshot('npc-world-test'),restart:()=>{service=new GameService(store,options);},elapse:(ms:number)=>{now+=ms;},service:()=>service};
}

test('50 distinct persistent residents balance all nine classes; recommendations preserve friends',()=>{
 const s=world();assert.equal(s.npcWorld.residents.length,50);assert.equal(new Set(s.npcWorld.residents.map((p:Rules)=>p.id)).size,50);
 assert.equal(new Set(s.npcWorld.residents.map((p:Rules)=>p.unit.name)).size,50);
 const classes=Object.values(s.npcWorld.residents.reduce((counts:Rules,p:Rules)=>{counts[p.unit.classId]=(counts[p.unit.classId]||0)+1;return counts;},{})) as number[];
 assert.equal(classes.length,9);assert.ok(classes.every(n=>n===5||n===6));
 const v=view(s).npcWorld;assert.equal(v.selected.length,4);assert.equal(v.selected.filter((p:Rules)=>p.role==='tank').length,1);assert.equal(v.selected.filter((p:Rules)=>p.role==='healer').length,1);
 const friend=v.residents.find((p:Rules)=>p.role==='tank');const next=act(s,{type:'npcFriend',id:friend.id,friend:true},0);const recommended=act(next,{type:'npcRecommend'},0);
 assert.ok(recommended.npcWorld.selection.includes(friend.id));assert.deepEqual(recommended.party,[]);
 const again=act(recommended,{type:'npcVisit'},0);assert.deepEqual(again.npcWorld,recommended.npcWorld);
});

test('progression is bounded, deterministic, capped to hero level and never refreshes earned gear',()=>{
 const s=world(),p=s.npcWorld.residents[0],earned=structuredClone(p.unit.equipment);s.level=30;s.wallAt=30*24*3600000;
 const copy=structuredClone(s);progressNpcWorld(s);progressNpcWorld(copy);assert.deepEqual(copy.npcWorld,s.npcWorld);
 assert.equal(p.steps,6);assert.equal(p.unit.level,27);assert.deepEqual(p.unit.equipment,earned);
 const saved=structuredClone(s.npcWorld);progressNpcWorld(s);assert.deepEqual(s.npcWorld,saved);
 s.wallAt+=2*3600000;progressNpcWorld(s);assert.equal(p.unit.level,30);s.wallAt+=2*3600000;progressNpcWorld(s);assert.equal(p.unit.level,30);
});

test('NPCs in the current run do not receive simultaneous background adventures',()=>{
 const s=run(),id=s.party[0].id;s.wallAt+=2*3600000;progressNpcWorld(s);
 assert.equal(s.npcWorld.residents.find((p:Rules)=>p.id===id).steps,0);
 assert.equal(s.npcWorld.residents.find((p:Rules)=>!s.party.some((c:Rules)=>c.id===p.id)).steps,6);
});

test('loot is awarded once; upgrades persist and no longer qualify as need; hidden rolls are not projected',()=>{
 const s=run(),rogue=s.party.find((c:Rules)=>c.classId===4);rogue.equipment={};
 assert.ok(equipmentUpgrade(rogue,items[5191]).need);queueGroupLoot(s,5191,1);
 const loot=s.groupLoot.pending[0];for(const m of loot.members)m.roll=m.id===rogue.id?100:1;
 assert.ok(!Object.hasOwn(groupLootView(s).pending[0].members[0],'roll'));
 resolveGroupLoot(s,loot.id,'pass');assert.equal(rogue.equipment[16].id,5191);assert.equal(s.pending.length,0);
 assert.equal(s.npcWorld.residents.find((p:Rules)=>p.id===rogue.id).unit.equipment[16].id,5191);
 // A sword can still improve a second weapon slot. Fill both before checking duplicates.
 if(rogue.learned.includes(674))rogue.equipment[17]={...rogue.equipment[16],uid:'second-sword'};
 assert.equal(equipmentUpgrade(rogue,items[5191]).need,false);
 assert.throws(()=>resolveGroupLoot(s,loot.id,'pass'),/已经分配/);
 const projected=projectClientSnapshot(s,view(s));assert.equal((projected.view as any).groupLoot.history.length,1);assert.ok(!(projected.player as any).npcWorld);
});

test('manual roll clock starts after combat, automatic policy resolves safely, quest drops keep old routing',()=>{
 const s=run();assert.equal(queueGroupLoot(s,5397,1),false);queueGroupLoot(s,5191,1);s.clock=100000;s.combat={id:'battle'};tickGroupLoot(s);assert.equal(s.groupLoot.pending[0].deadline,null);
 s.combat=null;tickGroupLoot(s);assert.equal(s.groupLoot.pending[0].deadline,160000);s.clock=160001;tickGroupLoot(s);assert.equal(s.groupLoot.pending.length,0);
 queueGroupLoot(s,5191,1);s.npcWorld.autoLoot=true;tickGroupLoot(s);assert.equal(s.groupLoot.pending.length,0);
});

test('NPC commands reject invalid rosters, companion control and changes during a run',()=>{
 const s=world(),id=s.npcWorld.residents[0].id;assert.throws(()=>act(s,{type:'npcGroup',memberIds:[id,id]},0),/不同/);assert.throws(()=>act(s,{type:'npcGroup',memberIds:['foreign']},0),/同行/);
 assert.throws(()=>act({...s,growthPolicy:'companion'},{type:'npcVisit'},0),/主角/);
 const playing=run();assert.throws(()=>act(playing,{type:'npcVisit'},0),/离开副本/);assert.throws(()=>act(playing,{type:'strategy',target:playing.party[0].id,rules:[]},0),/自行管理/);
});

test('service saves NPCs independently of owned companions and restores the mixed roster after restart',async()=>{
 const f=await fixture();let snap=await f.command('recruit',{id:'warrior',role:'tank'});const own=snap.state.party[0].id;const ownedGear=structuredClone(snap.state.party[0].equipment);
 await f.command('npcGroup',{memberIds:[own]});snap=await f.command('npcRecommend',{keep:true});const selected=snap.state.npcWorld.selection;assert.equal(selected[0],own);
 const friend=selected[1];await f.command('npcFriend',{id:friend,friend:true});f.restart();snap=await f.snapshot();assert.deepEqual(snap.state.party.map((c:Rules)=>c.id),[own]);assert.deepEqual(snap.state.party[0].equipment,ownedGear);
 snap=await f.command('enterDungeon',{contentId:'deadmines'});assert.equal(snap.state.party.length,4);assert.equal(snap.state.party.filter((c:Rules)=>c.npcPlayer).length,3);assert.equal(snap.instance!.roster.filter((r:Rules)=>r.controller==='npc').length,3);
 const instance:any=await f.store.read(tx=>tx.get('instances',snap.instanceId!));assert.equal(localEligible(instance),false);
 assert.equal((await f.store.read(tx=>tx.list('actor_leases'))).length,2);
 await assert.rejects(f.command('npcGroup',{memberIds:[]}),/先离开|这项操作/);
 await f.command('leaveDungeon');f.restart();snap=await f.snapshot();assert.deepEqual(snap.state.party.map((c:Rules)=>c.id),[own]);assert.deepEqual(snap.state.npcWorld.selection,selected);
 assert.equal(snap.state.npcWorld.residents.find((p:Rules)=>p.id===friend).friend,true);assert.equal((await f.store.read(tx=>tx.list('actor_leases'))).length,0);
 snap=await f.command('enterDungeon',{contentId:'deadmines'});assert.deepEqual(snap.state.party.map((c:Rules)=>c.id),selected);
});

test('committed NPC loot survives service restart, duplicate command and subsequent dungeon entry',async()=>{
 const f=await fixture();let ready=await f.snapshot();await f.command('npcGroup',{memberIds:[0,4,2,3].map(i=>ready.state.npcWorld.residents[i].id)});let snap=await f.command('enterDungeon',{contentId:'deadmines'});let lootId='',npcId='';
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);const s=i.simulation,c=s.party.find((p:Rules)=>p.classId===4);npcId=c.id;c.equipment={};queueGroupLoot(s,5191,1);const l=s.groupLoot.pending[0];lootId=l.id;for(const m of l.members)m.roll=m.id===npcId?100:1;await tx.put('instances',i);});
 snap=await f.command('groupLoot',{id:lootId,choice:'pass',requestId:'same-roll'});f.restart();const saved=await f.command('groupLoot',{id:lootId,choice:'pass',requestId:'same-roll'});
 assert.equal(saved.state.groupLoot.history.length,1);assert.equal(saved.state.party.find((c:Rules)=>c.id===npcId).equipment[16].id,5191);
 await f.command('leaveDungeon');snap=await f.command('enterDungeon',{contentId:'deadmines'});assert.equal(snap.state.party.find((c:Rules)=>c.id===npcId).equipment[16].id,5191);
 await assert.rejects(f.command('groupLoot',{id:lootId,choice:'pass'}),/已经分配/);
});

test('legacy all-owned dungeon still bypasses group rolls',()=>{
 let s:Rules=createGame('原有队伍',42,0);s.level=24;s.location='deadmines';for(const [id,role] of [['warrior','tank'],['priest','healer'],['rogue','melee'],['hunter','ranged']])s=act(s,{type:'recruit',id,role},0);
 s=act(s,{type:'enterDungeon'},0);assert.equal(queueGroupLoot(s,5191,1),false);assert.equal(s.party.filter((c:Rules)=>c.npcPlayer).length,0);
});

test('actual NPC dungeon combat advances using existing combat engine',()=>{
 let s=run();s.settings.autoLoot=true;s.npcWorld.autoLoot=true;s=act(s,{type:'dungeonNext'},0);
 const next=advance(s,20000,{maxTicks:1000});assert.ok(next.complete);assert.ok(next.state.logs.some((l:Rules)=>l.kind==='damage'||l.kind==='incoming'));syncNpcWorld(next.state);
 assert.equal(next.state.party.length,4);
});

test('emergency exit settles only committed drops and preserves NPC winnings without stale pending rolls',async()=>{
 const f=await fixture();let ready=await f.snapshot();await f.command('npcGroup',{memberIds:[0,4,2,3].map(i=>ready.state.npcWorld.residents[i].id)});let snap=await f.command('enterDungeon',{contentId:'deadmines'});let npcId='';
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);const s=i.simulation,c=s.party.find((p:Rules)=>p.classId===4);npcId=c.id;c.equipment={};queueGroupLoot(s,5191,1);for(const m of s.groupLoot.pending[0].members)m.roll=m.id===npcId?100:1;await tx.put('instances',i);});
 snap=await f.command('unstuck');assert.equal(snap.state.groupLoot.pending.length,0);assert.equal(snap.state.npcWorld.residents.find((p:Rules)=>p.id===npcId).unit.equipment[16].id,5191);assert.equal(snap.state.pending.filter((i:Rules)=>i.id===5191).length,0);
 assert.equal((await f.store.read(tx=>tx.list('actor_leases'))).length,0);f.restart();snap=await f.snapshot();assert.equal(snap.state.groupLoot.history.length,1);
});

test('owned companion winnings and displaced gear persist exactly once without changing NPC ownership',async()=>{
 const f=await fixture();let snap=await f.command('recruit',{id:'rogue',role:'melee'});const own=snap.state.party[0].id;
 await f.command('npcGroup',{memberIds:[own]});await f.command('npcRecommend',{keep:true});snap=await f.command('enterDungeon',{contentId:'deadmines'});let lootId='';
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);const s=i.simulation,c=s.party.find((p:Rules)=>p.id===own);c.equipment={};queueGroupLoot(s,5191,1);const l=s.groupLoot.pending[0];lootId=l.id;for(const m of l.members)m.roll=m.id===own?100:1;await tx.put('instances',i);});
 await f.command('groupLoot',{id:lootId,choice:'pass'});await f.command('leaveDungeon');snap=await f.snapshot();assert.equal(snap.state.party[0].equipment[16].id,5191);
 const rows:any[]=await f.store.read(tx=>tx.list('items',{ownerCharacterId:own}));assert.equal(rows.filter(r=>r.data.id===5191).length,1);
});

test('unique-item eligibility and simultaneous duplicate drops cannot bypass the ownership limit',()=>{
 const s=run(),unique=Object.values(items).find((i:any)=>i.maxcount===1&&i.Quality>=2&&[2,4].includes(i.class)&&i.InventoryType&&!i.startquest&&i.bonding!==4) as any;
 assert.ok(unique);s.pending.push({id:unique.entry,uid:'owned-unique',count:1});queueGroupLoot(s,unique.entry,1);const l=s.groupLoot.pending[0];assert.equal(l.members[0].eligible,false);assert.equal(groupLootView(s).pending[0].canGreed,false);assert.throws(()=>resolveGroupLoot(s,l.id,'greed'),/唯一/);resolveGroupLoot(s,l.id,'pass');
 assert.equal(s.pending.filter((i:Rules)=>i.id===unique.entry).length,1);
});

test('final-route instance remains running until pending group loot is settled',async()=>{
 const f=await fixture();await f.command('npcRecommend');const snap=await f.command('enterDungeon',{contentId:'deadmines'});
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.dungeon.completedAt=1;i.simulation.dungeon.autoAdvance=false;queueGroupLoot(i.simulation,5191,1);await f.service().persistInstance(tx,i,100000,'final-route-loot');assert.equal(i.status,'running');});
});

test('automatic group rolls do not disarm dungeon auto advance between encounters',()=>{
 let s=run();s.settings.autoLoot=true;s.npcWorld.autoLoot=true;s=act(s,{type:'dungeonNext'},0);
 // Existing combat must end before a queued roll can change equipment.
 s.combat=null;s.activity={type:'idle'};queueGroupLoot(s,5191,1);
 const result=advance(s,100).state;assert.equal(result.groupLoot.pending.length,0);assert.equal(result.dungeon.autoAdvance,true);
});

test('six-person batches cover roles, never repeat the previous batch and eventually introduce all 50',()=>{
 let s=world();const seen=new Set<string>();let previous:string[]=[];
 for(let turn=0;turn<12;turn++){
  if(turn)s=act(s,{type:'npcRefresh'},turn*NPC_REFRESH_MS);
  const board=view(s).npcWorld.board!;assert.equal(board.ids.length,6);assert.equal(new Set(board.ids).size,6);
  assert.ok(board.ids.every((id:string)=>!previous.includes(id)));board.ids.forEach((id:string)=>seen.add(id));
  const batch=view(s).npcWorld.residents.filter((p:Rules)=>board.ids.includes(p.id));
  assert.equal(batch.filter((p:Rules)=>p.role==='tank').length,1);assert.equal(batch.filter((p:Rules)=>p.role==='healer').length,1);
  assert.equal(board.remaining,NPC_REFRESH_MS);assert.equal(board.sequence,turn+1);previous=board.ids;
 }
 assert.equal(seen.size,50);
});

test('refresh cooldown is authoritative and browsing never rerolls gear, friends, selection or adventure randomness',()=>{
 let s=world(),id=s.npcWorld.board.ids[0];s=act(s,{type:'npcFriend',id,friend:true},0);
 const residents=structuredClone(s.npcWorld.residents),selection=[...s.npcWorld.selection],rng=s.rngState,board=structuredClone(s.npcWorld.board);
 assert.throws(()=>act(s,{type:'npcRefresh'},0),/秒后/);assert.throws(()=>act(s,{type:'npcRefresh'},NPC_REFRESH_MS-1),/秒后/);
 s=act(s,{type:'npcVisit'},1000);assert.deepEqual(s.npcWorld.board,board);
 const copy=structuredClone(s);s=act(s,{type:'npcRefresh'},NPC_REFRESH_MS);const repeated=act(copy,{type:'npcRefresh'},NPC_REFRESH_MS);
 assert.deepEqual(s.npcWorld.board,repeated.npcWorld.board);assert.deepEqual(s.npcWorld.residents,residents);assert.deepEqual(s.npcWorld.selection,selection);assert.equal(s.rngState,rng);
 assert.ok(!s.npcWorld.board.ids.includes(id));assert.equal(view(s).npcWorld.residents.find((p:Rules)=>p.id===id).friend,true);
 assert.ok(!Object.hasOwn(view(s).npcWorld.board!,'rngState'));assert.ok(!Object.hasOwn(view(s).npcWorld.board!,'shown'));
});

test('recommendation stays within current arrivals and known companions instead of bypassing the board',()=>{
 const s=world(),v=view(s).npcWorld;
 assert.ok(v.selected.every((p:Rules)=>v.board!.ids.includes(p.id)));
 const next=act(s,{type:'npcRefresh'},NPC_REFRESH_MS),oldIds=[...next.npcWorld.selection];
 const recommended=act(next,{type:'npcRecommend'},NPC_REFRESH_MS),allowed=new Set([...next.npcWorld.board.ids,...oldIds]);
 assert.ok(recommended.npcWorld.selection.every((id:string)=>allowed.has(id)));
});

test('service restart and duplicate refresh requests preserve the same batch and remaining cooldown',async()=>{
 const f=await fixture(),before=await f.snapshot(),ids=before.state.npcWorld.board.ids;
 f.elapse(NPC_REFRESH_MS-1);f.restart();await assert.rejects(f.command('npcRefresh'),/秒后/);
 f.elapse(1);const first=await f.command('npcRefresh',{requestId:'one-refresh'});f.restart();
 const repeated=await f.command('npcRefresh',{requestId:'one-refresh'});
 assert.deepEqual(repeated.state.npcWorld.board,first.state.npcWorld.board);assert.equal(first.state.npcWorld.board.sequence,2);
 assert.ok(first.state.npcWorld.board.ids.every((id:string)=>!ids.includes(id)));
 await assert.rejects(f.command('npcRefresh'),/秒后/);
 const snapshot=await f.snapshot();assert.equal(view(snapshot.state).npcWorld.board!.remaining,NPC_REFRESH_MS);
});
