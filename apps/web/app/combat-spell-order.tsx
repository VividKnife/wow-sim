"use client";
import {useEffect,useState} from 'react';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';

export default function CombatSpellOrder({battle,view,memberId,locked,request}:{battle:any;view:any;memberId:string;locked:boolean;request:(order:string,extra:any)=>void}){
 const [spellId,setSpellId]=useState(''),[targetId,setTargetId]=useState('');
 useEffect(()=>{setSpellId('');setTargetId('');},[memberId,battle.id]);
 const skills=view.inputSkills?.[memberId]||[],skill=skills.find((x:any)=>String(x.spellId)===spellId);
 const friendly=view.members.filter((m:any)=>m.hp>0),enemies=battle.enemies.filter((e:any)=>e.hp>0&&!e.removed&&!e.controlledBy);
 const targets=skill?.targetKind==='self'?friendly.filter((m:any)=>m.id===memberId):skill?.targetKind==='friendly'?friendly:skill?.targetKind==='either'?[...friendly,...enemies]:enemies;
 const target=skill?.targetKind==='self'?memberId:targets.some((t:any)=>t.id===targetId)?targetId:'';
 const pending=battle.command?.inputs?.find((i:any)=>i.memberId===memberId),result=battle.command?.results?.findLast((i:any)=>i.memberId===memberId);
 if(!skills.length)return null;
 return <div className="combat-spell-order" aria-label="指定技能指令">
  <label>技能<GameSelect aria-label="指定施放技能" value={spellId||'none'} disabled={locked} onValueChange={value=>{setSpellId(value==='none'?'':value);setTargetId('');}}>
   <GameSelectOption value="none">选择已学技能</GameSelectOption>{skills.map((s:any)=><GameSelectOption key={s.spellId} value={String(s.spellId)}>{s.name}{s.rank?` · 等级 ${s.rank}`:''}</GameSelectOption>)}
  </GameSelect></label>
  <label>目标<GameSelect aria-label="指定技能目标" value={target||'none'} disabled={locked||!skill||skill.targetKind==='self'} onValueChange={value=>setTargetId(value==='none'?'':value)}>
   <GameSelectOption value="none">选择目标</GameSelectOption>{targets.map((t:any)=><GameSelectOption key={t.id} value={t.id}>{t.name}</GameSelectOption>)}
  </GameSelect></label>
  <button type="button" disabled={locked||!skill||!target} onClick={()=>request('cast',{memberId,spellId:skill.spellId,targetId:target})}>施放一次</button>
  <button type="button" disabled={locked} onClick={()=>request('stopCast',{memberId})}>停止施法</button>
  <small role="status">{pending?'等待当前读条 / 公共冷却，最多5秒':result?`${skills.find((s:any)=>s.spellId===result.spellId)?.name||'技能'}：${result.reason||({started:'已开始施放',cancelled:'已取消',expired:'已过期',rejected:'执行失败'} as Record<string,string>)[result.status]}`:'指定目标与技能等级；施法仍受距离、资源、冷却和职业条件限制。'}</small>
 </div>;
}
