"use client";
import {Button} from '@/components/ui/button';
import {GameProps,duration} from './game-ui';
import {trainerNavigation} from '../lib/trainer-navigation.js';

export function TrainerNavigation({state,data,busy,send,kind}:GameProps&{kind:'class'|'profession'}){
 const {target,reason,here,enRoute}=trainerNavigation(state,data.map,kind);
 return <div className="action-row" aria-label={kind==='class'?'职业训练师导航':'生活职业训练师导航'}>
  <Button type="button" size="sm" variant="outline" disabled={busy||!!reason} title={reason||'自动导航并移动到最近的训练师所在地'} onClick={()=>target&&send({type:'travel',to:target.id})}>{here?'已在训练师所在地':enRoute?'正在前往训练师':'寻找最近训练师'}</Button>
  <small role="status">{target?`${target.name}${here?'':` · 预计 ${duration(target.travel)}`}`:'暂无可到达的训练师'}{reason&&!here&&!enRoute&&target?` · ${reason}`:''}</small>
 </div>;
}
