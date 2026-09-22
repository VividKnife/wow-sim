import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo,startMoltenCoreBoss,advanceMoltenCore,configureMoltenCore,retreatMoltenCore,moltenCoreView} from '../src/molten-core-demo.ts';
import {canEquip,spellInfo,stats} from '../src/rules/character.js';
import {items} from '../src/rules/catalog.js';
import {dispelSpellAuras} from '../src/rules/spell-aura-lifecycle.js';

const finish=(initial:ReturnType<typeof createMoltenCoreDemo>)=>{
 let run=initial;
 for(let i=0;i<18&&run.status==='combat';i++)run=advanceMoltenCore(run,10000);
 assert.notEqual(run.status,'combat','Every attempt must terminate within the encounter budget');
 return run;
};

test('25 actual level-60 characters use legal equipment with 2 tanks, 5 healers and 18 damage',()=>{
 const run=createMoltenCoreDemo(),view=moltenCoreView(run);
 assert.equal(view.members.length,25);assert.equal(new Set(view.members.map(c=>c.id)).size,25);
 assert.equal(view.members.filter(c=>c.role==='tank').length,2);
 assert.equal(view.members.filter(c=>c.role==='healer').length,5);
 for(const c of [run.state,...run.state.party]){
  assert.equal(c.level,60);assert.equal(c.hp,stats(c).maxHp);
  for(const e of Object.values(c.equipment) as any[])assert.equal(canEquip(c,items[e.id]),true,`${c.name}: ${e.id}`);
  if(items[c.equipment[16]?.id]?.InventoryType===17)assert.equal(c.equipment[17],undefined);
 }
});

test('boss order, combat configuration locking, retreat, retry and invalid inputs',()=>{
 const run=createMoltenCoreDemo(),before=JSON.stringify(run);
 assert.throws(()=>startMoltenCoreBoss(run,'magmadar'));
 assert.throws(()=>startMoltenCoreBoss(run,'unknown'));
 const started=startMoltenCoreBoss(run,'lucifron');
 assert.equal(JSON.stringify(run),before);
 assert.throws(()=>startMoltenCoreBoss(started,'lucifron'));
 assert.throws(()=>configureMoltenCore(started,{dispel:false}));
 assert.throws(()=>advanceMoltenCore(started,-1));
 assert.throws(()=>advanceMoltenCore(started,Infinity));
 // @ts-expect-error Deliberate invalid payload.
 assert.throws(()=>configureMoltenCore(run,{unknown:true}));
 const withdrawn=retreatMoltenCore(advanceMoltenCore(started,1000));
 assert.equal(withdrawn.status,'defeat');
 const retry=startMoltenCoreBoss(withdrawn,'lucifron');
 assert.equal(retry.attemptNumber,2);assert.equal(retry.attempts.length,1);
 assert.equal(retry.state.clock,0);assert.equal(retry.state.combat.enemies[0].hp,180000);
 assert.ok([retry.state,...retry.state.party].every(c=>c.hp===stats(c).maxHp));
});

test('Lucifron curse doubles real resource cost until dispelled',()=>{
 const run=startMoltenCoreBoss(createMoltenCoreDemo(),'lucifron'),c=run.state;
 const baseline=spellInfo(c,116)!.mana;
 c.auras=[{spell:19703,effect:1,type:0,raidCurse:true,dispel:2,positive:false,until:10000}];
 assert.equal(spellInfo(c,116)!.mana,baseline*2);
 assert.equal(dispelSpellAuras(c,[1],1,c,'negative'),0);
 assert.equal(dispelSpellAuras(c,[2],1,c,'negative'),1);
 assert.equal(spellInfo(c,116)!.mana,baseline);
});

test('JSON checkpoint and segmented execution preserve deterministic battle results',()=>{
 const initial=advanceMoltenCore(startMoltenCoreBoss(createMoltenCoreDemo(),'lucifron'),10000);
 const full=advanceMoltenCore(initial,2000);
 const segmented=advanceMoltenCore(advanceMoltenCore(JSON.parse(JSON.stringify(initial)),1000),1000);
 assert.deepEqual(full.state,segmented.state);
 assert.ok(moltenCoreView(full).events.some((e:any)=>e.text.includes('末日降临')));
});

test('both bosses are defeated through shared combat rules and grant demo rewards once',()=>{
 let run=finish(startMoltenCoreBoss(createMoltenCoreDemo(),'lucifron'));
 assert.equal(run.status,'victory');assert.deepEqual(run.cleared,['lucifron']);
 assert.ok(run.attempts[0].support.dispels>0);
 assert.ok(moltenCoreView(run).meter.some((row:any)=>row.healing>0));
 assert.throws(()=>startMoltenCoreBoss(run,'lucifron'));
 run=finish(startMoltenCoreBoss(JSON.parse(JSON.stringify(run)),'magmadar'));
 assert.equal(run.status,'victory');assert.equal(run.rewards.length,2);
 assert.ok(run.attempts[1].support.tranquilizes>0);assert.ok(run.attempts[1].support.wards>0);
 assert.equal(run.state.money,0);assert.equal(run.state.pending.length,0);
 assert.deepEqual(advanceMoltenCore(run,10000),run);
 assert.throws(()=>startMoltenCoreBoss(run,'magmadar'));
});

test('ignoring Magmadar mechanics causes an actual wipe, retry preserves Lucifron checkpoint',()=>{
 let run=createMoltenCoreDemo();run.cleared=['lucifron'];
 run=configureMoltenCore(run,{tranquilize:false,fearWard:false,avoidFire:false});
 run=finish(startMoltenCoreBoss(run,'magmadar'));
 assert.equal(run.status,'defeat');assert.equal(run.attempts[0].deaths,25);
 assert.ok(run.attempts[0].failures.fire>0);assert.equal(run.attempts[0].support.tranquilizes,0);
 assert.deepEqual(run.cleared,['lucifron']);
 const retry=startMoltenCoreBoss(configureMoltenCore(run,{tranquilize:true,fearWard:true,avoidFire:true}),'magmadar');
 assert.equal(retry.status,'combat');assert.deepEqual(retry.cleared,['lucifron']);
});
