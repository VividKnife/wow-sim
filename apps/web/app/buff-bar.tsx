'use client';
import {useState,useRef,useEffect} from 'react';
import {Popover} from 'radix-ui';
import {Icon,duration,type GameProps} from './game-ui';
import {hudBuffs,buffDuration} from '@/lib/player-buffs.js';
import './buff-bar.css';

type Buff={id:string|number;name:string;icon?:string;detail:string;until?:number;permanent:boolean;stacks?:number;charges?:number;amount?:number};
function BuffIcon({buff,clock}:{buff:Buff;clock:number}) {
 const [open,setOpen]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const show=()=>{if(timer.current)clearTimeout(timer.current);setOpen(true);};
 const hide=()=>{timer.current=setTimeout(()=>setOpen(false),150);};
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const remaining=buff.permanent?'永久':buffDuration((buff.until||0)-clock),stacks=buff.stacks||buff.charges||0;
 return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button type="button" className={`hud-buff${!buff.permanent&&(buff.until||0)-clock<=10000?' is-expiring':''}`} aria-label={`${buff.name}，${remaining}${stacks>1?`，${stacks}层`:''}`} onClick={event=>{event.preventDefault();show();}} onFocus={show} onBlur={hide} onPointerEnter={event=>{if(event.pointerType==='mouse')show();}} onPointerLeave={event=>{if(event.pointerType==='mouse')hide();}}>
  <span className="hud-buff-frame"><Icon src={buff.icon} name={buff.name} size={32}/>{stacks>1&&<b>{stacks}</b>}</span><small>{remaining}</small>
 </button></Popover.Trigger><Popover.Portal><Popover.Content className="hud-buff-tooltip" side="bottom" align="end" sideOffset={7} collisionPadding={12} onOpenAutoFocus={event=>event.preventDefault()} onCloseAutoFocus={event=>event.preventDefault()} onPointerEnter={show} onPointerLeave={hide}>
  <strong>{buff.name}</strong>{buff.detail&&<p>{buff.detail}</p>}{buff.amount!=null&&<p>效果数值：{Math.ceil(buff.amount)}</p>}{stacks>1&&<p>层数 / 次数：{stacks}</p>}<small>{buff.permanent?'永久生效':`剩余 ${duration((buff.until||0)-clock)}`}</small>
 </Popover.Content></Popover.Portal></Popover.Root>;
}
export default function BuffBar({state,data,classic=false}:Pick<GameProps,'state'|'data'>&{classic?:boolean}) {
 const buffs=hudBuffs(state,data) as Buff[];
 if(!buffs.length)return null;
 return <><section className={`hud-buffs${classic?' cu-buffs':''}`} aria-label="角色增益">{buffs.map(buff=><BuffIcon key={buff.id} buff={buff} clock={state.clock}/>)}</section></>;
}
