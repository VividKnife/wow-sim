import {duration} from './game-ui';
import {combatBosses} from '@/lib/boss-presentation.js';
import './boss-target.css';
export default function BossTarget({battle,data,clock,onSelect}:{battle:any;data:any;clock:number;onSelect:(id:string)=>void}){
 const bosses=combatBosses(battle,data);
 if(!bosses.length)return null;
 return <section className="boss-targets" aria-label="Boss 目标板">{bosses.map((boss:any)=>{
  const ui=data.battleView?.units[boss.id],hp=Math.max(0,ui?.hp??boss.hp),max=ui?.maxHp??boss.maxHp,percent=Math.max(0,Math.min(100,hp/Math.max(1,max)*100));
  const effects=(ui?.effects||[]).filter((e:any)=>!e.until||e.until>clock);
  return <article className="boss-target" key={boss.id}>
   <button type="button" className="boss-target-name" onClick={()=>onSelect(boss.id)} aria-label={`选择首领 ${boss.name}`}><span aria-hidden="true">☠</span><strong>{boss.name}</strong><small>首领</small></button>
   <div className="boss-target-health" role="progressbar" aria-label={`${boss.name}生命`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.ceil(hp)}><i style={{width:percent+'%'}}/><span>{Math.ceil(hp).toLocaleString()} / {Math.ceil(max).toLocaleString()} · {percent.toFixed(1)}%</span></div>
   {(['buff','debuff'] as const).map(kind=><div className={`boss-target-auras ${kind}`} key={kind} aria-label={kind==='buff'?'Boss 增益':'Boss 减益'}>{effects.filter((e:any)=>(e.kind||'buff')===kind).map((e:any,i:number)=><span className="boss-target-aura" key={`${e.spellId}:${i}`} title={`${kind==='buff'?'增益':'减益'}：${e.name}${e.until?' · '+duration(e.until-clock):''}`}>
    {e.icon?<img src={e.icon} alt={e.name}/>:<span>{e.name}</span>}{(e.stacks>1||e.charges>1)&&<b>{e.stacks>1?e.stacks:e.charges}</b>}{e.until&&<small>{duration(e.until-clock)}</small>}
   </span>)}</div>)}
  </article>;
 })}</section>;
}
