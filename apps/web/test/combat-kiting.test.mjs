import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {spellInfo} from '../../../packages/game-domain/src/rules/character.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {spellApproachRange,positionPartyMember} from '../../../packages/game-domain/src/rules/combat-positioning.js';
import {distance} from '../../../packages/sim-core/src/geometry.js';

function group(){
 let s=createGame('追击测试',283,0);s.level=20;s.learned.push(116,7322,2136);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 for(const id of ['warrior','priest','rogue','mage'])s=act(s,{type:'recruit',id},0);
 startCombat(s,[299],true);
 const [tank,healer,rogue,mage]=s.party,e=s.combat.enemies[0];tank.hp=rogue.hp=0;
 for(const c of [s,...s.party]){c.positionY=0;c.rules=[];}
 s.position=0;mage.position=5;healer.position=50;e.position=45;
 e.hp=e.maxHp=400;e.threat={[healer.id]:100000};e.target=healer.id;e.moveSpeed=7;e.nextAttack=1e9;
 for(const c of [s,mage]){c.learned.push(7322);c.rules=[{spell:7322,condition:'always',value:0,enabled:true}];}
 return s;
}

test('a dead tank leaves a supported retreat and both mages resume damaging the pursuer',()=>{
 let s=group();const ids=[s.id,s.party[3].id],origin=structuredClone(s.party[1]),events=[];let sequence=s.logSequence,maxDisplacement=0;
 while(s.combat&&s.clock<30000){s=advance(s,s.wallAt+100).state;events.push(...s.logs.filter(l=>l.id>sequence));sequence=s.logSequence;maxDisplacement=Math.max(maxDisplacement,distance(origin,s.party[1]));}
 assert.equal(s.combat,null);assert.ok(s.clock<15000);
 for(const id of ids)assert.ok(events.some(l=>l.kind==='damage'&&l.actorId===id),'each mage must land damage');
 assert.ok(maxDisplacement<60,'healer must remain close to the supporting group');
 assert.equal(events.some(l=>l.kind==='cancel'&&l.reason==='range'),false);
});

test('support retreat is bounded, respects roots, and holds position when nobody pursues',()=>{
 const s=group(),healer=s.party[1],e=s.combat.enemies[0];s.party[3].position=0;
 healer.position=12;e.position=7;const before=healer.position;
 healer.rootUntil=1000;assert.equal(positionPartyMember(s,healer),false);assert.equal(healer.position,before);healer.rootUntil=0;
 for(let i=0;i<1000;i++){const p={position:healer.position,positionY:healer.positionY};e.position=p.position-5;e.positionY=p.positionY;positionPartyMember(s,healer);assert.ok(distance(healer,s)<=12+1e-9);}
 e.target=s.id;const p=[healer.position,healer.positionY];assert.equal(positionPartyMember(s,healer),false);assert.deepEqual([healer.position,healer.positionY],p);
});

test('cast approach reserves distance for a receding target but preserves static, incoming and ground casts',()=>{
 const s=group(),e=s.combat.enemies[0],sp=spellInfo(s,7322);e.position=30;
 assert.equal(spellApproachRange(s,s,e,sp),sp.range);
 e.combatMotion={at:0,x:7,y:0};assert.ok(spellApproachRange(s,s,e,sp)<sp.range-10);
 e.combatMotion.x=-7;assert.equal(spellApproachRange(s,s,e,sp),sp.range);
 e.combatMotion.x=7;assert.equal(spellApproachRange(s,s,e,{...sp,SpellName:'Flamestrike'}),sp.range);
 assert.equal(spellApproachRange(s,s,e,{...sp,castMs:0}),sp.range);
 s.clock=200;assert.equal(spellApproachRange(s,s,e,sp),sp.range);
});

test('movement fallback uses only enabled in-range instants whose configured conditions match',()=>{
 for(const enabled of [true,false])for(const value of [10,90]){
  const s=group(),e=s.combat.enemies[0];e.position=19;e.combatMotion={at:0,x:7,y:0};e.hp=200;
  s.rules.push({spell:2136,condition:'targetHealthBelow',value,enabled});combatTick(s);
  assert.equal(s.logs.some(l=>l.kind==='cast'&&l.actorId===s.id&&l.spellId===2136),enabled&&value===90);
  assert.equal(s.cast,null);
 }
});

test('out-of-range cancellation records the cause and retries from inside the boundary without spending mana',()=>{
 const s=group(),e=s.combat.enemies[0];e.position=25;combatTick(s);assert.ok(s.cast);
 const mana=s.mana;s.clock=s.cast.until;e.position=50;combatTick(s);
 assert.equal(s.cast,null);assert.equal(s.mana,mana);assert.ok(s.logs.some(l=>l.kind==='cancel'&&l.actorId===s.id&&l.reason==='range'));
 e.position=29;delete e.combatMotion;combatTick(s);assert.equal(s.cast,null);assert.ok(s.position>0);
});

test('kiting decisions remain deterministic after serialization and partitioned advancement',()=>{
 const s=group(),once=advance(s,30000).state;
 let chunks=advance(s,1000).state;chunks=JSON.parse(JSON.stringify(chunks));
 for(let now=2000;now<=30000;now+=1000)chunks=advance(chunks,now).state;
 assert.deepEqual(chunks,once);
});
