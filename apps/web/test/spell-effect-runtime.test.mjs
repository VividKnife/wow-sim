import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {classDefinitions,classAbilities,spells,talents,table,preciseSpellFamilyFlags} from '../../../packages/game-domain/src/rules/catalog.js';
import {spellInfo} from '../../../packages/game-domain/src/rules/character.js';
import {genericEffects,classChannelTick} from '../../../packages/game-domain/src/rules/class-spell-effects.js';
import {resolveHeal} from '../../../packages/game-domain/src/rules/companion-combat.js';
import {applySpellAura,dispelSpellAuras} from '../../../packages/game-domain/src/rules/spell-aura-lifecycle.js';
import {spellProgram,spellAttributesEx3} from '../../../packages/sim-core/src/spell-program.js';
import {classEffect} from '../../../packages/game-domain/src/rules/class-mechanics.js';
import {hasAura,controlled} from '../../../packages/sim-core/src/combat-auras.js';
import {talentAffectsSpell,talentSpellValue} from '../../../packages/game-domain/src/rules/talent-effects.js';
import {onTalentEvent} from '../../../packages/game-domain/src/rules/talent-runtime.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {readFileSync} from 'node:fs';
import {auditSpellContracts} from '../../../scripts/audit-spell-contracts.mjs';

function actor(classId=8){const definition=classDefinitions.find(c=>c.id===classId),s=createGame('效果验证',313,0,{classId,raceId:definition.races[0]});s.level=60;s.equipment={};s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.auras=[{type:57,amount:-100,until:1e6},{type:52,amount:-100,until:1e6}];s.combat={enemies:[],damage:{},healing:{},casts:0};s.rules=[];return s;}
const target=()=>({id:'dummy',hp:1e8,maxHp:1e8,level:60,armor:0,mana:10000,auras:[],dots:[],threat:{},position:0,positionY:0});
function collector(){const hits=[];return {hits,api:{damage:(s,c,t,value,label,mult,detail)=>{hits.push({value,detail});t.hp-=value;}}};}
function talent(c,name,rank){const entry=Object.values(talents).find(t=>t.classId===c.classId&&t.name===name);assert.ok(entry,name);c.talents[entry.id]=rank;}

test('every player spell rank decodes all ordered effect slots without mutating its source',()=>{
 let count=0;for(const rows of Object.values(classAbilities))for(const row of rows){const sp=spells[row.spellId],before=JSON.stringify(sp),program=spellProgram(sp);assert.equal(program.id,row.spellId);
  assert.deepEqual(program.effects.map(e=>e.index),[1,2,3].filter(n=>sp['Effect'+n]));
  for(const effect of program.effects){assert.equal(effect.id,sp['Effect'+effect.index]);assert.equal(effect.trigger,sp['EffectTriggerSpell'+effect.index]||0);assert.ok(Object.isFrozen(effect));}
  assert.equal(JSON.stringify(sp),before);count++;
 }assert.ok(count>1500);
});

for(const definition of classDefinitions)test(`${definition.nameEn}: every direct magic damage rank stays within its source dice bounds`,()=>{
 const c=actor(definition.id),{hits,api}=collector();let checked=0;
 for(const row of classAbilities[definition.id]){const sp=spellInfo(c,row.spellId);if(!sp.School)continue;
  for(const effect of spellProgram(sp).effects.filter(e=>e.id===2)){
   hits.length=0;const t=target();genericEffects(c,c,t,sp,[c],api,{effects:[effect.index]});
   assert.equal(hits.length,1,`${sp.Id}/${effect.index}`);
   const level=Math.max(0,Math.min(60,sp.MaxLevel||60)-sp.SpellLevel),base=effect.basePoints+level*effect.pointsPerLevel;
   const low=Math.floor(base+Math.max(1,effect.baseDice)),high=Math.floor(base+Math.max(1,effect.dieSides+level*(sp['EffectDicePerLevel'+effect.index]||0)));
   assert.ok(hits[0].value>=low&&hits[0].value<=high,`${sp.Id}/${effect.index}: ${hits[0].value} outside ${low}..${high}`);assert.equal(hits[0].detail.critical,false);checked++;
  }
 }assert.ok(checked>0||[1,4].includes(definition.id));
});

