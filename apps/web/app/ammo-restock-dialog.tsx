import {useEffect,useRef,useState} from 'react';
import {restockHunterAmmo} from '@/lib/ammo-restock.js';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {ItemDisplay,money} from './game-ui';

export default function AmmoRestockDialog({prompt,item,busy,send,getSnapshot,actorId}:{prompt:any;item?:any;busy:boolean;send:(body:any)=>Promise<boolean>;getSnapshot:()=>any;actorId:string}){
 const [target,setTarget]=useState(prompt.target||400);
 const [working,setWorking]=useState(false),[error,setError]=useState('');
 const started=useRef(false),running=useRef(false);
 const valid=Number.isInteger(target)&&target>=1&&target<=10000;
 const packs=valid?Math.max(0,Math.ceil((target-prompt.current)/prompt.packSize)):0;
 const cost=packs*prompt.packPrice;
 const answer=async(enabled:boolean,purchase=enabled)=>{
  if(running.current)return;
  running.current=true;setWorking(true);setError('');
  try{
   if(purchase)await restockHunterAmmo({getSnapshot,send,actorId,memberId:prompt.memberId,visit:prompt.visit,target});
   const snapshot=getSnapshot();
   if(snapshot?.player?.id!==actorId||snapshot.view.ammoPrompt?.memberId!==prompt.memberId||snapshot.view.ammoPrompt?.visit!==prompt.visit)return;
   if(!await send({type:'ammoSettings',memberId:prompt.memberId,enabled,target:valid?target:400}))setError('补给设置未保存，请查看操作提示后重试。');
  }catch(e){setError((e as Error).message);}
  finally{running.current=false;setWorking(false);}
 };
 useEffect(()=>{
  if(prompt.enabled&&!busy&&!started.current){started.current=true;void answer(true);}
 });
 const locked=busy||working;
 return <Dialog open onOpenChange={open=>{if(!open&&!locked)void answer(!!prompt.enabled,false);}}><DialogContent showCloseButton={false}>
  <DialogHeader><DialogTitle>{prompt.name} 的弹药补给</DialogTitle><DialogDescription>回城时检测到弹药不足。当前储备 {prompt.current} 发，补给触发阈值为 {prompt.threshold} 发。</DialogDescription></DialogHeader>
  <p>{prompt.enabled?'已开启自动购买。':'是否开启自动购买？'}游戏页面打开时，回城后从当地商人购买适合当前等级和武器的最高级弹药，并自动装填。</p>
  <div className="filterbar"><label>自动补齐至 <input disabled={locked} aria-label="自动补齐弹药数量" type="number" min={1} max={10000} step={1} value={target} onChange={e=>setTarget(Number(e.target.value))}/></label></div>
  {prompt.available?<p><ItemDisplay item={item||{name:prompt.itemName}}/> · 每组 {prompt.packSize} 发 · 本次预计 {packs*prompt.packSize} 发，花费 {money(cost)}</p>:<p>当地商人没有适合当前武器和等级的弹药，可装填背包中已有的弹药。</p>}
  {!valid&&<p role="alert">补齐数量必须是 1—10000 的整数。</p>}
  {valid&&cost>prompt.balance&&<p className="footnote">当前钱币不足；开启后会先购买能够支付的数量。</p>}
  {error&&<p role="alert">{error}</p>}
  <DialogFooter><Button variant="outline" disabled={locked} onClick={()=>void answer(!!prompt.enabled,false)}>{prompt.enabled?'本次跳过':'暂不开启'}</Button><Button disabled={locked||!valid} onClick={()=>void answer(true)}>{working?'正在购买并装填…':prompt.enabled?'重试补给':'开启并补齐'}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
