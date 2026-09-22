import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {stats} from '../src/rules/character.js';
import {buildGameResponse} from '../src/rules/server-response.js';
import {enterGuildRaid,leaveGuildRaid,guildRaidView} from '../src/rules/guild-raid.js';
import type {Rules} from '../src/model.ts';

async function fixture(){
 let now=Date.UTC(2026,8,21),seq=0;const store=new MemoryStore();
 const options={contentVersion:'test',now:()=>now,seed:()=>60325};let service=new GameService(store,options);
 const save=await service.createSave('raider',{name:'熔火团长',classId:8,raceId:1,raidReady:true},'raid-save');
 const command=(type:string,extra:Rules={})=>service.command(save.id,{type,requestId:'raid-'+(++seq),...extra});
 const snapshot=()=>service.snapshot(save.id);
 const step=async(ms=2000)=>{now+=ms;await service.snapshot(save.id,undefined,true);for(let n=0;n<Math.ceil(ms/2000);n++)assert.deepEqual((await service.work()).errors,[]);return snapshot();};
 return {store,save,command,snapshot,step,restart:()=>{service=new GameService(store,options);},service:()=>service};
}

test('raid-ready creation is persistent, has five owned level-60 characters and independent assets',async()=>{
 const f=await fixture(),s=await f.snapshot();
 assert.equal(s.roster.length,5);assert.equal(s.state!.level,60);assert.notEqual(s.state!.growthPolicy,'companion');assert.equal(s.state!.party.length,4);
 assert.equal(s.state!.money,1000000);
 const gear=await f.store.read(tx=>tx.list('items',{accountId:f.save.id}));assert.equal(new Set(gear.map(i=>i.id)).size,gear.length);
 assert.ok(s.state!.party.every((c:Rules)=>c.level===60));
 const duplicate=await f.service().createSave('raider',{name:'熔火团长',classId:8,raceId:1,raidReady:true},'raid-save');assert.equal(duplicate.id,f.save.id);
 assert.equal((await f.store.read(tx=>tx.list('characters',{accountId:f.save.id}))).length,5);
 await assert.rejects(f.service().createSave('other',{name:'错误',classId:1,raceId:1,raidReady:true},'bad'),/人类法师/);
 await assert.rejects(f.command('raidStart',{bossId:'lucifron'}),/进入熔火/);
});

test('guild instance enforces ownership, capacity, tactics locking and retreat recovery',async()=>{
 const f=await fixture();
 await assert.rejects(f.command('enterDungeon',{contentId:'molten-core',capacity:40}),/25人/);
 let snap=await f.command('enterDungeon',{contentId:'molten-core'});
 assert.equal(snap.instance?.capacity,25);assert.equal(snap.instance?.roster.length,5);assert.equal(snap.state!.party.length,24);
 assert.equal(snap.state!.party.filter((c:Rules)=>c.guildUnit).length,20);
 assert.equal((await f.store.read(tx=>tx.list('actor_leases'))).length,5);
 await assert.rejects(f.command('hireMercenary',{instanceId:snap.instanceId,templateId:'tank'}),/无需雇佣/);
 await assert.rejects(f.command('joinInstance',{instanceId:snap.instanceId}),/单个账号/);
 await assert.rejects(f.command('raidStart',{bossId:'magmadar'}),/未解锁/);
 snap=await f.command('raidStart',{bossId:'lucifron'});
 await assert.rejects(f.command('raidTactics',{patch:{dispel:false}}),/战斗结束/);
 await assert.rejects(f.command('leaveInstance'),/战斗结束/);
 await f.command('abandonCombat',{encounterId:snap.state!.combat.id});
 snap=await f.command('raidRecover');assert.equal(snap.state!.activity.type,'raidRecovery');
 await assert.rejects(f.command('raidStart',{bossId:'lucifron'}),/休整/);
 snap=await f.step(10000);assert.ok([snap.state!,...snap.state!.party].every(c=>c.hp===stats(c).maxHp));
 assert.equal(snap.state!.activity.type,'idle');
 snap=await f.command('leaveInstance');assert.equal(snap.instanceId,null);assert.equal(snap.state!.party.length,4);assert.equal(snap.state!.guildRaid.active,false);
 snap=await f.command('enterDungeon',{contentId:'molten-core'});assert.equal(snap.state!.party.length,24);
});

