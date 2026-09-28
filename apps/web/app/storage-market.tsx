"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps,ItemDisplay,money} from './game-ui';
import './economy.css';
import type {InventoryItem} from './economy-types';

export function Bank({state:s,data:d,busy,send}:GameProps){
 const [search,setSearch]=useState(''),[count,setCount]=useState(1);
 const locked=busy||!d.bankHere||!!s.combat||!!s.dungeon||!['idle','hunt'].includes(s.activity.type),valid=Number.isInteger(count)&&count>0;
 const rows=(list:InventoryItem[],deposit:boolean)=><div className="storage-list">{list.filter(i=>d.items[i.id]?.name.includes(search)).map(i=><div className="storage-row" key={i.uid}><ItemDisplay className="grow" item={d.items[i.id]} instance={{...i,enchantDescription:d.enchants[i.enchant||'']?.description}}/><Button size="sm" variant="outline" disabled={locked||!valid||count>i.count||deposit&&!d.inventoryActions[i.uid]?.bankable} onClick={()=>send({type:deposit?'bankDeposit':'bankWithdraw',uid:i.uid,count})}>{deposit?'存入':'取出'} {valid?count:''}</Button><Button size="sm" variant="ghost" disabled={locked||deposit&&!d.inventoryActions[i.uid]?.bankable} onClick={()=>send({type:deposit?'bankDeposit':'bankWithdraw',uid:i.uid,count:i.count})}>整组</Button></div>)}{!list.length&&<p className="empty">这里还没有物品。</p>}</div>;
 return <section className="panel"><div className="section-heading"><div><div className="eyebrow">个人仓储</div><h2>银行 <small>{s.bank.length} / {d.bankCapacity} 格</small></h2></div><Button variant="outline" disabled={locked||!d.bankUpgradeCost||s.money<d.bankUpgradeCost} onClick={()=>send({type:'expandBank'})}>{d.bankUpgradeCost?'扩展 16 格 · '+money(d.bankUpgradeCost):'容量已满'}</Button></div><p>{d.bankHere?'你在银行附近，可以办理存取。':'六大主城的银行均可使用；当前可以查看库存。'}装备的附魔、绑定、耐久和锁定状态会保留。</p>{!d.bankHere&&<Button variant="outline" disabled={busy||!!s.combat||!!s.dungeon||!['idle','hunt'].includes(s.activity.type)} onClick={()=>send({type:'travel',to:d.faction==='Horde'?'orgrimmar':'stormwind'})}>前往银行</Button>}<div className="economy-toolbar"><input aria-label="搜索银行物品" placeholder="搜索物品…" value={search} onChange={e=>setSearch(e.target.value)}/><label>每次数量 <input aria-label="存取数量" type="number" min={1} max={100} value={count} onChange={e=>setCount(Number(e.target.value))}/></label><Button variant="outline" disabled={locked} onClick={()=>send({type:'bankDepositMaterials'})}>材料一键存入</Button><Button variant="outline" disabled={locked} onClick={()=>send({type:'sortBank'})}>整理银行</Button></div><div className="storage-columns"><section><h3>随身背包 · {s.bag.length}/{d.bagCapacity}</h3>{rows(s.bag,true)}</section><section><h3>银行库存 · {s.bank.length}/{d.bankCapacity}</h3>{rows(s.bank,false)}</section></div></section>;
}

export {default as Auction} from './auction-house';
