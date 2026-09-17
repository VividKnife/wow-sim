"use client";
import {useState} from 'react';
import {BookOpen,Store,BedDouble,ScrollText,UserRound} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {GameProps,Item,money} from './game-ui';
import CityServicePanel from './city-services';

const names:Record<string,string>={quests:'任务',trainer:'职业训练',shop:'交易',inn:'旅店'};
export function NpcPortrait({npc}: {npc:any}){
 const Glyph=npc.roles.includes('quests')?ScrollText:npc.roles.includes('trainer')?BookOpen:npc.roles.includes('inn')?BedDouble:npc.roles.includes('shop')?Store:UserRound;
 return <span className="npc-portrait" aria-hidden="true">{npc.portrait?<img src={npc.portrait} alt="" onError={e=>{e.currentTarget.style.display='none';}}/>:null}<Glyph size={30}/></span>;
}
export function QuestConversation({quest:q,...props}:GameProps&{quest:any}){
 const {data:d,busy,send}=props,[choice,setChoice]=useState(0);
 return <article className="npc-quest"><h3>{q.name} <small>等级 {q.level}</small></h3><p>{q.description}</p><div className="objective-list">{q.objectives.map((o:any,i:number)=><div key={i}><span className={o.count>=o.required?'done':''}>{o.name} <b>{o.count}/{o.required}</b></span></div>)}</div><p className="reward-line">奖励：{q.xp} 经验{q.money>0?' · '+money(q.money):''}</p>{q.rewards.map((i:any)=><Item key={i.id} item={d.items[i.id]} instance={i}/>)}{q.choices.length>0&&<label className="reward-choice">选择奖励<select value={choice||''} onChange={e=>setChoice(Number(e.target.value))}><option value="">请选择</option>{q.choices.map((i:any)=><option key={i.id} value={i.id}>{d.items[i.id]?.name||i.id}</option>)}</select></label>}<div className="action-row">{q.canAccept?<Button disabled={busy} onClick={()=>send({type:'accept',id:q.id})}>接受任务</Button>:<Button disabled={busy||!q.complete||q.choices.length>0&&!choice} onClick={()=>send({type:'turnin',id:q.id,choice})}>{q.complete?'完成任务':'任务尚未完成'}</Button>}</div></article>;
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
 const npcs=(d.interactions||[]).filter((n:any)=>!d.city||n.roles.includes('quests')),npc=selected&&selected.location===s.location?(npcs.find((n:any)=>n.key===selected.npc.key)||{...selected.npc,accepts:[],turnIns:[]}):null;
 return <section id="local-people" className="local-people" aria-label="附近人物"><div className="section-heading"><div><div className="eyebrow">与世界交谈</div><h2>附近人物</h2></div><small>选择人物，查看任务与服务</small></div><div className="npc-grid">{npcs.map((n:any)=><button key={n.key} className="npc-card" onClick={()=>setSelected({npc:n,location:s.location})}><NpcPortrait npc={n}/><span className="npc-card-copy"><strong>{n.name}</strong><small>{n.roles.map((r:string)=>names[r]).join(' · ')}</small><span>{n.turnIns.length?'查看任务进度':n.accepts.length?`${n.accepts.length} 个可接任务`:'点击交谈'}</span></span>{(n.accepts.length>0||n.turnIns.length>0)&&<span className={'quest-mark'+(n.turnIns.length&&!d.quests.some((q:any)=>n.turnIns.includes(q.id)&&q.complete)?' incomplete':'')}>{n.turnIns.length?'?':'!'}</span>}</button>)}</div>{!npcs.length&&<p className="empty">这里没有可交谈的人物。打开地图，前往附近城镇。</p>}<Dialog open={!!npc} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className="npc-dialog"><DialogHeader><div className="npc-dialog-heading">{npc&&<NpcPortrait npc={npc}/>}<div><DialogTitle>{npc?.name||'人物交谈'}</DialogTitle><DialogDescription>{d.location.name} · {npc?.roles.map((r:string)=>names[r]).join(' / ')}</DialogDescription></div></div></DialogHeader>{npc&&<NpcConversation key={s.id+':'+s.location+':'+npc.key} {...props} npc={npc}/>}</DialogContent></Dialog></section>;
}
