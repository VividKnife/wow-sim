"use client";
import {useState} from 'react';
import {UsersRound,Star,Shield,Heart,Swords,Plus,X,BookOpen,Check} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {GameProps,Item} from './game-ui';
import ClassIcon from './class-icon';
import {classOptions} from './class-options.js';
import './adventure-hall.css';

const roleName:Record<string,string>={tank:'坦克',healer:'治疗',melee:'近战输出',ranged:'远程输出'};
const className=(id:number)=>classOptions.find(c=>c.id===id)?.name||'冒险者';
const roleGroup=(role:string)=>['tank','healer'].includes(role)?role:'dps';
function Role({role}:{role:string}){const Mark=role==='tank'?Shield:role==='healer'?Heart:Swords;return <span className="hall-role" data-role={role}><Mark size={13}/>{roleName[role]||'输出'}</span>;}

export default function AdventureHall({state:s,data:d,busy,send,compact=false}:GameProps&{compact?:boolean}){
 const w=d.npcWorld;
 const [filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[friends,setFriends]=useState(false),[profile,setProfile]=useState<string|null>(null),[expanded,setExpanded]=useState(!compact);
 if(!w?.unlocked)return <section className="panel"><h2>冒险者大厅</h2><p>主角达到18级后，可结识 NPC 玩家，与自己的队友混编五人副本小队。</p></section>;
 const selected=w.selected||[],ids=selected.map((c:any)=>c.id),locked=busy||w.locked;
 const rows=(w.residents||[]).filter((p:any)=>(filter==='all'||roleGroup(p.role)===filter)&&(!friends||p.friend)&&(!query||`${p.name}${className(p.classId)}`.includes(query)));
 const inspected=w.residents.find((p:any)=>p.id===profile);
 const choose=(id:string)=>send({type:'npcGroup',memberIds:ids.includes(id)?ids.filter((x:string)=>x!==id):[...ids,id]});
 const counts=[{role:'tank',label:'坦克',target:1},{role:'healer',label:'治疗',target:1},{role:'dps',label:'输出',target:3}].map(r=>({...r,count:[{role:d.strategyMembers?.find((c:any)=>c.id===s.id)?.role||'ranged'},...selected].filter(c=>roleGroup(c.role)===r.role).length}));
 return <section className="panel adventure-hall" aria-label="副本组队大厅">
  <header className="hall-heading"><div><span className="eyebrow">旅店布告栏 · 冒险者大厅</span><h2>下一程，与谁同行</h2><p>自有队友与 NPC 玩家自由混编。出征名单独立保存，野外队伍不变。</p></div><span className="hall-count"><UsersRound size={20}/>{selected.length+1}<small>/ 5</small></span></header>
  <div className="hall-seats"><div className="hall-seat is-hero"><ClassIcon classId={s.classId} size={32}/><strong>{s.name}</strong><small>你 · 队长</small></div>{selected.map((c:any)=><div key={c.id} className="hall-seat"><ClassIcon classId={c.classId} size={30}/><strong>{c.name}</strong><small>{c.npc?'NPC 玩家':'自有队友'} · Lv.{c.level}</small><Role role={c.role}/><button type="button" aria-label={`移出 ${c.name}`} disabled={locked||!w.ready} onClick={()=>choose(c.id)}><X size={13}/></button></div>)}{Array.from({length:Math.max(0,4-selected.length)},(_,i)=><div key={i} className="hall-seat is-empty"><Plus size={19}/><span>等待同行者</span></div>)}</div>
  <div className="hall-balance">{counts.map(r=><span key={r.role} data-ready={r.count===r.target}>{r.label} {r.count} / {r.target}</span>)}<small>{w.custom?'已保存出征名单':'当前使用自有队伍'}</small></div>
  {!w.ready?<div className="hall-welcome"><BookOpen size={26}/><div><h3>认识这片世界的冒险者</h3><p>24 位固定身份的 NPC，有自己的职责、装备和冒险记录。加为好友，下次再一起出发。</p></div><Button disabled={locked} onClick={()=>send({type:'npcVisit'})}>走进冒险者大厅</Button></div>:<>
   <div className="hall-actions"><Button disabled={locked} onClick={()=>send({type:'npcRecommend',keep:false})}>推荐 NPC 小队</Button><Button variant="outline" disabled={locked||selected.length>=4} onClick={()=>send({type:'npcRecommend',keep:true})}>NPC 补齐空位</Button><Button variant="outline" disabled={locked||!w.custom} onClick={()=>send({type:'npcGroup',memberIds:null})}>使用自有队伍</Button><Button variant="ghost" disabled={locked} onClick={()=>send({type:'npcVisit'})}>查看冒险近况</Button>{compact&&<Button variant="ghost" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'收起名单':'挑选成员与好友'}</Button>}</div>
   {w.locked&&<p className="hall-notice" role="status">出征名单已锁定。结束活动并离开副本后，可重新组队、添加好友。</p>}
   {expanded&&<>
    {w.owned.length>0&&<div className="hall-owned"><h3>我的队友 <small>随时可以选择同行</small></h3><div>{w.owned.map((c:any)=><button type="button" key={c.id} aria-pressed={ids.includes(c.id)} disabled={locked||(!ids.includes(c.id)&&ids.length>=4)} onClick={()=>choose(c.id)}><ClassIcon classId={c.classId} size={30}/><span>{c.name}<small>{roleName[c.role]} · Lv.{c.level}</small></span>{ids.includes(c.id)?<Check size={16}/>:<Plus size={16}/>}</button>)}</div></div>}
    <div className="hall-toolbar"><label>寻找冒险者<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="名字或职业"/></label><label>职责<GameSelect aria-label="冒险者职责" value={filter} onValueChange={setFilter}><GameSelectOption value="all">全部职责</GameSelectOption><GameSelectOption value="tank">坦克</GameSelectOption><GameSelectOption value="healer">治疗</GameSelectOption><GameSelectOption value="dps">输出</GameSelectOption></GameSelect></label><button type="button" className="hall-friend-filter" aria-pressed={friends} onClick={()=>setFriends(!friends)}><Star size={15}/>{friends?'我的好友':'只看好友'}</button></div>
    <div className="hall-residents">{rows.map((p:any)=><article key={p.id} className="hall-person" data-selected={ids.includes(p.id)}><div className="hall-person-heading"><ClassIcon classId={p.classId} size={36}/><div><h3>{p.name}</h3><small>Lv.{p.level} {className(p.classId)} · NPC 玩家</small></div><button type="button" aria-label={`${p.friend?'移除好友':'添加好友'} ${p.name}`} aria-pressed={p.friend} disabled={locked} onClick={()=>send({type:'npcFriend',id:p.id,friend:!p.friend})}><Star size={17} fill={p.friend?'currentColor':'none'}/></button></div><div className="hall-person-tags"><Role role={p.role}/><span>{p.personality.name}</span></div><p className="hall-quote">“{p.personality.quote}”</p><p className="hall-status">{p.status} · 与你组队 {p.runs} 次</p><div className="hall-person-actions"><Button variant="ghost" size="sm" aria-expanded={profile===p.id} onClick={()=>setProfile(profile===p.id?null:p.id)}>查看档案</Button><Button size="sm" variant={ids.includes(p.id)?'outline':'default'} disabled={locked||(!ids.includes(p.id)&&ids.length>=4)} onClick={()=>choose(p.id)}>{ids.includes(p.id)?'移出名单':'邀请同行'}</Button></div>{profile===p.id&&inspected&&<div className="hall-dossier"><p>生命 {Math.round(p.stats.maxHp)} · 法力 {Math.round(p.stats.maxMana)} · 装备持续保存</p><details open><summary>当前装备 · {p.equipment.length} 件</summary><div className="hall-equipment">{p.equipment.map((item:any)=><Item key={item.uid} item={d.items[item.id]} instance={item}/>)}</div></details><h4>近期冒险</h4><ol>{p.history.map((e:any)=><li key={e.sequence}>{e.text}</li>)}</ol></div>}</article>)}</div>
    {!rows.length&&<p className="hall-notice">{friends?'还没有符合条件的好友。点击冒险者名字旁的星标结识他们。':'没有找到符合条件的冒险者。'}</p>}
   </>}
   <details className="hall-rules"><summary>副本分装与自主成长</summary><p>有 NPC 参战时，绿色及以上可装备掉落采用需求 / 贪婪 / 放弃。自有队友与 NPC 按当前职责自动判断提升；自有队友需求获奖后自动换装，其余物品保存在该队友的待领取列表。没有 NPC 时沿用原有拾取。</p><p>战后有60秒决定，超时默认贪婪。NPC 不修改点数；已经没有提升的装备不会再次需求。角色暂离后按冒险事件成长，每次最多补算两小时，等级追赶至主角当前等级。</p><label><input type="checkbox" checked={w.autoLoot} disabled={locked} onChange={e=>send({type:'npcLootPolicy',auto:e.target.checked})}/> 为主角自动按需选择（有提升需求，否则贪婪）</label></details>
  </>}
 </section>;
}

