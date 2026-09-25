import {battlePresentation,playerBuffs} from '../../../packages/game-domain/src/rules/battle-presentation.js';
import {icon} from '../../../packages/game-domain/src/rules/catalog.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats,act,view,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat,combatTick,hurtPlayer} from '../../../packages/game-domain/src/rules/combat.js';
import {talents,classTalentTrees,classDefinitions} from '../../../packages/game-domain/src/rules/catalog.js';
import {behindTarget,detectsTarget} from '../../../packages/game-domain/src/rules/combat-space.js';
import {spellInfo} from '../../../packages/game-domain/src/rules/character.js';
import {validateRules,currentStrategyRules} from '../../../packages/game-domain/src/rules/combat-strategy.js';
import {defaultClassRules} from '../../../packages/game-domain/src/rules/class-support.js';

function fixture(classId,learned,rules=learned){
 const s=createGame('职业测试',12345,0,{classId,raceId:classId===7?2:classId===11?4:classId===3?3:1});
 s.classId=classId;s.level=20;s.learned=learned;s.rules=rules.map(spell=>({spell,condition:'always',value:0,enabled:true}));s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.energy=100;s.rage=800;
 startCombat(s,[299]);const e=s.combat.enemies[0];e.hp=e.maxHp=100000;e.nextAttack=1e9;e.nextSpell=1e9;e.rootUntil=1e9;e.level=20;return s;
}
function tickTo(s,until){for(let at=s.clock;at<=until;at+=100){s.clock=at;combatTick(s);}}

test('player priest shield absorbs damage and its cooldown prevents reapplying weakened soul',()=>{
 const s=fixture(5,[17,585],[17]);s.hp=Math.floor(stats(s).maxHp*.4);combatTick(s);
 assert.ok(s.absorb?.amount>0,'shield must create a real absorb');const hp=s.hp,amount=s.absorb.amount;
 hurtPlayer(s,s.combat.enemies[0],s,amount+10,'测试攻击');assert.equal(s.hp,hp-10);assert.equal(s.absorb.amount,0);
 s.clock=1600;combatTick(s);assert.equal(s.absorb.amount,0);
});

test('Renew restores health in periodic ticks instead of charging mana for a no-op',()=>{
 const s=fixture(5,[139],[139]);s.hp=100;combatTick(s);const mana=s.mana;assert.ok(s.hots?.length);
 s.rules=[];tickTo(s,3100);assert.ok(s.hp>100);assert.equal(s.mana,mana);assert.ok(s.logs.some(l=>l.kind==='heal'&&l.spellId===139));
});

test('every class produces its own damaging action with seeded state and real resource costs',()=>{
 for(const [id,skills,spell]of [[1,[78],78],[2,[21084,20271],20271],[3,[3044],3044],[4,[1752],1752],[5,[585],585],[7,[403],403],[8,[133],133],[9,[686],686],[11,[5176],5176]]){
  const s=fixture(id,skills);tickTo(s,20000);assert.ok(s.logs.some(l=>l.kind==='damage'&&l.spellId===spell),`class ${id} must deal damage with ${spell}`);
  assert.ok(Number.isFinite(s.hp)&&Number.isFinite(s.mana));
 }
});

test('warlock periodic damage expires and survives JSON continuation deterministically',()=>{
 const s=fixture(9,[172]);combatTick(s);tickTo(s,2100);s.rules=[];const restored=JSON.parse(JSON.stringify(s));
 tickTo(s,22000);tickTo(restored,22000);assert.deepEqual(restored,s);assert.ok(s.logs.some(l=>l.kind==='damage'&&l.periodic));assert.equal(s.combat.enemies[0].dots.length,0);
});

test('hunter and warlock summons deal attributed damage and are not free repeated summons',()=>{
 for(const [id,spell]of [[3,883],[9,688]]){const s=fixture(id,[spell]);tickTo(s,15000);assert.ok(s.pet,`pet for ${id}`);assert.ok(s.logs.some(l=>l.kind==='damage'&&l.action?.includes('宠物')));assert.equal(s.logs.filter(l=>l.kind==='cast'&&l.spellId===spell).length,1);}
});

test('dead hunter pets require a paid Revive Pet cast and return at 15 percent health',()=>{
 const s=fixture(3,[883,982,1515],[883]);combatTick(s);const pet=s.pet;pet.hp=0;s.clock=1600;combatTick(s);assert.equal(s.pet.hp,0,'Call Pet cannot revive');
 s.rules=[{spell:1515,condition:'always',value:0,enabled:true}];s.nextAction=0;combatTick(s);assert.equal(s.cast,null,'taming cannot replace a dead owned pet');
 s.rules=[{spell:982,condition:'always',value:0,enabled:true}];const mana=s.mana;combatTick(s);assert.equal(s.cast?.spell,982);assert.equal(s.mana,mana);assert.ok(s.cast.timing.cost>0);const end=s.cast.until;s.rules=[];tickTo(s,end);assert.equal(s.pet,pet);assert.equal(s.pet.hp,Math.round(s.pet.maxHp*.15));
});

