'use client';
import {useEffect,useRef,useState} from 'react';
import {Dialog,Tooltip} from 'radix-ui';
import ClassicActionTooltip from './classic-action-tooltip';
import {Settings2,X} from 'lucide-react';
import {actionKeys,actionBarStorageKey,normalizeActionSlots,quickActions,defaultActionSlots,quickActionKey} from '@/lib/classic-action-bar.js';
import {Icon,type GameProps} from './game-ui';
import ActivityProgress from './activity-progress';
import './classic-action-bar.css';

export default function ClassicActionBar({state:s,data:d,busy,send,blocked}:{blocked:boolean}&GameProps){
 const mode=s.combat?'combat':'peace';
 const options={peace:quickActions(s,d,'peace'),combat:quickActions(s,d,'combat')};
 const actions=options[mode];
 const [profiles,setProfiles]=useState<Record<'peace'|'combat',(string|null)[]>>(()=>({peace:defaultActionSlots(options.peace),combat:defaultActionSlots(options.combat.filter(action=>'automatic' in action&&action.automatic))}));
 const slots=profiles[mode];
 const [ready,setReady]=useState(false),[editing,setEditing]=useState<number|null>(null),[search,setSearch]=useState('');
 const [editMode,setEditMode]=useState<'peace'|'combat'>(mode);
 const editorActions=options[editMode],editorSlots=profiles[editMode];
 const sending=useRef(false);
 useEffect(()=>{
  const saved:Partial<typeof profiles>={};
  for(const profile of ['peace','combat'] as const){
   try{const value=normalizeActionSlots(JSON.parse(localStorage.getItem(actionBarStorageKey(s.id,profile))||'null'));if(value)saved[profile]=value;}catch{}
  }
  // Browser preferences are restored after hydration, independently for each profile.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setProfiles(previous=>({...previous,...saved}));
  setReady(true);
 },[s.id]);
 const configure=(index:number)=>{setEditMode(mode);setEditing(index);setSearch('');};
 const assign=(key:string|null)=>{
  if(editing===null)return;
  const next=editorSlots.map((slot,i)=>i===editing?key:slot);setProfiles(previous=>({...previous,[editMode]:next}));
  try{localStorage.setItem(actionBarStorageKey(s.id,editMode),JSON.stringify(next));}catch{}
  setEditing(null);setSearch('');
 };
 const activate=(index:number)=>{
  if(blocked||editing!==null||busy||sending.current||!ready)return;
  const action=actions.find(a=>a.key===slots[index]);
  if(!slots[index]){configure(index);return;}
  if(!action?.canUse)return;
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
 const casting=!!s.cast||['hearth','teleport','conjure','classSpell','classChannel','mount'].includes(s.activity.type);
 return <Tooltip.Provider delayDuration={150} skipDelayDuration={100}><section className="cu-quickbar" aria-label={`${mode==='combat'?'战斗':'非战斗'}快捷技能栏`} data-mode={mode}>
  {casting&&<div className="cu-quickbar-cast"><ActivityProgress state={s} data={d} quartz running={!s.combat?.command?.paused}/></div>}
  <span className="cu-quick-mode" role="status">{mode==='combat'?'战斗':'非战斗'}</span>
  <div className="cu-quickbar-frame"><div className="cu-quickbar-slots">{slots.map((key,index)=>{
   const action=actions.find(a=>a.key===key),missing=!!key&&!action;
   return <ClassicActionTooltip key={`${mode}:${index}:${key}`} action={action} binding={key} state={s} data={d} shortcut={actionKeys[index]} disabled={blocked||editing!==null}><button type="button" className={`cu-quick-slot ${action&&'automatic' in action&&action.automatic?'automatic':key&&!action?.canUse?'unavailable':''}`} aria-label={`${index+1} 号栏位：${action?.name||(missing?'不可用':'空栏位')}`} aria-disabled={!!key&&(busy||!action?.canUse)||blocked||!ready} onClick={()=>activate(index)} onContextMenu={e=>{e.preventDefault();if(!blocked&&ready)configure(index);}}>
    {action?<Icon src={action.icon} name={action.name} size={40} showTitle={false}/>:<span className="cu-quick-empty">{missing?'?':'+'}</span>}<kbd>{actionKeys[index]}</kbd>
    {action&&'automatic' in action&&action.automatic&&<em className="cu-quick-auto">自动</em>}
    {action&&action.remaining>0&&<span className="cu-quick-cooldown">{action.remaining>=60000?`${Math.ceil(action.remaining/60000)}m`:Math.ceil(action.remaining/1000)}</span>}
    {action&&'count' in action&&action.count>1&&<small>{action.count}</small>}
   </button></ClassicActionTooltip>;
  })}</div><button type="button" className="cu-quick-config" aria-label="配置快捷技能栏" title="配置快捷技能栏" disabled={blocked||!ready} onClick={()=>configure(0)}><Settings2 size={18}/></button></div>
 </section>
 <Dialog.Root open={editing!==null&&!blocked} onOpenChange={open=>{if(!open){setEditing(null);setSearch('');}}}><Dialog.Portal><Dialog.Overlay className="cu-dialog-overlay"/><Dialog.Content className="cu-dialog cu-quick-dialog"><header className="cu-dialog-header"><div><Dialog.Title>配置快捷技能栏</Dialog.Title><Dialog.Description>进入和离开战斗时自动切换，两套栏位分别保存。手动技能默认对自己施放。</Dialog.Description></div><Dialog.Close className="cu-close" aria-label="关闭快捷栏配置"><X size={20}/></Dialog.Close></header><div className="cu-quick-editor">
  <div className="cu-quick-profiles" role="group" aria-label="选择要配置的技能栏">{(['peace','combat'] as const).map(profile=><button key={profile} aria-pressed={editMode===profile} onClick={()=>{setEditMode(profile);setSearch('');}}>{profile==='combat'?'战斗技能栏':'非战斗技能栏'}{profile===mode?' · 当前':''}</button>)}</div>
  <div className="cu-quick-tabs" aria-label="选择快捷栏位">{actionKeys.map((key,i)=><button key={key} aria-pressed={editing===i} onClick={()=>setEditing(i)}>{key}</button>)}</div>
  <div className="cu-quick-search"><input aria-label="搜索快捷技能或物品" placeholder="搜索技能、炉石、食物…" value={search} onChange={e=>setSearch(e.target.value)}/><button className="cu-gold-button" onClick={()=>assign(null)}>清空栏位</button></div>
  <div className="cu-quick-choices">{editorActions.filter(a=>a.name.toLowerCase().includes(search.toLowerCase())).map(action=><ClassicActionTooltip key={action.key} action={action} binding={action.key} state={s} data={d}><button onClick={()=>assign(action.key)} aria-pressed={editing!==null&&editorSlots[editing]===action.key}><Icon src={action.icon} name={action.name} showTitle={false}/><span><b>{action.name}</b><small>{action.kind} · {action.description}</small>{action.reason&&<em>{action.reason}</em>}</span></button></ClassicActionTooltip>)}{!editorActions.some(a=>a.name.toLowerCase().includes(search.toLowerCase()))&&<p>没有匹配的可配置技能或物品。</p>}</div>
  <p className="cu-quick-hint">按 1–0、-、= 或点击使用 · 右键任意栏位可替换 · 战斗技能仍由战斗策略释放</p>
 </div></Dialog.Content></Dialog.Portal></Dialog.Root></Tooltip.Provider>;
}
