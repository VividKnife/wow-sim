import {classAbilities,classContentManifest,classItemInventory,items,spells,trainerNodes,nameOf,icon} from './catalog.js';
import {supportedSpellNames} from './class-support.js';
import {log} from './character.js';

const bookEntries=classContentManifest.entries.filter(e=>e.acquisition==='book');
const booksByItem=new Map();
for(const e of bookEntries)for(const id of e.itemIds||[]){const rows=booksByItem.get(id)||[];rows.push(e);booksByItem.set(id,rows);}
const vendorItems=new Set(classItemInventory.filter(i=>i.sources.some(s=>['npc_vendor','npc_vendor_template'].includes(s.table))).map(i=>i.itemId));
// SkillLineAbility identifies these six demon skill lines; petcreateinfo_spell
// supplies their default abilities. Keep the identity separate from spell names.
const demonEntries={188:416,189:417,204:1860,205:1863,206:89,207:11859};
const rank=id=>Number(/Rank (\d+)/.exec(spells[id]?.Rank1||'')?.[1]||0);
const knows=(learned,id)=>learned.includes(id)||learned.some(old=>spells[old]?.SpellName===spells[id]?.SpellName&&rank(old)>=rank(id));
const ownInstance=(s,i)=>(s.bag||[]).find(b=>b.uid===i.uid&&b.id===i.id&&b.count>0);
const permitted=(s,e)=>e.classId===s.classId&&e.raceIds.includes(s.raceId||1);
const validBook=(e,id)=>['ability','pet-ability'].includes(e.contentRole)&&(e.obtainableItemIds||[]).includes(id);
const entryForPet=e=>[...new Set(e.sources.map(s=>demonEntries[s.skillId]).filter(Boolean))];

function playerReason(s,e){
 if(e.classId!==s.classId)return'这本技能书不属于当前职业';
 if(!e.raceIds.includes(s.raceId||1))return'这本技能书不属于当前种族';
 if(s.level<e.requiredLevel)return`需要 ${e.requiredLevel} 级`;
 if(!supportedSpellNames.has(e.name))return'这个技能的执行效果尚未实现';
 if(knows(s.learned||[],e.spellId))return'已经学会这个技能或更高等级';
 if(e.previousSpellId&&!(s.learned||[]).includes(e.previousSpellId))return'需要先学会前一等级技能';
 return'';
}

function petReason(s,e){
 if(e.classId!==s.classId)return'这本技能书不属于当前职业';
 if(!e.raceIds.includes(s.raceId||1))return'这本技能书不属于当前种族';
 const pet=s.pet;if(!pet||pet.hp<=0)return'需要召唤存活的宠物或恶魔';
 const entries=entryForPet(e);
 if(s.classId===9&&(!entries.length||!entries.includes(pet.entry)))return'这本魔典需要对应的恶魔宠物';
 if(s.classId===3&&pet.kind!=='beast')return'这本技能书需要野兽宠物';
 if(s.level<e.requiredLevel||pet.level<e.requiredLevel)return`角色与宠物都需要 ${e.requiredLevel} 级`;
 if(knows([...(pet.learned||[]),...(pet.availableSkills||[])],e.spellId))return'宠物已经学会这个技能或更高等级';
 if(e.previousSpellId&&!(pet.learned||[]).includes(e.previousSpellId))return'宠物需要先学会前一等级技能';
 return'';
}

function usableEntries(s,instance){
 const rows=booksByItem.get(instance.id)||[];
 return rows.filter(e=>permitted(s,e)&&validBook(e,instance.id));
}

/** Item-use view. It does not mutate state or grant a skill. */
export function classBookUse(s,instance){
 const rows=booksByItem.get(instance.id);if(!rows)return null;
 const selected=usableEntries(s,instance),owned=ownInstance(s,instance);
 let reason=!owned?'背包中没有这本技能书':owned.locked?'物品已锁定':owned.issued?'配发物品不能作为技能书使用':owned.ownerId&&owned.ownerId!==s.id?'这本技能书属于其他角色':s.hp<=0?'角色已死亡':s.combat?'战斗中不能学习技能书':!['idle','hunt'].includes(s.activity?.type||'idle')?'请先结束当前活动':'';
 if(!reason&&!selected.length)reason=!rows.some(e=>e.classId===s.classId)?'这本技能书不属于当前职业':!rows.some(e=>permitted(s,e))?'这本技能书不属于当前种族':'这本技能书没有可获得的来源';
 const unknown=selected.filter(e=>!(e.actor==='pet'?knows([...(s.pet?.learned||[]),...(s.pet?.availableSkills||[])],e.spellId):knows(s.learned||[],e.spellId)));
 if(!reason&&!unknown.length)reason='已经学会这本技能书中的技能';
 if(!reason)reason=unknown.map(e=>e.actor==='pet'?petReason(s,e):playerReason(s,e)).find(Boolean)||'';
 return{kind:'classBook',canUse:!reason,reason,label:'学习技能书',description:selected.map(e=>nameOf('spells',e.spellId)).join('、'),spellIds:unknown.map(e=>e.spellId),pet:unknown.some(e=>e.actor==='pet')};
}