test('hunters keep fighting when a faster melee enemy prevents reaching bow range',()=>{
 const s=fixture(3,[75,1978,3044,2973]);s.rules=defaultClassRules(3);const e=s.combat.enemies[0];e.rootUntil=0;e.moveSpeed=8;e.position=s.position+4;
 tickTo(s,30000);assert.ok(s.logs.some(l=>l.kind==='damage'&&l.at>20000&&!l.periodic),'must not retreat forever');
});

test('stealth suppresses automatic swings until the rogue can use Ambush',()=>{
 const s=fixture(4,[1784,8676,1752]);const e=s.combat.enemies[0];e.rootUntil=0;e.nextAttack=0;
 tickTo(s,9000);const ambush=s.logs.find(l=>l.kind==='damage'&&l.spellId===8676);assert.ok(ambush,'stealth opener must land');assert.ok(!s.logs.some(l=>l.kind==='damage'&&l.actorId===s.id&&l.at<ambush.at),'no auto attack may break the opener');
});

test('druid cat form consumes energy on Claw and regenerates it separately from mana',()=>{
 const s=fixture(11,[768,1082]);tickTo(s,10000);assert.equal(s.form,'cat');assert.ok(s.logs.some(l=>l.kind==='damage'&&l.spellId===1082));assert.ok(s.energy<100&&s.energy>=0); // Without Furor, shifting starts at zero energy; the third tick funds Claw.
});

test('all nine default strategy lists project to learned active skills before saving',()=>{
 for(const classId of [1,2,3,4,5,7,8,9,11]){const s=fixture(classId,[]);assert.doesNotThrow(()=>validateRules(s,currentStrategyRules(s,defaultClassRules(classId))));}
});

test('talent ranks change spell cast times, costs, and actual healing',()=>{
 const warlock=fixture(9,[172]);const corruption=Object.values(talents).find(t=>t.classId===9&&t.name==='Improved Corruption');assert.equal(spellInfo(warlock,172).castMs,2000);warlock.talents[corruption.id]=5;assert.equal(spellInfo(warlock,172).castMs,0);
 const rogue=fixture(4,[1752]);const sinister=Object.values(talents).find(t=>t.classId===4&&t.name==='Improved Sinister Strike');const before=spellInfo(rogue,1752).mana;rogue.talents[sinister.id]=2;assert.equal(spellInfo(rogue,1752).mana,before-5);
 const priest=fixture(5,[139]);const renew=Object.values(talents).find(t=>t.classId===5&&t.name==='Improved Renew');priest.hp=100;const plain=JSON.parse(JSON.stringify(priest));priest.talents[renew.id]=3;combatTick(plain);combatTick(priest);assert.ok(priest.hots[0].amount>plain.hots[0].amount);
});

test('Savage Strikes increases actual Raptor Strike critical hits',()=>{
 const rank=Object.values(talents).find(t=>t.classId===3&&t.name==='Savage Strikes');const counts=[];
 for(const points of [0,2]){const s=fixture(3,[2973]);s.talents[rank.id]=points;s.mana=100000;s.position=s.combat.enemies[0].position-4;tickTo(s,180000);counts.push(s.logs.filter(l=>l.kind==='damage'&&l.spellId===2973&&l.critical).length);}
 assert.ok(counts[1]>counts[0],`${counts}`);
});

test('Thunder Clap applies its attack-speed debuff as well as damage',()=>{
 const s=fixture(1,[6343]);s.position=s.combat.enemies[0].position-4;combatTick(s);assert.ok(s.combat.enemies[0].auras?.some(a=>a.type===138&&a.amount===-10&&a.until>s.clock));
});

test('Rockbiter uses the enchant aura attack power, never the 1800-second duration as AP',()=>{
 const s=fixture(7,[8017]);const before=stats(s).attackPower;combatTick(s);const added=stats(s).attackPower-before;assert.equal(added,49);assert.ok(added<100);
});

