"use client";
import {useState} from 'react';
import {BookOpen,Store,BedDouble,ScrollText,UserRound} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {GameProps,Item,money} from './game-ui';
import CityServicePanel from './city-services';
import CreaturePortrait from './creature-portrait';
import {serviceModels} from '../../../packages/game-data/creature-visuals.js';

const names:Record<string,string>={quests:'任务',trainer:'职业训练',shop:'交易',inn:'旅店',flight:'飞行管理员'};
export function NpcPortrait({npc}: {npc:any}){
 if(npc.entry||npc.key==='class-trainer')return <CreaturePortrait unit={{entry:npc.entry||serviceModels.trainer}} className="npc-portrait"/>;
 const Glyph=npc.roles.includes('quests')?ScrollText:npc.roles.includes('trainer')?BookOpen:npc.roles.includes('inn')?BedDouble:npc.roles.includes('shop')?Store:UserRound;
 return <span className="npc-portrait" aria-hidden="true"><Glyph size={30}/></span>;
}
export function QuestConversation({quest:q,...props}:GameProps&{quest:any}){
 const {data:d,busy,send}=props,[choice,setChoice]=useState(0);
 const canChoose=!q.canAccept&&q.complete;
 const selectedChoice=q.choices.some((i:any)=>i.id===choice)?choice:0;
 return <article className="npc-quest"><h3>{q.name} <small>等级 {q.level}</small></h3><p>{q.description}</p><div className="objective-list">{q.objectives.map((o:any,i:number)=><div key={i}><span className={o.count>=o.required?'done':''}>{o.name} <b>{o.count}/{o.required}</b></span></div>)}</div><p className="reward-line">奖励：{q.xp} 经验{q.money>0?' · '+money(q.money):''}</p>{q.rewards.map((i:any)=><Item key={i.id} item={d.items[i.id]} instance={i}/>)}{q.choices.length>0&&<section aria-label="可选奖励"><p className="reward-line">可选奖励（完成任务时从以下物品中选择一件）：</p><div className="reward-options" role={canChoose?'radiogroup':undefined} aria-label={canChoose?'选择一件任务奖励':undefined}>{q.choices.map((i:any)=>canChoose?<label key={i.id} className={'reward-option'+(selectedChoice===i.id?' selected':'')}><input className="reward-option-control" type="radio" name={`quest-reward-${q.id}`} value={i.id} checked={selectedChoice===i.id} disabled={busy} onChange={()=>setChoice(i.id)}/><Item item={d.items[i.id]} instance={i}/><span className="reward-option-state" aria-hidden="true">{selectedChoice===i.id?'已选择':'点击选择'}</span></label>:<Item key={i.id} item={d.items[i.id]} instance={i}/>)}</div></section>}<div className="action-row">{q.canAccept?<Button disabled={busy} onClick={()=>send({type:'accept',id:q.id})}>接受任务</Button>:<Button disabled={busy||!q.complete||q.choices.length>0&&!selectedChoice} onClick={()=>send({type:'turnin',id:q.id,choice:selectedChoice})}>{q.complete?'完成任务':'任务尚未完成'}</Button>}</div></article>;
}
export function NpcConversation({npc,...props}:GameProps&{npc:any}){
 const {state:s,data:d,busy}=props;
 const [section,setSection]=useState(npc.roles[0]);
 const current=npc.roles.includes(section)?section:npc.roles[0];
 const quests=d.quests.filter((q:any)=>npc.accepts.includes(q.id)||npc.turnIns.includes(q.id));
 // The existing service panels share the same authoritative command handlers in towns and cities.
 const canInteract=!s.combat&&!s.escort&&s.hp>0&&['idle','hunt'].includes(s.activity.type);
 const serviceData={...d,shop:current==='shop'?d.shop.filter((i:any)=>npc.stockIds.includes(i.id)):d.shop,city:{...d.city,canInteract,junkCount:s.bag.filter((i:any)=>d.items[i.id]?.quality===0&&!i.locked).length}};
 return <><div className="filterbar npc-service-tabs" aria-label="交谈内容">{npc.roles.map((role:string)=><button key={role} aria-pressed={current===role} className={current===role?'active':''} onClick={()=>setSection(role)}>{names[role]}</button>)}</div>{!canInteract&&<p role="status">抵达并脱离战斗后，即可与这里的人物交互。</p>}{current==='quests'?<div>{quests.length?quests.map((q:any)=><QuestConversation key={q.id} {...props} busy={busy||!canInteract} quest={q}/>):<p className="empty">暂时没有新的委托。祝你旅途平安。</p>}</div>:<CityServicePanel {...props} data={serviceData} service={{id:current,name:names[current],npc:npc.name,description:'',greeting:''}}/>}</>;
}
export default function LocalNpcs(props:GameProps){
 const {state:s,data:d}=props,[selected,setSelected]=useState<any>(null);
 const npcs=(d.interactions||[]).filter((n:any)=>!d.city||n.roles.includes('quests')||n.roles.includes('flight')),npc=selected&&selected.location===s.location?(npcs.find((n:any)=>n.key===selected.npc.key)||{...selected.npc,accepts:[],turnIns:[]}):null;
 return <section id="local-people" className="local-people" aria-label="附近人物"><div className="section-heading"><div><div className="eyebrow">与世界交谈</div><h2>附近人物</h2></div><small>选择人物，查看任务与服务</small></div><div className="npc-grid">{npcs.map((n:any)=>{const lowLevelQuests=n.accepts.length>0&&n.accepts.every((id:number)=>{const quest=d.quests.find((q:any)=>q.id===id);return quest&&s.level-quest.level>=5;});return <button key={n.key} className="npc-card" onClick={()=>setSelected({npc:n,location:s.location})}><NpcPortrait npc={n}/><span className="npc-card-copy"><strong>{n.name}</strong><small>{n.roles.map((r:string)=>names[r]).join(' · ')}</small><span>{n.turnIns.length?'查看任务进度':n.accepts.length?`${n.accepts.length} 个可接任务`:'点击交谈'}</span></span>{(n.accepts.length>0||n.turnIns.length>0)&&<span className={'quest-mark'+(n.turnIns.length&&!d.quests.some((q:any)=>n.turnIns.includes(q.id)&&q.complete)?' incomplete':!n.turnIns.length&&lowLevelQuests?' low-level':'')}>{n.turnIns.length?'?':'!'}</span>}</button>;})}</div>{!npcs.length&&<p className="empty">这里没有可交谈的人物。打开地图，前往附近城镇。</p>}<Dialog open={!!npc} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className="npc-dialog"><DialogHeader><div className="npc-dialog-heading">{npc&&<NpcPortrait npc={npc}/>}<div><DialogTitle>{npc?.name||'人物交谈'}</DialogTitle><DialogDescription>{d.location.name} · {npc?.roles.map((r:string)=>names[r]).join(' / ')}</DialogDescription></div></div></DialogHeader>{npc&&<NpcConversation key={s.id+':'+s.location+':'+npc.key} {...props} npc={npc}/>}</DialogContent></Dialog></section>;
}
