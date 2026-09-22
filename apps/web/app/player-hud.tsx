"use client";
import ClassIcon from './class-icon';
import {Bar,money,GameProps} from './game-ui';

export default function PlayerHud({state:s,data:d}:Pick<GameProps,'state'|'data'>){
 const resource=d.resource||{name:'法力',value:s.mana,max:d.stats.maxMana};
 return <section className="player-hud" aria-label="玩家状态"><div className="player-hud-inner"><div className="hud-identity"><div className="identity-crest compact" aria-hidden="true"><ClassIcon classId={s.classId}/></div><div><strong>{s.name} <span className="level-badge">Lv. {s.level}</span></strong><small>{d.faction==='Horde'?'部落':'联盟'} · {d.raceName} · {d.className}</small></div></div><div className="hud-vitals"><Bar label="生命" value={s.hp} max={d.stats.maxHp}/>{resource.max>0&&<Bar label={resource.name} value={resource.value} max={resource.max} tone={resource.name==='怒气'?'rage':resource.name==='能量'?'energy':'mana'}/>}</div><div className="hud-experience"><div><span>{s.level>=60?'已达等级上限':'经验'}</span><span>{s.level>=60?'Lv.60':`${s.xp} / ${d.nextXp}`}</span></div><Bar label="经验" value={s.level>=60?1:s.xp} max={s.level>=60?1:d.nextXp||1} tone="xp"/><small className="wallet">持有货币　{money(s.money)}</small></div></div></section>;
}
