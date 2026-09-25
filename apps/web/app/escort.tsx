"use client";
import CreaturePortrait from './creature-portrait';
import {Button} from '@/components/ui/button';
import {Bar,GameProps,duration} from './game-ui';

export default function Escort({state:s,data:d,busy,send}:GameProps){
 const e=d.escort;if(!e)return null;
 return <section className="panel" aria-label="护送迪菲亚叛徒"><div className="section-heading"><h2 className="escort-identity"><CreaturePortrait unit={{entry:467}}/>护送迪菲亚叛徒</h2><small>{e.active?`${e.index} / ${e.total} 路段`:'哨兵岭 → 月溪镇'}</small></div>
 {e.active?<><Bar label="叛徒生命" value={e.hp} max={e.maxHp}/><p>{e.cancelled?'停止请求已记录，等待当前战斗结束。':s.combat?'保护叛徒，击退沿途敌人。':`正在跟随叛徒${e.endsAt?' · 下一路段 '+duration(Math.max(0,e.endsAt-s.clock)):''}`}</p><Button variant="outline" disabled={busy||e.cancelled} onClick={()=>send({type:'escortCancel'})}>停止护送</Button></>:<><p>跟随叛徒前往秘密入口。途中他会受到攻击，存活抵达后才能回报任务。</p>{e.last?.outcome==='failed'&&<p>{e.last.reason}</p>}<Button disabled={busy||!e.canStart} onClick={()=>send({type:'escortStart'})}>{s.location==='sentinel'?'开始护送':'请先前往哨兵岭'}</Button></>}
 </section>;
}
