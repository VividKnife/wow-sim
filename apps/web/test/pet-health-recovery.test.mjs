import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {spellInfo,stats} from '../../../packages/game-domain/src/rules/character.js';
import {summonClassPet} from '../../../packages/game-domain/src/rules/class-spell-effects.js';
import {recoveryTick} from '../../../packages/game-domain/src/rules/recovery.js';

function make(classId,spell){
 const s=createGame('宠物恢复',99,0,{classId,raceId:classId===3?3:1});s.level=60;
 if(classId===3)s.hunterPet={entry:700,level:60,learned:[]};
 summonClassPet(s,s,spellInfo(s,spell));s.pet.hp=1;return s;
}
for(const [name,classId,spell]of [['hunter',3,883],['imp',9,688],['voidwalker',9,697],['succubus',9,712],['felhunter',9,691]]){
 test(`${name} regenerates on four-second ticks through normal engine advancement`,()=>{
  let s=make(classId,spell);const amount=Math.floor(stats(s.pet).maxHp*.13);
  s=advance(s,3900).state;assert.equal(s.pet.hp,1);
  s=advance(s,4000).state;assert.equal(s.pet.hp,1+amount);
  s=advance(s,7900).state;assert.equal(s.pet.hp,1+amount);
  s=advance(s,8000).state;assert.equal(s.pet.hp,1+amount*2);
  s=advance(s,40000).state;assert.equal(s.pet.hp,stats(s.pet).maxHp);
 });
}
test('combat suppresses pet healing without accumulating catch-up ticks',()=>{
 const s=make(9,697);s.combat={participantIds:[s.id,s.pet.id],enemies:[]};
 for(s.clock=100;s.clock<=20000;s.clock+=100)recoveryTick(s,false);
 assert.equal(s.pet.hp,1);s.combat=null;
 s.clock=20100;recoveryTick(s,false);assert.equal(s.pet.hp,1);
 s.clock=24000;recoveryTick(s,false);assert.equal(s.pet.hp,1+Math.floor(stats(s.pet).maxHp*.13));
});
test('dead and expired pets stay dead; totems do not regenerate',()=>{
 let s=make(3,883);s.pet.hp=0;s=advance(s,12000).state;assert.equal(s.pet.hp,0);
 s=make(9,688);s.pet.until=4000;s=advance(s,4000).state;assert.equal(s.pet.hp,0);
 s=make(3,883);s.pet=null;s.totems={earth:{petUnit:true,totemUnit:true,hp:1,maxHp:100}};
 s.clock=4000;recoveryTick(s,false);assert.equal(s.totems.earth.hp,1);
});
test('party pets recover independently without consuming food or water',()=>{
 let s=make(3,883);const companion=make(9,697);companion.id='companion';companion.pet.id='companion-pet';companion.pet.ownerId=companion.id;
 s.party=[companion];s.settings.autoFood=false;s.settings.autoWater=false;
 const bag=structuredClone(s.bag);s=advance(s,4000).state;
 assert.ok(s.pet.hp>1);assert.ok(s.party[0].pet.hp>1);assert.deepEqual(s.bag,bag);
});
