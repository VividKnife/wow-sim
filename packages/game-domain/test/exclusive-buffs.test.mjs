import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../src/rules/engine.js';
import {spellInfo} from '../src/rules/character.js';
import {spells} from '../src/rules/catalog.js';
import {classEffect} from '../src/rules/class-mechanics.js';
import {applyLongBuff} from '../src/rules/auto-buffs.js';
import {exclusiveBuffGroup} from '../src/rules/exclusive-buffs.js';
const fixture=(classId=3)=>{const s=createGame('互斥测试',283,0,{classId,raceId:[3,11].includes(classId)?4:1});s.id='caster';s.level=60;s.hp=stats(s).maxHp;return s;};
const spell=(s,name)=>spellInfo(s,Object.values(spells).filter(p=>p.SpellName===name&&p.SpellLevel>0).sort((a,b)=>a.SpellLevel-b.SpellLevel)[0].Id);
const cast=(s,name)=>classEffect(s,s,s,spell(s,name),[s,...s.party],{});
const holders=s=>[...(s.classBuffs||[]),...(s.auras||[]),...(s.periodicClass||[]),...Object.values(s.buffs||{}),s.reactiveClass,s.seal].filter(Boolean);
const names=(s,group)=>[...new Set(holders(s).filter(a=>exclusiveBuffGroup(spells[a.spell])===group).map(a=>spells[a.spell].SpellName))];

for(const [classId,group,sequence]of [
 [3,'aspect',['Aspect of the Hawk','Aspect of the Monkey','Aspect of the Cheetah','Aspect of the Pack','Aspect of the Wild','Aspect of the Beast','Aspect of the Hawk']],
 [2,'seal',['Seal of the Crusader','Seal of Command','Seal of Justice','Seal of Light','Seal of Wisdom','Seal of Righteousness']],
 [8,'mageArmor',['Ice Armor','Mage Armor','Ice Armor']],
 [9,'demonArmor',['Demon Armor','Demon Skin','Demon Armor']],
 [8,'magicModifier',['Dampen Magic','Amplify Magic','Dampen Magic']],
])test(`${group}: switching replaces all old effect containers`,()=>{
 const s=fixture(classId);for(const name of sequence){cast(s,name);assert.deepEqual(names(s,group),[name]);}
});
test('Frost Armor utility path and extended armors replace each other',()=>{
 const s=fixture(8);applyLongBuff(s,s,s,spell(s,'Frost Armor'),'armor');cast(s,'Mage Armor');assert.deepEqual(names(s,'mageArmor'),['Mage Armor']);
 applyLongBuff(s,s,s,spell(s,'Frost Armor'),'armor');assert.deepEqual(names(s,'mageArmor'),['Frost Armor']);
});
test('switching projected effects clears distant recipients but preserves another caster',()=>{
 for(const [classId,first,next,group]of [[3,'Aspect of the Pack','Aspect of the Hawk','aspect'],[2,'Devotion Aura','Retribution Aura','paladinAura']]){
  const s=fixture(classId),ally=fixture(classId);ally.id='ally';s.party=[ally];cast(s,first);
  ally.classBuffs.push({spell:spell(s,first).Id,name:first,caster:'other',until:s.clock+100000,stats:{}});
  ally.position=1000;cast(s,next);
  assert.equal(holders(ally).some(a=>exclusiveBuffGroup(spells[a.spell])===group&&a.caster===s.id),false);
  assert.ok(ally.classBuffs.some(a=>a.caster==='other'));
 }
});
test('Judgement consumes the stat and aura portions of a seal even on a miss',()=>{
 const s=fixture(2);cast(s,'Seal of the Crusader');classEffect(s,s,{id:'enemy'},spell(s,'Judgement'),[s],{lands:()=>false});assert.deepEqual(names(s,'seal'),[]);
});
test('stance and form switches leave only the current state',()=>{
 const s=fixture(1);for(const [name,stance]of [['Battle Stance','battle'],['Defensive Stance','defensive'],['Berserker Stance','berserker']]){cast(s,name);assert.equal(s.stance,stance);}
 const d=fixture(11);cast(d,'Moonkin Form');cast(d,'Cat Form');assert.equal(d.form,'cat');assert.deepEqual(names(d,'form'),[]);
});

test('blessings replace only the same caster on each recipient',()=>{
 const s=fixture(2);cast(s,'Blessing of Might');cast(s,'Blessing of Wisdom');assert.deepEqual(names(s,'blessing'),['Blessing of Wisdom']);
 s.classBuffs.push({spell:spell(s,'Blessing of Might').Id,name:'Blessing of Might',caster:'other',until:s.clock+100000,stats:{attackPower:10}});
 cast(s,'Greater Blessing of Kings');assert.deepEqual(new Set(names(s,'blessing')),new Set(['Blessing of Might','Greater Blessing of Kings']));
});
