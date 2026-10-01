import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {saveFetch} from '../lib/save-fetch';
import type {GameProps} from './game-ui';
import ClassIcon from './class-icon';
import './social.css';

type Model=Record<string,any>;
type Social={data:Model|null;error:string;busy:boolean;run:(body:Model)=>Promise<boolean>;search:(q:string)=>Promise<Model[]>};
const Context=createContext<Social>({data:null,error:'',busy:false,run:async()=>false,search:async()=>[]});
export const useSocial=()=>useContext(Context);
const roleNames:Record<string,string>={tank:'坦克',healer:'治疗',dps:'输出'};
async function response(response:Response){const data=await response.json();if(!response.ok)throw new Error(data.error||'社交服务暂时不可用');return data;}
export function SocialProvider({actorId,children}:{actorId:string;children:ReactNode}){
 const [data,setData]=useState<Model|null>(null),[error,setError]=useState(''),[connectionError,setConnectionError]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef(false),revision=useRef(0),alive=useRef(true),retry=useRef<Model|null>(null);
 const url=`/api/game/social?characterId=${encodeURIComponent(actorId)}`;
 useEffect(()=>{alive.current=true;let stopped=false,timer:ReturnType<typeof setTimeout>;const abort=new AbortController();
  const poll=async()=>{const cursor=revision.current;try{if(!pending.current){const next=await response(await saveFetch(url,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])}));if(!stopped&&cursor===revision.current){setData(next);setConnectionError('');}}}catch(e){if(!stopped)setConnectionError((e as Error).message);}finally{if(!stopped)timer=setTimeout(poll,document.hidden?10000:2000);}};
  void poll();return()=>{stopped=true;alive.current=false;abort.abort();clearTimeout(timer);};
 },[url]);
 const run=async(body:Model)=>{if(pending.current)return false;pending.current=true;revision.current++;setBusy(true);setError('');
  const command={...body,requestId:body.requestId??crypto.randomUUID()};retry.current=command;
  try{const next=await response(await saveFetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(15000)}));if(alive.current){setData(next);retry.current=null;}return true;}
  catch(e){if(alive.current)setError((e as Error).message);return false;}finally{pending.current=false;revision.current++;if(alive.current)setBusy(false);}
 };
 const search=async(q:string)=>{try{return (await response(await saveFetch(`${url}&q=${encodeURIComponent(q)}`,{signal:AbortSignal.timeout(10000)}))).players;}catch(e){if(alive.current)setError((e as Error).message);return [];}};
 return <Context.Provider value={{data,error:error||connectionError,busy,run,search}}>{children}{(data?.incoming.length>0||data?.proposal)&&<aside className="social-notifications" aria-label="社交通知">{data!.incoming.map((i:Model)=><div key={i.id}><strong>{i.name}</strong><p>{i.kind==='friend'?'请求添加好友':'邀请你加入队伍'}</p><Button disabled={busy} onClick={()=>void run({type:'respond',inviteId:i.id,accept:true})}>接受</Button><Button variant="outline" disabled={busy} onClick={()=>void run({type:'respond',inviteId:i.id,accept:false})}>拒绝</Button></div>)}{data!.proposal&&<Proposal/>}</aside>}{(error||connectionError)&&<div className="social-error" role="alert">{error||connectionError}{retry.current&&<button disabled={busy} onClick={()=>void run(retry.current!)}>重试上次操作</button>}<button onClick={()=>{setError('');retry.current=null;}}>关闭</button></div>}</Context.Provider>;
}
function Proposal(){const {data,busy,run}=useSocial();const p=data?.proposal;if(!p)return null;const accepted=p.accepted.includes(data!.self.id);return <section aria-label="匹配确认"><h3>找到地下城队伍</h3><p>{data!.dungeons.find((d:Model)=>d.id===p.dungeonId)?.name} · 等待玩家确认</p><p>剩余 {Math.max(0,Math.ceil((p.expiresAt-Date.now())/1000))} 秒。全部同意后组成队伍，不自动进入副本。</p><p>{p.accepted.length} / {p.members.filter((m:Model)=>!m.npc).length} 位玩家已确认</p><Button disabled={busy||accepted} onClick={()=>void run({type:'proposal',proposalId:p.id,accept:true})}>{accepted?'已确认，等待队友':'准备好了'}</Button><Button variant="outline" disabled={busy} onClick={()=>void run({type:'proposal',proposalId:p.id,accept:false})}>拒绝匹配</Button></section>;}
export function SocialChat(){
 const {data,busy,run}=useSocial(),[channel,setChannel]=useState('world'),[text,setText]=useState('');const list=useRef<HTMLDivElement>(null);
 const messages=data?.messages[channel]??[];useEffect(()=>{list.current?.scrollTo({top:list.current.scrollHeight});},[messages.at(-1)?.id,channel]);
 return <section className="social-chat" aria-label="玩家聊天"><div className="filterbar"><button aria-pressed={channel==='world'} onClick={()=>setChannel('world')}>世界</button><button aria-pressed={channel==='party'} onClick={()=>setChannel('party')}>队伍</button></div><div ref={list} className="social-chat-history" role="log" aria-label={channel==='world'?'世界聊天记录':'队伍聊天记录'}>{messages.map((m:Model)=><div className="social-message" key={m.id}><p><strong>[{m.name}]</strong> {m.text}</p>{m.kind==='recruitment'&&<div className="social-recruitment"><small>{m.minimumLevel}–{m.maximumLevel} 级 · {m.open?'招募中':'招募已结束'}{m.open?` · 缺坦克 ${m.needed.tank} / 治疗 ${m.needed.healer} / 输出 ${m.needed.dps}`:''}</small>{m.open&&data?.self.id!==m.actorId&&data?.group?.id!==m.groupId&&data?.self.roles.filter((r:string)=>m.needed[r]>0).map((role:string)=><Button key={role} size="sm" variant="outline" disabled={busy} onClick={()=>void run({type:'recruitJoin',groupId:m.groupId,recruitmentId:m.recruitmentId,role})}>以{roleNames[role]}加入</Button>)}</div>}</div>)}{!messages.length&&<p>{channel==='party'&&!data?.group?'加入队伍后可在此聊天。':'暂无消息。'}</p>}</div><form onSubmit={async e=>{e.preventDefault();if(await run({type:'chat',channel,text}))setText('');}}><input aria-label="聊天消息" maxLength={300} value={text} onChange={e=>setText(e.target.value)} placeholder={channel==='world'?'向世界发送消息…':'向队伍发送消息…'}/><Button type="submit" size="sm" disabled={busy||!data||!text.trim()||channel==='party'&&!data.group}>发送</Button></form></section>;
}
export default function SocialPanel(props:GameProps){
 const {data,busy,run,search}=useSocial();const [tab,setTab]=useState('finder'),[query,setQuery]=useState(''),[players,setPlayers]=useState<Model[]>([]),[dungeonId,setDungeonId]=useState('deadmines');
 const group=data?.group,me=data?.self,canLead=!group||group.leaderId===me?.id,locked=busy||!!group?.instanceId||['queued','proposal'].includes(group?.status);
 const initNpcs=async()=>await props.send({type:'npcMatchSupply'});
 const enqueue=async()=>{if(group?.members.length===5||await props.send({type:'npcMatchSupply',dungeonId}))await run({type:'queue',dungeonId});};
 const row=(p:Model)=> <article className="social-person" key={p.id}><ClassIcon classId={p.classId} size={30}/><div className="grow"><strong>{p.name}</strong><small>{p.level} 级 · {p.npc?'NPC 玩家':'玩家'}{p.role?` · ${roleNames[p.role]}`:''}{p.online===undefined?'':p.online?' · 在线':' · 离线'}</small></div><Button size="sm" variant="outline" disabled={locked||!canLead||group?.members.some((m:Model)=>m.id===p.id)||data?.outgoing?.some((i:Model)=>i.kind==='party'&&i.to===p.id)} onClick={()=>void run({type:p.npc?'npcInvite':'partyInvite',targetId:p.id})}>邀请组队</Button><Button size="sm" variant="ghost" disabled={busy||data?.outgoing?.some((i:Model)=>i.kind==='friend'&&i.to===p.id)} onClick={()=>void run({type:data?.friends.some((f:Model)=>f.id===p.id)?'friendRemove':'friendRequest',targetId:p.id})}>{data?.friends.some((f:Model)=>f.id===p.id)?'移除好友':data?.outgoing?.some((i:Model)=>i.kind==='friend'&&i.to===p.id)?'申请已发送':'添加好友'}</Button></article>;
 return <div className="social-panel"><header className="panel"><h1>社交与地下城查找器</h1><p>先与朋友组队，或选择职责寻找同行者。</p><nav className="filterbar" aria-label="社交页面">{[['finder','地下城查找器'],['friends','好友'],['players','寻找玩家'],['npcs','NPC 玩家'],['chat','聊天']].map(([id,name])=><Button key={id} variant={tab===id?'default':'outline'} onClick={()=>setTab(id)}>{name}</Button>)}</nav></header>
 {!data?<p role="status">正在连接社交服务…</p>:<>
 <section className="panel"><div className="section-heading"><h2>我的队伍 · {group?.members.length??1} / 5</h2>{group&&<Button variant="outline" disabled={busy} onClick={()=>void run({type:'leave'})}>离开队伍</Button>}</div>{(group?.members??[me]).map((p:Model)=><article className="social-person" key={p.id}><ClassIcon classId={p.classId} size={28}/><div className="grow"><strong>{p.name}{p.id===group?.leaderId?' · 队长':''}</strong><small>{p.level} 级 · {roleNames[p.role]??'未选择职责'}{p.npc?' · NPC':''}</small></div>{canLead&&p.id!==me.id&&<><Button size="sm" variant="ghost" disabled={locked} onClick={()=>void run({type:'kick',targetId:p.id})}>移出</Button>{!p.npc&&<Button size="sm" variant="ghost" disabled={locked} onClick={()=>void run({type:'promote',targetId:p.id})}>转交队长</Button>}</>}</article>)}</section>
 {tab==='finder'&&<section className="panel finder"><h2>地下城查找器</h2><p>1 坦克 · 1 治疗 · 3 输出。成员等级差最多 5 级。</p><fieldset disabled={locked}><legend>我的职责</legend><div className="finder-roles">{me.roles.map((role:string)=><button type="button" key={role} aria-pressed={group?.members.find((m:Model)=>m.id===me.id)?.role===role} onClick={()=>void run({type:'role',role})}><span>{role==='tank'?'🛡':role==='healer'?'✚':'⚔'}</span>{roleNames[role]}</button>)}</div></fieldset><label>选择地下城<GameSelect aria-label="查找器地下城" value={dungeonId} onValueChange={setDungeonId} disabled={locked||!canLead}>{data.dungeons.map((d:Model)=><GameSelectOption key={d.id} value={d.id} disabled={d.minimumLevel>me.level}>{d.name} · 最低 {d.minimumLevel} 级</GameSelectOption>)}</GameSelect></label>
 {group?.status==='queued'?<><p role="status">正在寻找队员…同等级 NPC 将自动补位。</p><Button disabled={busy||!canLead} onClick={()=>void run({type:'cancel'})}>取消匹配</Button></>:group?.status==='proposal'?<p role="status">已找到队伍，请在匹配通知中确认。</p>:<Button disabled={locked||props.busy||!canLead||!group?.members.every((m:Model)=>m.role)} onClick={()=>void enqueue()}>开始匹配</Button>}
 {group?.status==='matched'&&<MatchedDungeon game={props} group={group} dungeon={data.dungeons.find((d:Model)=>d.id===group.dungeonId)}/> }
 <p className="footnote">开始匹配会向世界频道发布招募。真人优先，等待 8 秒后空闲 NPC 自动参与补位。每位玩家自行选择职责，由队长开始匹配；找到队伍后需真人全部确认。候选不足时按当前等级补充持久 NPC，已有角色保留等级与装备。</p></section>}
 {tab==='friends'&&<section className="panel"><h2>好友</h2>{data.friends.map(row)}{!data.friends.length&&<p>在「寻找玩家」或「NPC 玩家」中添加好友。</p>}</section>}
 {tab==='players'&&<section className="panel"><h2>寻找玩家</h2><form className="filterbar" onSubmit={async e=>{e.preventDefault();setPlayers(await search(query));}}><input aria-label="搜索玩家" value={query} maxLength={40} onChange={e=>setQuery(e.target.value)} placeholder="角色名称或角色编号"/><Button type="submit" disabled={!query.trim()}>查找</Button></form>{players.map(row)}</section>}
 {tab==='npcs'&&<section className="panel"><h2>同等级 NPC 玩家</h2>{!data.npcs.length&&<Button disabled={props.busy} onClick={()=>void initNpcs()}>认识同行的 NPC 玩家</Button>}{data.npcs.map(row)}</section>}
 {tab==='chat'&&<section className="panel"><SocialChat/></section>}
 </>}</div>;
}

function MatchedDungeon({game,group,dungeon}:{game:GameProps;group:Model;dungeon:Model}){
 if(!dungeon)return null;
 const state=game.state,inside=state.dungeon?.id===dungeon.id,atEntrance=state.location===dungeon.entrance;
 const blocked=game.busy||!!state.combat||!!state.dungeon||state.hp<=0||state.activity.type!=='idle';
 return <div className="finder-success"><strong>队伍已组建 · {dungeon.name}</strong>
 <p>玩家各自前往入口，手动进入同一副本。NPC 随队长一起入场。</p>
 {inside?<p role="status">已进入队伍副本。{group.leaderId!==state.id?'等待队长指挥。':'其他玩家可在到达入口后加入。'}</p>:atEntrance?
 <Button disabled={blocked} onClick={()=>void game.send({type:'enterDungeon',contentId:dungeon.id})}>进入队伍副本</Button>:
 <Button variant="outline" disabled={blocked} onClick={()=>void game.send({type:'travel',to:dungeon.entrance})}>前往{dungeon.name}入口</Button>}
 </div>;
}