test('Chain Heal bounce scales the entire healing result, including bonus healing',()=>{
 const heal=(coefficient)=>{const s=actor(7);s.auras.push({type:135,amount:500,until:10000});s.hp=1;const sp=spellInfo(s,1064);genericEffects(s,s,s,sp,[s],{heal:resolveHeal},{effects:[1],coefficient});const event=s.logs.findLast(l=>l.kind==='heal');return event.amount+event.overheal;};
 const first=heal(1),second=heal(.5),third=heal(.25);assert.ok(Math.abs(second-first*.5)<=1);assert.ok(Math.abs(third-first*.25)<=1);
});

test('Chain Lightning bounce scales base damage and spell power together',()=>{
 const hit=coefficient=>{const s=actor(7);s.auras.push({type:13,misc:126,amount:350,until:10000});const {hits,api}=collector();genericEffects(s,s,target(),spellInfo(s,421),[s],api,{effects:[1],coefficient});return hits[0].value;};
 assert.ok(Math.abs(hit(.7)-hit(1)*.7)<1e-8);
});

test('periodic heal talent multiplier is applied exactly once',()=>{
 const heal=rank=>{const s=actor(11);if(rank)talent(s,'Improved Rejuvenation',rank);const sp=spellInfo(s,774),t=actor(1);genericEffects(s,s,t,sp,[s,t],{},{});return t.periodicClass[0].amount;};
 assert.equal(heal(3),heal(0)*1.15);
});

test('channeled healing receives its per-tick bonus healing coefficient',()=>{
 const tick=power=>{const s=actor(11);s.hp=1;s.auras.push({type:135,amount:power,until:10000});const values=[];classChannelTick(s,s,s,spellInfo(s,740),{},[s],{healAmount:(s,c,t,v)=>values.push(v)});return values[0];};
 assert.ok(tick(500)>tick(0));
});

test('mana burn never adds direct spell power on top of mana actually burned',()=>{
 const burn=power=>{const s=actor(5);s.auras.push({type:13,misc:126,amount:power,until:10000});const {hits,api}=collector(),t=target();genericEffects(s,s,t,spellInfo(s,8129),[s],api,{effects:[1]});return {mana:t.mana,value:hits[0].value};};
 assert.deepEqual(burn(500),burn(0));
});

test('combo point effects cap at five and switch their target without NaN state',()=>{
 const s=actor(4),t=target();s.combo=4;s.comboTarget=t.id;const sp={...spellInfo(s,1752),Effect1:80,EffectBasePoints1:1,EffectDieSides1:1};genericEffects(s,s,t,sp,[s],{}, {effects:[1]});assert.equal(s.combo,5);
 t.id='second';genericEffects(s,s,t,sp,[s],{},{effects:[1]});assert.equal(s.combo,2);
});

test('effect selection executes one aura slot without replaying the sibling direct hit',()=>{
 const s=actor(9),t=target(),{hits,api}=collector(),sp=spellInfo(s,348),dot=spellProgram(sp).effects.find(e=>e.aura===3);genericEffects(s,s,t,sp,[s],api,{effects:[dot.index]});assert.equal(hits.length,0);assert.equal(t.dots.length,1);
});

test('unsupported effects and trigger cycles are explicit execution results',()=>{
 const s=actor(),t=target(),sp={...spellInfo(s,133),Effect1:999};const report=genericEffects(s,s,t,sp,[s],{}, {effects:[1]});assert.equal(report.unsupported[0].effect,999);
 const cycle=genericEffects(s,s,t,spellInfo(s,133),[s],{},{ancestors:[133]});assert.equal(cycle.unsupported[0].reason,'trigger-cycle-or-depth');
});

test('dispel removes a whole multi-effect spell holder but leaves another caster untouched',()=>{
 const unit={auras:[{spell:1,effect:1,caster:'a',dispel:1,positive:false,until:1000},{spell:1,effect:2,caster:'a',dispel:1,positive:false,until:1000},{spell:1,effect:1,caster:'b',dispel:1,positive:false,until:1000}]};
 assert.equal(dispelSpellAuras(unit,[1],1,{clock:0,rngState:1},'negative'),1);assert.deepEqual(unit.auras.map(a=>a.caster),['b']);
});

test('friendly dispel keeps buffs, hostile dispel keeps debuffs, and expired effects cost no attempt',()=>{
 const unit={auras:[{spell:1,positive:false,dispel:1,until:0},{spell:2,positive:true,dispel:1,until:1000},{spell:3,positive:false,dispel:1,until:1000}]};
 assert.equal(dispelSpellAuras(unit,[1],1,{clock:0},'negative'),1);assert.ok(unit.auras.some(a=>a.spell===2));assert.ok(!unit.auras.some(a=>a.spell===3));
 assert.equal(dispelSpellAuras(unit,[1],1,{clock:0},'positive'),1);assert.ok(!unit.auras.some(a=>a.spell===2));
});

