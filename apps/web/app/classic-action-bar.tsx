import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {Dialog,Tooltip} from 'radix-ui';
import ClassicActionTooltip from './classic-action-tooltip';
import {Settings2,Swords,X} from 'lucide-react';
import {actionAfterElapsed,actionKeys,actionBarStorageKey,normalizeActionSlots,upgradeActionSlots,quickActions,quickActionChoices,defaultActionSlots,quickActionKey,insertNewActions} from '@/lib/classic-action-bar.js';
import {Icon,type GameProps} from './game-ui';
import {useCombatPlayback} from '@/lib/use-combat-playback';
import LiveCastBar from './live-cast-bar';
import './classic-action-bar.css';

export default function ClassicActionBar({state,data,playback,contentVersion,busy,send,blocked}:{blocked:boolean}&GameProps){
 const {state:s,data:d}=useCombatPlayback(state,data,playback,contentVersion,true);
 const [expanded,setExpanded]=useState(false),frameId=useId();
 const mode=s.combat?'combat':'peace';
 const baseActions=useMemo(()=>quickActions(s,d,mode),[s,d,mode]);
 const clockKey=`${s.id}:${s.clock}`;
 const [cooldownTime,setCooldownTime]=useState({key:clockKey,elapsed:0});
 const longestCooldown=Math.max(0,...baseActions.map(action=>action.remaining||0));
 const ticking=mode==='peace'&&!s.presence?.paused&&longestCooldown>0;
 useEffect(()=>{
  if(!ticking)return;
  const began=performance.now();
  const timer=setInterval(()=>{
   const elapsed=performance.now()-began;setCooldownTime({key:clockKey,elapsed});
   if(elapsed>=longestCooldown)clearInterval(timer);
  },100);
  return()=>clearInterval(timer);
 },[clockKey,ticking,longestCooldown]);
 const elapsed=ticking&&cooldownTime.key===clockKey?cooldownTime.elapsed:0;
 const actions=elapsed>0?baseActions.map(action=>actionAfterElapsed(action,elapsed)):baseActions;
 const [profiles,setProfiles]=useState<Record<'peace'|'combat',(string|null)[]>>(()=>({peace:defaultActionSlots(quickActionChoices(s,d,'peace')),combat:defaultActionSlots(quickActionChoices(s,d,'combat').filter(action=>'combatSkill' in action&&action.combatSkill))}));
 const seenFamilies=useRef<Record<'peace'|'combat',Set<string>>|null>(null);
 const resolvedProfiles:Record<'peace'|'combat',(string|null)[]>={peace:upgradeActionSlots(profiles.peace,s,d),combat:upgradeActionSlots(profiles.combat,s,d)};
 const slots=resolvedProfiles[mode];
 const [loadedId,setLoadedId]=useState<string|null>(null),[editing,setEditing]=useState<number|null>(null),[search,setSearch]=useState('');
 const ready=loadedId===s.id;
 const [editMode,setEditMode]=useState<'peace'|'combat'>(mode);
 const editorActions=quickActionChoices(s,d,editMode),editorSlots=resolvedProfiles[editMode];
 const sending=useRef(false);
 useEffect(()=>{
  const saved:Partial<typeof profiles>={};
  for(const profile of ['peace','combat'] as const){
   try{const value=normalizeActionSlots(JSON.parse(localStorage.getItem(actionBarStorageKey(s.id,profile))||'null'));if(value)saved[profile]=value;}catch{/* Browser storage may be unavailable. */}
  }
  // Browser preferences are restored after hydration, independently for each profile.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setProfiles(previous=>({...previous,...saved}));
  setLoadedId(s.id);
 },[s.id]);
 const candidateActions={peace:quickActionChoices(s,d,'peace').filter(action=>action.kind==='技能'),combat:quickActionChoices(s,d,'combat').filter(action=>'combatSkill' in action&&action.combatSkill)};
 useEffect(()=>{
  if(!ready)return;
  const result=insertNewActions(profiles,seenFamilies.current,candidateActions);
  seenFamilies.current=result.seenFamilies;
  if(result.changed)setProfiles(result.profiles);
 },[ready,profiles,s.id,d.skills,d.strategyMembers]);
 // Persist the effective bindings after hydration and whenever a learned rank changes.
 const peaceBindings=JSON.stringify(resolvedProfiles.peace),combatBindings=JSON.stringify(resolvedProfiles.combat);
 useEffect(()=>{
  if(!ready)return;
  try{
   localStorage.setItem(actionBarStorageKey(s.id,'peace'),peaceBindings);
   localStorage.setItem(actionBarStorageKey(s.id,'combat'),combatBindings);
  }catch{/* Browser storage may be unavailable. */}
 },[s.id,ready,peaceBindings,combatBindings]);
 const configure=(index:number)=>{setEditMode(mode);setEditing(index);setSearch('');};
 const assign=(key:string|null)=>{
  if(editing===null)return;
  const next=editorSlots.map((slot,i)=>i===editing?key:slot);setProfiles(previous=>({...previous,[editMode]:next}));
  try{localStorage.setItem(actionBarStorageKey(s.id,editMode),JSON.stringify(next));}catch{/* Browser storage may be unavailable. */}
  setEditing(null);setSearch('');
 };
 const activate=(index:number)=>{
  if(blocked||editing!==null||!ready)return;
  const action=actions.find(a=>a.key===slots[index]);
  if(!slots[index]){configure(index);return;}
  if(!action?.canUse)return;
  if((busy||sending.current)&&!('combatSkill' in action&&action.combatSkill&&!action.automatic))return;
  sending.current=true;void send(action.command).finally(()=>{sending.current=false;});
 };
 useEffect(()=>{
  const handle=(event:KeyboardEvent)=>{
   if(blocked||editing!==null||document.querySelector('[role=dialog][data-state=open],[role=listbox]'))return;
   const index=quickActionKey(event);if(index<0)return;
   event.preventDefault();activate(index);
  };
  window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);
 });
 return <Tooltip.Provider delayDuration={150} skipDelayDuration={100}><section className={`cu-quickbar${expanded?'':' cu-quickbar-compact'}`} aria-label={`${mode==='combat'?'战斗':'非战斗'}快捷技能栏`} data-mode={mode}>
  <LiveCastBar state={s} data={d} playback={playback} contentVersion={contentVersion}/>
  <button type="button" className="cu-quick-bubble" aria-label="展开动作条" aria-expanded={expanded} aria-controls={frameId} disabled={blocked} onClick={()=>setExpanded(true)}><Swords size={21}/></button>
  <span className="cu-quick-mode" role="status">{mode==='combat'?'战斗':'非战斗'}</span>
  <div className="cu-quickbar-frame" id={frameId}><div className="cu-quickbar-slots">{slots.map((key,index)=>{
   const action=actions.find(a=>a.key===key),missing=!!key&&!action;
   return <ClassicActionTooltip key={`${mode}:${index}:${key}`} action={action} binding={key} state={s} data={d} shortcut={actionKeys[index]} disabled={blocked||editing!==null}><button type="button" className={`cu-quick-slot ${action&&'queued' in action&&action.queued?'queued ':''}${action&&'automatic' in action&&action.automatic?'automatic':key&&!action?.canUse?'unavailable':''}`} aria-label={`${index+1} 号栏位：${action?.name||(missing?'不可用':'空栏位')}`} aria-disabled={!!key&&(busy&&!(action&&'combatSkill' in action&&action.combatSkill&&!action.automatic)||!action?.canUse)||blocked||!ready} onClick={()=>activate(index)} onContextMenu={e=>{e.preventDefault();if(!blocked&&ready)configure(index);}}>
    {action?<Icon src={action.icon} name={action.name} size={40} showTitle={false}/>:<span className="cu-quick-empty">{missing?'?':'+'}</span>}<kbd>{actionKeys[index]}</kbd>
    {action&&'queued' in action&&action.queued&&<em className="cu-quick-auto">待施放</em>}
    {action&&'automatic' in action&&action.automatic&&<em className="cu-quick-auto">自动</em>}
    {action&&action.remaining>0&&<span className="cu-quick-cooldown">{action.remaining>=60000?`${Math.ceil(action.remaining/60000)}m`:action.remaining<10000?(Math.ceil(action.remaining/100)/10).toFixed(1):Math.ceil(action.remaining/1000)}</span>}
    {action&&'count' in action&&action.count>1&&<small>{action.count}</small>}
   </button></ClassicActionTooltip>;
  })}</div><div className="cu-quick-controls"><button type="button" className="cu-quick-collapse" aria-label="收起动作条" aria-expanded={expanded} aria-controls={frameId} onClick={()=>setExpanded(false)}><X size={18}/></button><button type="button" className="cu-quick-config" aria-label="配置快捷技能栏" title="配置快捷技能栏" disabled={blocked||!ready} onClick={()=>configure(0)}><Settings2 size={18}/></button></div></div>
 </section>
 <Dialog.Root open={editing!==null&&!blocked} onOpenChange={open=>{if(!open){setEditing(null);setSearch('');}}}><Dialog.Portal><Dialog.Overlay className="cu-dialog-overlay"/><Dialog.Content className="cu-dialog cu-quick-dialog"><header className="cu-dialog-header"><div><Dialog.Title>配置快捷技能栏</Dialog.Title><Dialog.Description>进入和离开战斗时自动切换，两套栏位分别保存。攻击技能对当前敌人施放，治疗与增益默认对自己施放。</Dialog.Description></div><Dialog.Close className="cu-close" aria-label="关闭快捷栏配置"><X size={20}/></Dialog.Close></header><div className="cu-quick-editor">
  <div className="cu-quick-profiles" role="group" aria-label="选择要配置的技能栏">{(['peace','combat'] as const).map(profile=><button key={profile} aria-pressed={editMode===profile} onClick={()=>{setEditMode(profile);setSearch('');}}>{profile==='combat'?'战斗技能栏':'非战斗技能栏'}{profile===mode?' · 当前':''}</button>)}</div>
  <div className="cu-quick-tabs" aria-label="选择快捷栏位">{actionKeys.map((key,i)=><button key={key} aria-pressed={editing===i} onClick={()=>setEditing(i)}>{key}</button>)}</div>
  <div className="cu-quick-search"><input aria-label="搜索快捷技能或物品" placeholder="搜索技能、炉石、食物…" value={search} onChange={e=>setSearch(e.target.value)}/><button className="cu-gold-button" onClick={()=>assign(null)}>清空栏位</button></div>
  <div className="cu-quick-choices">{editorActions.filter(a=>a.name.toLowerCase().includes(search.toLowerCase())).map(action=><ClassicActionTooltip key={action.key} action={action} binding={action.key} state={s} data={d}><button onClick={()=>assign(action.key)} aria-pressed={editing!==null&&editorSlots[editing]===action.key}><Icon src={action.icon} name={action.name} showTitle={false}/><span><b>{action.name}</b><small>{action.kind} · {action.description}</small>{action.reason&&<em>{action.reason}</em>}</span></button></ClassicActionTooltip>)}{!editorActions.some(a=>a.name.toLowerCase().includes(search.toLowerCase()))&&<p>没有匹配的可配置技能或物品。</p>}</div>
  <p className="cu-quick-hint">按 1–0、-、= 或点击使用 · 右键任意栏位可替换 · 战斗中点击排队，当前读条或公共冷却结束后优先施放</p>
 </div></Dialog.Content></Dialog.Portal></Dialog.Root></Tooltip.Provider>;
}
