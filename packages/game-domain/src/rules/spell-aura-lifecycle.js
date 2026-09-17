import {spells,spellChain} from './catalog.js';
import {addCombatAura,activeAuras} from '../../../sim-core/src/combat-auras.js';
import {rng} from './character.js';
import {spellAttributesEx3} from '../../../sim-core/src/spell-program.js';

const root=id=>spellChain[id]?.first_spell||id;
const spellId=a=>a.spell??a.spellId;
const identity=a=>`${spellId(a)}:${a.caster??''}`;

// Ordinary stat/control auras are exclusive across ranks. Periodic effects keep
// their per-caster identity in their periodic container instead of stacking stats.
export function applySpellAura(unit,aura,clock){
 const source=spells[aura.spell],group=root(aura.spell);
 const perCaster=!!(source?.AttributesEx3&spellAttributesEx3.PER_CASTER_AURA);
 const same=a=>root(a.spell)===group&&a.effect===aura.effect&&(!perCaster||a.caster===aura.caster);
 const current=activeAuras(unit,clock).filter(same);
 if(aura.positive&&current.some(a=>(spells[a.spell]?.SpellLevel||0)>(source?.SpellLevel||0)))return false;
 const previous=current[0],limit=source?.StackAmount||1;
 const stacks=limit>1?Math.min(limit,(previous?.stacks||0)+1):1;
 const next={...aura,perCaster,stacks,baseAmount:aura.amount,amount:aura.amount*stacks};
 if(aura.mechanic&&activeAuras(unit,clock).some(a=>a.type===77&&a.misc===aura.mechanic)){
  addCombatAura(unit,next,clock);return false;
 }
 unit.auras=(unit.auras||[]).filter(a=>a.until>clock&&!same(a));
 addCombatAura(unit,next,clock);return true;
}

function positive(a,key){
 if(a.positive!=null)return a.positive;
 if(['hots','periodicClass','classBuffs','absorb','manaShield'].includes(key))return true;
 if(key==='dots')return false;
 const sp=spells[spellId(a)];
 // Explicit hostile target selectors cover old/custom effects without metadata.
 if([1,2,3].some(n=>[6,15,16,22,24,28,53,54].includes(sp?.['EffectImplicitTargetA'+n])))return false;
 return [1,2,3].some(n=>[1,21,20,30,35,37].includes(sp?.['EffectImplicitTargetA'+n]));
}

export function dispelSpellAuras(unit,types,count=Infinity,state,polarity='all'){
 const clock=state?.clock??0,groups=new Map(),arrays=['auras','dots','classBuffs','hots','periodicClass'];
 const collect=(a,key)=>{
  if(!a||a.until!=null&&a.until<=clock||a.remaining!=null&&a.remaining<=0)return;
  if(!types.includes(a.dispel??spells[spellId(a)]?.Dispel))return;
  if(polarity!=='all'&&positive(a,key)!==(polarity==='positive'))return;
  const id=identity(a),group=groups.get(id)||{id,entries:[],resistance:0};
  group.entries.push({a,key});group.resistance=Math.max(group.resistance,a.dispelResistance||0);groups.set(id,group);
 };
 for(const key of arrays)for(const a of unit[key]||[])collect(a,key);
 for(const key of ['absorb','manaShield'])collect(unit[key],key);
 let attempts=0,removed=0;
 for(const group of groups.values()){
  if(attempts++>=count)break;
  if(state&&group.resistance>0&&rng(state)<group.resistance/100)continue;
  // A dispel removes a spell holder, including every effect slot, once.
  for(const key of arrays)if(unit[key])unit[key]=unit[key].filter(a=>identity(a)!==group.id);
  for(const key of ['absorb','manaShield'])if(unit[key]&&identity(unit[key])===group.id)unit[key]=null;
  removed++;
 }
 return removed;
}