test('dispelled silence stops blocking immediately without a stale second timer',()=>{
 const unit={cast:{spell:133},nextAction:3000};applySpellAura(unit,{spell:15487,effect:1,type:27,dispel:1,positive:false,caster:'enemy',until:5000},0);
 assert.equal(unit.cast,null);assert.equal(unit.nextAction,0);assert.equal(hasAura(unit,27,0),true);
 dispelSpellAuras(unit,[1],1,{clock:0},'negative');assert.equal(hasAura(unit,27,0),false);assert.ok(!unit.silenceUntil);
});

test('higher rank buff replaces lower ranks; lower ranks cannot overwrite it',()=>{
 const unit={};const add=(spell,value)=>applySpellAura(unit,{spell,effect:1,type:29,misc:3,amount:value,positive:true,caster:'mage',until:5000},0);
 add(1459,2);add(1460,7);assert.equal(unit.auras.length,1);assert.equal(unit.auras[0].amount,7);assert.equal(add(1459,2),false);assert.equal(unit.auras[0].spell,1460);
});

test('mechanic immunity rejects a control aura and preserves an existing cast',()=>{
 const unit={cast:{spell:133},auras:[{type:77,misc:12,until:5000}]};assert.equal(applySpellAura(unit,{spell:853,type:12,mechanic:12,until:3000},0),false);assert.ok(unit.cast);assert.equal(controlled(unit,0),false);
});

test('all talent modifier ranks match exact family bits, never an unrelated family',()=>{
 const affects=new Map(table('spell_affect').map(r=>[`${r.entry}:${r.effectId+1}`,r.SpellFamilyMask]));let pairs=0;
 for(const t of Object.values(talents))for(const id of t.ranks){const aura=spells[id];if(!aura)continue;
  for(let n=1;n<=3;n++){if(![107,108].includes(aura['EffectApplyAuraName'+n]))continue;
   const bits=BigInt(affects.get(`${id}:${n}`)??affects.get(`${t.ranks[0]}:${n}`)??aura['EffectItemType'+n]??0);
   for(const row of classAbilities[t.classId]){const sp=spells[row.spellId],expected=(!aura.SpellFamilyName||aura.SpellFamilyName===sp.SpellFamilyName)&&bits!==0n&&(bits&BigInt(preciseSpellFamilyFlags[sp.Id]??sp.SpellFamilyFlags??0))!==0n;
    assert.equal(talentAffectsSpell(aura,n,sp),expected,`${t.name}/${id}/${sp.Id}`);pairs++;
   }
   assert.equal(talentAffectsSpell(aura,n,{SpellFamilyName:999,SpellFamilyFlags:bits.toString()}),false);
  }
 }assert.ok(pairs>100000);
});

test('rank replacement and additive percentage modifiers never multiply duplicate talent ranks',()=>{
 const s=actor(8);talent(s,'Improved Fireball',5);assert.equal(talentSpellValue(s,spells[133],10,3500),3000);talent(s,'Improved Fireball',1);assert.equal(talentSpellValue(s,spells[133],10,3500),3400);
});

test('the per-spell and per-talent contract report reconciles the complete public inventory',()=>{
 const report=auditSpellContracts();assert.deepEqual(report,JSON.parse(readFileSync(new URL('../../../docs/research/spell-contracts.json',import.meta.url),'utf8')));
 assert.equal(report.totals.playerAbilityRows,1759);assert.equal(report.totals.talentNodes,432);assert.equal(report.totals.talentRanks,1357);
 assert.deepEqual(report.missingTriggers,[]);assert.equal(report.claims.everyAbilityEndToEndVerified,false);
});

test('Blast Wave critical damage triggers Ignite through the shared combat event path',()=>{
 const s=actor();talent(s,'Ignite',5);s.auras=[{type:57,amount:100,until:10000},{type:55,amount:100,until:10000}];s.learned=[11113];
 startCombat(s,[299]);const enemy=s.combat.enemies[0];enemy.hp=enemy.maxHp=100000;enemy.position=s.position+2;enemy.positionY=s.positionY;
 s.rules=[{spell:11113,condition:'always',value:0,enabled:true}];s.nextSwing=enemy.nextAttack=enemy.nextSpell=1e9;combatTick(s);const hit=s.logs.findLast(l=>l.kind==='damage'&&l.spellId===11113);assert.ok(hit?.critical);
 const ignite=enemy.dots.find(d=>d.spellId===12654);assert.ok(ignite);assert.equal(ignite.amount*ignite.remaining,Math.floor(hit.amount*.2)*2);
});

