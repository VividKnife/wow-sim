"use client";
import {Button} from '@/components/ui/button';
import {classCombatMeta} from '../../../packages/sim-core/src/class-combat.js';
import {actionProgress} from '@/lib/combat-view.js';
import {Bar,Icon,duration,GameProps} from './game-ui';

type Props={unit:any;ui:any;clock:number;live:boolean};
export function BattleUnitStatus({unit,ui,clock,live}:Props){
 if(!ui)return null;
 const cast=ui.cast?.until>clock?ui.cast:null;
 const effects=ui.effects.filter((e:any)=>!e.until||e.until>clock);
 return <section className="battle-class-status" aria-label={`${unit.name}职业状态`} style={{borderColor:ui.color}}>
  <div className="section-heading"><h3>{unit.name}</h3><span className="battle-mode" style={{color:ui.color}}>Lv.{ui.level} · {ui.mode}{unit.stealthed?' · 潜行':''}</span></div>
  {ui.controlled&&<p>受 {ui.ownerName} 控制 · {duration(ui.controlUntil-clock)}</p>}
  <Bar label="生命" value={Math.max(0,ui.hp)} max={ui.maxHp}/>
  {ui.resource?.max>0&&<Bar label={ui.resource.name} value={ui.resource.value} max={ui.resource.max} tone={ui.resource.tone}/>}
  {ui.secondaryResource?.max>0&&<Bar {...ui.secondaryResource} label="保留法力"/>}
  {ui.combo&&<div className="battle-combo" aria-label={`连击点 ${ui.combo.value} / 5，${ui.combo.targetName}`}><span>连击点</span><div>{Array.from({length:5},(_,i)=><i key={i} className={i<ui.combo.value?'filled':''}/>)}</div><span>{ui.combo.value}/5 · {ui.combo.targetName}</span></div>}
  {ui.shards!==null&&<p className="battle-class-note">灵魂碎片 <strong>{ui.shards}</strong></p>}
  {unit.petUnit&&!unit.totemUnit&&<p className="battle-class-note">{ui.ownerName}的伙伴 · {ui.petMode}{ui.happiness?` · ${ui.happiness} · 忠诚度 ${ui.loyalty||1}/6`:''}</p>}
  {cast&&<div className="action-meter spell-meter"><span><Icon src={cast.icon} name={cast.name} size={24}/>{cast.channel?'引导':'施法'}：{cast.name} → {cast.targetName}<small>{duration(cast.until-clock)}</small></span><div role="progressbar" aria-label={cast.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(actionProgress(cast.startedAt,cast.until,clock)*100)}><i style={{width:actionProgress(cast.startedAt,cast.until,clock)*100+'%'}}/></div></div>}
  {ui.totems.length>0&&<div className="battle-totems" aria-label="四元素图腾">{ui.totems.map((t:any)=><div key={t.element} className={t.until>clock?'active':''}><strong>{t.label}</strong>{t.until>clock?<><Icon src={t.icon} name={t.name} size={28}/><span>{t.name}</span><small>{duration(t.until-clock)}{t.maxHp?` · 生命 ${Math.ceil(t.hp)}/${t.maxHp}`:''}</small></>:<span>未放置</span>}</div>)}</div>}
  <div className="battle-status-list" aria-label="当前效果">{effects.length?effects.map((e:any,i:number)=><div key={`${e.spellId}-${i}`} className="battle-status-effect"><Icon src={e.icon} name={e.name} size={28}/><div><strong>{e.name}{e.charges!=null?` ×${e.charges}`:e.stacks>1?` ×${e.stacks}`:''}</strong><small>{e.detail}{e.amount!=null?` ${Math.ceil(e.amount)}`:''}{e.until?` · ${duration(e.until-clock)}`:''}</small></div></div>):<p className="battle-class-note">暂无持续效果</p>}</div>
  {ui.cooldowns.some((c:any)=>c.readyAt>clock)&&<details className="battle-cooldowns"><summary>技能冷却（{ui.cooldowns.filter((c:any)=>c.readyAt>clock).length}）</summary><div className="battle-status-list">{ui.cooldowns.filter((c:any)=>c.readyAt>clock).map((c:any)=><div key={c.spellId} className="battle-status-effect"><Icon src={c.icon} name={c.name} size={24}/><span>{c.name} · {duration(c.readyAt-clock)}</span></div>)}</div></details>}
  {!live&&<small className="battle-class-note">本场结束时的状态</small>}
 </section>;
}

export function BattleCompanions({state:s,data:d,busy,send,units,clock,live,targetId}:GameProps&{units:any[];clock:number;live:boolean;targetId?:string}){
 const pets=units.filter(u=>u.petUnit&&!u.totemUnit&&u.ownerId===s.id),target=units.find(u=>u.id===targetId&&u.foe&&u.hp>0&&!u.removed);
 if(![3,9].includes(s.classId))return null;
 return <div className="battle-companions">{pets.length?pets.map(pet=>{const ui=d.battleView.units[pet.id];return <div key={pet.id}><BattleUnitStatus unit={pet} ui={ui} clock={clock} live={live}/><div className="battle-pet-commands" aria-label="宠物指令">{[['passive','被动'],['defensive','防御'],['aggressive','主动'],['follow','跟随'],['stay','停留']].map(([command,label])=><Button key={command} size="sm" variant={pet.mode===command?'default':'outline'} aria-pressed={pet.mode===command} disabled={busy||!ui.canCommand} onClick={()=>send({type:'petCommand',command})}>{label}</Button>)}<Button size="sm" disabled={busy||!ui.canCommand||!target} onClick={()=>send({type:'petCommand',command:'attack',targetId:target?.id})}>{target?`攻击 ${target.name}`:'选择敌人后指令攻击'}</Button></div></div>;}):<p className="battle-class-note">{s.classId===3?'本场没有出战宠物；可在职业技能中召唤伙伴。':'本场没有出战恶魔；可在职业技能中召唤恶魔。'}</p>}</div>;
}

export function BattleClassHint({classId}:{classId:number}){return <p className="battle-class-note">{classCombatMeta[classId]?.hint}</p>;}
