import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {createGame,act,advance,view} from '../src/rules/engine.js';
import {canEquip,gainXp,stats} from '../src/rules/character.js';
import {items,xpTable} from '../src/rules/catalog.js';
import {roles} from '../src/rules/party.js';
import {recipes} from '../src/rules/profession-data.js';
import {recipeAvailability} from '../src/rules/professions.js';
import {buildGameResponse} from '../src/rules/server-response.js';
import type {Character,Rules} from '../src/model.ts';
function unlocked(){let s:Rules=createGame('队长',123,0);s.level=18;s.location='stormwind';return act(s,{type:'turnin',id:900001},0);}

test('level 18 automatically accepts the inn quest; only Stormwind turn-in unlocks recruitment',()=>{
 let s:Rules=createGame('队长',123,0);s.level=17;s.location='stormwind';
 assert.throws(()=>act(s,{type:'recruit',id:'mage'},0),/18级/);
 gainXp(s,s,xpTable[17].xp_for_next_level);assert.ok(s.quests[900001]);
 s.location='goldshire';assert.throws(()=>act(s,{type:'turnin',id:900001},0),/交付/);
 assert.throws(()=>act(s,{type:'recruit',id:'mage'},0),/任务/);
 assert.throws(()=>act(s,{type:'abandon',id:900001},0),/无法放弃/);
 s.location='stormwind';s=act(s,{type:'turnin',id:900001},0);
 assert.equal(buildGameResponse(s,1).snapshot!.view.partyUnlocked,true);
 assert.ok(!s.quests[900001]);assert.equal(advance(s,5000).state.quests[900001],undefined);
 s.location='goldshire';assert.throws(()=>act(s,{type:'recruit',id:'mage'},0),/暴风城/);
});

test('all nine classes and supported roles receive legal green kits, talents, skills and useful strategies',()=>{
 for(const candidate of roles)for(const role of candidate.roles){
  const s=act(unlocked(),{type:'recruit',id:candidate.id,role,professions:['tailoring','enchanting']},0),c=s.party[0];
  assert.equal(c.level,18);assert.equal(c.strategyPolicy.role,role);assert.ok(c.rules.length>0,`${candidate.id}/${role}`);
  assert.equal(Object.values(c.talents).reduce((a:number,b:any)=>a+b,0),9);
  assert.ok(c.learned.length>10);assert.equal(c.hp,stats(c).maxHp);
  for(const slot of [1,2,3,5,6,7,8,9,10,11,12,13,14,15,16])assert.ok(c.equipment[slot],`${candidate.id}: ${slot}`);
  for(const item of Object.values(c.equipment) as Rules[]){assert.equal(items[item.id].Quality,2);assert.ok(canEquip(c,items[item.id]));assert.equal(item.issued,true);}
  assert.deepEqual(c.professions,{tailoring:{skill:75,cap:75},enchanting:{skill:75,cap:75}});
  assert.ok(recipes.filter(r=>['tailoring','enchanting'].includes(r.profession)&&r.skill<=75&&!r.specialization).every(r=>recipeAvailability(c,r).known));
 }
});

test('a player tank can select three different damage classes and a healer; invalid roles and professions reject',()=>{
 let s=unlocked();for(const [id,role]of [['rogue','melee'],['mage','ranged'],['hunter','ranged'],['priest','healer']])s=act(s,{type:'recruit',id,role},0);
 assert.equal(s.party.length,4);assert.equal(new Set(s.party.map((c:Rules)=>c.classId)).size,4);
 assert.throws(()=>act(s,{type:'recruit',id:'druid'},0),/五人/);
 assert.throws(()=>act(unlocked(),{type:'recruit',id:'mage',role:'tank'},0),/职责/);
 assert.throws(()=>act(unlocked(),{type:'recruit',id:'mage',professions:['alchemy','alchemy']},0),/两个不同/);
});

test('replacement preserves compatible item identity, returns incompatible equipment, checks capacity before charging',()=>{
 let s=act(unlocked(),{type:'recruit',id:'warrior'},0);s.money=100000;
 const old=structuredClone(s.party[0]),uid=old.equipment[5].uid;
 const full={...s,bag:Array.from({length:16},(_,i)=>({id:159,uid:`fill-${i}`,count:1}))};
 assert.throws(()=>act(full,{type:'recruit',id:'mage',replaceId:old.id},0),/背包/);assert.equal(full.money,100000);
 const same=act(s,{type:'recruit',id:'warrior',replaceId:old.id},0);assert.equal(same.party[0].equipment[5].uid,uid);assert.equal(same.money,0);
 const changed=act(s,{type:'recruit',id:'mage',replaceId:old.id},0);
 assert.equal(changed.money,0);assert.equal(changed.party[0].id,old.id);assert.ok(changed.bag.some((i:Rules)=>i.uid===uid));
 assert.equal(changed.party[0].equipment[2].uid,old.equipment[2].uid);
 assert.equal(items[changed.party[0].equipment[5].id].Quality,2);
});

test('service persists recruitment, replacement assets, profession pages and free respec without a create bypass',async()=>{
 const store=new MemoryStore();let service=new GameService(store,{contentVersion:'test',now:()=>1000,seed:()=>123});
 const created=await service.createAccount('a',{name:'队长',classId:1,raceId:1},'create');const hero=created.account.primaryCharacterId;
 await assert.rejects(service.command('a',{type:'createCompanion',classId:8,name:'法师',requestId:'early'}),/18级/);
 await store.transaction(async tx=>{const c=(await tx.get<Character>('characters',hero))!;c.rules.level=18;c.rules.location='stormwind';await tx.put('characters',c);});
 await service.command('a',{type:'turnin',id:900001,requestId:'unlock'});
 const recruited=await service.command('a',{type:'recruit',id:'warrior',role:'tank',requestId:'recruit'}),companion=recruited.roster.find(c=>c.kind==='companion')!.id;
 const before=await service.snapshot('a',companion);assert.equal(before.state.level,18);assert.ok(view(before.state).professions.some(p=>p.id==='alchemy'&&p.skill===75));
 const armor=before.state.equipment[5].uid;
 await store.transaction(async tx=>{await tx.put('wallets',{id:hero,characterId:hero,accountId:'a',balance:100000});});
 const command={type:'recruit',id:'mage',role:'ranged',replaceId:companion,requestId:'replace'};
 await service.command('a',command);await service.command('a',command);
 service=new GameService(store,{contentVersion:'test',now:()=>1000,seed:()=>123});
 const after=await service.snapshot('a',companion),owner=await service.snapshot('a');
 assert.equal(owner.state.money,0);assert.equal(after.state.classId,8);assert.equal(after.state.location,'stormwind');assert.equal(after.roster.length,2);
 assert.ok(owner.state.bag.some((i:Rules)=>i.uid===armor));assert.equal(after.state.growthPolicy,'companion');assert.ok(!after.state.quests[900001]);
 await service.command('a',{type:'resetTalents',characterId:companion,requestId:'reset'});
 assert.deepEqual((await service.snapshot('a',companion)).state.talents,{});
 await assert.rejects(service.command('a',{type:'learnProfession',characterId:companion,id:'cooking',requestId:'third'}),/两项/);
 const assets=await store.transaction(tx=>tx.list<Rules>('items',{accountId:'a'}));assert.equal(new Set(assets.map(i=>i.id)).size,assets.length);
});
