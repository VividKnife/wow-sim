"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps} from './game-ui';

function AmmoSettings({row,disabled,send}:{row:any;disabled:boolean;send:GameProps['send']}){
 const [enabled,setEnabled]=useState(row.enabled),[target,setTarget]=useState(row.target);
 const valid=Number.isInteger(target)&&target>=1&&target<=10000;
 return <article>
  <h3>{row.name} · 已装填 {row.count} 发</h3>
  <div className="filterbar">
   <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>自动购买弹药</label>
   <label>补齐至 <input aria-label={`${row.name}补齐数量`} type="number" min={1} max={10000} step={1} value={target} onChange={e=>setTarget(Number(e.target.value))}/></label>
   <Button disabled={disabled||!valid} onClick={()=>void send({type:'ammoSettings',memberId:row.id,enabled,target})}>保存补给设置</Button>
  </div>
  {!valid&&<p role="alert">补齐数量必须是 1—10000 的整数。</p>}
  {row.loadable?.map((stack:any)=><div className="filterbar" key={stack.uid}><span>{stack.name} ×{stack.count}</span><Button variant="outline" disabled={disabled} onClick={()=>void send({type:'loadAmmo',memberId:row.id,uid:stack.uid})}>为 {row.name} 装填</Button></div>)}
 </article>;
}

export default function AmmoControls({state:s,data:d,busy,send}:GameProps){
 if(!d.ammo?.length)return null;
 const disabled=busy||!!s.combat||!!s.dungeon||!['idle','hunt'].includes(s.activity.type);
 return <section className="panel" aria-label="猎人弹药补给"><h2>猎人弹药补给</h2>
  <p>回城时已装填弹药不足 400 发，自动购买当前等级可用的最高级弹药，按整组补齐。保存设置不立即扣款。背包中购买、制造或转入的弹药需先装填，可分配给同行猎人。</p>
  {d.ammo.map((row:any)=><AmmoSettings key={`${row.id}:${row.enabled}:${row.target}`} row={row} disabled={disabled} send={send}/>)}
 </section>;
}
