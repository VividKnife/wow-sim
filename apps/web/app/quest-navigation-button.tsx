import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {NpcDialog} from './local-npcs';
import type {GameProps} from './game-ui';

export default function QuestNavigationButton({navigation:n,onNavigate,...props}:GameProps&{navigation:any;onNavigate:()=>void|Promise<unknown>}){
 const {state:s,data:d,busy}=props;
 const [conversation,setConversation]=useState<string|null>(null);
 const scene=`${s.id}:${s.location}:${s.dungeon?.runId||''}`;
 const npc=n.npcKey&&(d.interactions||[]).find((npc:any)=>npc.key===n.npcKey&&(n.kind==='accept'?npc.accepts:npc.turnIns).includes(n.questId));
 const locked=busy||!!s.combat||!!s.escort||s.hp<=0||!['idle','hunt'].includes(s.activity.type);
 const here=n.here&&n.to===s.location;
 const leaveFirst=!!(s.dungeon||d.goldRaid?.active)&&!here;
 const label=here?(npc?'与 '+npc.name+' 交谈':n.kind==='objective'?'已在任务区域':'已到任务人物处'):(n.npcName?'前往 '+n.npcName:n.kind==='turnin'?'前往交付':'前往任务区域');
 return <><Button variant="outline" title={leaveFirst?'请先离开副本，再前往任务人物处。':undefined} disabled={locked||leaveFirst||here&&!npc} onClick={()=>here?setConversation(scene):void onNavigate()}>{label}{!here&&' ↗'}</Button>{conversation===scene&&here&&npc&&<NpcDialog {...props} npc={npc} onClose={()=>setConversation(null)}/>}</>;
}
