"use client";
import {useEffect,useRef} from 'react';
import {Bar,money,GameProps} from './game-ui';

export default function PlayerHud({state:s,data:d}:Pick<GameProps,'state'|'data'>){
 const ref=useRef<HTMLElement>(null);
 useEffect(()=>{const node=ref.current;if(!node)return;const resize=new ResizeObserver(()=>document.documentElement.style.setProperty('--player-hud-height',`${node.getBoundingClientRect().height}px`));resize.observe(node);return()=>{resize.disconnect();document.documentElement.style.removeProperty('--player-hud-height');};},[]);
 const resource=d.resource||{name:'法力',value:s.mana,max:d.stats.maxMana};
 return <footer ref={ref} className="player-hud" aria-label="玩家状态"><div className="player-hud-inner"><div className="hud-identity"><div className="identity-crest compact" aria-hidden="true">{d.className?.slice(0,1)||'勇'}</div><div><strong>{s.name} <span className="level-badge">Lv.{s.level}</span></strong><small>{d.raceName} · {d.className}</small></div></div><div className="hud-vitals"><Bar label="生命" value={s.hp} max={d.stats.maxHp}/>{resource.max>0&&<Bar label={resource.name} value={resource.value} max={resource.max} tone={resource.name==='怒气'?'rage':resource.name==='能量'?'energy':'mana'}/>}</div><div className="hud-experience"><div><span>{s.level>=60?'已达等级上限':'经验'}</span><span>{s.level>=60?'Lv.60':`${s.xp} / ${d.nextXp}`}</span></div><Bar label="经验" value={s.level>=60?1:s.xp} max={s.level>=60?1:d.nextXp||1} tone="xp"/><small className="wallet">{money(s.money)}</small></div></div></footer>;
}
