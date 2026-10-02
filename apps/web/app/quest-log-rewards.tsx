import {ItemDisplay,money} from './game-ui';

export default function QuestLogRewards({quest:q,items}:{quest:any;items:Record<string,any>}){
 const rewardItems=(rewards:any[])=><div className="quest-log-reward-items">{rewards.map(item=><div className="quest-log-reward-item" key={item.id}><ItemDisplay item={items[item.id]} instance={item}/><span>×{item.count}</span></div>)}</div>;
 return <section className="quest-log-rewards" aria-label="任务奖励">
  <h3>任务奖励</h3>
  <div className="quest-log-reward-values"><span>经验：{q.xp} 点</span>{q.money!==0&&<span>{q.money>0?'金钱：':'需要支付：'}{money(Math.abs(q.money))}</span>}</div>
  {q.rewards.length>0&&<div><p>固定奖励</p>{rewardItems(q.rewards)}</div>}
  {q.choices.length>0&&<div><p>可选奖励 <small>交付时选择一件</small></p>{rewardItems(q.choices)}</div>}
 </section>;
}
