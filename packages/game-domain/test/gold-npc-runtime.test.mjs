import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../src/rules/engine.js';
import {newCharacter} from '../src/rules/character.js';
import {startCombat} from '../src/rules/combat.js';
import {moltenCoreTick} from '../src/rules/molten-core-encounter.js';
import {marketPrice} from '../src/rules/inventory.js';

function fixture(){
 const s=createGame('金团补给',722,0);s.level=60;s.hp=stats(s).maxHp;
 const c=newCharacter('补给治疗',5,60,1);c.id='healer';c.hp=stats(c).maxHp;c.mana=0;c.money=1000000;
 c.strategyPolicy={role:'healer'};c.goldNpc=true;
 c.goldProfile={skill:'regular',usingConsumables:true,nextThink:999999,consumableSpent:0,potionsUsed:0};
 s.party=[c];s.goldRaid={active:true};startCombat(s,[10184],true);delete s.combat.pull;
 const boss=s.combat.enemies[0];boss.hp=Math.floor(boss.maxHp*.5);boss.airborne=true;
 s.combat.raidEncounter={id:'onyxia',bossId:boss.id,phase:2,fires:[],tactics:{avoidFire:false},nextWhelps:999999,nextSpecial:999999,nextBreath:999999};
 return {s,c,boss};
}
const tick=s=>moltenCoreTick(s,[s,...s.party],()=>{});

test('Onyxia uses ordinary NPC potions with real wallet costs, cooldown and deterministic recovery',()=>{
 const {s,c}=fixture(),money=c.money,leaderMoney=s.money,price=marketPrice(13444).buy;
 tick(s);
 assert.ok(c.mana>0);assert.equal(c.money,money-price);assert.equal(s.money,leaderMoney);
 assert.equal(c.goldProfile.potionsUsed,1);assert.equal(c.goldProfile.consumableSpent,price);
 assert.ok(c.potionReady>s.clock);assert.equal(s.logs.filter(l=>l.kind==='potion').length,1);
 c.mana=0;s.clock=100;tick(s);
 assert.equal(c.mana,0);assert.equal(c.money,money-price);assert.equal(c.goldProfile.potionsUsed,1);
 const restored=JSON.parse(JSON.stringify(s));s.clock=restored.clock=c.potionReady;
 tick(s);tick(restored);assert.deepEqual(restored,s);
 assert.ok(c.mana>0);assert.equal(c.money,money-2*price);assert.equal(c.goldProfile.potionsUsed,2);
});

test('raid potion lifecycle respects funds, opt-out, death and encounter completion',()=>{
 for(const reason of ['funds','opt-out','dead','finished']){
  const {s,c,boss}=fixture();
  if(reason==='funds')c.money=0;
  if(reason==='opt-out')c.goldProfile.usingConsumables=false;
  if(reason==='dead')c.hp=0;
  if(reason==='finished')boss.hp=0;
  const money=c.money;tick(s);
  assert.equal(c.money,money,reason);assert.equal(c.mana,0,reason);assert.equal(c.goldProfile.potionsUsed,0,reason);
 }
});
