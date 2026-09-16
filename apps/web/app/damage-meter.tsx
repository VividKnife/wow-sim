"use client";
import {useState,type CSSProperties} from 'react';
import {BarChart3,ChevronDown,ChevronRight,Clock3} from 'lucide-react';
import {meterRows} from '@/lib/game/combat-metrics.js';
import {Icon} from './game-ui';
import './damage-meter.css';

const classes:Record<number,{color:string;name:string;icon?:string}>={
 1:{color:'#c69b6d',name:'战',icon:'assets/inv_sword_04.png'},2:{color:'#f48cba',name:'骑'},
 3:{color:'#aad372',name:'猎',icon:'class-assets/ability_hunter_beasttaming.jpg'},
 4:{color:'#fff468',name:'贼',icon:'assets/ability_backstab.png'},
 5:{color:'#ffffff',name:'牧',icon:'assets/spell_holy_wordfortitude.png'},7:{color:'#0070dd',name:'萨'},
 8:{color:'#3fc7eb',name:'法',icon:'assets/spell_frost_frostbolt02.png'},9:{color:'#8788ee',name:'术'},11:{color:'#ff7c0a',name:'德'},
};
const number=(n:number)=>n>=1e6?`${(n/1e6).toFixed(2)}m`:n>=1e4?`${(n/1000).toFixed(1)}k`:Math.round(n).toLocaleString('en-US');
const timer=(ms:number)=>{const seconds=Math.floor(Math.max(0,ms)/1000);return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;};

export default function DamageMeter({battle,dungeon,clock,skills=[]}:{battle:any;dungeon:any;clock:number;skills?:any[]}){
 const [scope,setScope]=useState('encounter'),[expanded,setExpanded]=useState<string|null>(null),[collapsed,setCollapsed]=useState(false);
 const overall=scope==='dungeon'&&!!dungeon?.metrics;
 const source=overall?dungeon.metrics:battle,metrics=source.metrics||source;
 const rows=meterRows(source,clock),total=rows.reduce((n:number,r:any)=>n+r.damage,0),dps=rows.reduce((n:number,r:any)=>n+r.dps,0),leader=Math.max(1,...rows.map((r:any)=>r.damage));
 const elapsed=metrics.durationMs??Math.max(0,(battle.endedAt??clock)-(metrics.startedAt??battle.startedAt));
 return <section className="damage-meter" aria-label="伤害统计">
  <header className="dm-titlebar"><BarChart3 size={14} aria-hidden="true"/><h3>伤害统计</h3><span className="dm-mode">伤害输出</span><button className="dm-collapse" aria-label={collapsed?'展开伤害统计':'收起伤害统计'} aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}>{collapsed?<ChevronRight size={14}/>:<ChevronDown size={14}/>}</button></header>
  {!collapsed&&<>
   <div className="dm-toolbar"><select aria-label="统计战斗范围" value={overall?'dungeon':'encounter'} onChange={e=>{setScope(e.target.value);setExpanded(null);}}><option value="encounter">{battle.endedAt!=null?'上一场战斗':'当前战斗'}</option><option value="dungeon" disabled={!dungeon?.metrics}>副本已结算战斗</option></select><span className="dm-timer" title="有效战斗时长"><Clock3 size={11} aria-hidden="true"/>{timer(elapsed)}</span><span className={`dm-state ${battle.endedAt==null&&!overall?'live':''}`}>{overall?'累计':battle.endedAt!=null?'已结束':'战斗中'}</span></div>
   <div className="dm-columns" aria-hidden="true"><span>排名 / 成员</span><span>伤害</span><span>DPS</span><span>占比</span></div>
   <div className="dm-list">{!rows.length&&<p className="dm-empty">等待战斗数据…</p>}{rows.map((row:any,index:number)=>{
    const identity=classes[row.classId]||{color:'#a6b79b',name:'随'},selected=expanded===row.actorId;
    return <div className="dm-entry" key={row.actorId} style={{'--dm-color':identity.color} as CSSProperties}>
     <button className={`dm-row ${selected?'selected':''}`} aria-expanded={selected} aria-label={`${row.name}，伤害 ${row.damage}，DPS ${row.dps.toFixed(1)}，占比 ${(row.share*100).toFixed(1)}%，技能明细`} onClick={()=>setExpanded(selected?null:row.actorId)}>
      <i className="dm-fill" style={{width:`${row.damage/leader*100}%`}} aria-hidden="true"/>
      <span className="dm-member"><span className="dm-rank">{index+1}.</span>{identity.icon?<img className="dm-class-icon" src={`/icons/${identity.icon}`} alt=""/>:<span className="dm-class-letter" aria-hidden="true">{identity.name}</span>}<span className="dm-name">{row.name}</span></span>
      <span className="dm-value" title={`${row.damage.toLocaleString()} 有效伤害`}>{number(row.damage)}</span><span className="dm-value">{number(row.dps)}</span><span className="dm-share">{(row.share*100).toFixed(1)}%</span>
     </button>
     {selected&&<div className="dm-breakdown"><div className="dm-breakdown-title"><span>{row.name} · 技能伤害</span><small>伤害 / 占比</small></div>{!row.spells.some((spell:any)=>spell.damage>0)&&<p className="dm-empty">尚未造成有效伤害</p>}{row.spells.filter((spell:any)=>spell.damage>0).map((spell:any)=>{
      const skill=skills.find((s:any)=>s.spellId===spell.spellId);
      return <div className="dm-spell" key={spell.spellId}><i style={{width:`${spell.share*100}%`}} aria-hidden="true"/><div className="dm-spell-main"><Icon src={skill?.icon} name={spell.label} size={18}/><span>{spell.label}</span><b>{number(spell.damage)} <small>{(spell.share*100).toFixed(1)}%</small></b></div><div className="dm-spell-meta">{spell.hits} 次命中 · {spell.crits} 次暴击{spell.periodicDamage>0?` · 周期伤害 ${number(spell.periodicDamage)}`:''}</div></div>;
     })}</div>}
    </div>;
   })}</div>
   <footer className="dm-total"><span>总计 <small>{rows.length} 名成员</small></span><strong>{number(total)}</strong><strong>{number(dps)}</strong><span>{total>0?'100%':'—'}</span></footer>
   <div className="dm-footnote"><span>{overall?'已结算场次 · 包含失败尝试':'点击成员查看技能明细'}</span><span>{rows.some((r:any)=>r.partial)?'部分记录':'有效伤害'}</span></div>
  </>}
 </section>;
}
