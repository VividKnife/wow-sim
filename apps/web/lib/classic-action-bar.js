import {targetSkillUses} from './skill-use-view.js';
import {highestSpellRanks} from './spell-ranks.js';
export const actionKeys=['1','2','3','4','5','6','7','8','9','0','-','='];
export const actionBarStorageKey=(id,mode)=>`wow-sim:action-bar:${id}:${mode}`;
export function normalizeActionSlots(value){
 if(!Array.isArray(value))return null;
 return actionKeys.map((_,i)=>typeof value[i]==='string'&&/^(spell|item):\d+$/.test(value[i])?value[i]:null);
}
export function actionAfterElapsed(action,elapsedMs=0){
 const remaining=Math.max(0,(action.remaining||0)-Math.max(0,elapsedMs));
 // Only the rules engine can declare that time is the sole remaining blocker.
 const ready=remaining===0&&action.canUseAfterCooldown===true;
 return {...action,remaining,canUse:action.canUse||ready,reason:ready?'':action.reason};
}
export function quickActions(s,d,mode='peace'){
 const uses=targetSkillUses(d,s.id,s.clock);
  const spells=(d.skills||[]).filter(sp=>sp.known&&uses[sp.spellId]).map(sp=>({key:`spell:${sp.spellId}`,spellId:sp.spellId,name:sp.name,nameEn:sp.nameEn,icon:sp.icon,...uses[sp.spellId],kind:'技能',command:sp.nameEn==='Revive Pet'?{type:'cast',id:sp.spellId}:{type:'cast',id:sp.spellId,target:uses[sp.spellId].targetId||s.id}}));
 const ids=[...new Set((s.bag||[]).filter(i=>d.itemUses?.[i.uid]).map(i=>i.id))];
 const items=ids.map(id=>{
  const stacks=s.bag.filter(i=>i.id===id),stack=stacks.find(i=>d.itemUses?.[i.uid]?.canUse)||stacks.find(i=>!i.locked&&d.itemUses?.[i.uid])||stacks[0];
  const item=d.items?.[id];
  return {key:`item:${id}`,name:item?.name||`物品 ${id}`,icon:item?.icon,kind:'物品',count:stacks.reduce((n,i)=>n+i.count,0),...d.itemUses?.[stack.uid],command:{type:'useItem',uid:stack.uid}};
 });
 if(mode==='combat'){
  const unit=d.battleView?.units?.[s.id];
  const combat=(d.strategyMembers?.find(member=>member.id===s.id)?.skills||[]).filter(sp=>sp.known).map(sp=>{
   const input=unit?.quickCasts?.find(input=>input.spellId===sp.spellId),manual=!!input;
   const reason=input?.reason||(manual?'':s.combat?'此技能由战斗策略自动释放':'进入战斗后可使用');
   return {key:`spell:${sp.spellId}`,spellId:sp.spellId,name:sp.name,nameEn:sp.nameEn,icon:sp.icon,kind:manual?'战斗技能':'自动战斗技能',automatic:!manual,combatSkill:true,queued:unit?.queuedSpellId===sp.spellId,canUse:manual&&!reason,reason,description:manual?'点击优先施放；读条或公共冷却期间排队，再次选择会替换待施放技能。':'可在策略中调整施放条件',remaining:Math.max(0,(unit?.cooldowns?.find(cd=>cd.spellId===sp.spellId)?.readyAt||0)-(s.clock||0)),command:manual?{type:'cast',id:sp.spellId,target:input.targetId}:null};
  });
  return [...combat,...spells.filter(action=>!combat.some(skill=>skill.key===action.key)),...items];
 }
 return [...items.filter(i=>i.key==='item:6948'),...spells,...items.filter(i=>i.key!=='item:6948')];
}
export function defaultActionSlots(actions){return actionKeys.map((_,i)=>actions[i]?.key||null);}
const actionFamily=action=>action?.nameEn||action?.name||action?.key;
export function insertNewActions(profiles,seenFamilies,candidatesByMode){
 const next={...profiles},seen={peace:new Set(seenFamilies?.peace||[]),combat:new Set(seenFamilies?.combat||[])},changed={peace:false,combat:false};
 for(const mode of ['peace','combat']){
  const candidates=candidatesByMode?.[mode]||[],byKey=new Map(candidates.map(action=>[action.key,action])),slots=[...(profiles[mode]||[])];
  if(!seenFamilies?.[mode]){for(const action of candidates)seen[mode].add(actionFamily(action));continue;}
  const occupiedFamilies=new Set(slots.map(key=>actionFamily(byKey.get(key))).filter(Boolean));
  for(const action of candidates){const family=actionFamily(action);if(seen[mode].has(family)||occupiedFamilies.has(family))continue;const index=slots.findIndex(key=>!key);if(index<0)break;slots[index]=action.key;occupiedFamilies.add(family);seen[mode].add(family);changed[mode]=true;}
  for(const action of candidates)seen[mode].add(actionFamily(action));
  if(changed[mode])next[mode]=slots;
 }
 return {profiles:changed.peace||changed.combat?next:profiles,seenFamilies:seen,changed:changed.peace||changed.combat};
}
export function quickActionKey(event){
 if(event.defaultPrevented||event.repeat||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return -1;
 if(event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=dialog],[role=combobox],[role=listbox]'))return -1;
 return actionKeys.indexOf(event.key);
}

export function quickActionChoices(s,d,mode='peace'){
 const skills=[...(d.skills||[]),...(mode==='combat'?d.strategyMembers?.find(member=>member.id===s.id)?.skills||[]:[])];
 const ids=new Set(highestSpellRanks(skills.filter(skill=>skill.known)).map(skill=>`spell:${skill.spellId}`));
 return quickActions(s,d,mode).filter(action=>action.kind==='物品'||ids.has(action.key));
}

export function upgradeActionSlots(slots,s,d){
 const skills=[...(d.skills||[]),...(d.strategyMembers?.find(member=>member.id===s.id)?.skills||[])];
 const family=skill=>skill.nameEn||skill.name||skill.spellId;
 const byId=new Map(skills.map(skill=>[`spell:${skill.spellId}`,skill]));
 const highest=new Map(highestSpellRanks(skills.filter(skill=>skill.known)).map(skill=>[family(skill),skill]));
 return slots.map(key=>{
  const bound=byId.get(key),learned=bound&&highest.get(family(bound));
  if(!bound||!learned)return key;
  const best=highestSpellRanks([bound,learned])[0];
  return `spell:${best.spellId}`;
 });
}
