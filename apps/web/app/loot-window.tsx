"use client";
import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Icon,money,type GameProps} from './game-ui';
import './loot-window.css';

export default function LootWindow({state:s,data:d,busy,send}:GameProps){
 const [open,setOpen]=useState(true),[selected,setSelected]=useState<string[]>([]),[attempted,setAttempted]=useState(false),[notice,setNotice]=useState('');
 const pending=s.pending as {uid:string;id:number;count:number;bound?:boolean;lootBattleId?:string}[],auto=!!s.settings.autoLoot;
 const latest=useRef({pending,send,busy});
 useEffect(()=>{latest.current={pending,send,busy};},[pending,send,busy]);
 const hadLoot=useRef(pending.length>0);
 const canLoot=!s.combat&&s.hp>0;
 const pick=async(uids:string[])=>{
  setAttempted(true);setNotice('');
  const success=await send({type:'loot',uids});
  if(success)setNotice('背包空间不足时，剩余物品会保留。');
 };
 useEffect(()=>{
  if(pending.length)hadLoot.current=true;
  else if(hadLoot.current)setOpen(false);
 },[pending.length]);
 useEffect(()=>{
  if(!open||!auto||!canLoot||attempted)return;
  // Start on presentation, so slow polling/background catch-up cannot skip the preview.
  const timer=setTimeout(()=>{
   if(latest.current.busy)return;
   setAttempted(true);
   if(!latest.current.pending.length){setOpen(false);return;}
   void latest.current.send({type:'loot',uids:latest.current.pending.map(i=>i.uid)}).then(success=>{
    if(success)setNotice('背包空间不足时，剩余物品会保留。');
   });
  },1500);
  return()=>clearTimeout(timer);
 },[open,auto,canLoot,attempted,busy]);
 if(s.combat||(!s.lastCombat&&!pending.length))return null;
 const chosen=selected.filter(uid=>pending.some(i=>i.uid===uid));
 return <>
  {!open&&pending.length>0&&<button className="classic-button loot-reopen" onClick={()=>setOpen(true)}>战利品 · {pending.length}</button>}
  <Dialog open={open} onOpenChange={setOpen}>
   <DialogContent className="loot-window" onPointerDownOutside={e=>e.preventDefault()}>
    <header className="loot-heading"><span className="loot-emblem" aria-hidden="true">✦</span><div><DialogTitle>战利品</DialogTitle><DialogDescription>点击物品拾取，或勾选后批量拾取</DialogDescription></div></header>
    {!!s.lastCombat?.lootGold&&<p className="loot-coins">{money(s.lastCombat.lootGold)} <small>已收入钱袋</small></p>}
    <div className="loot-list">
     {pending.map(instance=>{const item=d.items[instance.id];return <div key={instance.uid} className={'loot-row quality-'+(item?.quality||0)}>
      <input type="checkbox" aria-label={`选择 ${item?.name||instance.id}`} checked={selected.includes(instance.uid)} onChange={e=>{setAttempted(true);setSelected(ids=>e.target.checked?[...ids,instance.uid]:ids.filter(id=>id!==instance.uid));}}/>
      <button disabled={busy||!canLoot} onClick={()=>void pick([instance.uid])} aria-label={`拾取 ${item?.name||instance.id} ×${instance.count}`}>
       <span className="loot-icon"><Icon src={item?.icon} name={item?.name||'物品'} size={40}/><b>{instance.count>1?instance.count:''}</b></span>
       <span><strong>{item?.name||`物品 ${instance.id}`}</strong><small>{instance.lootBattleId&&instance.lootBattleId!==s.lastCombat?.id?'此前保留的掉落':'点击拾取'}{instance.bound?' · 已绑定':''}</small></span>
      </button>
     </div>})}
     {!pending.length&&<p className="loot-empty">本次战斗没有可拾取的物品</p>}
    </div>
    <div className="loot-controls"><label><input type="checkbox" checked={auto} disabled={busy} onChange={e=>{setAttempted(false);void send({type:'settings',autoLoot:e.target.checked});}}/>自动拾取</label><small>{pending.length} 格掉落 · 背包 {s.bag.length}/{d.bagCapacity}</small></div>
    <p className="loot-status" role="status">{!canLoot?'复活后可拾取，物品会保留。':auto&&!attempted?'展示 1.5 秒后自动拾取全部':notice||'未拾取物品会保留，可稍后继续领取。'}</p>
    <div className="loot-actions"><button className="classic-button secondary" disabled={busy||!canLoot||!chosen.length} onClick={()=>void pick(chosen)}>拾取所选{chosen.length?`（${chosen.length}）`:''}</button><button className="classic-button" disabled={busy||!canLoot||!pending.length} onClick={()=>void pick(pending.map(i=>i.uid))}>全部拾取</button></div>
   </DialogContent>
  </Dialog>
 </>;
}
