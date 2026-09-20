"use client";
import {Button} from '@/components/ui/button';
import {GameProps,duration} from './game-ui';

export default function StockadesQuestEvent({state:s,data:d,busy,send}:GameProps){
 const event=d.stockadesQuestEvent;if(!event)return null;
 const stages:Record<string,string>={disguise:'泰里恩正在准备间谍机器人的伪装。',dismiss:'跟随线索，等待公爵遣散卫兵。',conspiracy:'观察密谈，查明迪菲亚阴谋。',combat:'击败莱斯科瓦和马尔松。'};
 return <section className="panel" aria-label="暴风城密谋事件"><div className="eyebrow">监狱暴动 · 后续调查</div><h2>{event.name}</h2>
  {event.active?<><p role="status">{event.cancelled?'事件已停止，等待当前战斗结束。':stages[event.stage]}{event.endsAt?' · '+duration(event.endsAt-s.clock):''}</p><Button variant="outline" disabled={busy||event.cancelled} onClick={()=>send({type:'stockadesQuestCancel'})}>停止事件</Button></>:<><p>在暴风要塞与泰里恩会合，观察花园中的密谈，然后阻止叛徒逃脱。</p>{event.last?.outcome==='failed'&&<p role="status">{event.last.reason}</p>}{s.location===event.location?<Button disabled={busy||!event.canStart} onClick={()=>send({type:'stockadesQuestStart',questId:event.questId})}>开始调查与袭击</Button>:<Button variant="outline" disabled={busy||!!s.combat||s.hp<=0||!['idle','hunt'].includes(s.activity.type)} onClick={()=>send({type:'travel',to:event.location})}>前往暴风要塞</Button>}</>}
 </section>;
}
