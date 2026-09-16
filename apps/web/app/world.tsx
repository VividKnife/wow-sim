"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps,duration,money,Item,Icon} from './game-ui';
import Dungeon from './dungeon';
import WorldMap from './world-map';
import Hearthstone from './hearthstone';
import Mounts from './mounts';
import Escort from './escort';
import {Gathering} from './professions';
export default function World({state:s,data:d,busy,send}:GameProps){
 const [filter,setFilter]=useState('全部'),[mapOpen,setMapOpen]=useState(false),[questMode,setQuestMode]=useState('附近'),[choices,setChoices]=useState<Record<string,number>>({});
 const questList=d.quests.filter((q:any)=>questMode==='日志'?q.active:questMode==='全部'?!q.completed:q.canAccept||q.canTurnIn||q.waitUntil>s.clock&&q.startLocations.includes(s.location));
 const navigationLocked=busy||!!s.combat||s.hp<=0||!['idle','hunt'].includes(s.activity.type);
 const navigate=async(id:number)=>{if(await send({type:'navigateQuest',id}))setMapOpen(true);};
 const navigationButton=(q:any)=>q.navigation?<Button variant="outline" disabled={navigationLocked||q.navigation.here} onClick={()=>navigate(q.id)}>{q.navigation.here?(q.navigation.kind==='turnin'?'已到交付地点':'已在任务区域'):(q.navigation.kind==='turnin'?'前往交付':'前往任务区域')} ↗</Button>:<span className="quest-navigation-note">暂无可导航地点，请查看任务说明</span>;
 if(s.dungeon)return <div className="world-main"><Hearthstone state={s} data={d} busy={busy} send={send}/><Dungeon state={s} data={d} busy={busy} send={send}/></div>;
 return <div className="world-layout"><section className="world-main"><div className="section-heading"><div><div className="eyebrow">{d.location.region} / 等级 {d.location.min}—{d.location.max}</div><h1>{d.location.name}</h1></div><Button variant="outline" onClick={()=>setMapOpen(!mapOpen)}>{mapOpen?'收起地图':'打开区域地图'} ↗</Button></div>
 <Hearthstone state={s} data={d} busy={busy} send={send}/>
 <Mounts state={s} data={d} busy={busy} send={send}/>
 <Escort state={s} data={d} busy={busy} send={send}/>
 <Gathering state={s} data={d} busy={busy} send={send}/>
 {mapOpen&&<WorldMap state={s} data={d} busy={busy} send={send}/>}
 {d.quests.some((q:any)=>q.active)&&<section className="panel quest-shortcuts" aria-label="任务快捷导航"><h2>任务快捷导航</h2>{d.quests.filter((q:any)=>q.active).map((q:any)=><div className="quest-shortcut" key={q.id}><div className="grow"><strong>{q.complete?'✓':'◇'} {q.name}</strong><small>{q.navigation?`${q.navigation.kind==='turnin'?'交付地点':'任务区域'}：${q.navigation.name}${q.navigation.here?' · 已抵达':' · '+duration(q.navigation.duration)}`:q.description}</small></div>{navigationButton(q)}</div>)}</section>}
 {(s.location==='deadmines'||d.location.region==='西部荒野')&&<Dungeon state={s} data={d} busy={busy} send={send}/>}
 <div className="filterbar local-filters">{['全部','人物与服务','怪物','任务物件'].map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f}</button>)}</div>
 {['全部','任务物件'].includes(filter)&&d.questTools?.length>0&&<section className="panel"><h2>任务物品</h2>{d.questTools.map((t:any)=><div className="item-row" key={t.id}><Icon src={t.icon} name={t.name}/><div className="grow"><strong>{t.name}</strong><small>{t.place}</small></div><Button variant="outline" disabled={busy||s.location===t.location&&!t.available} onClick={()=>send(s.location===t.location?{type:'useQuestItem',id:t.id}:{type:'travel',to:t.location})}>{s.location===t.location?t.label:'前往使用地点'}</Button></div>)}</section>}
 <div className="interaction-grid">{['全部','人物与服务'].includes(filter)&&<>
  {d.canTrain&&<div className="interaction service"><span className="service-glyph">✧</span><strong>{d.className}训练师</strong><small>在「角色」中学习新技能</small></div>}
  {d.shop.length>0&&<a href="#local-shop" className="interaction service"><span className="service-glyph">♙</span><strong>当地商人</strong><small>购买补给 · 出售物品</small></a>}
  {d.hearthstone?.hasInn&&<button className="interaction service" disabled={busy||!d.hearthstone.canBind} onClick={()=>send({type:'bindHearth'})}><span className="service-glyph">⌂</span><strong>旅店老板 · 绑定炉石</strong><small>{s.hearth===s.location&&d.hearthstone.hasItem?'已绑定此处':'将炉石绑定到'+d.location.name}</small></button>}
  {d.hasFlight&&<button className="interaction service" disabled={busy||s.flightPoints.includes(s.location)} onClick={()=>send({type:'unlockFlight'})}><span className="service-glyph">↗</span><strong>飞行管理员</strong><small>{s.flightPoints.includes(s.location)?'飞行点已发现':'发现这个飞行点'}</small></button>}
  {[...new Set(questList.filter((q:any)=>q.canAccept||q.canTurnIn).map((q:any)=>q.giver))].filter(Boolean).map((name:any)=><a className="interaction npc" href="#quest-list" key={name}><span className="quest-mark">!</span><strong>{name}</strong><small>可交谈 · 查看下方任务</small></a>)}
 </>}
 {['全部','怪物'].includes(filter)&&d.monsters.map((m:any)=><button className={'interaction monster '+(m.min>s.level+2?'danger':'')} key={m.id} disabled={busy} onClick={()=>send({type:'hunt',id:m.id})}><span className="mob-level">{m.min===m.max?m.min:`${m.min}—${m.max}`}{m.elite?' 精英':''}</span><strong>{m.name}</strong><small>开始自动狩猎 →</small></button>)}
 {['全部','任务物件'].includes(filter)&&d.gatherables.map((o:any)=><button className="interaction" key={o.id} disabled={busy} onClick={()=>send({type:'gather',id:o.id})}><span className="quest-mark">◇</span><strong>{o.items[0]?.name||o.name}</strong><small>调查 / 采集 · 5 秒</small></button>)}
 </div>
 {d.hasFlight&&s.flightPoints.includes(s.location)&&s.flightPoints.filter((n:string)=>n!==s.location).map((n:string)=><Button key={n} variant="outline" onClick={()=>send({type:'fly',to:n})}>飞往 {d.map.find((x:any)=>x.id===n)?.name}</Button>)}
 <section id="quest-list" className="panel quest-panel"><div className="section-heading"><h2>冒险任务 <small>{Object.keys(s.quests).length} / 20</small></h2><div className="filterbar">{['附近','日志','全部'].map(m=><button key={m} className={questMode===m?'active':''} onClick={()=>setQuestMode(m)}>{m}</button>)}</div></div>
 {!questList.length&&<p className="empty">这里暂时没有可领取的任务。查看日志中的目标，或打开地图前往下一个地点。</p>}
 {questList.map((q:any)=><details className="quest-entry" key={q.id}><summary><span className={'quest-mark '+(q.complete?'complete':'')}>{q.active?'?':'!'}</span><strong>{q.name}</strong><small>Lv.{q.level} {q.active?(q.complete?'可交付':'进行中'):q.waitUntil>s.clock?'制作中 '+duration(q.waitUntil-s.clock):q.available?'可领取':'前置未完成'}</small></summary><p>{q.description}</p><div className="objective-list">{q.objectives.map((o:any,i:number)=><div key={i}><span className={o.count>=o.required?'done':''}>{o.name} <b>{o.count}/{o.required}</b></span><small>{o.locations.map((id:string)=>d.map.find((n:any)=>n.id===id)?.name).filter(Boolean).join('、')}</small></div>)}</div><p className="reward-line">奖励：{q.xp} 经验{q.money>0?' · '+money(q.money):''}</p>
 {q.rewards.map((i:any)=><Item key={i.id} item={d.items[i.id]} instance={i}/>)}{q.choices.length>0&&<label className="reward-choice">选择奖励<select value={choices[q.id]||''} onChange={e=>setChoices({...choices,[q.id]:Number(e.target.value)})}><option value="">请选择</option>{q.choices.map((i:any)=><option key={i.id} value={i.id}>{d.items[i.id]?.name||i.id}</option>)}</select></label>}
 <div className="action-row">{q.canAccept&&<Button disabled={busy} onClick={()=>send({type:'accept',id:q.id})}>接受任务</Button>}{q.canTurnIn&&q.complete&&<Button disabled={busy||q.choices.length>0&&!choices[q.id]} onClick={()=>send({type:'turnin',id:q.id,choice:choices[q.id]})}>完成任务</Button>}{q.active&&navigationButton(q)}{q.active&&<Button variant="ghost" onClick={()=>send({type:'abandon',id:q.id})}>放弃任务</Button>}</div></details>)}
 </section>
 {d.shop.length>0&&<section className="panel" id="local-shop"><h2>当地商店</h2><p>价格单位为铜币；背包物品可在「角色」页卖给商人。</p><div className="shop-list">{d.shop.filter((i:any)=>[159,117,2070,4540,1179,1205,3371,4496,4498].includes(i.id)).map((i:any)=><div className="shop-row" key={i.id}><span>{i.name} ×{i.count}</span><Button variant="outline" disabled={busy||s.money<i.price} onClick={()=>send({type:'buy',id:i.id,count:1})}>{money(i.price)} · 购买</Button></div>)}</div><details><summary>查看全部 {d.shop.length} 件商品</summary>{d.shop.map((i:any)=><div className="shop-row" key={i.id}><span>{i.name} ×{i.count}</span><Button variant="ghost" disabled={busy||s.money<i.price} onClick={()=>send({type:'buy',id:i.id,count:1})}>{money(i.price)}</Button></div>)}</details></section>}
 </section><aside className="journey-sidebar panel"><div className="eyebrow">旅程笔记</div><h2>下一步冒险</h2><p>接取任务 → 前往目标地点 → 自动狩猎或采集 → 回到任务人物处交付。</p><hr/><h3>在出发前</h3><p>准备食物和水，并到训练师处学习新法术。资源不足或背包已满时，自动狩猎会停下。</p><hr/><h3>当前目标</h3>{d.quests.filter((q:any)=>q.active).map((q:any)=><a href="#quest-list" className="sidebar-quest" key={q.id}>{q.complete?'✓':'◇'} {q.name}</a>)}</aside></div>
}
