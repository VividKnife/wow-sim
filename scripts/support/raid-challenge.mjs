// Isolated challenge fixtures. Never grants gear to a saved player or resident.
import {createMoltenCoreDemo} from '../../packages/game-domain/src/molten-core-demo.ts';
import {combatRole} from '../../packages/game-domain/src/rules/combat-roles.js';
import {stats,canEquip,slotOf} from '../../packages/game-domain/src/rules/character.js';
import {items,nameOf} from '../../packages/game-domain/src/rules/catalog.js';
import {raidLoot} from '../../packages/game-domain/src/rules/raid-rewards.js';
import {npcWeaponAllowed,npcEquipmentValue,equipmentUpgrade,equipNpcItem} from '../../packages/game-domain/src/rules/npc-equipment.js';
import {npcStrategy} from '../../packages/game-domain/src/rules/npc-strategies.js';
import {npcBuildPlan} from '../../packages/game-domain/src/rules/npc-builds.js';
import {validateRaidComposition} from '../../packages/game-domain/src/rules/raid-composition.js';
import raidSource from '../../packages/game-data/data/molten-core-loot.json' with {type:'json'};
import journal from '../../packages/game-data/data/dungeon-journal.json' with {type:'json'};
export const challengeGearNames={dungeon:'五人本毕业',halfEpic:'半身史诗',fullEpic:'全身史诗'};
const dungeonIds=new Set(journal.dungeons.filter(d=>d.minimumLevel>=45&&!/upper|raid/.test(d.id)).flatMap(d=>d.bosses.flatMap(b=>b.loot.map(i=>i.id))));
const epicIds=new Set([...Object.values(raidLoot).flat(),...['creature_loot_template','gameobject_loot_template','reference_loot_template'].flatMap(table=>raidSource.tables[table].filter(r=>r.mincountOrRef>=0).map(r=>r.item))]);
const pools={dungeon:[...dungeonIds].map(id=>items[id]).filter(i=>i&&i.Quality===3),fullEpic:[...epicIds].map(id=>items[id]).filter(i=>i&&i.Quality===4)};
const cache=new Map();
function buildEquipment(c,tier){
 const key=`${c.classId}:${combatRole(c)}:${tier}`;if(cache.has(key))return structuredClone(cache.get(key));
 const unit={...c,equipment:{},bag:[],bank:[],pending:[]};
 const ranked=pools[tier].filter(i=>[2,4].includes(i.class)&&![0,4,19].includes(i.InventoryType)&&!i.RandomProperty&&!i.RandomSuffix&&!i.RequiredSkill&&canEquip(c,i)&&npcWeaponAllowed(c,i))
  .map(i=>({i,score:npcEquipmentValue(unit,{[slotOf(i)]:{id:i.entry}})})).sort((a,b)=>b.score-a.score||a.i.entry-b.i.entry);
 for(let pass=0;pass<2;pass++)for(const {i}of ranked){const plan=equipmentUpgrade(unit,i);if(plan.need)equipNpcItem(unit,{id:i.entry,count:1,bound:true,durability:i.MaxDurability||undefined},plan);}
 if(Object.keys(unit.equipment).length<(15+([1,3,4,5,8,9].includes(c.classId)?1:0)+(items[unit.equipment[16]?.id]?.InventoryType===17?0:1)))throw new Error(`Incomplete ${key}: ${Object.keys(unit.equipment)}`);
 cache.set(key,structuredClone(unit.equipment));return unit.equipment;
}
export function equipChallengeGear(c,tier){
 if(!Object.hasOwn(challengeGearNames,tier))throw new Error('Unknown gear tier');
 const blue=buildEquipment(c,'dungeon'),epic=tier==='dungeon'?null:buildEquipment(c,'fullEpic');
 if(tier==='dungeon')c.equipment=blue;
 else if(tier==='fullEpic')c.equipment=epic;
 else{
  c.equipment=blue;
  // Weapons are one bundle, so a two-handed upgrade never leaves an illegal offhand.
  const slots=Object.keys(epic).map(Number).filter(slot=>slot!==16&&slot!==17).sort((a,b)=>a-b);
  const count=Math.floor(Object.keys(blue).length/2);
  for(const slot of slots.slice(0,count))c.equipment[slot]=epic[slot];
 }
 for(const [slot,e]of Object.entries(c.equipment)){e.uid=`challenge:${c.id}:${slot}`;e.ownerId=c.id;}
 c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;
}
let template;
export function createRaidChallenge({seed=60325,size=40,tanks=3,healers=8,gear='dungeon'}={}){
 validateRaidComposition({size,tanks,healers});if(size-tanks-healers<1)throw new Error('Challenge mage commander needs a damage seat');
 template??=createMoltenCoreDemo().state;
 const s=structuredClone(template),original=[s,...s.party],members=[s];
 s.party=[];s.rngState=seed;
 for(const [role,count]of [['tank',tanks],['healer',healers],['damage',size-tanks-healers-1]]){
  const choices=original.filter(c=>role==='damage'?!['tank','healer'].includes(combatRole(c)):combatRole(c)===role);
  for(let i=0;i<count;i++){
   const c=structuredClone({...choices[i%choices.length],party:[]});c.id=`challenge-${members.length}`;c.name+=`·${members.length}`;members.push(c);
  }
 }
 for(const c of members){
  const role=combatRole(c),build=npcBuildPlan(c,role,{skill:'regular'}),strategy=npcStrategy(c,build);
  c.rules=strategy.rules;c.strategyPolicy={...strategy.policy,waitForTank:false,protectCC:true};
  c.npcBuild=build;equipChallengeGear(c,gear);c.potions={};
 }
 s.party=members.slice(1);return s;
}
export function challengeInputs(s){return [s,...s.party].map(c=>({id:c.id,classId:c.classId,role:combatRole(c),stats:stats(c),equipment:Object.entries(c.equipment).map(([slot,e])=>({slot:Number(slot),id:e.id,name:nameOf('items',e.id),quality:items[e.id].Quality}))}));}
