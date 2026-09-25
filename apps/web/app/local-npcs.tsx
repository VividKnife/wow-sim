"use client";
import {useState} from 'react';
import {BookOpen,Store,BedDouble,ScrollText,UserRound,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogClose,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {GameProps,Item,money} from './game-ui';
import CityServicePanel from './city-services';
import CreaturePortrait from './creature-portrait';
import './npc-conversation.css';
import {serviceModels} from '../../../packages/game-data/creature-visuals.js';

const names:Record<string,string>={quests:'任务',trainer:'职业训练',shop:'交易',inn:'旅店',flight:'飞行管理员'};
const categories=[{label:'全部',role:null},{label:'任务',role:'quests'},{label:'训练师',role:'trainer'},{label:'商人',role:'shop'},{label:'旅店',role:'inn'}] as const;
export function NpcPortrait({npc}: {npc:any}){
 if(npc.entry||npc.key==='class-trainer')return <CreaturePortrait unit={{entry:npc.entry||serviceModels.trainer}} className="npc-portrait"/>;
 const Glyph=npc.roles.includes('quests')?ScrollText:npc.roles.includes('trainer')?BookOpen:npc.roles.includes('inn')?BedDouble:npc.roles.includes('shop')?Store:UserRound;
 return <span className="npc-portrait" aria-hidden="true"><Glyph size={30}/></span>;
}
export function QuestConversation({quest:q,...props}:GameProps&{quest:any}){
 const {data:d,busy,send}=props,[choice,setChoice]=useState(0);
 const canChoose=!q.canAccept&&q.complete;
 const selectedChoice=q.choices.some((i:any)=>i.id===choice)?choice:0;
 const paragraphs=(q.details||q.description||'').split(/\n+/).filter((text:string)=>text.trim());
 const rewardItem=(item:any)=><div className="quest-reward-item"><Item item={d.items[item.id]} instance={item}/>{item.count>1&&<span className="quest-reward-count">×{item.count}</span>}</div>;
 return <article className="npc-quest">
  <header className="quest-heading"><h3>{q.name}</h3><p>任务等级 {q.level}{q.minLevel!=null&&<> · 最低接受等级 {q.minLevel}</>}</p></header>
  <div className="quest-narrative">{paragraphs.map((text:string,index:number)=><p key={index}>{text}</p>)}</div>
  <section className="quest-objectives" aria-label="任务目标">
   <p className="quest-objective-summary"><span aria-hidden="true">◆</span><span>目标：{q.description}</span></p>
   {q.objectives.length>0&&<ul>{q.objectives.map((o:any,i:number)=><li key={i} className={o.count>=o.required?'done':''}><span>{o.name}</span><b>{q.canAccept?`×${o.required}`:`${o.count}/${o.required}`}</b></li>)}</ul>}
  </section>
  <section className="quest-rewards" aria-label="任务奖励"><h4>奖励</h4>
   <p>经验：{q.xp} 点</p>{q.money!==0&&<p>{q.money>0?'金钱：':'需要支付：'}{money(Math.abs(q.money))}</p>}
   {q.rewards.length>0&&<div className="quest-guaranteed-rewards"><p className="quest-reward-caption">你将获得：</p>{q.rewards.map((item:any)=><div key={item.id}>{rewardItem(item)}</div>)}</div>}
   {q.choices.length>0&&<section aria-label="可选奖励"><p className="quest-reward-caption">可选择下列奖励之一：</p><div className="reward-options" role={canChoose?'radiogroup':undefined} aria-label={canChoose?'选择一件任务奖励':undefined}>{q.choices.map((item:any)=>canChoose?<label key={item.id} className={'reward-option'+(selectedChoice===item.id?' selected':'')}><input className="reward-option-control" type="radio" name={`quest-reward-${q.id}`} value={item.id} checked={selectedChoice===item.id} disabled={busy} onChange={()=>setChoice(item.id)}/>{rewardItem(item)}<span className="reward-option-state" aria-hidden="true">{selectedChoice===item.id?'已选择':'点击选择'}</span></label>:<div key={item.id}>{rewardItem(item)}</div>)}</div></section>}
  </section>
  <div className="action-row quest-actions">{q.canAccept?<Button disabled={busy} onClick={()=>send({type:'accept',id:q.id})}>接受任务</Button>:<Button disabled={busy||!q.complete||q.choices.length>0&&!selectedChoice} onClick={()=>send({type:'turnin',id:q.id,choice:selectedChoice})}>{q.complete?'完成任务':'任务尚未完成'}</Button>}</div>
 </article>;
}
export function NpcConversation({npc,...props}:GameProps&{npc:any}){
 const {state:s,data:d,busy}=props;
 const [section,setSection]=useState(npc.roles[0]);
 const current=npc.roles.includes(section)?section:npc.roles[0];
 const quests=d.quests.filter((q:any)=>npc.accepts.includes(q.id)||npc.turnIns.includes(q.id));
 // The existing service panels share the same authoritative command handlers in towns and cities.
 const canInteract=!s.combat&&!s.escort&&s.hp>0&&['idle','hunt'].includes(s.activity.type);
 const serviceData={...d,shop:current==='shop'?d.shop.filter((i:any)=>npc.stockIds.includes(i.id)):d.shop,city:{...d.city,canInteract,junkCount:s.bag.filter((i:any)=>d.items[i.id]?.quality===0&&!i.locked).length}};
 return <>{npc.roles.length>1&&<div className="filterbar npc-service-tabs" aria-label="交谈内容">{npc.roles.map((role:string)=><button key={role} aria-pressed={current===role} className={current===role?'active':''} onClick={()=>setSection(role)}>{names[role]}</button>)}</div>}{!canInteract&&<p role="status">抵达并脱离战斗后，即可与这里的人物交互。</p>}{current==='quests'?<div>{quests.length?quests.map((q:any)=><QuestConversation key={q.id} {...props} busy={busy||!canInteract} quest={q}/>):<p className="empty">暂时没有新的委托。祝你旅途平安。</p>}</div>:<CityServicePanel {...props} data={serviceData} service={{id:current,name:names[current],npc:npc.name,description:'',greeting:''}}/>}</>;
}
export default function LocalNpcs(props:GameProps){
 const {state:s,data:d}=props,[selected,setSelected]=useState<any>(null),[category,setCategory]=useState<(typeof categories)[number]['label']>('全部');
 const npcs=d.interactions||[],role=categories.find(item=>item.label===category)?.role;
 const visibleNpcs=role?npcs.filter((n:any)=>n.roles.includes(role)):npcs;
 const npc=selected&&selected.location===s.location?(npcs.find((n:any)=>n.key===selected.npc.key)||{...selected.npc,accepts:[],turnIns:[]}):null;
 return <section id="local-people" className="local-people" aria-label="附近人物"><div className="section-heading"><div><div className="eyebrow">与世界交谈</div><h2>附近人物</h2></div><small>选择人物，查看任务与服务</small></div><nav className="filterbar npc-category-tabs" aria-label="人物分类">{categories.map(item=><button type="button" key={item.label} aria-pressed={category===item.label} className={category===item.label?'active':''} onClick={()=>setCategory(item.label)}>{item.label}</button>)}</nav><div className="npc-grid">{visibleNpcs.map((n:any)=>{const lowLevelQuests=n.accepts.length>0&&n.accepts.every((id:number)=>{const quest=d.quests.find((q:any)=>q.id===id);return quest&&s.level-quest.level>=5;});return <button key={n.key} className="npc-card" onClick={()=>setSelected({npc:n,location:s.location})}><NpcPortrait npc={n}/><span className="npc-card-copy"><strong>{n.name}</strong><small>{n.roles.map((r:string)=>names[r]).join(' · ')}</small><span>{n.turnIns.length?'查看任务进度':n.accepts.length?`${n.accepts.length} 个可接任务`:'点击交谈'}</span></span>{(n.accepts.length>0||n.turnIns.length>0)&&<span className={'quest-mark'+(n.turnIns.length&&!d.quests.some((q:any)=>n.turnIns.includes(q.id)&&q.complete)?' incomplete':!n.turnIns.length&&lowLevelQuests?' low-level':'')}>{n.turnIns.length?'?':'!'}</span>}</button>;})}</div>{!visibleNpcs.length&&<p className="empty">{role?`附近没有${category}人物。`:'这里没有可交谈的人物。打开地图，前往附近城镇。'}</p>}<Dialog open={!!npc} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className="npc-dialog classic-npc-dialog" showCloseButton={false}><DialogHeader className="npc-dialog-titlebar"><DialogTitle>{npc?.name||'人物交谈'}</DialogTitle><DialogClose className="npc-dialog-close" aria-label="关闭交谈"><X size={22}/></DialogClose></DialogHeader><div className="npc-dialog-scroll"><div className="npc-dialog-heading">{npc&&<NpcPortrait npc={npc}/>}<div><h2>{npc?.name}</h2><DialogDescription>{d.location.name} · {npc?.roles.map((r:string)=>names[r]).join(' / ')}</DialogDescription></div></div>{npc&&<NpcConversation key={s.id+':'+s.location+':'+npc.key} {...props} npc={npc}/>}</div></DialogContent></Dialog></section>;
}
