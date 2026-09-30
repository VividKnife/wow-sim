import test from 'node:test';
import assert from 'node:assert/strict';
import {hudEffects,buffDuration,buffRemaining} from '../lib/player-effects.js';
import {createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {applyExperienceBuff} from '../../../packages/game-domain/src/rules/experience.js';
import {battlePresentation,playerEffects} from '../../../packages/game-domain/src/rules/battle-presentation.js';
import {startCombat,commandCombatCast,executeCombatIntent} from '../../../packages/game-domain/src/rules/combat.js';
import {projectClientSnapshot,projectCombatPlayback,createCombatFrameProjector} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {dispelSpellAuras} from '../../../packages/game-domain/src/rules/spell-aura-lifecycle.js';
import {CombatStreamSender,CombatStreamReceiver,hydrateCombatFrame} from '../../../packages/sim-core/src/combat-stream.js';
import {playbackPerspective} from '../lib/combat-playback.js';
test('HUD lists permanent and active buffs outside combat, deduplicating server effects',()=>{
 const s=applyExperienceBuff(createGame('Buff测试',1,0),2);
 s.clock=1000;s.buffs={int:{spell:1459,until:10000,amount:2,kind:'int'},expired:{spell:168,until:999}};
 s.dots=[{spell:589,until:10000}];
 const d=view(s),buffs=hudEffects(s,d);
 assert.equal(buffs.filter(b=>b.name==='经验加成').length,1);
 assert.ok(buffs.find(b=>b.spellId===1459));
 assert.ok(!buffs.find(b=>b.spellId===168));
 assert.equal(buffs.find(b=>b.spellId===589).kind,'debuff');
 assert.equal(buffs[0].permanent,true);
 s.clock=10001;
 assert.deepEqual(hudEffects(s,d).map(effect=>effect.name),s.serverBuffs.map(effect=>effect.name));
});
test('HUD formats short countdowns and merges timed item effects',()=>{
 assert.deepEqual([999,10000,60000,3600000].map(buffDuration),['1s','10s','1m','1h']);
 const buffs=hudEffects({clock:1000},{itemBuffs:[{spell:1,name:'药剂',until:2000},{spell:2,name:'已过期',until:1000}]});
 assert.equal(buffs.length,1);assert.equal(buffs[0].permanent,false);
});

test('HUD uses Classic aura text instead of internal effect labels or runtime amounts',()=>{
 const s=createGame('光环说明',1,0);s.clock=1000;
 s.buffs={int:{spell:1459,until:1801000,amount:2,kind:'int'}};
 s.hots=[{spell:139,until:16000,amount:9}];
 s.absorb={spell:17,until:31000,amount:44};
 const buffs=hudEffects(s,view(s));
 assert.equal(buffs.find(b=>b.spellId===1459).detail,'智力提高2点。');
 assert.equal(buffs.find(b=>b.spellId===1459).dispel,'魔法');
 assert.equal(buffs.find(b=>b.spellId===139).detail,'每3秒回复9点生命值。');
 assert.equal(buffs.find(b=>b.spellId===17).detail,'吸收伤害。');
});
test('item buffs expose the aura name and original effect description',()=>{
 const s=createGame('药剂说明',1,0);s.clock=1000;
 s.itemBuffs=[{item:2454,spell:3164,stats:{str:8},until:60000}];
 const buff=hudEffects(s,view(s)).find(b=>b.spellId===3164);
 assert.equal(buff.detail,'力量提高8点。');
 assert.ok(buff.name);assert.equal(buff.dispel,'');
});

test('HUD distinguishes helpful and harmful effects across combat stores',()=>{
 const s=createGame('战斗增益',1,0);s.clock=1000;
 s.auras=[{spell:10060,positive:true,until:16000},{spell:118,positive:false,until:16000}];
 s.periodicClass=[{spell:139,type:8,until:16000}];
 s.reactiveClass={spell:324,charges:3,until:60000};
 s.racialEffects={forsaken:{until:6000}};
 s.bloodrage={until:11000};s.sprintUntil=16000;
 s.dots=[{spell:589,until:16000}];s.weakenedSoulUntil=16000;
 const buffs=playerEffects(s);
 for(const id of [10060,139,324,7744,2687,2983])assert.equal(buffs.find(b=>b.spellId===id)?.kind,'buff',`missing ${id}`);
 for(const id of [118,589,6788])assert.equal(buffs.find(b=>b.spellId===id)?.kind,'debuff',`missing harmful ${id}`);
});

test('shield applies visible weakened soul to its recipient and blocks repeat manual and policy casts until expiry',()=>{
 const s=createGame('牧师',1,0,{classId:5,raceId:1});s.level=20;s.learned=[17];s.mana=1000;
 const ally=createGame('队友',2,0,{classId:1,raceId:1});ally.id='ally';s.party=[ally];
 startCombat(s,[6]);delete s.combat.pull;s.position=ally.position=0;
 commandCombatCast(s,s,17,ally.id);
 assert.equal(s.weakenedSoulUntil,undefined);assert.equal(ally.weakenedSoulUntil,15000);
 const effect=playerEffects({...ally,clock:s.clock}).find(e=>e.spellId===6788);
 assert.equal(effect.kind,'debuff');assert.equal(effect.until,15000);assert.match(effect.detail,/真言术：盾/);
 ally.absorb.amount=0;s.clock=5000;
 const mana=s.mana;
 assert.throws(()=>commandCombatCast(s,s,17,ally.id),/虚弱灵魂/);
 assert.equal(executeCombatIntent(s,s,{kind:'cast',family:'class',spellId:17,targetId:ally.id}).accepted,false);
 assert.equal(s.mana,mana);assert.equal(ally.absorb.amount,0);
 // The selected recipient can be another player, so verify the HTTP HUD too.
 const selected={...s,id:ally.id,hp:ally.hp,absorb:ally.absorb,weakenedSoulUntil:ally.weakenedSoulUntil,party:[],combat:null};
 const snapshot=projectClientSnapshot(selected,view(selected));
 assert.equal(hudEffects(snapshot.player,snapshot.view).find(e=>e.spellId===6788)?.kind,'debuff');
 s.clock=15000;assert.ok(!playerEffects({...ally,clock:s.clock}).some(e=>e.spellId===6788));
 commandCombatCast(s,s,17,ally.id);assert.ok(ally.absorb.amount>0);assert.equal(ally.weakenedSoulUntil,30000);
});

test('slows and scripted controls are visible, expire and do not duplicate equivalent auras',()=>{
 const actor={clock:1000,movementSlows:[{spell:116,caster:'mage',amount:.4,until:6000}],stunUntil:4000,rootUntil:5000,silenceUntil:3000,auras:[{spell:853,type:12,until:4000,positive:false}]};
 const effects=playerEffects(actor);
 assert.equal(effects.find(e=>e.spellId===116)?.kind,'debuff');
 assert.equal(effects.find(e=>e.spellId===853)?.kind,'debuff');
 assert.ok(!effects.some(e=>e.name==='昏迷'));assert.ok(effects.some(e=>e.name==='定身'));assert.ok(effects.some(e=>e.name==='沉默'));
 actor.clock=6000;assert.deepEqual(playerEffects(actor),[]);
});

test('same-name damage effects retain different casters and disappear when dispelled',()=>{
 const s=createGame('持续伤害',1,0);s.clock=1000;
 s.dots=['a','b'].map(caster=>({spellId:589,caster,next:4000,remaining:3,interval:3000}));
 const effects=hudEffects(s,view(s));assert.equal(effects.length,2);assert.notEqual(effects[0].id,effects[1].id);
 assert.ok(effects.every(e=>e.kind==='debuff'&&e.until===10000));
 dispelSpellAuras(s,[1],1,s,'negative');assert.equal(hudEffects(s,view(s)).length,1);
 dispelSpellAuras(s,[1],1,s,'negative');assert.deepEqual(hudEffects(s,view(s)),[]);
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
  return hudEffects(current.state,current.data);
 };
 assert.ok(!read().some(b=>b.spellId===324));
 s.clock=1100;s.reactiveClass={spell:324,charges:3,until:60000};
 s.auras=[{spell:10060,positive:true,until:16000,stacks:1}];
 s.absorb={spell:17,amount:44,until:31000};
 s.manaShield={spell:1463,amount:120,until:61000};
 s.weakenedSoulUntil=16100;s.dots=[{spellId:589,caster:'enemy',next:4100,interval:3000,remaining:3}];
 s.itemBuffs=[{item:2454,spell:3164,stats:{str:8},until:60000}];
 let buffs=read();assert.equal(buffs.find(b=>b.spellId===324).charges,3);
 for(const id of [10060,17,1463,3164])assert.ok(buffs.some(b=>b.spellId===id));
 for(const id of [6788,589])assert.equal(buffs.find(b=>b.spellId===id)?.kind,'debuff');
 s.clock=1200;s.reactiveClass.charges=1;s.auras[0].until=20000;s.auras[0].stacks=2;
 buffs=read();assert.equal(buffs.find(b=>b.spellId===324).charges,1);
 assert.equal(buffs.find(b=>b.spellId===10060).until,20000);assert.equal(buffs.find(b=>b.spellId===10060).stacks,2);
 s.clock=1300;s.absorb.amount=0;s.manaShield.amount=0;s.reactiveClass.charges=0;s.auras=[];s.itemBuffs=[];
 buffs=read();for(const id of [324,17,1463,10060,3164])assert.ok(!buffs.some(b=>b.spellId===id),`retained ${id}`);
 assert.ok(buffs.some(b=>b.spellId===6788),'weakened soul survives a consumed shield');
 s.dots=[];assert.ok(!read().some(b=>b.spellId===589));
 s.clock=1400;s.auras=[{spell:10060,positive:true,until:1500}];assert.ok(read().some(b=>b.spellId===10060));
 s.clock=1500;assert.ok(!read().some(b=>b.spellId===10060));
 s.clock=16100;assert.ok(!read().some(b=>b.spellId===6788));
});
test('tooltip duration uses localized units and rounds positive remaining time up',()=>{
 assert.deepEqual([0,999,59000,60000,60001,3600000].map(buffRemaining),[
  '剩余 0 秒','剩余 1 秒','剩余 59 秒','剩余 1 分钟','剩余 2 分钟','剩余 1 小时',
 ]);
});
