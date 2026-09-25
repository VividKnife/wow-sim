'use client';
import {Button} from '@/components/ui/button';
import {GameProps} from './game-ui';

export default function QuestScenes({state:s,data:d,busy,send}:GameProps){
 const local=d.quests.filter((q:any)=>q.active&&q.scenes?.some((scene:any)=>scene.locations.includes(s.location)));
 if(!local.length)return null;
 return <section className="panel"><h2>区域任务事件</h2><p>这些剧情、仪式和任务物品交互以计时场景推进。保持在任务地点，完成后返回任务人物交付。</p>{local.map((q:any)=><div className="quest-entry" key={q.id}><h3>{q.name}</h3>{q.scenes.filter((scene:any)=>scene.locations.includes(s.location)).map((scene:any)=><div className="action-row" key={scene.key}><Button disabled={busy||!scene.available} onClick={()=>send({type:'questScene',id:q.id,key:scene.key})}>{scene.name}</Button><small>{scene.adaptation} · {scene.duration/1000} 秒</small></div>)}</div>)}</section>;
}
