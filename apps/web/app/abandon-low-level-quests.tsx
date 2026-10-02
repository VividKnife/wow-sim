import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel} from '@/components/ui/alert-dialog';
import {isLowLevelQuest} from '../../../packages/sim-core/src/quest-level.js';
import type {GameProps} from './game-ui';

type Quest={id:number;name:string;level:number;active:boolean;complete:boolean};
export default function AbandonLowLevelQuests({state:s,data:d,busy,send}:GameProps){
 const [review,setReview]=useState<{actorId:string;ids:number[]}|null>(null);
 const [submitting,setSubmitting]=useState(false),inFlight=useRef(false);
 const lowQuests:Quest[]=d.quests.filter((q:Quest)=>q.active&&isLowLevelQuest(s.level,q.level));
 const selected=review?.actorId===s.id?lowQuests.filter(q=>review?.ids.includes(q.id)):[];
 const locked=busy||submitting||!!s.combat||!!s.escort||s.hp<=0||!['idle','hunt'].includes(s.activity.type);
 const confirm=async()=>{
  if(locked||inFlight.current||!selected.length)return;
  inFlight.current=true;setSubmitting(true);
  try{if(await send({type:'abandonLowLevelQuests',ids:selected.map(q=>q.id)}))setReview(null);}
  finally{inFlight.current=false;setSubmitting(false);}
 };
 return <><Button variant="outline" disabled={locked||!lowQuests.length} onClick={()=>setReview({actorId:s.id,ids:lowQuests.map(q=>q.id)})}>一键放弃绿色任务（{lowQuests.length}）</Button>
  <AlertDialog open={!!review&&review.actorId===s.id} onOpenChange={open=>{if(!open&&!inFlight.current)setReview(null);}}>
   <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
    <AlertDialogHeader><AlertDialogTitle>确认放弃 {selected.length} 个绿色任务？</AlertDialogTitle><AlertDialogDescription>绿色任务指低于角色等级至少 5 级的任务。放弃后将清除任务进度及不再需要的任务物品，包括已完成但尚未交付的任务。</AlertDialogDescription></AlertDialogHeader>
    <ul className="max-h-64 overflow-y-auto space-y-2" aria-label="即将放弃的任务">{selected.map(q=><li key={q.id}>{q.name} · Lv.{q.level}{q.complete?' · 已完成待交付':''}</li>)}</ul>
    {!selected.length&&<p role="status">已没有可放弃的绿色任务。</p>}
    <AlertDialogFooter><AlertDialogCancel disabled={submitting}>取消</AlertDialogCancel><Button variant="destructive" disabled={locked||!selected.length} onClick={()=>void confirm()}>{submitting?'正在放弃…':'确认放弃'}</Button></AlertDialogFooter>
   </AlertDialogContent>
  </AlertDialog>
 </>;
}
