import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,stats,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../../packages/game-domain/src/rules/combat.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import Battle from '../../app/battle';
import '../../app/globals.css';

const groups=[{name:'恢复的任务怪物',ids:[1031,4130,6509,5362]},{name:'新增事件召唤',ids:[9453,1494,8925,8926,11598]}];
function Preview(){
 const [group,setGroup]=useState(0),[open,setOpen]=useState(true);
 const s=createGame('世界校验预览',73,0);s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.location='northshire';
 startCombat(s,groups[group].ids,true);const snapshot=projectClientSnapshot(s,view(s));
 return <main className="game-shell"><h1>世界审计回归预览</h1><p>独立静态战场，不连接存档。检查软泥、异种虫、血瓣花、鹰身人和任务召唤模型。</p>{groups.map((g,i)=><button key={g.name} onClick={()=>{setGroup(i);setOpen(true);}}>{g.name}</button>)}<Battle key={group} state={snapshot.player} data={snapshot.view} busy={false} send={async()=>false} open={open} onOpenChange={setOpen}/></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
