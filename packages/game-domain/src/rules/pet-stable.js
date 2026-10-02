import {creatures,creatureLocations} from './catalog.js';
import {saveHunterPet,MAX_PET_LOYALTY} from './pet-progression.js';
import {summonClassPet} from './class-spell-effects.js';
import {log,spellInfo} from './character.js';

const stablePrices=[10000,50000];
const stableLocations=new Set(Object.values(creatures).filter(npc=>npc.NpcFlags&8192).flatMap(npc=>creatureLocations[npc.Entry]||[]));
export const stableHere=s=>!s.dungeon&&stableLocations.has(s.location);
const petSummary=pet=>pet?{entry:pet.entry,name:pet.name,level:pet.level,loyalty:MAX_PET_LOYALTY,trainingPoints:(pet.trainingPoints??pet.level*((pet.loyalty??MAX_PET_LOYALTY)-1))+(MAX_PET_LOYALTY-(pet.loyalty??MAX_PET_LOYALTY))*pet.level}:null;

export function petStableView(s){
 if(s.classId!==3)return null;
 return {here:stableHere(s),capacity:s.stableCapacity||0,prices:stablePrices,
  slots:stablePrices.map((_,index)=>petSummary(s.stablePets?.[index])),
  current:petSummary(s.pet||s.hunterPet)};
}

export function petStableAction(s,action){
 if(s.classId!==3)throw new Error('只有猎人可以使用兽栏');
 if(!stableHere(s))throw new Error('请前往兽栏管理员');
 if(s.hp<=0||s.combat||s.escort||!['idle','hunt'].includes(s.activity.type))throw new Error('请先脱离战斗并结束当前活动');
 const index=action.slot,capacity=s.stableCapacity||0;
 if(!Number.isInteger(index)||index<0||index>=stablePrices.length)throw new Error('兽栏位置无效');
 if(action.operation==='buy'){
  if(index!==capacity)throw new Error('请依次解锁兽栏位置');
  const price=stablePrices[index];if(s.money<price)throw new Error('铜币不足');
  s.money-=price;s.stableCapacity=capacity+1;log(s,'解锁了第 '+(index+1)+' 个兽栏位置','pet');return;
 }
 if(index>=capacity)throw new Error('这个兽栏位置尚未解锁');
 s.stablePets??=Array(stablePrices.length).fill(null);
 if(action.operation==='store'){
  if(s.stablePets[index])throw new Error('这个兽栏位置已有宠物');
  if(!s.pet&&!s.hunterPet)throw new Error('没有可存放的宠物');
  if(s.pet?.hp<=0)throw new Error('请先复活宠物');
  if(s.pet)saveHunterPet(s,s);
  const pet=s.hunterPet;s.stablePets[index]=pet;s.pet=null;s.hunterPet=null;
  log(s,'将 '+pet.name+' 存入兽栏','pet');return;
 }
 if(action.operation==='withdraw'){
  const stored=s.stablePets[index];if(!stored)throw new Error('这个兽栏位置没有宠物');
  if(s.pet?.hp<=0)throw new Error('请先复活当前宠物');
  if(s.pet)saveHunterPet(s,s);
  s.stablePets[index]=s.hunterPet||null;s.hunterPet=stored;s.pet=null;
  summonClassPet(s,s,spellInfo(s,883));
  log(s,'从兽栏领出了 '+s.pet.name,'pet');return;
 }
 throw new Error('未知兽栏操作');
}
