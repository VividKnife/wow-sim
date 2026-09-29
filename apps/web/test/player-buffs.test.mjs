import test from 'node:test';
import assert from 'node:assert/strict';
import {hudBuffs,buffDuration,buffRemaining} from '../lib/player-buffs.js';
import {createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {applyExperienceBuff} from '../../../packages/game-domain/src/rules/experience.js';
import {battlePresentation,playerBuffs} from '../../../packages/game-domain/src/rules/battle-presentation.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {projectCombatPlayback,createCombatFrameProjector} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {CombatStreamSender,CombatStreamReceiver,hydrateCombatFrame} from '../../../packages/sim-core/src/combat-stream.js';
import {playbackPerspective} from '../lib/combat-playback.js';
test('HUD lists permanent and active buffs outside combat, deduplicating server effects',()=>{
 const s=applyExperienceBuff(createGame('Buff测试',1,0),2);
 s.clock=1000;s.buffs={int:{spell:1459,until:10000,amount:2,kind:'int'},expired:{spell:168,until:999}};
 s.dots=[{spell:589,until:10000}];
 const d=view(s),buffs=hudBuffs(s,d);
 assert.equal(buffs.filter(b=>b.name==='经验加成').length,1);
 assert.ok(buffs.find(b=>b.spellId===1459));
 assert.ok(!buffs.find(b=>b.spellId===168||b.spellId===589));
 assert.equal(buffs[0].permanent,true);
 s.clock=10001;assert.equal(hudBuffs(s,d).length,1);
});
test('HUD formats short countdowns and merges timed item effects',()=>{
 assert.deepEqual([999,10000,60000,3600000].map(buffDuration),['1s','10s','1m','1h']);
 const buffs=hudBuffs({clock:1000},{itemBuffs:[{spell:1,name:'药剂',until:2000},{spell:2,name:'已过期',until:1000}]});
 assert.equal(buffs.length,1);assert.equal(buffs[0].permanent,false);
});

test('HUD uses Classic aura text instead of internal effect labels or runtime amounts',()=>{
 const s=createGame('光环说明',1,0);s.clock=1000;
 s.buffs={int:{spell:1459,until:1801000,amount:2,kind:'int'}};
 s.hots=[{spell:139,until:16000,amount:9}];
 s.absorb={spell:17,until:31000,amount:44};
 const buffs=hudBuffs(s,view(s));
 assert.equal(buffs.find(b=>b.spellId===1459).detail,'智力提高2点。');
 assert.equal(buffs.find(b=>b.spellId===1459).dispel,'魔法');
 assert.equal(buffs.find(b=>b.spellId===139).detail,'每3秒回复9点生命值。');
 assert.equal(buffs.find(b=>b.spellId===17).detail,'吸收伤害。');
});
test('item buffs expose the aura name and original effect description',()=>{
 const s=createGame('药剂说明',1,0);s.clock=1000;
 s.itemBuffs=[{item:2454,spell:3164,stats:{str:8},until:60000}];
 const buff=hudBuffs(s,view(s)).find(b=>b.spellId===3164);
 assert.equal(buff.detail,'力量提高8点。');
 assert.ok(buff.name);assert.equal(buff.dispel,'');
});

test('HUD includes combat aura stores and excludes harmful effects',()=>{
 const s=createGame('战斗增益',1,0);s.clock=1000;
 s.auras=[{spell:10060,positive:true,until:16000},{spell:118,positive:false,until:16000}];
 s.periodicClass=[{spell:139,type:8,until:16000}];
 s.reactiveClass={spell:324,charges:3,until:60000};
 s.racialEffects={forsaken:{until:6000}};
 s.bloodrage={until:11000};s.sprintUntil=16000;
 s.dots=[{spell:589,until:16000}];s.weakenedSoulUntil=16000;
 const buffs=playerBuffs(s);
 for(const id of [10060,139,324,7744,2687,2983])assert.ok(buffs.some(b=>b.spellId===id),`missing ${id}`);
 for(const id of [118,589,6788])assert.ok(!buffs.some(b=>b.spellId===id),`harmful ${id}`);
});

for(const mode of ['recording','worker'])test(`${mode}: HUD follows additions, refreshes, charges, dispels and expiry without a new overview`,()=>{
 const s=createGame('实时增益',1,0);s.clock=1000;startCombat(s,[6]);
 const base=structuredClone(s),overview=view(s);
 const projector=createCombatFrameProjector(),sender=new CombatStreamSender(),receiver=new CombatStreamReceiver();
 const read=()=>{
  const battle=battlePresentation(s);
  let snapshot;
  if(mode==='worker'){
   const packet=sender.encode(projector(s,battle,s.wallAt));
   snapshot=hydrateCombatFrame(receiver.apply(packet).snapshot);
   sender.acknowledge(packet.sequence,packet.buffer);
  }else snapshot=projectCombatPlayback(s,battle,s.wallAt);
  const current=playbackPerspective(base,overview,snapshot,s.clock+100);
  return hudBuffs(current.state,current.data);
 };
 assert.ok(!read().some(b=>b.spellId===324));
 s.clock=1100;s.reactiveClass={spell:324,charges:3,until:60000};
 s.auras=[{spell:10060,positive:true,until:16000,stacks:1}];
 s.absorb={spell:17,amount:44,until:31000};
 s.manaShield={spell:1463,amount:120,until:61000};
 s.itemBuffs=[{item:2454,spell:3164,stats:{str:8},until:60000}];
 let buffs=read();assert.equal(buffs.find(b=>b.spellId===324).charges,3);
 for(const id of [10060,17,1463,3164])assert.ok(buffs.some(b=>b.spellId===id));
 s.clock=1200;s.reactiveClass.charges=1;s.auras[0].until=20000;s.auras[0].stacks=2;
 buffs=read();assert.equal(buffs.find(b=>b.spellId===324).charges,1);
 assert.equal(buffs.find(b=>b.spellId===10060).until,20000);assert.equal(buffs.find(b=>b.spellId===10060).stacks,2);
 s.clock=1300;s.absorb.amount=0;s.manaShield.amount=0;s.reactiveClass.charges=0;s.auras=[];s.itemBuffs=[];
 buffs=read();for(const id of [324,17,1463,10060,3164])assert.ok(!buffs.some(b=>b.spellId===id),`retained ${id}`);
 s.clock=1400;s.auras=[{spell:10060,positive:true,until:1500}];assert.ok(read().some(b=>b.spellId===10060));
 s.clock=1500;assert.ok(!read().some(b=>b.spellId===10060));
});
test('tooltip duration uses localized units and rounds positive remaining time up',()=>{
 assert.deepEqual([0,999,59000,60000,60001,3600000].map(buffRemaining),[
  '剩余 0 秒','剩余 1 秒','剩余 59 秒','剩余 1 分钟','剩余 2 分钟','剩余 1 小时',
 ]);
});