test('Ignite refresh carries remaining damage rather than adding parallel copies',()=>{
 const s=actor();talent(s,'Ignite',5);const enemy=target();
 onTalentEvent(s,s,{type:'damage',target:enemy,spell:spells[133],amount:1000,critical:true},{});
 enemy.dots[0].remaining=1;s.clock=2000;
 onTalentEvent(s,s,{type:'damage',target:enemy,spell:spells[11113],amount:500,critical:true},{});
 assert.equal(enemy.dots.length,1);assert.equal(enemy.dots[0].amount*2,400);assert.equal(enemy.dots[0].next,4000);
});

test('every periodic damage and healing rank applies the source amount to the selected slot',()=>{
 let count=0;
 for(const definition of classDefinitions){const s=actor(definition.id);
  for(const row of classAbilities[definition.id]){const sp=spellInfo(s,row.spellId);
   for(const effect of spellProgram(sp).effects.filter(e=>[6,35].includes(e.id)&&[3,8,53,64,89,161].includes(e.aura))){
    const t=target();genericEffects(s,s,t,sp,[s],{}, {effects:[effect.index]});
    const state=[3,53,64,89].includes(effect.aura)?t.dots[0]:t.periodicClass[0];assert.ok(state,`${sp.Id}/${effect.index}`);
    const level=Math.max(0,Math.min(s.level,sp.MaxLevel||s.level)-sp.SpellLevel),expected=Math.floor(effect.basePoints+level*effect.pointsPerLevel+Math.max(1,effect.baseDice));
    assert.equal(state.amount,expected,`${sp.Id}/${effect.index}`);assert.ok(state.interval>0);assert.ok(Number.isFinite(state.next));count++;
   }
  }
 }assert.equal(count,auditSpellContracts().totals.periodicEffectsTested);
});

test('every direct healing rank resolves its source dice range without duplicate effects',()=>{
 let count=0;
 for(const definition of classDefinitions){const s=actor(definition.id);
  for(const row of classAbilities[definition.id]){const sp=spellInfo(s,row.spellId);
   for(const effect of spellProgram(sp).effects.filter(e=>e.id===10)){
    s.hp=1;const before=s.logs.length;genericEffects(s,s,s,sp,[s],{heal:resolveHeal},{effects:[effect.index]});
    const events=s.logs.slice(before).filter(l=>l.kind==='heal');assert.equal(events.length,1,`${sp.Id}/${effect.index}`);
    const level=Math.max(0,Math.min(s.level,sp.MaxLevel||s.level)-sp.SpellLevel),base=effect.basePoints+level*effect.pointsPerLevel;
    const low=Math.floor(base+Math.max(1,effect.baseDice)),high=Math.floor(base+Math.max(1,effect.dieSides+level*(sp['EffectDicePerLevel'+effect.index]||0))),actual=events[0].amount+events[0].overheal;
    assert.ok(actual>=low&&actual<=high,`${sp.Id}/${effect.index}: ${actual} outside ${low}..${high}`);count++;
   }
  }
 }assert.equal(count,auditSpellContracts().totals.directHealingEffectsTested);
});

test('casting a lower rank stat buff preserves the higher rank actual attributes',()=>{
 const s=actor(5);classEffect(s,s,s,spellInfo(s,602),[s],{});const armor=stats(s).armor;classEffect(s,s,s,spellInfo(s,588),[s],{});assert.equal(stats(s).armor,armor);assert.equal(s.classBuffs.find(b=>b.name==='Inner Fire').spell,602);
});

test('the source ignore-caster-modifiers flag bypasses otherwise matching talent modifiers',()=>{
 const s=actor(8);talent(s,'Improved Fireball',5);const sp={...spells[133],AttributesEx3:spellAttributesEx3.IGNORE_CASTER_MODIFIERS};assert.equal(talentSpellValue(s,sp,10,3500),3500);
});

test('per-caster aura source flag preserves independent owners on the same target',()=>{
 const sp=Object.values(spells).find(sp=>sp.AttributesEx3&spellAttributesEx3.PER_CASTER_AURA);assert.ok(sp);
 const unit={};for(const caster of ['a','b'])applySpellAura(unit,{spell:sp.Id,effect:1,type:13,amount:10,caster,until:5000},0);
 assert.deepEqual(unit.auras.map(a=>a.caster),['a','b']);
});
