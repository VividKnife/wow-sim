import test from 'node:test';
import assert from 'node:assert/strict';
import {newCharacter} from '../lib/game/character.js';
import {items,classAbilities} from '../lib/game/catalog.js';
import * as acquisition from '../lib/game/class-acquisition.js';

function state(classId=8,raceId=1){return{...newCharacter('书籍测试',classId,60,raceId),hp:500,clock:0,location:'northshire',activity:{type:'idle'},bag:[],logs:[],logSequence:0};}
const book=(id,uid='book')=>({id,uid,count:1});

test('source spell books require class, level and previous rank, then consume the exact unlocked stack',()=>{
 const s=state(),a=classAbilities[8].find(a=>a.spellId===25306),i=book(21279);s.bag=[{...i,uid:'locked',locked:true},i];
 assert.equal(a.acquisition,'book');
 assert.match(acquisition.classBookUse(s,i).reason,/前一|前置/);
 s.learned.push(a.previousSpellId);s.level=59;assert.match(acquisition.classBookUse(s,i).reason,/60/);s.level=60;
 assert.equal(acquisition.classBookUse(s,i).canUse,true);
 assert.equal(acquisition.useClassBook(s,i),true);
 assert.ok(s.learned.includes(25306));assert.deepEqual(s.bag.map(i=>i.uid),['locked']);
 const other=book(21279,'other');s.bag.push(other);assert.match(acquisition.classBookUse(s,other).reason,/已经/);
 const warrior=state(1);warrior.bag=[book(21279)];assert.match(acquisition.classBookUse(warrior,warrior.bag[0]).reason,/职业/);
});

test('training cannot grant a loot book skill without consuming an actual book',()=>{
 const s=state(),a=classAbilities[8].find(a=>a.spellId===25306);s.learned.push(a.previousSpellId);
 assert.match(acquisition.trainingBookReason(s,a),/书|秘典/);
 assert.throws(()=>acquisition.consumeTrainingBook(s,a),/书|秘典/);
 const i=book(21279);s.bag.push(i);assert.equal(acquisition.trainingBookReason(s,a),'');
 acquisition.consumeTrainingBook(s,a);assert.equal(s.bag.length,0);assert.ok(!s.learned.includes(a.spellId));
});

test('class supplies sell only source vendor reagents and books at trainer services',()=>{
 const mage=state();const shop=acquisition.classSupplyShop(mage),rune=shop.find(r=>r.id===17031);
 assert.ok(rune);assert.equal(rune.price,items[17031].BuyPrice);assert.equal(rune.count,items[17031].BuyCount);
 assert.ok(!shop.some(r=>r.id===21279),'raid drop book must not become a vendor purchase');
 assert.ok(!shop.some(r=>r.id===6265),'soul shards are not vendor stock');
 assert.deepEqual(acquisition.classSupplyShop({...mage,location:'echo'}),[]);
 assert.ok(acquisition.classSupplyShop(state(9)).some(r=>r.id===16302));
});

test('demon grimoires require the correct living demon and persist learned ranks on the owner',()=>{
 const s=state(9),i=book(16302);s.bag=[i];
 s.pet={entry:1863,kind:'succubus',level:60,hp:100,learned:[],availableSkills:[]};
 assert.match(acquisition.classBookUse(s,i).reason,/宠物|恶魔/);
 s.pet={entry:416,kind:'imp',level:60,hp:100,learned:[3110],availableSkills:[3110]};
 assert.equal(acquisition.useClassBook(s,i),true);assert.ok(s.pet.learned.includes(7799));
 assert.ok(s.pet.availableSkills.includes(7799));assert.ok(s.petLearnedSkills[416].includes(7799));
 assert.deepEqual(JSON.parse(JSON.stringify(s)).petLearnedSkills,s.petLearnedSkills);
});

test('locked, issued, foreign-owned and unavailable books cannot be consumed',()=>{
 for(const flags of [{locked:true},{issued:true},{ownerId:'other'}]){
  const s=state(),i={...book(21279),...flags};s.learned.push(10149);s.bag=[i];const before=JSON.stringify(s);
  assert.throws(()=>acquisition.useClassBook(s,i));assert.equal(JSON.stringify(s),before);
 }
 const s=state();assert.equal(acquisition.classBookUse(s,book(6948)),null);assert.equal(acquisition.useClassBook(s,book(6948)),false);
});
