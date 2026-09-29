'use client';
import {useState} from 'react';
import {PartyBuffAudio} from './party-buff-audio';
import {Button} from '@/components/ui/button';
import type {GameProps} from './game-ui';
import './party-buffs.css';
const statusNames:Record<string,string>={ready:'已就绪',missing:'待补',mana:'回蓝中',cooldown:'冷却中',casting:'施法中',materials:'缺材料',funds:'金币不足',unavailable:'无法补充',dead:'待复活'};
export function PartyBuffOrder({state:s,data:d,busy,send}:GameProps){
 const active=s.activity.type==='partyBuffs',check=d.partyBuffCheck;
 const [expanded,setExpanded]=useState(active),[showAll,setShowAll]=useState(false);
 const members=check?.members.map((member:any)=>{
  const entries=member.entries.filter((entry:any)=>entry.status!=='unavailable');
  return {...member,entries,missing:entries.filter((entry:any)=>entry.status!=='ready').length};
 }).filter((m:any)=>showAll||m.missing||m.dead)||[];
 const fraction=check?.total?Math.round(check.present/check.total*100):0;
 return <section className="party-buff-check" aria-label="团队增益检查">
  <div className="action-row"><Button variant="outline" disabled={busy||!!s.combat||s.hp<=0||(!active&&s.activity.type!=='idle')} onClick={async()=>{if(await send({type:active?'stop':'partyBuffs'}))setExpanded(true);}}>{active?'停止补 Buff':'全团补 Buff'}</Button><PartyBuffAudio state={s} data={d}/><Button variant="ghost" aria-expanded={expanded} aria-controls="party-buff-members" onClick={()=>setExpanded(!expanded)}>{expanded?'收起检查':'查看缺失增益'}</Button></div>
  {check?<>
   <div className="buff-check-overview" role="status"><strong>{active?'正在补充增益':check.missing?'团队增益待补充':check.unavailable.length?'团队仍有阵容缺项':'团队增益已补齐'}</strong><span>已覆盖 {check.present} / {check.total} 项</span><span>待补 {check.missing} 项</span>{active&&<><span>已施放 {check.completed} 次 · 剩余 {check.remainingCasts} 次施法</span><span>已用道具 {check.completedItems} 件 · 剩余 {check.remainingItems} 件</span></>}</div>
   <progress className="buff-check-progress" aria-label="团队增益覆盖率" value={fraction} max={100}/>
   {check.lastCast&&<p className="buff-check-last">最近施放：{check.lastCast}</p>}
   {check.unavailable.length>0&&<p className="buff-check-unavailable">阵容暂无法补齐：{check.unavailable.map((b:any)=>b.name).join('、')}。</p>}
   <div id="party-buff-members" hidden={!expanded}>
    <div className="buff-check-filter"><label><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/>显示已齐全成员</label><small>检查职业增益、药剂 / 合剂和武器强化。NPC 按性格与购买力选择经济或强化补给；优先自备，缺货按拍卖行价自费补充，团长需自备。</small></div>
    <div className="buff-check-members">{members.map((member:any)=><article key={member.id} className="buff-check-member"><div className="buff-check-member-title"><strong>{member.name}</strong><small>第 {member.squad} 小队 · {member.dead?'已倒下':member.missing?`缺 ${member.missing} 项`:'增益齐全'}</small></div><ul>{member.entries.filter((entry:any)=>showAll||entry.status!=='ready').map((entry:any)=><li key={entry.name} className={'buff-check-entry is-'+entry.status}><span><b>{entry.name}</b><small>{entry.tier?(entry.tier==='premium'?'强化补给 · ':'经济补给 · '):''}{statusNames[entry.status]}</small></span><span className="buff-check-reason">{entry.status==='ready'?`剩余 ${Math.ceil(entry.remaining/60000)} 分钟`:entry.reason}</span></li>)}</ul></article>)}</div>
    {!members.length&&<p className="buff-check-complete">所有存活成员可由团队提供的增益均已齐全。</p>}
   </div>
  </>:<p role="status">{s.combat?'战斗结束后可检查团队增益。':'正在读取团队增益检查结果…'}</p>}
 </section>;
}
