"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {money} from './game-ui';

export default function AmmoRestockDialog({prompt,busy,send}:{prompt:any;busy:boolean;send:(body:any)=>Promise<boolean>}){
 const [target,setTarget]=useState(prompt.target||400);
 const valid=Number.isInteger(target)&&target>=1&&target<=10000;
 const packs=valid?Math.max(0,Math.ceil((target-prompt.current)/prompt.packSize)):0;
 const cost=packs*prompt.packPrice;
 const answer=(enabled:boolean)=>send({type:'ammoRestock',memberId:prompt.memberId,enabled,target:valid?target:400});
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)void answer(false);}}><DialogContent showCloseButton={false}>
  <DialogHeader><DialogTitle>{prompt.name} 的弹药即将耗尽</DialogTitle><DialogDescription>{prompt.trigger==='recruit'?'新队友需要准备弹药。':'返回城镇时检测到弹药不足。'} 当前 {prompt.current} 发，低于 {prompt.threshold} 发。</DialogDescription></DialogHeader>
  <p>是否开启自动购买？每次返回城镇且弹药低于 {prompt.threshold} 时，将默认购买当前等级可用的最高级弹药。</p>
  <div className="filterbar"><label>自动补齐至 <input aria-label="自动补齐弹药数量" type="number" min={1} max={10000} step={prompt.packSize} value={target} onChange={e=>setTarget(Number(e.target.value))}/></label></div>
  <p><strong>{prompt.itemName}</strong> · 每组 {prompt.packSize} 发 · 本次预计 {packs*prompt.packSize} 发，花费 {money(cost)}</p>
  {!valid&&<p role="alert">补齐数量必须是 1—10000 的整数。</p>}
  {valid&&cost>prompt.balance&&<p className="footnote">当前钱币不足；开启后会先购买能够支付的数量。</p>}
  <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>void answer(false)}>暂不开启</Button><Button disabled={busy||!valid} onClick={()=>void answer(true)}>开启并补齐</Button></DialogFooter>
 </DialogContent></Dialog>;
}
