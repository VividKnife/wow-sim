"use client";
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {useState} from 'react';
import {GameProps,Icon} from './game-ui';
import './item-transfer.css';

export default function ItemTransfer({state:s,data:d,busy,send,roster=[]}:GameProps){
 const [recipient,setRecipient]=useState(''),[search,setSearch]=useState('');
 const [selected,setSelected]=useState<Record<string,number>>({}),[notice,setNotice]=useState('');
 const others=roster.filter(c=>c.id!==s.id);
 if(!others.length)return null;
 const target=others.find(c=>c.id===recipient);
 const reason=(i:any)=>d.inventoryActions?.[i.uid]?.transferBlockedReason||'';
 const filtered=s.bag.filter((i:any)=>(d.items[i.id]?.name||'').toLowerCase().includes(search.toLowerCase()));
 const chosen=s.bag.filter((i:any)=>Object.hasOwn(selected,i.uid));
 const invalid=chosen.some((i:any)=>reason(i)||!Number.isInteger(selected[i.uid])||selected[i.uid]<1||selected[i.uid]>i.count);
 const blocked=s.combat?'战斗结束后可以转移物品':s.hp<=0?'复活后可以转移物品':!['idle','hunt'].includes(s.activity.type)?'当前活动结束后可以转移物品':target&&target.location!==s.location?'接收角色需要与你位于同一地点':'';
 const update=(uid:string,count?:number)=>{setNotice('');setSelected(previous=>{const next={...previous};if(count===undefined)delete next[uid];else next[uid]=count;return next;});};
 async function transfer(){
  if(await send({type:'transferItems',recipientId:recipient,items:chosen.map((i:any)=>({uid:i.uid,count:selected[i.uid]}))})){
   setSelected({});setNotice(`已将 ${chosen.length} 组物品转移给 ${target.name}`);
  }
 }
 return <details className="classic-frame item-transfer">
  <summary>队伍物品转移 <span>批量转交 · 拆分数量</span></summary>
  <div className="transfer-content">
   <p className="transfer-help">从 {s.name} 的背包转给其他角色。绑定装备可在同账号内转移，属性与附魔保留。</p>
   <label className="transfer-recipient">接收角色<GameSelect aria-label="接收角色" disabled={busy} value={recipient} onValueChange={nextValue=>{setRecipient(nextValue);setNotice('');}}><GameSelectOption value="">请选择接收角色</GameSelectOption>{others.map(c=><GameSelectOption key={c.id} value={c.id}>{c.name} · 背包 {c.bagUsed}/{c.bagCapacity}{c.location!==s.location?' · 不在同一地点':''}</GameSelectOption>)}</GameSelect></label>
   {target&&<p className="transfer-help">剩余 {Math.max(0,target.bagCapacity-target.bagUsed)} 格 · 相同物品自动合并堆叠；空间不足时整批取消。</p>}
   <div className="transfer-toolbar"><input aria-label="搜索可转移物品" placeholder="搜索物品…" value={search} onChange={e=>setSearch(e.target.value)}/><button className="classic-button secondary" disabled={busy} onClick={()=>{setNotice('');setSelected(previous=>({...previous,...Object.fromEntries(filtered.filter((i:any)=>!reason(i)).map((i:any)=>[i.uid,i.count]))}));}}>全选可转移</button><button className="classic-button secondary" disabled={busy||!chosen.length} onClick={()=>setSelected({})}>清空</button></div>
   <div className="transfer-items">{filtered.map((i:any)=>{const item=d.items[i.id],checked=Object.hasOwn(selected,i.uid),why=reason(i);return <div className={'transfer-item'+(checked?' is-selected':'')} key={i.uid}>
    <label><input type="checkbox" aria-label={`选择 ${item?.name}`} checked={checked} disabled={busy||!!why} onChange={e=>update(i.uid,e.target.checked?i.count:undefined)}/><Icon src={item?.icon} name={item?.name||'物品'} size={32}/><span><strong className={'rarity-'+item?.quality}>{item?.name} ×{i.count}</strong><small>{why||(i.bound?'已绑定 · 可在队伍内转移':'可转移')}</small></span></label>
    {checked&&<div className="transfer-quantity"><input type="number" aria-label={`${item?.name} 转移数量`} disabled={busy} min={1} max={i.count} value={selected[i.uid]} onChange={e=>update(i.uid,Number(e.target.value))}/><button className="classic-button secondary" disabled={busy} onClick={()=>update(i.uid,i.count)}>整组</button></div>}
   </div>;})}{!filtered.length&&<p className="transfer-help">没有匹配的背包物品。</p>}</div>
   <div className="transfer-footer"><span>已选 {chosen.length} 组</span><button className="classic-button" disabled={busy||!!blocked||!target||!chosen.length||invalid} onClick={()=>void transfer()}>{busy?'处理中…':'转移给 '+(target?.name||'所选角色')}</button></div>
   {invalid&&<p role="alert">请检查数量，并移除已锁定或无法转移的物品。</p>}{blocked&&<p role="status">{blocked}</p>}{notice&&<p className="transfer-success" role="status">{notice}</p>}
  </div>
 </details>;
}
