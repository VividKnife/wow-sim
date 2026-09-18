"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps,Icon,money} from './game-ui';
import type {InventoryItem} from './economy-types';
import './economy.css';

export default function BatchTrade({state:s,data:d,busy,send,auction=false}:GameProps&{auction?:boolean}){
 const [selected,setSelected]=useState<string[]>([]),[search,setSearch]=useState('');
 const locked=busy||!!s.combat||!!s.dungeon||!!s.escort||s.hp<=0||!['idle','hunt'].includes(s.activity.type)||(!auction&&!d.shop.length);
 const eligible=s.bag.filter((i:InventoryItem)=>auction?d.inventoryActions[i.uid]?.tradable&&Math.floor(d.inventoryActions[i.uid].quote.sell*i.count*.95)>0:d.inventoryActions[i.uid]&&!d.inventoryActions[i.uid].protected&&d.items[i.id]?.sell>0) as InventoryItem[];
 const visible=eligible.filter(i=>d.items[i.id].name.toLowerCase().includes(search.toLowerCase()));
 const chosen=eligible.filter(i=>selected.includes(i.uid)),allVisible=visible.length>0&&visible.every(i=>selected.includes(i.uid));
 const value=(i:InventoryItem)=>auction?Math.floor(d.inventoryActions[i.uid].quote.sell*i.count*.95):d.items[i.id].sell*i.count;
 const total=chosen.reduce((n,i)=>n+value(i),0),remaining=100-s.auctions.length,overLimit=auction&&chosen.length>remaining;
 async function submit(){if(await send({type:auction?'auctionSellBatch':'sellBatch',uids:chosen.map(i=>i.uid)}))setSelected([]);}
 return <section aria-label={auction?'批量上架物品':'批量出售物品'}>
  <p>{auction?'勾选背包物品整组上架，金额已扣除 5% 手续费。绑定、锁定与任务物品不可上架。':'勾选背包物品整组出售。锁定、任务物品和配发装备不会出现在这里。'}{auction&&` 当前还可上架 ${remaining} 组。`}</p>
  <div className="economy-toolbar"><input aria-label={auction?'搜索可上架物品':'搜索可出售物品'} placeholder="搜索背包物品…" value={search} onChange={e=>setSearch(e.target.value)}/><Button variant="outline" disabled={locked||!visible.length} onClick={()=>setSelected(previous=>allVisible?previous.filter(uid=>!visible.some(i=>i.uid===uid)):[...new Set([...previous,...visible.map(i=>i.uid)])])}>{allVisible?'取消当前全选':'全选当前列表'}</Button><Button variant="ghost" disabled={locked||!selected.length} onClick={()=>setSelected([])}>清空选择</Button></div>
  <div className="economy-callout"><p aria-live="polite">已选 {chosen.length} 组 · 共 {chosen.reduce((n,i)=>n+i.count,0)} 件 · {auction?'预计到账':'合计'} {money(total)}</p>{overLimit&&<p role="status">所选组数超过剩余上架额度，请减少选择。</p>}<Button disabled={locked||!chosen.length||overLimit} onClick={submit}>{auction?'批量上架所选':'批量出售所选'}</Button></div>
  <div className="storage-list">{visible.map(i=><label className="storage-row" key={i.uid}><input type="checkbox" aria-label={`选择 ${d.items[i.id].name} ×${i.count}`} disabled={locked} checked={chosen.some(row=>row.uid===i.uid)} onChange={e=>setSelected(previous=>e.target.checked?[...previous.filter(uid=>uid!==i.uid),i.uid]:previous.filter(uid=>uid!==i.uid))}/><Icon src={d.items[i.id].icon} name={d.items[i.id].name}/><div className="grow"><strong className={'rarity-'+d.items[i.id].quality}>{d.items[i.id].name} ×{i.count}</strong><small>{i.bound?'已绑定 · ':''}{d.enchants?.[i.enchant||'']?.description||''}</small></div><span>{money(value(i))}</span></label>)}</div>
  {!visible.length&&<p className="empty">{eligible.length?'没有符合搜索条件的物品。':auction?'没有可上架的物品。':'没有可出售的物品。'}</p>}
 </section>;
}
