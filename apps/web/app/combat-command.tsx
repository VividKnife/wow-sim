"use client";
/* eslint-disable @next/next/no-img-element -- Game spell icons. */
import {useEffect,useState,type ReactNode} from 'react';
import {Swords,Flame,Footprints,Hand,Crosshair,RotateCcw,Pause,Play,Flag,ChevronDown,X} from 'lucide-react';
import ClassIcon from './class-icon';
import {GameProps} from './game-ui';
import './combat-command.css';

export const combatMarks:Record<string,string>={skull:'☠ 骷髅',cross:'✕ 十字',moon:'☾ 月亮',square:'■ 方块',star:'★ 星星',diamond:'◆ 菱形'};
const kindNames:Record<string,string>={soft:'维持控场',hard:'强制控制',interrupt:'等待打断',kite:'风筝牵制',tactic:'职业技能'};
export function CommandPreparation({state:s,busy,send}:Pick<GameProps,'state'|'busy'|'send'>){
 return <label className="command-preparation"><input type="checkbox" checked={!!s.settings.commandCombat} disabled={busy||!!s.combat} onChange={e=>send({type:'combatCommand',order:'prepare',enabled:e.target.checked})}/><span>指挥接下来的战斗<small>每场先暂停，布置完毕再开战</small></span></label>;
}
type Props=GameProps&{memberId:string;targetId:string;onMemberChange:(id:string)=>void;onTargetChange:(id:string)=>void;onOrder:(body:any,targeted?:boolean)=>void;pending:any;onCancel:()=>void;canLead:boolean;active:boolean;embedded?:boolean};
type Slot={key:string;label:string;icon:ReactNode;run:()=>void;pressed?:boolean;disabled?:boolean;detail:string;cooldown?:number};
export default function CombatCommand({state:s,data:d,busy,memberId,targetId,onMemberChange,onTargetChange,onOrder,pending,onCancel,canLead,active,embedded}:Props){
 const [more,setMore]=useState(false),[targetsOpen,setTargetsOpen]=useState(false),[captainOpen,setCaptainOpen]=useState(false),[hint,setHint]=useState('');
 const battle=s.combat,view=d.combatCommand,command=battle?.command;
 const members=view?.members||[],member=members.find((m:any)=>m.id===memberId)||members[0];
 const enemies=(battle?.enemies||[]).filter((e:any)=>e.hp>0&&!e.removed&&!e.controlledBy),target=enemies.find((e:any)=>e.id===targetId);
 const locked=busy||!canLead,dead=!member||member.hp<=0;
 const skills=(view?.skills||[]).filter((x:any)=>x.memberId===member?.id);
 const tasks=(command?.orders||[]).filter((o:any)=>o.memberId===member?.id);
 const mode=command?.memberModes?.[member?.id]||command?.mode||'auto';
 const request=(order:string,extra:any={},targeted=false)=>onOrder({order,...extra},targeted);
 const slots:Slot[]=member?[
  {key:'single',label:'单体',icon:<Swords/>,pressed:mode==='single',disabled:locked||dead,detail:'单体输出：暂时停用伤害型范围技能，治疗与控制照常',run:()=>request('mode',{mode:'single',memberId:member.id})},
  ...(member.canAoe?[{key:'aoe',label:'范围',icon:<Flame/>,pressed:mode==='aoe',disabled:locked||dead,detail:'范围输出：优先已学群攻，仍保护软控目标',run:()=>request('mode',{mode:'aoe',memberId:member.id})}]:[]),
  ...skills.map((skill:any)=>{const state=skill.targets[target?.id],invalid=target?state?.reason:!Object.values(skill.targets).some((x:any)=>!x.reason);return {key:String(skill.spellId),label:skill.name,icon:<img src={skill.icon} alt=""/>,pressed:tasks.some((o:any)=>o.spellId===skill.spellId),disabled:locked||!!invalid,detail:state?.reason||state?.status||'选择敌人后下达'+skill.name,cooldown:Math.max(0,Math.ceil((skill.cooldownUntil-s.clock)/1000)),run:()=>request('control',{memberId:member.id,spellId:skill.spellId,label:skill.name},true)};}),
  ...(member.canKite?[{key:'kite',label:'风筝',icon:<Footprints/>,pressed:tasks.some((o:any)=>o.kind==='kite'),disabled:locked||dead,detail:'攻击指定敌人并在被追击时撤退，坦克不抢回该目标',run:()=>request('kite',{memberId:member.id,label:'风筝'},true)}]:[]),
  {key:'auto',label:'自动',icon:<RotateCcw/>,pressed:mode==='auto'&&!tasks.length,disabled:locked||dead,detail:'取消该队员的临时任务，恢复原策略',run:()=>request('mode',{mode:'auto',memberId:member.id})},
 ]:[];
 const captain:Slot[]=[
  {key:'focus',label:'集火',icon:<Crosshair/>,pressed:!!target&&command?.focusId===target.id,disabled:locked,detail:'选中敌人后全队集火；治疗继续救人，坦克继续接怪',run:()=>request('focus',{label:'全队集火'},true)},
  {key:'single',label:'单体',icon:<Swords/>,pressed:command?.mode==='single',disabled:locked,detail:'全队使用单体输出，保护其他目标',run:()=>request('mode',{mode:'single'})},
  {key:'aoe',label:'范围',icon:<Flame/>,pressed:command?.mode==='aoe',disabled:locked||!members.some((m:any)=>m.canAoe),detail:'全队优先已学群攻，保留治疗职责与控场保护',run:()=>request('mode',{mode:'aoe'})},
  {key:'hold',label:command?.holdFire?'开火':'停火',icon:<Hand/>,pressed:!!command?.holdFire,disabled:locked,detail:'停止主动伤害；治疗、控制继续；不会清除已有持续伤害',run:()=>request('holdFire',{enabled:!command?.holdFire})},
  {key:'auto',label:'自动',icon:<RotateCcw/>,disabled:locked,detail:'全队取消临时打法、集火及任务，恢复原策略',run:()=>request('mode',{mode:'auto'})},
 ];
 useEffect(()=>{setMore(false);setHint('');},[memberId,battle?.id]);
 useEffect(()=>{
  if(!active||!view)return;
  const key=(e:KeyboardEvent)=>{
   const node=e.target as HTMLElement;
   if(e.defaultPrevented||e.repeat||e.ctrlKey||e.metaKey||e.altKey||node.closest?.('input,textarea,[contenteditable=true],[role=combobox],[role=listbox]'))return;
   if(embedded&&document.querySelector('[role=dialog][data-state=open]'))return;
   if(e.key==='Escape'&&pending){e.preventDefault();e.stopImmediatePropagation();onCancel();return;}
   if(/^F[1-5]$/.test(e.key)){const m=members[Number(e.key.slice(1))-1];if(m){e.preventDefault();onMemberChange(m.id);}return;}
   if(e.key==='Tab'&&!e.shiftKey&&enemies.length&&!node.closest?.('button,a,[tabindex]')){e.preventDefault();onTargetChange(enemies[(enemies.findIndex((e:any)=>e.id===targetId)+1)%enemies.length].id);return;}
   const digit=/^Digit[1-8]$/.test(e.code)?Number(e.code.slice(5)):0,slot=(e.shiftKey?captain:slots)[digit-1];
   if(slot&&!slot.disabled){e.preventDefault();slot.run();}
  };
  window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
 });
 if(!battle||!view||!member)return null;
 const button=(slot:Slot,i:number,team=false)=><button type="button" key={slot.key} className="command-slot" aria-label={`${team?'全队':member.name}：${slot.label}`} title={slot.detail} disabled={slot.disabled} aria-pressed={!!slot.pressed} onClick={slot.run} onPointerEnter={()=>setHint(slot.detail)} onFocus={()=>setHint(slot.detail)}>{i<8&&<kbd>{team?'⇧':''}{i+1}</kbd>}<span className="command-slot-icon">{slot.icon}</span>{!!slot.cooldown&&<span className="command-slot-cooldown">{slot.cooldown}</span>}<span className="command-slot-name">{slot.label}</span></button>;
 const taskLabel=tasks.map((o:any)=>`${skills.find((x:any)=>x.spellId===o.spellId)?.name||kindNames[o.kind]} → ${enemies.find((e:any)=>e.id===o.targetId)?.name||'目标失效'}`).join(' · ');
 return <>
  <aside className="command-target-hud" aria-label="指挥目标">
   <button type="button" className="command-target-name" aria-expanded={targetsOpen} onClick={()=>setTargetsOpen(!targetsOpen)}><span>{target?<>{combatMarks[command?.marks?.[target.id]]} {target.name}</>:'点击敌人选择目标'}</span><ChevronDown size={13}/></button>
   {target&&<><div className="command-target-health" role="progressbar" aria-label={`${target.name}生命`} aria-valuenow={Math.round(target.hp)} aria-valuemin={0} aria-valuemax={target.maxHp}><i style={{width:Math.max(0,target.hp/target.maxHp*100)+'%'}}/></div><small>{command?.focusId===target.id?'全队集火 · ':''}{Math.ceil(target.hp)} / {target.maxHp}{target.cast?' · 正在施法':''}</small><div className="command-target-marks" role="group" aria-label="敌人标记">{Object.entries(combatMarks).map(([mark,label])=><button key={mark} type="button" title={label} aria-label={label} aria-pressed={command?.marks?.[target.id]===mark} disabled={locked} onClick={()=>request('mark',{targetId:target.id,mark:command?.marks?.[target.id]===mark?'':mark})}>{label.split(' ')[0]}</button>)}<button type="button" aria-label="清除此目标指令" title="清除此目标指令" disabled={locked} onClick={()=>request('clear',{targetId:target.id})}><X size={12}/></button></div></>}
   {(targetsOpen||pending)&&<div className="command-target-picker">{enemies.map((e:any)=><button key={e.id} type="button" aria-pressed={e.id===targetId} onClick={()=>{onTargetChange(e.id);setTargetsOpen(false);}}>{combatMarks[command?.marks?.[e.id]]?.split(' ')[0]} {e.name}<small>Lv.{e.level} · {Math.ceil(e.hp/e.maxHp*100)}%</small></button>)}</div>}
  </aside>
  <section className="combat-command command-hotbar" aria-label="小队指挥" onPointerLeave={()=>setHint('')}>
   {<div className={`command-member-picker ${embedded?'command-members-mobile':''}`} aria-label="选择受令队员">{members.map((m:any)=><button key={m.id} type="button" aria-pressed={member.id===m.id} onClick={()=>onMemberChange(m.id)}><ClassIcon classId={m.classId} size={20}/>{m.name}</button>)}</div>}
   <header className="command-hotbar-heading"><div><ClassIcon classId={member.classId} size={25}/><strong>{member.name}</strong><span>{taskLabel||(mode==='aoe'?'范围输出':mode==='single'?'单体输出':'按原策略行动')}</span></div><button type="button" className="command-pause" disabled={locked} onClick={()=>request(command?.paused?'resume':'pause')}>{command?.paused?<Play size={13}/>:<Pause size={13}/>}<span>{command?.paused?'继续战斗':'战术暂停'}</span></button></header>
   <div className="command-hotbar-rows"><div className="command-personal" role="group" aria-label={`${member.name}职业快捷栏`}>{(more?slots:slots.slice(0,8)).map((slot,i)=>button(slot,i))}{slots.length>8&&<button type="button" className="command-more" aria-expanded={more} onClick={()=>setMore(!more)}>{more?'收起':'更多'}<ChevronDown size={14}/></button>}</div><div className={`command-captain ${captainOpen?'is-open':''}`}><button type="button" className="command-captain-title" aria-expanded={captainOpen} onClick={()=>setCaptainOpen(!captainOpen)}><Flag size={13}/><span>队长指挥</span></button><div className="command-captain-slots" role="group" aria-label="队长快捷栏">{captain.map((slot,i)=>button(slot,i,true))}</div></div></div>
   <div className="command-feedback" role="status">{pending?<><span>{pending.label||'下达指令'} → 点击敌人或上方目标列表</span><button type="button" onClick={onCancel}>取消 · Esc</button></>:<span>{!canLead?'由队长发布指令':hint||(command?.paused?'战术暂停 · 时间冻结，布置完成后继续':'实时指挥 · F1–F5 选队员 · 1–8 技能 · Shift+数字 队长命令')}</span>}</div>
  </section>
 </>;
}
