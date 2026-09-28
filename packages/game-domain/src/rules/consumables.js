import {items,nameOf} from './catalog.js';
import {stats,roll,log} from './character.js';
import {potions} from './profession-data.js';
import {usableCount,consume} from './inventory.js';
export const defaultPotions={enabled:false,health:35,mana:20,healthItem:0,manaItem:0};
export function validatePotions(p){if(!p||typeof p.enabled!=='boolean'||!Number.isInteger(p.health)||!Number.isInteger(p.mana)||p.health<1||p.health>100||p.mana<1||p.mana>100)throw new Error('药水阈值必须是 1—100 的整数');for(const kind of ['health','mana'])if(p[kind+'Item']!==0&&potions[p[kind+'Item']]?.kind!==kind)throw new Error('请选择对应类型的药水');return{enabled:p.enabled,health:p.health,mana:p.mana,healthItem:p.healthItem,manaItem:p.manaItem};}
// Both manual and AI use share the item-template cooldown (category 4).
export function drinkPotion(s,c,id){
 const p=potions[id],item=items[id];
 if(!p||c.hp<=0||item.RequiredLevel>c.level||(c.potionReady||0)>s.clock)return false;
 const field=p.kind==='health'?'hp':'mana',max=p.kind==='health'?stats(c).maxHp:stats(c).maxMana;
 const amount=Math.min(Math.max(0,max-c[field]),roll(s,p.min,p.max));
 c[field]+=amount;c.potionReady=s.clock+Math.max(item.spellcooldown_1,item.spellcategorycooldown_1,0);
 log(s,`${c.name} 使用 ${nameOf('items',id)}，恢复 ${amount}${p.kind==='health'?' 生命':' 法力'}`,'potion',{actorId:c.id,itemId:id,amount});
 return true;
}
export function selectStrategyPotion(s,c){
 const config=c.potions||defaultPotions,inventory=c.npcPlayer?c:s;
 if(!config.enabled||!Array.isArray(inventory.bag)&&!inventory.inventoryCounts||c.hp<=0||(c.potionReady||0)>s.clock)return;
 const st=stats(c);
 for(const kind of ['health','mana']){
  const field=kind==='health'?'hp':'mana',max=kind==='health'?st.maxHp:st.maxMana;
  if(!max||c[field]>=max*config[kind]/100)continue;
  const selected=config[kind+'Item'];
  const id=Object.keys(potions).map(Number).filter(id=>potions[id].kind===kind&&(!selected||id===selected)&&items[id].RequiredLevel<=c.level&&usableCount(inventory,id)>0).sort((a,b)=>potions[b].min-potions[a].min)[0];
  if(id)return {kind:'potion',itemId:id};
 }
}

export function executeStrategyPotion(s,c,id){
 const inventory=c.npcPlayer?c:s;
 if(!potions[id]||usableCount(inventory,id)<1)return false;
 if(!drinkPotion(s,c,id))return false;
 consume(inventory,id,1);return true;
}
