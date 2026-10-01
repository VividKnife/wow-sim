import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SocialChat,SocialProvider} from '../../app/social';
import ClassicGame from '../../app/classic-game';
import {createGame,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import type {Rules} from '../../../../packages/game-domain/src/model';
import '../../app/globals.css';
const state:Rules=createGame('艾琳',37,0,{raceId:1,classId:8});
state.id='chat-preview';state.clock=600000;
const events=[['travel','抵达艾尔文森林 · 闪金镇'],['quest','接受任务：剿灭狗头人'],['loot','拾取 亚麻布 ×3'],['xp','获得 120 点经验'],['info','背包空间不足，请整理背包后继续拾取。'],['damage','寒冰箭对狗头人造成 128 点伤害']];
state.logs=Array.from({length:36},(_,i)=>({id:i+1,at:i*16000,kind:events[i%6][0],text:events[i%6][1]}));
const snapshot=projectClientSnapshot(state,view(state)),data={...clientContent(),...snapshot.view};
function Preview(){
 const [panel,setPanel]=useState<string|null>(null);
 if(new URLSearchParams(location.search).get('surface')==='web')return <SocialProvider actorId={state.id}><main className="game-shell journey-shell" style={{maxWidth:900,margin:'24px auto',padding:16}}><section className="panel"><h1>社交与组队</h1><SocialChat/></section></main></SocialProvider>;
 return <SocialProvider actorId={state.id}><main className="classic-game-root"><ClassicGame state={snapshot.player} data={data} busy={false} send={async()=>true} canLead panel={panel} onPanelChange={setPanel} renderPanel={()=>null} onStyleChange={()=>{}} onObserve={()=>{}} modalBattleOpen={false} overview={<div className="activity-strip">正在闪金镇休整。打开地图，选择下一处目的地。</div>} status={null} utilities={null} activityLabel="休整中"/></main></SocialProvider>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