test('emergency exit clears guild activity and releases the five owned characters',async()=>{
 const f=await fixture();await f.command('enterDungeon',{contentId:'molten-core'});
 await f.command('raidStart',{bossId:'lucifron'});
 let snap=await f.command('unstuck');
 assert.equal(snap.instanceId,null);assert.equal(snap.state!.guildRaid.active,false);
 assert.equal(snap.state!.party.length,4);assert.equal((await f.store.read(tx=>tx.list('actor_leases'))).length,0);
 snap=await f.command('enterDungeon',{contentId:'molten-core'});assert.equal(snap.state!.party.length,24);
});

test('weekly reset renews boss rewards on reentry',async()=>{
 const f=await fixture(),snapshot=await f.snapshot(),s=snapshot.state!;
 enterGuildRaid(s);s.guildRaid.cleared=['lucifron','magmadar'];s.guildRaid.claims={lucifron:true,magmadar:true};
 s.wallAt+=604800000;
 assert.deepEqual(guildRaidView(s).cleared,['lucifron','magmadar']);
 leaveGuildRaid(s);enterGuildRaid(s);
 assert.deepEqual(s.guildRaid.cleared,[]);assert.deepEqual(s.guildRaid.claims,{});
});

test('two real boss fights persist through service restart, award equippable loot once, and retain checkpoint after leaving',async()=>{
 const f=await fixture();await f.command('enterDungeon',{contentId:'molten-core'});
 let snap=await f.command('raidStart',{bossId:'lucifron'});
 for(let i=0;i<95&&snap.state!.combat;i++){snap=await f.step();if(i===10)f.restart();}
 assert.equal(snap.state!.combat,null);assert.deepEqual(snap.state!.guildRaid.cleared,['lucifron']);
 assert.equal(snap.state!.pending.length,1);
 const reward=snap.state!.pending[0];
 snap=await f.command('loot');assert.ok(snap.state!.bag.some((i:Rules)=>i.uid===reward.uid));
 snap=await f.command('equip',{uid:reward.uid});assert.ok(Object.values(snap.state!.equipment).some((i:any)=>i.uid===reward.uid));
 await f.command('raidRecover');await f.step(10000);
 snap=await f.command('leaveInstance');
 snap=await f.command('enterDungeon',{contentId:'molten-core'});assert.deepEqual(snap.state!.guildRaid.cleared,['lucifron']);
 snap=await f.command('raidStart',{bossId:'magmadar'});
 for(let i=0;i<95&&snap.state!.combat;i++)snap=await f.step();
 assert.equal(snap.state!.combat,null);assert.deepEqual(snap.state!.guildRaid.cleared,['lucifron','magmadar']);
 assert.equal(snap.state!.guildRaid.rewards.length,2);
 await f.command('loot');await f.command('raidRestart');
 snap=await f.command('raidStart',{bossId:'lucifron'});
 // The entire first-clear fights above exercise actual rules; shorten the repeat to audit reward idempotency.
 await f.store.transaction(async tx=>{const row:any=await tx.get('instances',snap.instanceId!);row.simulation.combat.enemies.forEach((e:Rules)=>{e.hp=0;});await tx.put('instances',row);});
 snap=await f.step();assert.equal(snap.state!.guildRaid.rewards.length,2);assert.equal(snap.state!.pending.length,0);
 const projected:any=buildGameResponse(snap.state,snap.revision);assert.equal(projected.snapshot.view.guildRaid.members.length,25);assert.equal(projected.snapshot.player.guildRaid,undefined);
});