test('Stoneskin reduces physical hits, Strength of Earth changes strength, and fire totem deals damage',()=>{
 const s=fixture(7,[8071,8075,3599]);s.rules=[{spell:8071,condition:'always',value:0,enabled:true}];s.position=20;combatTick(s);s.rules=[];tickTo(s,2100);assert.equal(s.stoneskin.amount,4);const hp=s.hp;hurtPlayer(s,s.combat.enemies[0],s,10);assert.equal(s.hp,hp-6);
 s.rules=[{spell:8075,condition:'always',value:0,enabled:true}];s.nextAction=0;const str=stats(s).str;combatTick(s);s.rules=[];tickTo(s,4200);assert.equal(stats(s).str,str+10);
 s.rules=[{spell:3599,condition:'always',value:0,enabled:true}];s.nextAction=0;combatTick(s);s.rules=[];tickTo(s,6500);assert.ok(s.logs.some(l=>l.kind==='damage'&&l.spellId===3599));
});

test('pets are living combat targets and never dilute player experience rewards',()=>{
 const s=fixture(9,[688]);tickTo(s,12000);assert.ok(s.pet.hp>0);hurtPlayer(s,s.combat.enemies[0],s.pet,s.pet.maxHp+1);assert.equal(s.pet.hp,0);assert.equal(s.pet.xp,undefined);assert.equal(s.level,20);
});

test('each of the 27 trees offers a complete 11-point implemented level-20 allocation',()=>{
 for(const tree of classTalentTrees){
  const raceId=classDefinitions.find(c=>c.id===tree.classId).races[0];let s=createGame('天赋构筑',178,0,{classId:tree.classId,raceId});s.level=20;
  for(let point=0;point<11;point++){const node=view(s).talents.find(t=>t.tree===tree.id&&t.canLearn);assert.ok(node,`${tree.classId}/${tree.name}: no functional node for point ${point+1}`);s=act(s,{type:'talent',id:node.id},0);}
  assert.equal(Object.values(s.talents).reduce((n,v)=>n+v,0),11);
 }
});

test('nine class hunt simulations resume identically through JSON and split advances',()=>{
 for(const definition of classDefinitions){
  let s=createGame('存档职业',922,0,{classId:definition.id,raceId:definition.races[0]});s.level=20;s.money=1000000;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
  // Train through the real public action, respecting previous ranks and support.
  for(let pass=0;pass<5;pass++){const available=view(s).skills.filter(a=>a.canTrain);if(!available.length)break;for(const a of available)s=act(s,{type:'train',id:a.spellId},0);}
  startCombat(s,[636]);const target=s.combat.enemies[0];target.hp=target.maxHp=100000;target.nextAttack=target.nextSpell=1e9;
  const full=advance(s,15000).state,split=advance(JSON.parse(JSON.stringify(advance(s,7000).state)),15000).state;assert.deepEqual(split,full,definition.name);assert.ok(Number.isFinite(full.hp)&&Number.isFinite(full.mana),definition.name);
 }
});

for(const opener of [53,8676])for(const party of [false,true])test(`rogue circles behind before ${opener} opening (${party?'party':'solo'})`,()=>{
 const s=fixture(4,[1784,opener,1752]),e=s.combat.enemies[0];e.combatFacing=Math.PI;
 if(party){
  const tank=createGame('坦克',7,0,{classId:1,raceId:1});tank.id='test-tank';tank.level=20;tank.hp=stats(tank).maxHp;tank.rules=[];tank.position=e.position-4;tank.positionY=0;tank.nextAction=0;tank.nextSwing=0;tank.nextPowerRegen=2000;
  s.party=[tank];s.combat.participantIds.push(tank.id);e.target=tank.id;e.threat[tank.id]=100000;
  // Dungeon preparation may finish well after the encounter was created.
  s.combat.pull={startsAt:2000,engagedAt:null};s.clock=2000;
 }
 e.rootUntil=0;e.nextAttack=0;
 let opened=false,movedLaterally=false;
 for(let i=0;i<300;i++){
  const before=s.logs.length;combatTick(s);
  movedLaterally ||= Math.abs(s.positionY)>1;
  const cast=s.logs.slice(before).find(l=>l.actorId===s.id&&l.kind==='cast'&&l.spellId===opener);
  if(cast){assert.ok(behindTarget(s,e),'opener must be physically behind the target');opened=true;break;}
  assert.ok(!s.logs.some(l=>l.actorId===s.id&&['damage','miss'].includes(l.kind)),'no lower priority attack breaks stealth');
  s.clock+=100;
 }
 assert.ok(opened,'configured opener must execute');assert.ok(movedLaterally,'rogue must circle around the target');
 assert.equal(s.logs.filter(l=>l.actorId===s.id&&l.spellId===1784&&l.kind==='cast').length,1);
});

