import {combatRole} from '../../src/rules/combat-roles.js';
import {npcStrategy} from '../../src/rules/npc-strategies.js';
import {npcBuildPlan} from '../../src/rules/npc-builds.js';
import {items} from '../../src/rules/catalog.js';
import {canEquip,slotOf,stats} from '../../src/rules/character.js';
import {enchants,enchantFits} from '../../src/rules/profession-data.js';

// Full Might, MC/Onyxia off-pieces, and two pre-raid defensive trinkets.
// This is a reproducible equipment fixture, not a claim of universal phase-one BiS.
export const t1TankItems=[16866,17065,16868,16865,16864,16867,16862,16861,16863,18204,18879,17063,18466,11810,18832,17066,17072];
export function equipT1Tank(c){
 if(c.classId!==1||c.level!==60)throw new Error('T1 fixture requires a level-60 warrior');
 c.equipment={};
 for(const id of t1TankItems){
  const item=items[id];if(!canEquip(c,item))throw new Error(`Illegal T1 fixture item: ${id}`);
  let slot=slotOf(item);if([11,13].includes(slot)&&c.equipment[slot])slot++;
  c.equipment[slot]={id,uid:`t1:${c.id}:${slot}`,count:1,bound:true,durability:item.MaxDurability||undefined};
 }
 // Use real implemented permanent enchants. No synthetic stats, world buffs,
 // temporary weapon proc, flask, or head/leg libram is added by this fixture.
 for(const [slotText,equipment] of Object.entries(c.equipment)){
  const slot=Number(slotText),key=slot===5?'health':slot===15?'armor':[8,9,17].includes(slot)?'sta':null;
  if(!key)continue;
  const best=Object.entries(enchants).filter(([,e])=>e.stats[key]&&enchantFits(e,items[equipment.id],slot)).sort((a,b)=>b[1].stats[key]-a[1].stats[key])[0];
  if(best)equipment.enchant=best[0];
 }
 c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;
 return c;
}

export function prepareRaidTanks(state,profile='t1'){
 if(!['baseline','t1'].includes(profile))throw new Error('Unknown tank fixture profile');
 const tanks=state.party.filter(c=>combatRole(c)==='tank');
 for(const c of tanks){
  const strategy=npcStrategy(c,npcBuildPlan(c,'tank',{skill:'regular'}));
  c.rules=strategy.rules;c.strategyPolicy={...strategy.policy,waitForTank:false,protectCC:false};
  if(profile==='t1')equipT1Tank(c);
 }
 return tanks;
}
