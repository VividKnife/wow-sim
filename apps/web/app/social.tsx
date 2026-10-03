import {createContext,useContext,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {ArrowDown,Globe,Users,Send,MessageCircle} from 'lucide-react';
import {useChatScroll} from '@/lib/use-chat-scroll';
import {Button} from '@/components/ui/button';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {saveFetch} from '../lib/save-fetch';
import type {GameProps} from './game-ui';
import ClassIcon from './class-icon';
import {classColors} from '@/lib/class-colors';
import './social.css';

type Model=Record<string,any>;
type Social={data:Model|null;error:string;busy:boolean;run:(body:Model)=>Promise<boolean>;search:(q:string)=>Promise<Model[]>};
const Context=createContext<Social>({data:null,error:'',busy:false,run:async()=>false,search:async()=>[]});
export const useSocial=()=>useContext(Context);
const roleNames:Record<string,string>={tank:'坦克',healer:'治疗',dps:'输出'};
async function response(response:Response){const data=await response.json();if(!response.ok)throw new Error(data.error||'社交服务暂时不可用');return data;}
export function SocialProvider({actorId,children,notificationsInPanel=false}:{actorId:string;children:ReactNode;notificationsInPanel?:boolean}){
 const [data,setData]=useState<Model|null>(null),[error,setError]=useState(''),[connectionError,setConnectionError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState<Model|null>(null);
 const pending=useRef(false),revision=useRef(0),alive=useRef(true);
 const url=`/api/game/social?characterId=${encodeURIComponent(actorId)}`;
 useEffect(()=>{alive.current=true;let stopped=false,timer:ReturnType<typeof setTimeout>;const abort=new AbortController();
  const poll=async()=>{const cursor=revision.current;try{if(!pending.current){const next=await response(await saveFetch(url,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])}));if(!stopped&&cursor===revision.current){setData(next);setConnectionError('');}}}catch(e){if(!stopped)setConnectionError((e as Error).message);}finally{if(!stopped)timer=setTimeout(poll,document.hidden?10000:2000);}};
  void poll();return()=>{stopped=true;alive.current=false;abort.abort();clearTimeout(timer);};
 },[url]);
 const run=async(body:Model)=>{if(pending.current)return false;pending.current=true;revision.current++;setBusy(true);setError('');
  const command={...body,requestId:body.requestId??crypto.randomUUID()};setRetry(command);
  try{const next=await response(await saveFetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(15000)}));if(alive.current){setData(next);setRetry(null);}return true;}
  catch(e){if(alive.current)setError((e as Error).message);return false;}finally{pending.current=false;revision.current++;if(alive.current)setBusy(false);}
 };
 const search=async(q:string)=>{try{return (await response(await saveFetch(`${url}&q=${encodeURIComponent(q)}`,{signal:AbortSignal.timeout(10000)}))).players;}catch(e){if(alive.current)setError((e as Error).message);return [];}};
 return <Context.Provider value={{data,error:error||connectionError,busy,run,search}}>{children}{!notificationsInPanel&&<SocialNotifications/>}{(error||connectionError)&&<div className="social-error" role="alert">{error||connectionError}{retry&&<button disabled={busy} onClick={()=>void run(retry!)}>重试上次操作</button>}<button onClick={()=>{setError('');setRetry(null);}}>关闭</button></div>}</Context.Provider>;
}
export function SocialNotifications(){const {data,busy,run}=useSocial();if(!data||(data.incoming.length===0&&!data.proposal))return null;return <aside className="social-notifications" aria-label="社交通知">{data.incoming.map((i:Model)=><div key={i.id}><strong>{i.name}</strong><p>{i.kind==='friend'?'请求添加好友':'邀请你加入队伍'}</p><Button disabled={busy} onClick={()=>void run({type:'respond',inviteId:i.id,accept:true})}>接受</Button><Button variant="outline" disabled={busy} onClick={()=>void run({type:'respond',inviteId:i.id,accept:false})}>拒绝</Button></div>)}{data.proposal&&<Proposal/>}</aside>;}
function Proposal(){const {data,busy,run}=useSocial();const [now,setNow]=useState(()=>Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);const p=data?.proposal;if(!p)return null;const accepted=p.accepted.includes(data!.self.id);return <section aria-label="匹配确认"><h3>找到地下城队伍</h3><p>{data!.dungeons.find((d:Model)=>d.id===p.dungeonId)?.name} · 等待玩家确认</p><p>剩余 {Math.max(0,Math.ceil((p.expiresAt-now)/1000))} 秒。全部同意后组成队伍，不自动进入副本。</p><p>{p.accepted.length} / {p.members.filter((m:Model)=>!m.npc).length} 位玩家已确认</p><Button disabled={busy||accepted} onClick={()=>void run({type:'proposal',proposalId:p.id,accept:true})}>{accepted?'已确认，等待队友':'准备好了'}</Button><Button variant="outline" disabled={busy} onClick={()=>void run({type:'proposal',proposalId:p.id,accept:false})}>拒绝匹配</Button></section>;}
export function SocialChat({active=true,compact=false,channel:fixedChannel}:{active?:boolean;compact?:boolean;channel?:string}){
 const {data,error,busy,run}=useSocial();
 const [selectedChannel,setChannel]=useState('world'),[drafts,setDrafts]=useState<Record<string,string>>({});
 const channel=fixedChannel??selectedChannel;
 const draftKey=channel==='party'?`party:${data?.group?.id??'none'}`:'world',text=drafts[draftKey]??'';
 const messages:Model[]=data?.messages[channel]??[],blocked=!data||channel==='party'&&!data.group;
 const inputId=useId(),composing=useRef(false);
 const setText=(value:string)=>setDrafts(drafts=>({...drafts,[draftKey]:value}));
 return <section className={`social-chat${compact?' social-chat-minimal':''}`} aria-label="玩家聊天" data-channel={channel}>
  {!compact&&<div className="social-chat-channels" role="group" aria-label="发送频道">
   <button aria-pressed={channel==='world'} onClick={()=>setChannel('world')}><Globe size={14}/>世界</button>
   <button aria-pressed={channel==='party'} onClick={()=>setChannel('party')}><Users size={14}/>队伍{data?.group&&<small>{data.group.members.length}</small>}</button>
   <span className={`social-chat-connection${error?' is-error':''}`} role="status">{error?'暂不可用':data?'已连接':'连接中…'}</span>
  </div>}
  {compact&&error&&<p className="social-chat-inline-error" role="status">聊天暂不可用，请稍后重试。</p>}
  <ChatMessages compact={compact} key={draftKey} messages={messages} active={active} channel={channel} blocked={blocked} loading={!data} failed={!!error} data={data} busy={busy} run={run}/>
  <form className="social-chat-composer" onSubmit={async e=>{
   e.preventDefault();if(composing.current||blocked||busy||!text.trim())return;
   const sent=text,key=draftKey;
   if(await run({type:'chat',channel,text:sent.trim()}))setDrafts(current=>current[key]===sent?{...current,[key]:''}:current);
  }}>
   <div className="social-chat-input-row"><label className="social-chat-destination" htmlFor={inputId}>{channel==='world'?'世界':'队伍'}</label><input id={inputId} aria-label="聊天消息" autoComplete="off" maxLength={300} value={text} disabled={blocked} onChange={e=>setText(e.target.value)} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={e=>{if(e.key==='Enter'&&(e.nativeEvent.isComposing||composing.current||e.keyCode===229))e.preventDefault();}} placeholder={blocked?(data?'加入队伍后即可发言':'正在连接聊天…'):compact?'输入消息…':'说点什么，与冒险者同行…'}/><button type="submit" aria-label="发送消息" disabled={busy||blocked||!text.trim()}><Send size={15}/><span>{busy?'发送中':'发送'}</span></button></div>
   <div className="social-chat-hint"><span>{channel==='world'?'所有冒险者可见':'仅当前队伍可见'}<span className="social-chat-enter"> · Enter 发送</span></span><span className={text.length>=280?'is-near-limit':''}>{text.length} / 300</span></div>
  </form>
 </section>;
}
function ChatMessages({messages,compact,active,channel,blocked,loading,failed,data,busy,run}:{messages:Model[];compact:boolean;active:boolean;channel:string;blocked:boolean;loading:boolean;failed:boolean;data:Model|null;busy:boolean;run:Social['run']}){
 const {ref:feedRef,onScroll,unread,latest}=useChatScroll(messages.map(m=>m.id),active);
 return <div className="social-chat-feed"><div ref={feedRef} onScroll={onScroll} className="social-chat-history" role="log" aria-live={active?'polite':'off'} aria-relevant="additions" aria-label={channel==='world'?'世界聊天记录':'队伍聊天记录'} tabIndex={0}>
  {messages.map(m=>{const own=data?.self.id===m.actorId,date=new Date(m.at),valid=Number.isFinite(date.getTime());return <article className={`social-message${own?' is-own':''}${m.kind==='recruitment'?' is-recruitment':''}`} key={m.id} title={valid?date.toLocaleString('zh-CN'):undefined}>
   <header>{compact?<><span>[{channel==='world'?'世界':'队伍'}] </span><strong style={{color:classColors[m.classId]??'#ddd6c5'}}>[{m.name}]</strong><span>：</span></>:<strong style={{color:classColors[m.classId]??'#ddd6c5'}}>{m.name}</strong>}{own&&<small>你</small>}{m.kind==='recruitment'&&<span className="social-recruitment-tag">队伍招募</span>}<time dateTime={valid?date.toISOString():undefined} title={valid?date.toLocaleString('zh-CN'):undefined}>{valid?date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):'—'}</time></header><p>{m.text}</p>
   {m.kind==='recruitment'&&<details className="social-recruitment" open={compact?undefined:true}><summary>招募详情</summary><span>{m.minimumLevel}–{m.maximumLevel} 级 · {m.open?'招募中':'招募已结束'}</span>{m.open&&<div className="social-recruitment-roles">{Object.entries(roleNames).map(([role,name])=><span key={role} className={m.needed[role]?'':'is-filled'}>{name} {m.needed[role]||'已满'}</span>)}</div>}{m.open&&!own&&data?.group?.id!==m.groupId&&data?.self.level>=m.minimumLevel&&data?.self.level<=m.maximumLevel&&data?.self.roles.filter((r:string)=>m.needed[r]>0).map((role:string)=><Button key={role} size="sm" variant="outline" disabled={busy} onClick={()=>void run({type:'recruitJoin',groupId:m.groupId,recruitmentId:m.recruitmentId,role})}>以{roleNames[role]}加入</Button>)}</details>}
  </article>;})}
  {!messages.length&&<div className="social-chat-empty"><MessageCircle size={25}/><strong>{loading?(failed?'暂时无法连接':'正在连接冒险者…'):blocked?'还没有加入队伍':'这里还很安静'}</strong><p>{loading?(failed?'连接恢复后将自动更新，请稍后重试。':'聊天记录即将显示在这里。'):blocked?'在社交与组队中寻找队友，开启队伍聊天。':channel==='world'?'打个招呼，或在这里寻找同行的伙伴。':'向队友打个招呼，一起准备下一场冒险。'}</p></div>}
 </div>{unread>0&&<button className="chat-new-messages" onClick={latest}><ArrowDown size={13}/>{unread} 条新消息</button>}</div>;
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
 {tab==='finder'&&<section className="panel finder"><h2>地下城查找器</h2><p>1 坦克 · 1 治疗 · 3 输出。NPC 等级为队长 −1～+3 级；真人满足副本准入等级即可。</p><fieldset disabled={locked}><legend>我的职责</legend><div className="finder-roles">{me.roles.map((role:string)=><button type="button" key={role} aria-pressed={group?.members.find((m:Model)=>m.id===me.id)?.role===role} onClick={()=>void run({type:'role',role})}><span>{role==='tank'?'🛡':role==='healer'?'✚':'⚔'}</span>{roleNames[role]}</button>)}</div></fieldset><label>选择地下城<GameSelect aria-label="查找器地下城" value={dungeonId} onValueChange={setDungeonId} disabled={locked||!canLead}>{data.dungeons.map((d:Model)=><GameSelectOption key={d.id} value={d.id} disabled={d.minimumLevel>me.level}>{d.name} · 最低 {d.minimumLevel} 级</GameSelectOption>)}</GameSelect></label>
 {group?.status==='queued'?<><p role="status">正在寻找队员…附近等级 NPC 将自动补位。</p><Button disabled={busy||!canLead} onClick={()=>void run({type:'cancel'})}>取消匹配</Button></>:group?.status==='proposal'?<p role="status">已找到队伍，请在匹配通知中确认。</p>:<Button disabled={locked||props.busy||!canLead||!group?.members.every((m:Model)=>m.role)} onClick={()=>void enqueue()}>开始匹配</Button>}
 {group?.status==='matched'&&<MatchedDungeon game={props} group={group} dungeon={data.dungeons.find((d:Model)=>d.id===group.dungeonId)}/> }
 <p className="footnote">开始匹配会向世界频道发布招募。真人优先，等待 8 秒后空闲 NPC 自动参与补位。每位玩家自行选择职责，由队长开始匹配；找到队伍后需真人全部确认。候选不足时按当前等级补充持久 NPC，已有角色保留等级与装备。</p></section>}
 {tab==='friends'&&<section className="panel"><h2>好友</h2>{data.friends.map(row)}{!data.friends.length&&<p>在「寻找玩家」或「NPC 玩家」中添加好友。</p>}</section>}
 {tab==='players'&&<section className="panel"><h2>寻找玩家</h2><form className="filterbar" onSubmit={async e=>{e.preventDefault();setPlayers(await search(query));}}><input aria-label="搜索玩家" value={query} maxLength={40} onChange={e=>setQuery(e.target.value)} placeholder="角色名称或角色编号"/><Button type="submit" disabled={!query.trim()}>查找</Button></form>{players.map(row)}</section>}
 {tab==='npcs'&&<section className="panel"><h2>附近等级 NPC 玩家</h2>{!data.npcs.length&&<Button disabled={props.busy} onClick={()=>void initNpcs()}>认识同行的 NPC 玩家</Button>}{data.npcs.map(row)}</section>}
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
