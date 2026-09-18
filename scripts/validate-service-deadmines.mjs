import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {GameService} from '../packages/game-domain/src/service.ts';
import {MemoryStore} from '../packages/persistence/src/memory.ts';
import {newState,persistCharacter} from '../packages/game-domain/src/context.ts';
import {stats} from '../packages/game-domain/src/rules/character.js';
import {dungeonView,recoveryView} from '../packages/game-domain/src/rules/dungeon-view.js';
import {dungeonRoute} from '../packages/game-domain/src/rules/dungeon.js';

const sourcePath=process.argv[2]||'.cache/refactor-content-mage-cc/final-state.json';
const target=Number(process.argv[3]||14),source=JSON.parse(readFileSync(sourcePath));
const store=new MemoryStore();let now=source.wallAt,sequence=0;
const options={contentVersion:'service-deadmines-validation',now:()=>now,seed:()=>1234,id:()=>`service-dm-${++sequence}`};
let service=new GameService(store,options);
const report={fixture:{sourcePath,kind:'explicit normalized initialization; not service natural leveling',overrides:['fresh dungeon progress','deadmines entrance','stable normalized identities','empty companion personal inventories']},routes:[],recoveries:[],failures:[]};
const command=value=>service.command('dm-account',{...value,requestId:`command-${++sequence}`});
const initial=await service.createAccount('dm-account',{name:source.name,classId:source.classId,raceId:source.raceId},'create');
const ids=[initial.account.primaryCharacterId];
await store.transaction(async tx=>{const c=await tx.get('characters',ids[0]);c.rules.level=Math.max(18,source.level);c.rules.location='stormwind';c.rules.completed[900001]=1;await tx.put('characters',c);});
for(const member of source.party){const added=await command({type:'createCompanion',name:member.name,classId:member.classId,raceId:member.raceId||1});ids.push(added.roster.find(r=>!ids.includes(r.id)).id);}
const mapping=new Map([source,...source.party].map((m,i)=>[m.id,ids[i]]));
await store.transaction(async tx=>{
 for(const [index,original] of [source,...source.party].entries()){
  const c=await tx.get('characters',ids[index]);
  const s={...newState(original.name,original.classId,original.raceId||1,1234,now,c.id),...structuredClone(original),id:c.id,party:[],location:'deadmines',wallAt:now,clock:source.clock,activity:{type:'idle'},combat:null,lastCombat:null};
  delete s.dungeon;delete s.dungeonSave;s.dungeonEntries=[];s.dungeonSequence=0;
  for(const item of [...s.bag,...Object.values(s.equipment),...s.bags,...s.bank])if(item.ownerId)item.ownerId=mapping.get(item.ownerId)||item.ownerId;
  await persistCharacter(tx,c,s,now,`fixture-${index}`,options.id);
 }
});
await command({type:'setParty',characterIds:ids});
const before=await service.snapshot('dm-account');
const moneyBefore=before.state.money,killsBefore=before.state.totals.kills;
const walletsBefore=await store.transaction(tx=>tx.list('wallets'));
const initialItemIds=new Set((await store.transaction(tx=>tx.list('items'))).map(i=>i.id));
const formed=await command({type:'createInstance',contentId:'deadmines',characterIds:ids,capacity:5});
const instanceId=formed.instanceId;
assert.deepEqual((await store.transaction(tx=>tx.list('actor_leases'))).map(l=>l.actorId).sort(),[...ids].sort());
await command({type:'startInstance',instanceId});
await assert.rejects(command({type:'travel',to:'goldshire'}),/离开实例/);
const instance=()=>store.transaction(tx=>tx.get('instances',instanceId));
const state=async()=>(await instance()).simulation;
const tick=async(ms=2000)=>{now+=ms;const result=await service.work(now,100);assert.deepEqual(result.errors,[]);return state();};
try{
 // Controlled failure fixture, separate from the actual combat outcome below.
 const fallenId=ids[3];
 await store.transaction(async tx=>{const row=await tx.get('instances',instanceId);row.simulation.party.find(c=>c.id===fallenId).hp=0;await tx.put('instances',row);});
 await assert.rejects(command({type:'dungeonNext'}),/复活/);
 await command({type:'resurrect',target:fallenId});
 let revived=await state();const resurrectionEnd=revived.activity.endsAt;
 revived=await tick(resurrectionEnd-revived.clock);
 assert.ok(revived.party.find(c=>c.id===fallenId).hp>0);
 assert.ok((await service.snapshot('dm-account',fallenId)).state.hp>0);
 report.recoveries.push({kind:'controlled death fixture before first encounter',id:fallenId,method:'priest resurrect command and worker',persisted:true});
 for(let operation=0;operation<500;operation++){
  let s=await state();if(s.dungeon.cursor>=target)break;
  if(s.combat||!['idle','dead'].includes(s.activity.type)){await tick(5000);continue;}
  const fallen=[s,...s.party].filter(c=>c.hp<=0);
  if(fallen.length){const recovery=recoveryView(s),res=recovery.fallen.find(c=>c.canResurrect);await command(res?{type:'resurrect',target:res.id}:{type:'revive'});report.recoveries.push({cursor:s.dungeon.cursor,fallen:fallen.map(c=>c.id),method:res?'resurrect':'revive'});continue;}
  if([s,...s.party].some(c=>c.hp<stats(c).maxHp*.85||c.mana<stats(c).maxMana*.75)){
   await command({type:'rest'});for(let wait=0;wait<90;wait++){s=await tick(5000);if([s,...s.party].every(c=>c.hp>=stats(c).maxHp*.85&&c.mana>=stats(c).maxMana*.75))break;}
   await command({type:'stop'});s=await state();
  }
  const d=dungeonView(s),cursor=s.dungeon.cursor;
  if(d.canInteract)await command({type:'dungeonInteract'});
  // Keep per-encounter checkpoints in this diagnostic; normal play stays automatic.
  else {assert.ok(d.canNext,d.nextReason);await command({type:'dungeonNext'});await command({type:'dungeonPause'});}
  for(let wait=0;wait<120;wait++){s=await tick(2000);if(!s.combat&&s.activity.type==='idle')break;}
  assert.equal(s.combat,null,'encounter must finish within 240 simulated seconds');
  report.routes.push({cursor,route:dungeonRoute[cursor].id,after:s.dungeon.cursor,kills:s.totals.kills-killsBefore,fallen:[s,...s.party].filter(c=>c.hp<=0).map(c=>c.id)});
  assert.deepEqual([s.id,...s.party.map(c=>c.id)].sort(),[...ids].sort());
  console.log(JSON.stringify(report.routes.at(-1)));
 }
 const s=await state();assert.ok(s.dungeon.cursor>=target,'bounded run must reach requested route checkpoint');assert.ok(s.dungeon.cleared['dm-rhahkzor'],'first guaranteed boss must be cleared');
 assert.ok(s.totals.kills>killsBefore);assert.ok(s.money>moneyBefore);
 report.beforeLeave={cursor:s.dungeon.cursor,bosses:s.dungeon.defeatedBosses,kills:s.totals.kills-killsBefore,moneyGain:s.money-moneyBefore,ids,instanceStatus:(await instance()).status};
 const items=await store.transaction(tx=>tx.list('items'));assert.ok(items.every(i=>ids.includes(i.ownerCharacterId)));assert.equal(new Set(items.map(i=>i.id)).size,items.length);
 const gained=items.filter(i=>!initialItemIds.has(i.id));assert.ok(gained.length>0);assert.ok(gained.every(i=>i.ownerCharacterId===ids[0]),'encounter loot must belong to the collecting hero');
 const walletsAfter=await store.transaction(tx=>tx.list('wallets'));for(const wallet of walletsBefore.filter(w=>w.characterId!==ids[0]))assert.equal(walletsAfter.find(w=>w.id===wallet.id).balance,wallet.balance,'companions must not duplicate leader currency rewards');
 report.rewardOwnership={newItems:gained.length,allLootOwnedByLeader:true,companionWalletsUnchanged:true};
 report.itemOwners=Object.fromEntries(ids.map(id=>[id,items.filter(i=>i.ownerCharacterId===id).length]));
 await command({type:'leaveInstance',instanceId});
 assert.equal((await store.transaction(tx=>tx.list('actor_leases'))).length,0);
 service=new GameService(store,options);
 const after=await service.snapshot('dm-account');assert.equal(after.instanceId,null);assert.equal(after.state.money,s.money);assert.equal(after.state.id,ids[0]);assert.deepEqual(after.roster.map(r=>r.id).sort(),[...ids].sort());
 for(const id of ids){const reloaded=await service.snapshot('dm-account',id);assert.equal(reloaded.state.id,id);assert.ok(reloaded.state.hp>0);}
 report.result={passed:true,checkpoint:target,instanceStatus:(await instance()).status,leases:0,stableRoster:true,restartPersistent:true};
}catch(error){report.failures.push({message:error.message,stack:error.stack});process.exitCode=1;console.error(error);}
writeFileSync('.cache/refactor-service-deadmines.json',JSON.stringify(report,null,2));
