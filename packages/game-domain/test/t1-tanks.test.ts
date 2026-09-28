import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo} from '../src/molten-core-demo.ts';
import {equipT1Tank,t1TankItems} from './support/t1-tank-fixture.js';
import {mightSetBonuses} from '../src/rules/might-set.js';
import {stats} from '../src/rules/character.js';
import {items,spells} from '../src/rules/catalog.js';
import {hurtPlayer,startCombat} from '../src/rules/combat.js';
import {raidEnemy} from '../src/rules/molten-core-content.js';

test('T1 tank fixture equips eight distinct Might pieces and valid source defensive stats',()=>{
 const s:any=createMoltenCoreDemo().state,c=s.party.find((c:any)=>c.raidMainTank),before:any=stats(c);equipT1Tank(c);
 assert.equal(Object.keys(c.equipment).length,17);assert.equal(new Set(t1TankItems).size,17);
 assert.deepEqual(mightSetBonuses(c),{count:8,blockValue:30,rageChance:.2,sunderThreat:1.15});
 const st:any=stats(c);assert.ok(st.maxHp>before.maxHp);assert.ok(st.armor>before.armor);assert.ok(st.defense>before.defense);
 const plain=structuredClone(c);plain.equipment[1].durability=0;
 assert.equal(mightSetBonuses(plain).sunderThreat,1);
 const withoutHead:any=stats(plain);assert.ok(Math.abs(st.dodge-withoutHead.dodge-(spells[13669].EffectBasePoints1+1)/100)<1e-9);
 const three={classId:1,equipment:{1:{id:16866},3:{id:16868},5:{id:16865}}};
 assert.equal(mightSetBonuses(three).blockValue,30);
 assert.equal(mightSetBonuses({...three,equipment:{...three.equipment,5:{id:16865,durability:0}}}).blockValue,0);
});

test('shield block value includes source item auras and the Might three-piece bonus exactly once',()=>{
 const s:any=createMoltenCoreDemo().state,c=s.party.find((c:any)=>c.raidMainTank);equipT1Tank(c);
 const st:any=stats(c),shield=items[c.equipment[17].id];
 let flat=0;
 for(const e of Object.values(c.equipment) as any[])for(let n=1;n<=5;n++){
  const i=items[e.id],sp=spells[i['spellid_'+n]];if(i['spelltrigger_'+n]!==1||!sp)continue;
  for(let j=1;j<=3;j++)if(sp['EffectApplyAuraName'+j]===158)flat+=sp['EffectBasePoints'+j]+1;
 }
 assert.equal(st.blockValue,(shield.block+st.str/20-1+flat+30)*(1+st.blockValuePct));
});

test('Might five-piece grants one rage on a seeded 20-percent damage proc and survives JSON restore',()=>{
 const state:any=createMoltenCoreDemo().state,c=state.party.find((c:any)=>c.raidMainTank);equipT1Tank(c);
 const e:any=raidEnemy(state,'test-boss','首领',12118);startCombat(state,[],true,[e] as any);
 const plain=structuredClone(state),without=plain.party.find((p:any)=>p.id===c.id);
 // Retain identical armor/health and disable only the set by removing four pieces.
 for(const slot of [1,3,5,6])delete without.equipment[slot];
 state.rngState=plain.rngState=1;c.rage=without.rage=0;
 hurtPlayer(state,e,c,1,'test',{periodic:true});hurtPlayer(plain,plain.combat.enemies[0],without,1,'test',{periodic:true});
 assert.equal(c.rage-without.rage,10);
 const restored=JSON.parse(JSON.stringify(state));assert.deepEqual(mightSetBonuses(restored.party.find((p:any)=>p.id===c.id)),mightSetBonuses(c));
});
