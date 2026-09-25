"use client";
import type {CSSProperties} from 'react';
import {Shield,Plus,Swords} from 'lucide-react';
import {unitCondition,actionProgress} from '@/lib/combat-view.js';
import {classCombatMeta} from '../../../packages/sim-core/src/class-combat.js';
import {duration} from './game-ui';
import './battle-raid-frames.css';

const ratio=(value:number,max:number)=>Math.max(0,Math.min(100,max>0?value/max*100:0));
const resources:Record<string,string>={mana:'#247ae3',rage:'#dc403e',energy:'#e6ca43',focus:'#df9c40'};
export default function BattleRaidFrames({units,views,selectedId,onSelect,clock,live}:{units:any[];views:Record<string,any>;selectedId:string;onSelect:(id:string)=>void;clock:number;live:boolean}){
 const members=units.filter(unit=>!unit.foe&&!unit.petUnit&&!unit.totemUnit&&!unit.removed);
 const groups=Array.from({length:Math.ceil(members.length/5)},(_,index)=>members.slice(index*5,index*5+5));
 return <section className="raid-frames" aria-label="团队框架">
  <header><strong>团队框架</strong><span>{members.filter(unit=>(views[unit.id]?.hp??unit.hp)>0).length}/{members.length} 存活{!live?' · 战斗结束时':''}</span></header>
  <div className="raid-frames-scroll"><div className="raid-frames-groups" style={{'--raid-groups':groups.length} as CSSProperties}>
   {groups.map((group,index)=><div className="raid-frame-group" key={index} role="group" aria-label={`小队${index+1}`}><h3>小队{index+1}</h3>{group.map(unit=>{
    const ui=views[unit.id],hp=ui?.hp??unit.hp,maxHp=ui?.maxHp??unit.maxHp??1,percent=ratio(hp,maxHp),dead=hp<=0;
    const resource=ui?.resource,color=ui?.color||classCombatMeta[unit.classId]?.color||'#8bab9e';
    const role=unit.strategyPolicy?.role&&unit.strategyPolicy.role!=='auto'?unit.strategyPolicy.role:unit.role;
    const RoleIcon=role==='tank'?Shield:role==='healer'?Plus:['melee','ranged','damage'].includes(role)?Swords:null;
    const condition=dead?'死亡':unitCondition(unit,clock)||'';
    const effects=dead?[]:(ui?.effects||[]).filter((effect:any)=>!effect.until||effect.until>clock);
    const cast=!dead&&ui?.cast?.until>clock?ui.cast:null;
    const health=`生命 ${Math.ceil(Math.max(0,hp))} / ${Math.ceil(maxHp)}`;
    const power=resource?.max>0?`${resource.name} ${Math.floor(resource.value)} / ${Math.floor(resource.max)}`:'';
    return <button type="button" key={unit.id} className={`raid-frame${dead?' is-dead':''}${!dead&&percent<30?' is-critical':''}`} aria-pressed={selectedId===unit.id} aria-label={`${unit.name}，${ui?.className||''}，${health}${power?'，'+power:''}${condition?'，'+condition:''}`} title={[unit.name,health,power,condition,...effects.map((effect:any)=>`${effect.name}${effect.until?' · '+duration(effect.until-clock):''}`)].filter(Boolean).join('\n')} onClick={()=>onSelect(unit.id)} style={{'--raid-class':color,'--raid-resource':resources[resource?.key]||resources[resource?.tone]||resources.mana} as CSSProperties}>
     <span className="raid-frame-health" style={{width:percent+'%'}}/>
     <span className="raid-frame-name">{RoleIcon&&<RoleIcon size={11} aria-hidden="true"/>}<span>{unit.name}</span></span>
     <span className="raid-frame-state">{condition||`${Math.round(percent)}%`}</span>
     <span className="raid-frame-effects">{effects.slice(0,3).map((effect:any,i:number)=><span key={`${effect.spellId}:${i}`} className="raid-frame-aura" title={`${effect.name}${effect.until?' · '+duration(effect.until-clock):''}`}>
      {effect.icon?<img src={effect.icon} alt={effect.name}/>:<span>{effect.name.slice(0,1)}</span>}{(effect.stacks>1||effect.charges>1)&&<b>{effect.stacks>1?effect.stacks:effect.charges}</b>}
     </span>)}{effects.length>3&&<small>+{effects.length-3}</small>}</span>
     {cast&&<span className="raid-frame-cast" title={cast.name} style={{width:actionProgress(cast.startedAt,cast.until,clock)*100+'%'}}/>}
     <span className="raid-frame-resource"><i style={{width:!dead&&resource?ratio(resource.value,resource.max)+'%':'0%'}}/></span>
    </button>;
   })}</div>)}
  </div></div>
  <footer>点击成员选择目标 · 金框为当前选中</footer>
 </section>;
}