test('stealth rear movement respects roots and resumes deterministically',()=>{
 const s=fixture(4,[1784,8676,1752]);s.rootUntil=3000;const start=[s.position,s.positionY];
 tickTo(s,2500);assert.deepEqual([s.position,s.positionY],start);assert.equal(s.stealthed,true);
 const restored=JSON.parse(JSON.stringify(s));tickTo(s,15000);tickTo(restored,15000);assert.deepEqual(restored,s);
 assert.ok(s.logs.some(l=>l.kind==='cast'&&l.spellId===8676));
});

test('PvE stealth detection distinguishes the front from the rear',()=>{
 const s=fixture(4,[1784]),e=s.combat.enemies[0];e.combatFacing=Math.PI;s.stealthed=true;s.positionY=e.positionY;
 s.position=e.position-4;assert.equal(detectsTarget(e,s,0),true);
 s.position=e.position+4;assert.equal(detectsTarget(e,s,0),false);
 s.position=e.position+.5;assert.equal(detectsTarget(e,s,0),true);
});

for(const incoming of [false,true])test(`ordinary Stealth cannot start after ${incoming?'incoming damage':'enemy acquisition'} without outgoing threat`,()=>{
 const s=fixture(4,[1784],[1784]),e=s.combat.enemies[0];s.rules=[];s.nextSwing=1e9;
 if(incoming)hurtPlayer(s,e,s,1);else combatTick(s);
 assert.equal(e.threat[s.id]||0,0,'regression must not rely on outgoing threat');
 s.rules=[{spell:1784,condition:'always',value:0,enabled:true}];s.clock=2000;s.nextAction=0;
 combatTick(s);assert.equal(!!s.stealthed,false);assert.ok(!s.logs.some(l=>l.kind==='cast'&&l.spellId===1784));
});

test('ordinary Stealth stays blocked after threat resets and JSON continuation, but a new encounter permits an opener',()=>{
 let s=fixture(4,[1784],[1784]),e=s.combat.enemies[0];hurtPlayer(s,e,s,1);e.threat={};e.target=null;
 s=JSON.parse(JSON.stringify(s));s.clock=2000;combatTick(s);assert.equal(!!s.stealthed,false);
 startCombat(s,[299]);combatTick(s);assert.equal(s.stealthed,true);
});

test('Vanish can still enter stealth after the rogue has engaged',()=>{
 const s=fixture(4,[1856],[1856]),e=s.combat.enemies[0];s.bag.push({id:5140,count:1});hurtPlayer(s,e,s,1);e.threat[s.id]=100;
 combatTick(s);assert.equal(s.stealthed,true);assert.equal(e.threat[s.id],0);
 assert.ok(s.logs.some(l=>l.kind==='cast'&&l.spellId===1856));
});

test('stealth buff uses the spell icon in the HUD and combat presentation',()=>{
 const s=fixture(4,[1784]);combatTick(s);
 for(const effects of [playerBuffs(s),battlePresentation(s).units[s.id].effects]){
  const buff=effects.find(a=>a.spellId===1784);assert.ok(buff);assert.equal(buff.icon,icon('spells',1784));assert.ok(buff.icon);assert.equal(buff.until,null);
 }
 s.stealthed=false;assert.ok(!playerBuffs(s).some(a=>a.spellId===1784));
 s.stealthed=true;s.form='cat';assert.equal(playerBuffs(s).find(a=>a.spellId===5215)?.icon,icon('spells',5215));
});

for(const opener of [53,8676])test(`solo rogue approaches directly from behind for ${opener}`,()=>{
 const s=fixture(4,[1784,opener,1752]),e=s.combat.enemies[0];
 assert.ok(behindTarget(s,e),'enemy must spawn facing away');
 const initialY=s.positionY;
 let opened=false;
 for(let at=0;at<=4000;at+=100){
  s.clock=at;combatTick(s);assert.equal(s.positionY,initialY,'no circling is needed');
  if(s.logs.some(l=>l.actorId===s.id&&l.kind==='cast'&&l.spellId===opener)){assert.ok(behindTarget(s,e));opened=true;break;}
 }
 assert.ok(opened,'rear-facing spawn should allow the opener within four seconds');
 s.clock+=100;combatTick(s);assert.equal(behindTarget(s,e),false,'enemy turns toward the rogue after the opener');
});

test('solo rogue rear-facing spawns apply to every enemy but not a party encounter',()=>{
 const s=fixture(4,[1784]);startCombat(s,[299,299,299]);
 assert.ok(s.combat.enemies.every(e=>behindTarget(s,e)));
 const ally=createGame('队友',9,0,{classId:5,raceId:1});ally.id='ally';s.party=[ally];
 startCombat(s,[299]);assert.equal(behindTarget(s,s.combat.enemies[0]),false);
 const warrior=fixture(1,[78]);assert.equal(behindTarget(warrior,warrior.combat.enemies[0]),false);
});
