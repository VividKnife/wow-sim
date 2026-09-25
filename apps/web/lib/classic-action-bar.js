export const actionKeys=['1','2','3','4','5','6','7','8','9','0','-','='];
export const actionBarStorageKey=(id,mode)=>`wow-sim:action-bar:${id}:${mode}`;
export function normalizeActionSlots(value){
 if(!Array.isArray(value))return null;
 return actionKeys.map((_,i)=>typeof value[i]==='string'&&/^(spell|item):\d+$/.test(value[i])?value[i]:null);
}
export function quickActions(s,d,mode='peace'){
 const uses={...d.skillUses,...d.skillUsesByTarget?.[s.id]};
 const spells=(d.skills||[]).filter(sp=>sp.known&&uses[sp.spellId]).map(sp=>({key:`spell:${sp.spellId}`,name:sp.name,icon:sp.icon,...uses[sp.spellId],kind:'技能',command:{type:'cast',id:sp.spellId,target:s.id}}));
 const ids=[...new Set((s.bag||[]).filter(i=>d.itemUses?.[i.uid]).map(i=>i.id))];
 const items=ids.map(id=>{
  const stacks=s.bag.filter(i=>i.id===id),stack=stacks.find(i=>d.itemUses?.[i.uid]?.canUse)||stacks.find(i=>!i.locked&&d.itemUses?.[i.uid])||stacks[0];
  const item=d.items?.[id];
  return {key:`item:${id}`,name:item?.name||`物品 ${id}`,icon:item?.icon,kind:'物品',count:stacks.reduce((n,i)=>n+i.count,0),...d.itemUses?.[stack.uid],command:{type:'useItem',uid:stack.uid}};
 });
 if(mode==='combat'){
  const unit=d.battleView?.units?.[s.id];
  const combat=(d.strategyMembers?.find(member=>member.id===s.id)?.skills||[]).filter(sp=>sp.known).map(sp=>({key:`spell:${sp.spellId}`,name:sp.name,icon:sp.icon,kind:'自动战斗技能',automatic:true,canUse:false,reason:s.combat?'由战斗策略自动释放':'进入战斗后由策略自动释放',description:'可在策略中调整施放条件',remaining:Math.max(0,(unit?.cooldowns?.find(cd=>cd.spellId===sp.spellId)?.readyAt||0)-(s.clock||0)),command:null}));
  return [...combat,...spells.filter(action=>!combat.some(skill=>skill.key===action.key)),...items];
 }
 return [...items.filter(i=>i.key==='item:6948'),...spells,...items.filter(i=>i.key!=='item:6948')];
}
export function defaultActionSlots(actions){return actionKeys.map((_,i)=>actions[i]?.key||null);}
export function quickActionKey(event){
 if(event.defaultPrevented||event.repeat||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return -1;
 if(event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=dialog],[role=combobox],[role=listbox]'))return -1;
 return actionKeys.indexOf(event.key);
}
