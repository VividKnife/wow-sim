import {useState,useRef,useEffect} from 'react';
import {Popover} from 'radix-ui';
import {Icon,type GameProps} from './game-ui';
import {hudEffects,buffDuration,buffRemaining} from '@/lib/player-effects.js';
import {useCombatPlayback} from '@/lib/use-combat-playback';
import './buff-bar.css';

type Buff={id:string;kind:'buff'|'debuff';name:string;icon?:string;detail:string;dispel?:string;until?:number;permanent:boolean;stacks?:number;charges?:number};
function BuffIcon({buff,clock}:{buff:Buff;clock:number}) {
 const [open,setOpen]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const show=()=>{if(timer.current)clearTimeout(timer.current);setOpen(true);};
 const hide=()=>{timer.current=setTimeout(()=>setOpen(false),150);};
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const remaining=buff.permanent?'永久':buffDuration((buff.until||0)-clock),stacks=buff.stacks||buff.charges||0;
 return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button type="button" className={`hud-buff${buff.kind==='debuff'?' is-debuff':''}${!buff.permanent&&(buff.until||0)-clock<=10000?' is-expiring':''}`} aria-label={`${buff.kind==='debuff'?'减益：':''}${buff.name}，${remaining}${stacks>1?`，${stacks}层`:''}`} onClick={event=>{event.preventDefault();show();}} onFocus={show} onBlur={hide} onPointerEnter={event=>{if(event.pointerType==='mouse')show();}} onPointerLeave={event=>{if(event.pointerType==='mouse')hide();}}>
  <span className="hud-buff-frame">{buff.icon?<Icon src={buff.icon} name={buff.name} size={32}/>:<span className="hud-effect-symbol" aria-hidden="true">{buff.name.slice(0,1)}</span>}{stacks>1&&<b>{stacks}</b>}</span><small>{remaining}</small>
 </button></Popover.Trigger><Popover.Portal><Popover.Content className="hud-buff-tooltip" side="bottom" align="end" sideOffset={7} collisionPadding={12} onOpenAutoFocus={event=>event.preventDefault()} onCloseAutoFocus={event=>event.preventDefault()} onPointerEnter={show} onPointerLeave={hide}>
  <header><strong>{buff.name}</strong>{buff.dispel&&<span>{buff.dispel}</span>}</header>{buff.detail&&<p>{buff.detail}</p>}{!buff.permanent&&<small>{buffRemaining((buff.until||0)-clock)}</small>}
 </Popover.Content></Popover.Portal></Popover.Root>;
}
export default function BuffBar({state,data,playback,contentVersion,classic=false}:Pick<GameProps,'state'|'data'|'playback'|'contentVersion'>&{classic?:boolean}) {
 const {state:s,data:d}=useCombatPlayback(state,data,playback,contentVersion,true);
 const effects=hudEffects(s,d) as Buff[];
 if(!effects.length)return null;
 return <div className={`hud-buffs${classic?' cu-buffs':''}`}>
  {(['debuff','buff'] as const).map(kind=>{const group=effects.filter(effect=>effect.kind===kind);return group.length>0&&<section key={kind} className="hud-effects-group" aria-label={kind==='debuff'?'角色减益':'角色增益'}>{group.map(buff=><BuffIcon key={buff.id} buff={buff} clock={s.clock}/>)}</section>;})}
 </div>;
}
