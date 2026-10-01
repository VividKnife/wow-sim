import {createPortal} from 'react-dom';
import {Button} from '@/components/ui/button';
import {GameProps,Item,ItemDisplay} from './game-ui';
import './group-loot.css';
const choiceName=(choice:string)=>choice==='need'?'需求':choice==='greed'?'贪婪':'放弃';
export function GroupLootPopup({state:s,data:d,busy,send}:GameProps){
 const loot=d.groupLoot;if(!loot?.pending.length)return null;
 return createPortal(<aside className="loot-roll-stack" aria-label="装备分配"><header><strong>装备掉落</strong>{loot.queued>0&&<span>另有 {loot.queued} 件排队</span>}</header>{loot.pending.slice(0,2).map((l:any)=><article className="loot-roll-card" key={l.id} aria-label={`分配 ${d.items[l.item.id]?.name||'装备'}`}>
  <ItemDisplay item={d.items[l.item.id]||{name:`物品 ${l.item.id}`}} instance={l.item}/>
  <p role="status">{s.combat?'战斗结束后分配':l.choice?`已选择${choiceName(l.choice)}，等待 ${l.waiting} 位成员`:l.remaining===null?'不限时 · 请选择分配方式':`${Math.ceil(l.remaining/1000)} 秒后默认贪婪`}</p>
  {l.remaining!==null&&!s.combat&&<div className="loot-roll-timer" role="progressbar" aria-label="分配剩余秒数" aria-valuemin={0} aria-valuemax={60} aria-valuenow={Math.ceil(l.remaining/1000)}><i style={{width:`${Math.max(0,Math.min(100,l.remaining/600))}%`}}/></div>}
  <div className="loot-roll-actions"><Button disabled={busy||!!s.combat||!!l.choice||!l.canNeed} title={l.canNeed?'提升当前职责配装':'这件装备没有提升你的当前职责配装'} onClick={()=>send({type:'groupLoot',id:l.id,choice:'need'})}>需求</Button><Button variant="outline" disabled={busy||!!s.combat||!!l.choice||!l.canGreed} onClick={()=>send({type:'groupLoot',id:l.id,choice:'greed'})}>贪婪</Button><Button variant="ghost" disabled={busy||!!s.combat||!!l.choice} onClick={()=>send({type:'groupLoot',id:l.id,choice:'pass'})}>放弃</Button></div>
 </article>)}</aside>,document.body);
}
export function GroupLoot({data:d}:GameProps){
 const loot=d.groupLoot;if(!loot?.history.length)return null;
 return <section className="panel hall-loot" aria-label="队伍战利品"><h2>最近分配</h2><details><summary>最近分配 · {loot.history.length} 件</summary>{loot.history.map((l:any)=><div key={l.id} className="hall-loot-result"><Item item={d.items[l.itemId]||{name:l.name}}/><span>获得者：{l.winner}</span><small>{l.votes.map((v:any)=>`${v.name} ${choiceName(v.choice)}${v.roll??''}`).join(' · ')}</small></div>)}</details></section>;
}