export function GroupLoot({state:s,data:d,busy,send}:GameProps){
 const loot=d.groupLoot;if(!loot||!loot.pending.length&&!loot.history.length)return null;
 return <section className="panel hall-loot" aria-label="队伍战利品"><div className="section-heading"><h2>队伍战利品</h2><small>需求优先 · 公开掷点</small></div>{loot.pending.map((l:any)=><article key={l.id}><Item item={d.items[l.item.id]} instance={l.item}/><p>{s.combat?'战斗结束后开始分装':`${Math.ceil(l.remaining/1000)} 秒后默认贪婪`}{loot.auto?' · 已开启自动按需分装':''}</p><p className="footnote">需求意向：{l.members.filter((m:any)=>m.need).map((m:any)=>m.name).join('、')||'暂无成员'}</p><div className="hall-actions"><Button disabled={busy||!!s.combat||!l.canNeed} onClick={()=>send({type:'groupLoot',id:l.id,choice:'need'})}>需求</Button><Button variant="outline" disabled={busy||!!s.combat||!l.canGreed} onClick={()=>send({type:'groupLoot',id:l.id,choice:'greed'})}>贪婪</Button><Button variant="ghost" disabled={busy||!!s.combat} onClick={()=>send({type:'groupLoot',id:l.id,choice:'pass'})}>放弃</Button></div>{!l.canNeed&&<small>这件装备没有提升你的当前职责配装。</small>}</article>)}{loot.history.length>0&&<details><summary>最近分配 · {loot.history.length} 件</summary>{loot.history.map((l:any)=><div key={l.id} className="hall-loot-result"><strong>{l.name}</strong><span>获得者：{l.winner}</span><small>{l.votes.map((v:any)=>`${v.name} ${v.choice==='need'?'需求':v.choice==='greed'?'贪婪':'放弃'}${v.roll??''}`).join(' · ')}</small></div>)}</details>}</section>;
}
