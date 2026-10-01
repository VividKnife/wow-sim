import ClassicChat from './classic-chat';

import {useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {Dialog} from 'radix-ui';
import {Swords,X,Square,ArrowLeftRight,GripHorizontal} from 'lucide-react';
import {classicMenus,classicStopAction} from '@/lib/classic-interface.js';
import {mapRegions,mapPoints,playerMapPoint,travelMapFrame} from '@/lib/world-map.js';
import {scenePresentation,instanceActions} from '@/lib/scene-presentation.js';
import ActivityProgress from './activity-progress';
import ClassicActionBar from './classic-action-bar';
import BuffBar from './buff-bar';
import WorldScene from './world-scene';
import SceneUiToggle from './scene-ui-toggle';
import LiveDamageMeter from './live-damage-meter';
import LiveRaidFrames from './live-raid-frames';
import JourneyLog from './journey-log';
import ClassIcon from './class-icon';
import {classColors as colors} from '@/lib/class-colors';
import {useHudDrag} from '@/lib/use-hud-drag';
import type {GameProps} from './game-ui';
import {useLivePlayerVitals} from '@/lib/use-live-player-vitals';
import './journey.css';
import './classic-game.css';

type Model=GameProps['data'];
const percent=(value:number,max:number)=>Math.min(100,Math.max(0,100*(value||0)/Math.max(1,max||0)));
const fmt=(value:number)=>Math.round(value||0).toLocaleString('en-US');
const extraMenus=[{id:'meter',name:'伤害统计',icon:'inv_sword_04'},{id:'settings',name:'设置',icon:'inv_misc_gear_01'},{id:'raid',name:'团队副本',icon:'inv_misc_head_dragon_01'},{id:'activities',name:'野外活动',icon:'ability_hunter_snipershot'},{id:'log',name:'战报',icon:'inv_sword_04'},{id:'account',name:'角色与后台活动',icon:'inv_misc_book_09'},{id:'mounts',name:'坐骑',icon:'ability_mount_ridinghorse'}];
function Icon({name}:{name:string}){return <img src={`/icons/assets/${name}.png`} alt="" draggable={false}/>;}
function Vital({label,value,max,tone='health'}:{label:string;value:number;max:number;tone?:string}){return <span className={`cu-vital ${tone}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(value||0)} aria-valuemin={0} aria-valuemax={max}><i style={{width:percent(value,max)+'%'}}/><span>{fmt(value)} / {fmt(max)}</span></span>;}
function ClassicPlayerFrame({state,data,playback,contentVersion,onOpen}:{state:any;data:any;playback:any;contentVersion?:string;onOpen:()=>void}){
 const {state:s,data:d}=useLivePlayerVitals(state,data,playback,contentVersion);
 const resource=d.resource||{name:'法力',value:s.mana,max:d.stats.maxMana};
 return <button className="cu-player" onClick={onOpen} aria-label="查看角色"><span className="cu-portrait cu-class-portrait"><ClassIcon classId={s.classId} size="100%"/><b>{s.level}</b></span><span className="cu-player-bars"><strong><span>{s.name}</span><small>{d.raceName} · {d.className}</small></strong><Vital label="生命" value={s.hp} max={d.stats.maxHp}/>{resource.max>0&&<Vital label={resource.name} value={resource.value} max={resource.max} tone={resource.name==='怒气'?'rage':resource.name==='能量'?'energy':'mana'}/>}</span></button>;
}
type Props=GameProps&{canLead:boolean;panel:string|null;onPanelChange:(panel:string|null)=>void;renderPanel:(panel:string)=>ReactNode;onStyleChange:()=>void;onObserve:()=>void;modalBattleOpen:boolean;overview:ReactNode;status:ReactNode;utilities:ReactNode;activityLabel:string};
export default function ClassicGame(props:Props){
 const {state:s,data:d,busy,send,panel,onPanelChange,onStyleChange,onObserve,renderPanel,status,utilities,activityLabel}=props;
 const [commandMemberId,setCommandMemberId]=useState(s.id);
 const [uiHidden,setUiHidden]=useState(false);
 const chatHud=useHudDrag();
 const {ref:meterRef,style:meterStyle,handle:meterHandle,reset:resetMeter}=useHudDrag();
 const focus=useRef<HTMLElement|null>(null),home=useRef<HTMLButtonElement|null>(null);
 const open=(id:string)=>{focus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;onPanelChange(id);};
 useEffect(()=>{
  const keydown=(event:KeyboardEvent)=>{
   if(uiHidden){if(event.key==='Escape'){event.preventDefault();setUiHidden(false);}return;}
   if(event.key==='Escape'&&!event.defaultPrevented&&!event.repeat&&!panel&&!props.modalBattleOpen&&!document.querySelector('[role=dialog][data-state=open],[role=listbox]')){event.preventDefault();focus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;onPanelChange('settings');return;}
   if(event.defaultPrevented||event.altKey||event.metaKey||event.ctrlKey||event.repeat||panel||props.modalBattleOpen)return;
   const target=event.target as HTMLElement;
   if(target.closest?.('input,textarea,select,[contenteditable=true],[role=dialog],[role=combobox]'))return;
   const item=classicMenus.find(item=>item.key.toLowerCase()===event.key.toLowerCase());
   if(item){event.preventDefault();focus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;onPanelChange(item.id);}
  };
  window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
 },[panel,props.modalBattleOpen,onPanelChange,uiHidden]);
 const battling=!!s.combat;
 const members=(d.goldRaid?.active)&&d.battleView?.actors?.length?d.battleView.actors.filter((u:Model)=>!u.petUnit&&!u.totemUnit&&!u.escortNpc):[{...s,stats:d.stats},...(d.party||[])];
 const quests=d.quests.filter((q:Model)=>q.active),available=d.quests.filter((q:Model)=>q.canAccept).length;
 const presentation=scenePresentation(s,d),instance=presentation.instance,actions=instanceActions(s,d),travelling=s.activity.type==='travel'&&!instance;
 const region=presentation.region,regionMap=mapRegions[region as keyof typeof mapRegions];
 const dungeonMap=instance?.view?.map,floor=dungeonMap?.floors.find((f:Model)=>f.id===dungeonMap.floorByNode[instance?.view?.locationId])||dungeonMap?.floors[0];
 const map=instance?floor:regionMap;
 const point=playerMapPoint(travelMapFrame(s,0).journey,d.map),dungeonPoint=dungeonMap?.points[instance?.view?.locationId];
 const at=instance?(dungeonPoint?[dungeonPoint[0]/dungeonMap.width*100,dungeonPoint[1]/dungeonMap.height*100]:null):point&&point.region===region?[point.x,point.y]:mapPoints[s.location as keyof typeof mapPoints];
 const stop=classicStopAction(s,d);
 const showStop=(s.activity.type!=='idle'&&s.activity.type!=='dungeonCannon')||(!!d.goldRaid?.active&&!!d.goldRaid?.map?.autoAdvance)||(!!s.dungeon&&!!d.dungeon?.autoAdvance);
 const menus=classicMenus.map(item=>item.id==='map'&&instance?{...item,name:'副本地图'}:item);
 const menu=[...menus,...extraMenus].find(item=>item.id===panel);
 const instanceStatus=actions?(s.activity.type==='revive'?'倒下成员正在返回尸体。':actions.recover.label==='恢复中'?'小队正在恢复生命与法力。':instance?.view?.autoAdvance?'沿所选路线推进中。':actions.advance.disabled?actions.advance.reason:'选择路线，或推进下一场战斗。'):null;
 const destination=d.map.find((n:Model)=>n.id===s.activity.to)?.name;
 const groupFrames=(compact=false)=><div className={`cu-group ${compact?'compact':''}`}>{members.map((unit:Model)=>{
  const ui=battling?d.battleView?.units?.[unit.id]:null,hp=ui?.hp??unit.hp,mana=ui?.resource?.key==='mana'?ui.resource.value:unit.mana,maxHp=ui?.maxHp||unit.stats?.maxHp||unit.maxHp||1,maxMana=ui?.resource?.key==='mana'?ui.resource.max:unit.stats?.maxMana??unit.maxMana??0;
  return <button key={unit.id} className="cu-member" aria-pressed={battling&&!!d.combatCommand&&commandMemberId===unit.id} onClick={()=>battling&&d.combatCommand?setCommandMemberId(unit.id):open(members.length>5?'raid':'party')} style={{'--class-color':colors[unit.classId]||'#bdad8e'} as CSSProperties} title={`${unit.name} · 生命 ${fmt(hp)}/${fmt(maxHp)}`}><ClassIcon classId={unit.classId} size={compact?18:24}/><span className="cu-member-bars"><b><span>{unit.name}</span><small>{unit.level}</small></b><span className="cu-member-hp"><i style={{width:percent(hp,maxHp)+'%'}}/></span>{maxMana>0&&<span className="cu-member-mp"><i style={{width:percent(mana,maxMana)+'%'}}/></span>}</span><em>{Math.round(percent(hp,maxHp))}%</em></button>;
 })}</div>;
 const damageMeter=<LiveDamageMeter state={s} data={d} playback={props.playback} contentVersion={props.contentVersion} empty={<div className="cu-meter-empty"><Swords size={22}/><h3>伤害统计</h3><p>尚无战斗记录。战斗中可实时查看成员伤害、DPS 与技能明细。</p><button className="cu-gold-button" onClick={()=>open('activities')}>查看野外活动</button></div>}/>;
 return <div className={`classic-game${uiHidden?' scene-ui-hidden':''}`}>
  <section className={`cu-viewport ${battling?'cu-in-combat':''} ${travelling?'cu-is-travelling':''}`} aria-label="经典游戏主界面">
   <div className="cu-world" inert={!!panel||props.modalBattleOpen}><WorldScene {...props} uiHidden={uiHidden} commandMemberId={commandMemberId} onCommandMemberChange={setCommandMemberId} animationPaused={!!panel||props.modalBattleOpen}/></div>
   <SceneUiToggle hidden={uiHidden} onToggle={()=>setUiHidden(value=>!value)}/>
   <div className="cu-shade"/>
   <div className="cu-player-hud">
   <ClassicPlayerFrame state={s} data={d} playback={props.playback} contentVersion={props.contentVersion} onOpen={()=>open('character')}/>
   <BuffBar state={s} data={d} playback={props.playback} contentVersion={props.contentVersion} classic/>
   </div>
   <div className="cu-zone-title"><small>{battling?'战斗中':travelling?`${presentation.region} · 旅途中`:presentation.region}</small><h1>{presentation.name}{travelling?'附近':''}</h1><p>{destination?`前往 ${destination}`:s.activity.reason||instanceStatus||activityLabel}</p></div>
   {s.hp<=0&&!battling&&<button className="cu-corpse-run" disabled={busy||s.activity.type==='revive'||!!instance&&(!props.canLead||!!actions?.revive.disabled)} onClick={()=>void send(actions?.revive.command||{type:'revive'})}><Icon name="spell_holy_resurrection"/><span>{s.activity.type==='revive'?'跑尸中…':actions?.revive.label==='全团复活'?'全团复活':'释放灵魂 · 跑尸'}</span></button>}
   <button className="cu-minimap" onClick={()=>open('map')} aria-label={instance?"打开副本地图":"打开世界地图"}><span className="cu-map-circle" style={map?.image?{backgroundImage:`url(${map.image})`,backgroundSize:'100%',backgroundPosition:'center'}:undefined}>{at&&map?.image?<i style={{left:Math.min(88,Math.max(12,at[0]))+'%',top:Math.min(88,Math.max(12,at[1]))+'%'}}>▲</i>:<i>✦</i>}<small>N</small></span><span>{presentation.name}</span><em>{instance?'副本地图':'地图'} · M</em></button>
   <aside className={`cu-left-hud${members.length>5?' cu-raid-hud':''}`} aria-label="小队状态"><div className="cu-hud-heading"><span>{members.length>5?'团队':'冒险小队'} · {members.length} 人</span><button onClick={()=>open(members.length>5?'raid':'party')}>管理</button></div>{members.length>5?<LiveRaidFrames state={s} data={d} playback={props.playback} contentVersion={props.contentVersion} selectedId={commandMemberId} onSelect={setCommandMemberId}/>:groupFrames(true)}</aside>
   <aside className="cu-right-hud" aria-label="任务追踪"><h2 className="cu-quest-tracker-heading">任务追踪 <span>{quests.length}</span></h2>{quests.length?quests.map((quest:Model)=><button key={quest.id} className="cu-quest-tracker" onClick={()=>open('quests')}><b>{quest.complete?'?':'◇'} {quest.name}</b>{quest.objectives.map((objective:Model,i:number)=><span className="cu-quest-objective" key={i}>{objective.name} {objective.count}/{objective.required}</span>)}<small>{quest.complete?'返回委托人领取报酬':'点击查看任务与导航'}</small></button>):<button className="cu-quest-tracker" onClick={()=>open('nearby')}><b>{available?`! ${available} 个可接任务`:'暂无追踪任务'}</b><small>{available?'与附近人物交谈':'查看附近人物与服务'}</small></button>}</aside><div className="cu-corner-meter" ref={meterRef} style={meterStyle}><button className="cu-hud-drag cu-meter-drag" aria-label="移动伤害统计" title="拖动移动 · 方向键微调 · 双击或 Home 复位" {...meterHandle}><GripHorizontal size={16}/></button>{damageMeter}</div>
   {!battling&&!instance&&<div className="cu-scene-caption"><span className="cu-nameplate">{s.name}</span><small>{s.mounted?'骑乘中':`${d.raceName} · ${d.className}`}</small></div>}
   <ClassicChat state={s} hud={chatHud} onMeter={()=>open('meter')} battle={<JourneyLog {...props} onObserve={onObserve}/>}/>
   {(!battling||!d.combatCommand)&&<div className="cu-actions" aria-label="场景操作">{s.activity.paused&&<button disabled={busy} onClick={()=>open('bag')}><span>整理背包 {s.bag.length}/{d.bagCapacity} · 待拾取 {s.pending.length} 组</span></button>}{s.dungeon&&!battling&&<label className="cu-command-toggle"><input type="checkbox" checked={!!s.settings.commandCombat} disabled={busy||!props.canLead} onChange={e=>void send({type:'combatCommand',order:'prepare',enabled:e.target.checked})}/>指挥战斗</label>}{showStop&&<button title={s.activity.stopQueued?stop.label:stop.disabled?(instance?'当前没有正在推进的副本路线。':'当前无需停止；地面旅行可在地图中改道。'):stop.label} disabled={busy||stop.disabled||!!instance&&!props.canLead} onClick={()=>void send(stop.command)}><Square size={14}/><span>{stop.label}</span></button>}{actions?<>{(['revive','recover'] as const).map(key=><button key={key} disabled={busy||!props.canLead||actions[key].disabled} title={actions[key].reason} onClick={()=>void send(actions[key].command)}><Icon name={key==='revive'?'spell_holy_resurrection':'inv_drink_07'}/><span>{actions[key].label}</span></button>)}<button className="cu-fight-button" disabled={!battling&&(busy||!props.canLead||actions.advance.disabled)} title={actions.advance.reason} onClick={()=>battling?onObserve():void send(actions.advance.command)}><Swords size={17}/><span>{battling?'战斗详情':actions.advance.label}</span></button></>:<><button className="cu-fight-button" onClick={()=>battling?onObserve():open('activities')}><Swords size={17}/><span>{battling?'战斗详情':'野外活动'}</span></button></>}<button ref={home} onClick={()=>open('nearby')} aria-haspopup="dialog" title="附近人物 (N)"><Icon name="spell_holy_magicalsentry"/><span>附近人物</span></button></div>}
   {['gather','professionGather'].includes(s.activity.type)&&<div className="cu-gather-progress"><ActivityProgress state={s} data={d}/></div>}
   <ClassicActionBar key={s.id} {...props} blocked={uiHidden||!!panel||props.modalBattleOpen}/>
   <footer className="cu-bottom-ui">{travelling&&<div className="cu-travel-progress"><ActivityProgress state={s} data={{map:d.map}}/></div>}<div className="cu-xp" role="progressbar" aria-label="经验值" aria-valuemin={0} aria-valuemax={s.level>=60?1:d.nextXp||1} aria-valuenow={s.level>=60?1:s.xp}><i style={{width:(s.level>=60?100:percent(s.xp,d.nextXp))+'%'}}/><span>等级 {s.level} <b>{s.level>=60?'已达等级上限':`经验 ${fmt(s.xp)} / ${fmt(d.nextXp)}`}</b></span></div><nav className="cu-menu" aria-label="游戏菜单">{menus.filter(item=>item.id!=='nearby').map(item=><button key={item.id} onClick={()=>open(item.id)} title={`${item.name} (${item.key})`} aria-label={item.name} aria-haspopup="dialog"><span className="cu-icon-frame"><Icon name={item.icon}/><kbd>{item.key}</kbd>{item.id==='quests'&&quests.some((q:Model)=>q.complete)&&<i/>}</span><span>{item.name}</span></button>)}<button onClick={()=>open('raid')} aria-label="团队副本" aria-haspopup="dialog"><span className="cu-icon-frame"><Icon name="inv_misc_head_dragon_01"/></span><span>团本</span></button><button onClick={()=>open('settings')} aria-label="设置" title="设置 (Esc)" aria-haspopup="dialog"><span className="cu-icon-frame"><Icon name="inv_misc_gear_01"/><kbd>Esc</kbd></span><span>设置</span></button></nav></footer>
  </section>
  <div className="cu-status-area">{status}</div>
  {utilities}
  <Dialog.Root open={!!panel} onOpenChange={isOpen=>{if(!isOpen)onPanelChange(null);}}><Dialog.Portal><Dialog.Overlay className="cu-dialog-overlay"/><Dialog.Content className={`cu-dialog cu-live-dialog cu-panel-${panel}`} onCloseAutoFocus={event=>{event.preventDefault();requestAnimationFrame(()=>{if(document.querySelector('[role=dialog][data-state=open]'))return;(focus.current?.isConnected?focus.current:home.current)?.focus({preventScroll:true});});}}><header className="cu-dialog-header"><span className="cu-dialog-medallion"><Icon name={menu?.icon||'inv_misc_book_09'}/></span><div><Dialog.Title>{menu?.name||'游戏功能'}</Dialog.Title><Dialog.Description>{presentation.name} · {activityLabel}</Dialog.Description></div><Dialog.Close className="cu-close" aria-label="关闭窗口"><X size={20}/></Dialog.Close></header><div className="cu-dialog-body">{panel==='meter'?damageMeter:panel&&renderPanel(panel)}{panel==='settings'&&<div className="cu-settings-navigation"><button className="cu-gold-button" onClick={()=>{chatHud.reset();resetMeter();}}>重置聊天与统计位置</button><button className="cu-gold-button" onClick={()=>open('account')}>角色与后台活动</button><button className="cu-gold-button" onClick={onStyleChange}><ArrowLeftRight size={14}/>切换为网页 UI</button></div>}</div></Dialog.Content></Dialog.Portal></Dialog.Root>
 </div>;
}
