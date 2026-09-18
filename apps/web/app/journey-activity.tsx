"use client";
import {Button} from '@/components/ui/button';
import {Eye,Moon} from 'lucide-react';
import {Bar,duration,type GameProps} from './game-ui';
import ActivityProgress from './activity-progress';

type Props=GameProps&{activityLabel:string;onObserve:()=>void};
export default function JourneyActivity({state:s,data:d,busy,send,activityLabel,onObserve}:Props){
 if(!s.combat)return <>
  <ActivityProgress state={s} data={d} running/>
  {s.hp<=0&&<div className="action-row" aria-label="复活角色">
   <Button onClick={()=>send({type:'revive'})} disabled={busy}>复活</Button>
   {d.canSoulstoneRevive&&<Button onClick={()=>send({type:'soulstoneRevive'})} disabled={busy}>灵魂石复活</Button>}
   {d.reincarnation&&<Button title={d.reincarnation.reason} onClick={()=>send({type:'reincarnate'})} disabled={busy||!d.reincarnation.canUse}>复生</Button>}
  </div>}
 </>;
 const enemy=s.combat?.enemies?.find((unit:any)=>!unit.dead);
 const destination=s.activity.to&&d.map.find((node:any)=>node.id===s.activity.to)?.name;
 const target=d.monsters.find((monster:any)=>monster.id===s.activity.target);
 const stopped=s.activity.type==='idle'&&!s.rest&&!d.dungeon?.autoAdvance;
 return <>
  <section className="activity-strip journey-activity" aria-live="polite">
   <div className="journey-activity-heading">
    <span><i className={'activity-light '+s.activity.type}/>{s.combat?'战斗进行中':activityLabel}</span>
    {s.activity.endsAt&&<time>{duration(s.activity.endsAt-s.clock)}</time>}
   </div>
   <div className="journey-activity-body">
    <div className="grow">
     <strong>{enemy?.name||target?.name||d.location.name}{destination?' → '+destination:''} {enemy&&<small>Lv. {enemy.level}</small>}</strong>
     <p>{s.activity.reason||(s.dungeon?(d.dungeon?.autoAdvance?'自动推进中，战后按恢复设置休整；遇到阻挡会暂停。':d.dungeon?.advanceReason||'自动推进已暂停，本场结束后可整理小队。'):s.combat?'小队依照已保存的策略自动战斗。':'野外活动离线继续；脱离战斗后自动恢复生命与法力。')}</p>
    </div>
    <div className="journey-activity-actions">
     {(s.combat||s.lastCombat)&&<Button onClick={onObserve}>观察战斗 <Eye size={16}/></Button>}
     {s.hp<=0?<>
      <Button onClick={()=>send({type:'revive'})} disabled={busy||!!s.combat}>复活</Button>
      {d.canSoulstoneRevive&&<Button onClick={()=>send({type:'soulstoneRevive'})} disabled={busy}>灵魂石复活</Button>}
      {d.reincarnation&&<Button title={d.reincarnation.reason} onClick={()=>send({type:'reincarnate'})} disabled={busy||!d.reincarnation.canUse}>复生</Button>}
     </>:<Button variant="outline" onClick={()=>send({type:'stop'})} disabled={busy||stopped||s.activity.flight&&s.activity.stopAtNext}>
      {s.activity.flight?(s.activity.stopAtNext?'已申请下一站停靠':'下一飞行点停靠'):s.combat?'本场结束后停止':'停止'}
     </Button>}
    </div>
   </div>
   <ActivityProgress state={s} data={d} running/>
   <div className="journey-activity-meta"><span><Moon size={14}/> 离线继续</span><span>背包 {s.bag.length}/{d.bagCapacity}</span></div>
  </section>
  {s.combat&&<details className="combat-strip journey-combat-details"><summary>实时战斗详情</summary>
   {s.combat.enemies.filter((unit:any)=>!unit.dead).map((unit:any)=><div className="enemy-status" key={unit.id}><strong>{unit.name} <small>Lv.{unit.level}</small></strong><Bar label="生命" value={unit.hp} max={unit.maxHp}/></div>)}
   {s.cast&&<p>{d.skills.find((skill:any)=>skill.spellId===s.cast.spell)?.name||'施法'} · {duration(s.cast.until-s.clock)}</p>}
  </details>}
 </>;
}
