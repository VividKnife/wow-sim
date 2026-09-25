"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';

export default function UnstuckControl({busy,send}:{busy:boolean;send:(body:any)=>Promise<boolean>}){
 const [open,setOpen]=useState(false),[done,setDone]=useState(false);
 return <section className="panel" aria-label="脱离卡死">
  <Button variant="outline" disabled={busy} onClick={()=>{setOpen(!open);setDone(false);}}>脱离卡死</Button>
  {open&&<div>
   <p>可随时主动恢复，无需等待。取消当前战斗和活动，倒下成员恢复半血。若在共享副本中，会结束整个队伍的当前活动，并将成员送到入口外；副本进度保存在原队长处，重新进入后可从原进度继续。</p>
   <p>保留已保存的角色成长、金币和物品；不补发未结算收益，制造订单退回未消耗材料。</p>
   <div className="action-row"><Button variant="destructive" disabled={busy} onClick={async()=>{if(await send({type:'unstuck'})){setOpen(false);setDone(true);}}}>结束活动并脱离</Button><Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>取消</Button></div>
  </div>}
  {done&&<p role="status">已脱离卡死，可以重新开始冒险。</p>}
 </section>;
}
