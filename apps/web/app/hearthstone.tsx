"use client";
import {Button} from '@/components/ui/button';
import {GameProps,ItemDisplay,duration} from './game-ui';

export default function Hearthstone({state:s,data:d,busy,send}:GameProps){
 const h=d.hearthstone;if(!h)return null;
 const casting=s.activity.type==='hearth';
 const item=s.bag.find((i:any)=>i.id===6948),use=item?d.itemUses?.[item.uid]:undefined;
 return <section className="panel hearthstone-panel" aria-label="炉石">
  <div className="item-row" style={{border:0,padding:0,flexWrap:'wrap'}}>
   <ItemDisplay className="grow" item={d.items[6948]||{name:'炉石',icon:h.icon}} instance={item} details={<>绑定地点：{h.destinationName}<div>{casting?`正在返回 · 剩余 ${duration(s.activity.endsAt-s.clock)}`:h.remaining>0?`冷却剩余 ${duration(h.remaining)}`:`${duration(h.castMs)}读条 · ${duration(h.cooldownMs)}冷却`}</div></>}/>
   {casting?<Button variant="outline" disabled={busy} onClick={()=>send({type:'stop'})}>中断炉石</Button>:<Button variant="outline" disabled={busy||!use?.canUse} title={use?.reason||`返回${h.destinationName}`} onClick={()=>send({type:'useItem',uid:item.uid})}>{h.remaining>0?'炉石冷却中':'使用炉石'}</Button>}
  </div>
  <p className="footnote">{casting?'读条完成后返回绑定地点；中断不会消耗冷却。':use?.reason||'可在旅店老板处更改绑定地点。'}{h.hasInn?' · 此处有旅店老板，可在人物与服务中绑定炉石。':''}</p>
 </section>;
}