function consumeExact(s,instance){instance.count--;if(!instance.count)s.bag=s.bag.filter(i=>i.uid!==instance.uid);}

/** Returns false only when the item is not a class book; failed use throws. */
export function useClassBook(s,instance){
 const view=classBookUse(s,instance);if(!view)return false;if(!view.canUse)throw new Error(view.reason);
 const selected=usableEntries(s,instance).filter(e=>view.spellIds.includes(e.spellId));
 consumeExact(s,ownInstance(s,instance));
 for(const e of selected){
  if(e.actor==='pet'){
   const pet=s.pet;pet.availableSkills=[...new Set([...(pet.availableSkills||[]),e.spellId])];
   if(s.classId===9){pet.learned=[...new Set([...(pet.learned||[]),e.spellId])];s.petLearnedSkills??={};s.petLearnedSkills[pet.entry]=[...new Set([...(s.petLearnedSkills[pet.entry]||[]),e.spellId])];}
   else{s.petAvailableSkills??={};s.petAvailableSkills[pet.entry]=[...new Set([...(s.petAvailableSkills[pet.entry]||[]),e.spellId])];}
  }else s.learned=[...new Set([...(s.learned||[]),e.spellId])];
 }
 log(s,'阅读 '+nameOf('items',instance.id)+'，学会 '+view.description,'learn');return true;
}

/** Trainer UI and action gate: book acquisitions still require the actual item. */
export function trainingBookReason(s,a){
 if(a?.acquisition!=='book')return'';
 const entries=bookEntries.filter(e=>e.spellId===a.spellId&&e.classId===a.classId&&e.actor==='player');
 const matching=entries.find(e=>permitted(s,e));
 if(!matching)return'这本技能书不属于当前职业或种族';
 const blocked=playerReason(s,matching);if(blocked)return blocked;
 const instance=(s.bag||[]).find(i=>validBook(matching,i.id)&&!i.locked&&!i.issued&&(!i.ownerId||i.ownerId===s.id)&&i.count>0);
 return instance?'':'需要持有未锁定的对应技能书';
}

export function consumeTrainingBook(s,a){
 if(a?.acquisition!=='book')return false;
 const reason=trainingBookReason(s,a);if(reason)throw new Error(reason);
 const entries=bookEntries.filter(e=>e.spellId===a.spellId&&permitted(s,e)&&e.actor==='player');
 const instance=s.bag.find(i=>!i.locked&&!i.issued&&(!i.ownerId||i.ownerId===s.id)&&i.count>0&&entries.some(e=>validBook(e,i.id)));
 consumeExact(s,instance);return true;
}

/** Shared trainer service adaptation; source BuyPrice/BuyCount remain exact. */
export function classSupplyShop(s){
 if(!trainerNodes.includes(s.location))return[];
 const ids=new Set();
 for(const ability of classAbilities[s.classId]||[]){
  if(ability.raceIds?.length&&!ability.raceIds.includes(s.raceId||1))continue;
  const spell=spells[ability.spellId];if(!spell)continue;
  for(let n=1;n<=8;n++)if(spell['Reagent'+n]>0)ids.add(spell['Reagent'+n]);
  for(let n=1;n<=2;n++)if(spell['Totem'+n]>0)ids.add(spell['Totem'+n]);
 }
 for(const entry of bookEntries.filter(e=>permitted(s,e)&&['ability','pet-ability'].includes(e.contentRole)))for(const id of entry.obtainableItemIds||[])ids.add(id);
 return[...ids].filter(id=>vendorItems.has(id)&&items[id]?.BuyPrice>0&&items[id].RequiredLevel<=60).sort((a,b)=>a-b).map(id=>({id,name:nameOf('items',id),price:items[id].BuyPrice,count:items[id].BuyCount||1,quality:items[id].Quality,icon:icon('items',id),source:'class-supplies'}));
}
