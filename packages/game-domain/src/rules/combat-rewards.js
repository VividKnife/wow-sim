import {creatures} from './catalog.js';
import {roll} from './character.js';
import {rewardCharacters} from './combat-members.js';
import {creditKill} from './quests.js';
import {creditNpcMoney} from './npc-world.js';

// Encounter membership is the reward boundary. Dead party members still share
// corpse rewards; pets, totems, escorts and characters outside the encounter do not.
export function creditCombatKill(s,entry){
 const battle=s.combat,members=rewardCharacters(s),raw=creatures[entry];
 for(const c of members)if(c.quests&&c.totals){c.totals.kills++;creditKill(c,entry,battle);}
 const gold=roll(s,raw.MinLootGold,raw.MaxLootGold),previous=battle.lootGold||0;
 battle.lootGold=previous+gold;
 battle.lootGoldByActor??={};
 if(!members.length)return;
 const base=Math.floor(gold/members.length),remainder=gold%members.length,offset=previous%members.length;
 for(let i=0;i<members.length;i++){
  const c=members[(offset+i)%members.length],share=base+(i<remainder?1:0);
  if(c.npcPlayer)creditNpcMoney(s,c,share);else c.money=(c.money||0)+share;
  if(c.totals)c.totals.money+=share;
  battle.lootGoldByActor[c.id]=(battle.lootGoldByActor[c.id]||0)+share;
 }
}
