import type {GameProps} from './game-ui';
import QuestNavigationButton from './quest-navigation-button';

export default function DungeonQuests({dungeonId,...props}:GameProps&{dungeonId:string}){
 const quests=props.data.dungeonQuests?.[dungeonId]||[];
 return <section className="journal-quests" aria-label="地下城任务"><p className="footnote">可直接前往任务人物；有未完成前置时，会指向当前需要处理的前置任务人物。</p>
  {!quests.length&&<p className="journal-empty">暂无适合当前角色的地下城任务。</p>}
  {quests.map((q:any)=><article className="quest-entry" key={q.id}><h3>{q.name} <small>Lv.{q.level}</small></h3>
   <p>{q.prerequisite?`前置任务：${q.targetName} · `:''}{q.status==='completed'?'已完成':q.status==='turnin'?'已完成，等待交付':q.status==='active'?'进行中，完成目标后交付':q.reason||'可接取'}</p>
   {q.reason&&q.status!=='completed'&&q.status!=='available'&&<p className="quest-navigation-note">{q.reason}</p>}
   {q.navigation&&!q.reason&&<><small>{q.navigation.npcName} · {q.navigation.region} / {q.navigation.name}</small><div className="action-row"><QuestNavigationButton {...props} navigation={q.navigation} onNavigate={()=>props.send({type:'travel',to:q.navigation.to})}/></div></>}
  </article>)}
 </section>;
}
