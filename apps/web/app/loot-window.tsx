"use client";
import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {ItemDisplay,money,type GameProps} from './game-ui';
import './loot-window.css';

export default function LootWindow({state:s,data:d,busy,send,settingsInMenu=false}:GameProps&{settingsInMenu?:boolean}){
 const eligible=s.pending.filter((item:{id:number})=>!(s.settings.autoLoot&&s.settings.autoLootIgnoreGray&&d.items[item.id]?.quality===0));
 const filteredCount=s.pending.length-eligible.length;
 const [open,setOpen]=useState(()=>eligible.length>0),[selected,setSelected]=useState<string[]>([]),[notice,setNotice]=useState('');
 const pending=s.pending as {uid:string;id:number;count:number;bound?:boolean;lootBattleId?:string}[],auto=!!s.settings.autoLoot;
 const priorEligible=useRef(eligible.length);
 const canLoot=!s.combat&&s.hp>0;
 const pick=async(uids:string[])=>{
  setNotice('');
  const success=await send({type:'loot',uids});
  if(success)setNotice('背包空间不足时，剩余物品会保留。');
 };
 useEffect(()=>{
  if(!pending.length||(priorEligible.current>0&&!eligible.length))setOpen(false);
  priorEligible.current=eligible.length;
 },[eligible.length,pending.length]);
 if(s.combat||(!s.lastCombat&&!pending.length))return null;
 const chosen=selected.filter(uid=>pending.some(i=>i.uid===uid));
 return <>
  {!open&&(pending.length>0||!settingsInMenu&&s.lastCombat)&&<button className="classic-button loot-reopen" onClick={()=>setOpen(true)}>{pending.length?`战利品 · ${pending.length}`:'自动拾取设置'}</button>}
  <Dialog open={open} onOpenChange={setOpen}>
   <DialogContent className="loot-window" onPointerDownOutside={e=>e.preventDefault()}>
    <header className="loot-heading"><span className="loot-emblem" aria-hidden="true">✦</span><div><DialogTitle>战利品</DialogTitle><DialogDescription>点击物品拾取，或勾选后批量拾取</DialogDescription></div></header>
    {!!s.lastCombat?.lootGold&&<p className="loot-coins">{money(s.lastCombat.lootGold)} <small>已收入钱袋</small></p>}
    <div className="loot-list">
     {pending.map(instance=>{const item=d.items[instance.id];return <div key={instance.uid} className={'loot-row quality-'+(item?.quality||0)}>
      <input type="checkbox" aria-label={`选择 ${item?.name||instance.id}`} checked={selected.includes(instance.uid)} onChange={e=>{setSelected(ids=>e.target.checked?[...ids,instance.uid]:ids.filter(id=>id!==instance.uid));}}/>
      <ItemDisplay item={item||{name:`物品 ${instance.id}`}} instance={instance} details={instance.lootBattleId&&instance.lootBattleId!==s.lastCombat?.id?'此前保留的掉落 · 点击拾取':'点击拾取'} trigger={<button disabled={busy||!canLoot} onClick={()=>void pick([instance.uid])} aria-label={`拾取 ${item?.name||instance.id} ×${instance.count}`}/>}/>
     </div>})}
     {!pending.length&&<p className="loot-empty">本次战斗没有可拾取的物品</p>}
    </div>
    <div className="loot-controls"><label><input type="checkbox" checked={auto} disabled={busy} onChange={e=>{void send({type:'settings',autoLoot:e.target.checked});}}/>自动拾取</label><small>{pending.length} 格掉落 · 背包 {s.bag.length}/{d.bagCapacity}</small></div>
    {!settingsInMenu&&<label><input type="checkbox" checked={!!s.settings.autoLootIgnoreGray} disabled={busy||!auto} onChange={e=>void send({type:'settings',autoLootIgnoreGray:e.target.checked})}/>跳过灰色物品</label>}
    {filteredCount>0&&<p className="loot-status">已跳过 {filteredCount} 格灰色物品，不影响继续战斗；可在这里手动拾取。</p>}
    <p className="loot-status" role="status">{!canLoot?'复活后可拾取，物品会保留。':notice||(auto?'战后自动拾取，切换标签页仍会继续；背包放不下的物品会保留。':'未拾取物品会保留，可稍后继续领取。')}</p>
    <div className="loot-actions"><button className="classic-button secondary" disabled={busy||!canLoot||!chosen.length} onClick={()=>void pick(chosen)}>拾取所选{chosen.length?`（${chosen.length}）`:''}</button><button className="classic-button" disabled={busy||!canLoot||!pending.length} onClick={()=>void pick(pending.map(i=>i.uid))}>全部拾取</button></div>
   </DialogContent>
  </Dialog>
 </>;
}
