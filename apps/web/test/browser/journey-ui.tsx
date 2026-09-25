/* eslint-disable @next/next/no-img-element -- This Vite preview serves local Classic assets. */
import React,{useCallback,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {createRoot} from 'react-dom/client';
import {Dialog} from 'radix-ui';
import {ArrowRight,Check,ChevronDown,MapPin,Pause,Play,RotateCcw,Search,X} from 'lucide-react';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import {meterRows} from '../../../../packages/sim-core/src/combat-meter.js';
import {nextQuestAction} from './journey-ui-actions.mjs';
import WorldScene from '../../app/world-scene';
import CreaturePortrait from '../../app/creature-portrait';
import DamageMeter from '../../app/damage-meter';
import {ItemDisplay,type GameProps} from '../../app/game-ui';
import {GameSelect,GameSelectOption} from '../../components/ui/game-select';
import '../../app/globals.css';
import './journey-ui.css';

type Model=GameProps['data'];
type Command={type:string;[key:string]:unknown};
type Objective={kind:string;id:number;name:string;count:number;required:number;locations:string[]};
type Quest={id:number;name:string;giver:string;level:number;description:string;details:string;xp:number;money:number;active:boolean;complete:boolean;completed:boolean;canAccept:boolean;canTurnIn:boolean;objectives:Objective[];choices:{id:number;count:number}[];rewards:{id:number;count:number}[];navigation?:{to:string;here:boolean}|null};
type Node={id:string;name:string;region:string;travel:number};
type Unit={id:string;name:string;classId:number;hp:number;mana:number;level:number;role?:string;stats?:{maxHp:number;maxMana:number}};
type Npc={key:string;entry:number;name:string;roles:string[];accepts:number[];turnIns:number[]};
const content=clientContent();
const names:Record<number,string>={1:'战士',4:'盗贼',5:'牧师',8:'法师',9:'术士'};
const colors:Record<number,string>={1:'#c69b6d',4:'#e2ce72',5:'#ddd8c9',8:'#67b8d0',9:'#aa95d0'};
const menus=[['nearby','附近人物','spell_holy_magicalsentry'],['quests','任务日志','inv_misc_book_09'],['map','区域地图','inv_misc_map_01'],['character','角色背包','inv_helmet_03'],['party','小队','spell_holy_prayerofhealing'],['report','战报','inv_sword_04']];
const percent=(n:number,max:number)=>Math.max(0,Math.min(100,100*n/Math.max(1,max)));
const number=(n:number)=>Math.round(n).toLocaleString('en-US');
const seconds=(ms:number)=>`${Math.max(0,Math.ceil(ms/1000))} 秒`;
function Icon({name}:{name:string}){return <img className="j-icon" src={`/icons/assets/${name}.png`} alt=""/>;}
function Bar({value,max,label,tone='health'}:{value:number;max:number;label:string;tone?:string}){return <div className={`j-bar ${tone}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}><i style={{width:percent(value,max)+'%'}}/><span>{label} {number(value)} / {number(max)}</span></div>;}

function useJourney(){
 const [snapshot,setSnapshot]=useState<{player:Model;view:Model}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[paused,setPaused]=useState(false),[speed,setSpeed]=useState(1);
 const worker=useRef<Worker|null>(null),sequence=useRef(0),pending=useRef(new Map<number,{resolve:(ok:boolean)=>void;timer:ReturnType<typeof setTimeout>}>());
 useEffect(()=>{
  const instance=new Worker(new URL('./journey-ui.worker.ts',import.meta.url),{type:'module'});worker.current=instance;
  const requests=pending.current;
  instance.onmessage=event=>{const m=event.data;if(m.snapshot)setSnapshot(m.snapshot);if(m.paused!==undefined)setPaused(m.paused);if(m.speed)setSpeed(m.speed);
   if(m.error)setError(m.error);
   if(m.requestId){const request=requests.get(m.requestId);if(request){clearTimeout(request.timer);request.resolve(!m.error);requests.delete(m.requestId);}setBusy(requests.size>0);if(!m.error)setError('');if(m.result)setNotice(m.result);}
  };
  instance.onerror=()=>{setError('模拟暂不可用，请重新加载页面。');for(const p of requests.values()){clearTimeout(p.timer);p.resolve(false);}requests.clear();setBusy(false);};
  const visibility=()=>instance.postMessage({type:'visibility',active:!document.hidden});visibility();document.addEventListener('visibilitychange',visibility);
  return()=>{instance.terminate();worker.current=null;document.removeEventListener('visibilitychange',visibility);for(const p of requests.values()){clearTimeout(p.timer);p.resolve(false);}requests.clear();};
 },[]);
 const request=useCallback((type:string,extra:Record<string,unknown>={}):Promise<boolean>=>{
  if(!worker.current||pending.current.size)return Promise.resolve(false);
  setBusy(true);setError('');setNotice('');const requestId=++sequence.current;
  return new Promise(resolve=>{const timer=setTimeout(()=>{pending.current.delete(requestId);setBusy(false);setError('操作响应超时。请等待状态同步后再试。');resolve(false);},15000);pending.current.set(requestId,{resolve,timer});worker.current!.postMessage({type,requestId,...extra});});
 },[]);
 return {snapshot,busy,error,notice,paused,speed,request,clearFeedback:()=>{setError('');setNotice('');},send:(action:Command)=>request('action',{action})};
}
function Journey(){
 const game=useJourney();
 const [selected,setSelected]=useState(7),[panel,setPanel]=useState<string|null>(null),[query,setQuery]=useState(''),[stress,setStress]=useState(false);
 const returnFocus=useRef<HTMLElement|null>(null);
 const openPanel=(id:string)=>{game.clearFeedback();returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setQuery('');setPanel(id);};
 const data=useMemo(()=>game.snapshot?{...content,...game.snapshot.view}:null,[game.snapshot]);
 if(!game.snapshot||!data)return <main className="j-app j-loading"><span className="j-quest-mark">!</span><p role={game.error?'alert':'status'}>{game.error||'正在准备北郡的旅程…'}</p>{game.error&&<button className="j-button" onClick={()=>location.reload()}>重新加载</button>}</main>;
 const s=game.snapshot.player,d:Model=data;
 const quests:Quest[]=d.quests,quest=quests.find(q=>q.id===selected)||quests.find(q=>q.id===7);
 const action=nextQuestAction(s,quest,d.map);
 const fighting=!!s.combat,battle=s.combat||s.lastCombat;
 const moving=s.activity.type==='travel',castingMount=s.activity.type==='mount';
 const available=quests.filter(q=>q.active||q.canAccept||q.completed);
 const units:Unit[]=[{...s,stats:d.stats},...d.party];
 const rows=meterRows(battle,s.clock);
 const activeQuests=quests.filter(q=>q.active);
 const destination=d.map.find((n:Node)=>n.id===s.activity.to)?.name;
 const nextDestination=quest?.navigation&&d.map.find((n:Node)=>n.id===quest.navigation?.to)?.name;
 const stateLabel=game.paused?'试玩已暂停':fighting?'战斗中':castingMount?'召唤坐骑':moving?'旅行中':s.rest?'恢复中':s.hp<=0?'已倒下':s.activity.type==='hunt'?'自动狩猎':'休息中';
 const owned=d.mounts?.collection.find((m:Model)=>m.owned&&m.canMount);
 const canInteract=!game.busy&&!fighting&&s.hp>0&&['idle','hunt'].includes(s.activity.type);
 const phase=quest?.completed?4:quest?.complete?3:quest?.active?quest.objectives.some(o=>o.count>0)||s.location===quest.objectives[0]?.locations[0]?2:1:0;
 const displayName=(name:string)=>stress?`${name} · 星辰与远山之间的漫游者`:name;
 const statusText=moving?`正在前往${destination||'目的地'} · 剩余 ${seconds(s.activity.endsAt-s.clock)}`:castingMount?`准备出发 · 召唤坐骑剩余 ${seconds(s.activity.endsAt-s.clock)}`:s.activity.reason||(fighting?'队伍按已保存策略自动战斗。':s.rest?'恢复生命与法力后继续狩猎。':s.activity.type==='hunt'?'正在准备下一场战斗，完成目标后自动停止。':'选择一项委托，开始下一段旅程。');
 const group=(compact=false)=><div className={`j-party ${compact?'compact':''}`}>{units.map(u=><div className="j-unit" key={u.id} style={{'--class-color':colors[u.classId]} as CSSProperties}><span className="j-class">{names[u.classId]?.slice(0,1)||'友'}</span><div><span><b>{displayName(u.name)}</b><small>{u.role||'远程输出'}</small></span><div className="j-unit-hp"><i style={{width:percent(u.hp,u.stats?.maxHp||1)+'%'}}/></div></div><em>{Math.round(percent(u.hp,u.stats?.maxHp||1))}%</em></div>)}</div>;
 const report=()=>battle?<DamageMeter battle={battle} dungeon={s.dungeon} clock={s.clock} skills={d.combatSkills||d.skills}/>:<div className="j-empty"><Icon name="inv_sword_04"/><p>还没有战斗记录</p><small>接受委托，抵达目标区域并开始狩猎后，这里显示真实技能伤害。</small></div>;
 return <main className="j-app">
  <div className="j-core">
   <section className="j-adventure" aria-label="世界与当前活动">
    <div className={`j-scene ${fighting?'fighting':''}`}>
     <WorldScene state={s} data={d} busy={game.busy} send={game.send} animationPaused={game.paused}/>
     <button className="j-player" onClick={()=>openPanel('character')} aria-label="打开角色状态"><img src="/interface/classic/characterframe/temporaryportrait-female-human.png" alt=""/><div><strong>{displayName(s.name)} <small>{s.level} 级</small></strong><Bar label="生命" value={s.hp} max={d.stats.maxHp}/><Bar label="法力" value={s.mana} max={d.stats.maxMana} tone="mana"/></div></button>
     <div className="j-location"><span><MapPin size={13}/>{d.location.region}</span><h1>{d.location.name}</h1><small>{fighting?'当前区域遭遇战':'森林地区氛围示意'}</small></div>
     <aside className="j-party-hud" aria-label="小队生命状态">{group(true)}</aside>
     {fighting&&<aside className="j-dps-hud"><header><span>小队 DPS</span><b>{number(rows.reduce((n,r)=>n+r.dps,0))}</b></header>{rows.slice(0,3).map(r=><div key={r.actorId}><span style={{color:colors[r.classId]}}>{r.name}</span><b>{number(r.dps)}</b></div>)}<button onClick={()=>openPanel('report')}>查看完整战报 <ArrowRight size={12}/></button></aside>}
     {!fighting&&<div className="j-traveler"><span>{displayName(s.name)}</span><small>{s.mounted?'骑乘中':moving?'步行赶路':'人类 · 法师'}</small></div>}
     <div className="j-scene-tools"><button onClick={()=>openPanel('map')}><Icon name="inv_misc_map_01"/>区域地图</button><button disabled={game.busy||castingMount||s.activity.type==='hunt'||(s.mounted?!d.mounts.canDismount:!owned)} title={fighting?'战斗中不能骑乘':s.activity.type==='hunt'?'请先停止自动狩猎':castingMount?'正在召唤坐骑':s.mounted?d.mounts.dismountReason:owned?'召唤已拥有的旅行棕马':'当前状态不可骑乘'} onClick={()=>void game.send(s.mounted?{type:'dismount'}:{type:'mount',id:owned.id})}><Icon name="ability_mount_ridinghorse"/>{castingMount?'召唤中…':s.mounted?'下马':'骑马'}</button></div>
    </div>
    <div className="j-activity" aria-label="当前活动"><div><span className={`j-dot ${fighting?'danger':''}`}/><b>{stateLabel}</b>{game.paused&&<button className="j-resume" onClick={()=>void game.request('pause')}>继续模拟</button>}<span>{statusText}</span></div>{(moving||castingMount)&&<progress aria-label="旅程进度" max={100} value={percent(s.clock-s.activity.startedAt,s.activity.endsAt-s.activity.startedAt)}/>}<small>经验 {number(s.xp)} / {number(d.nextXp)}<i><em style={{width:percent(s.xp,d.nextXp)+'%'}}/></i></small></div>
    <nav className="j-menu" aria-label="游戏功能">{menus.map(([id,name,icon])=><button key={id} onClick={()=>openPanel(id)} aria-haspopup="dialog"><Icon name={icon}/><span>{name}</span>{id==='quests'&&activeQuests.length>0&&<small>{activeQuests.length}</small>}</button>)}</nav>
   </section>
   <aside className="j-quest-panel" aria-label="当前委托">
    <header><span><Icon name="inv_misc_book_09"/>当前委托</span><button onClick={()=>openPanel('quests')}>切换 <ChevronDown size={13}/></button></header>
    <div className="j-parchment">
     <div className="j-quest-meta"><span className="j-quest-mark">{quest?.completed?'✓':quest?.complete?'?':'!'}</span><div><small>{quest?.completed?'已交付':quest?.complete?'等待交付':quest?.active?'正在追踪':'可接取'} · 等级 {quest?.level}</small><h2>{quest?displayName(quest.name):'暂无委托'}</h2></div></div>
     {quest?<><p className="j-brief">{quest.description}</p><ol className="j-steps" aria-label="任务阶段">{['接受','前往','完成目标','交付'].map((step,i)=><li key={step} className={phase>i?'done':phase===i?'current':''} aria-current={phase===i?'step':undefined}><span>{phase>i?<Check size={12}/>:i+1}</span>{step}</li>)}</ol>
      <section className="j-objectives"><h3>{quest.completed?'已完成目标':'任务目标'}</h3>{quest.objectives.length?quest.objectives.map(o=><div key={o.kind+o.id}><div><b>{displayName(o.name)}</b><strong>{quest.completed?o.required:Math.min(o.count,o.required)} <span>/ {o.required}</span></strong></div><progress aria-label={o.name} value={quest.completed?o.required:Math.min(o.count,o.required)} max={o.required}/><small>{o.locations.map(id=>d.map.find((n:Node)=>n.id===id)?.name).filter(Boolean).join('、')}</small></div>):<p>与指定人物交谈。</p>}</section>
      <div className="j-giver"><span>交付给</span><b>{quest.giver}</b><small>{quest.completed?'已向委托人领取报酬':quest.complete?nextDestination||d.location.name:'完成目标后返回委托人'}</small></div>
      <div className="j-reward"><span>任务报酬</span><b>{quest.xp} <small>经验</small></b>{quest.money>0&&<b>{quest.money} <small>铜币</small></b>}</div>
      {(quest.choices.length>0||quest.rewards.length>0)&&<p className="j-reward-note">{quest.choices.length>0?`${quest.choices.length} 件可选装备奖励；本轮尚未接通选奖交付。`:`另有 ${quest.rewards.length} 项物品奖励。`}</p>}
      <div className="j-primary"><button className="j-button primary" disabled={game.busy||!action.command} onClick={()=>action.command&&void game.send(action.command)}>{game.busy?'正在处理…':action.label}{!game.busy&&action.command&&<ArrowRight size={16}/>}</button><p>{action.reason}</p></div>
      <details className="j-quest-text"><summary>阅读委托原文</summary><p>{quest.details}</p></details>
     </>:<div className="j-empty"><p>暂无任务可显示</p><button className="j-button" onClick={()=>openPanel('nearby')}>查看附近人物</button></div>}
    </div>
    <div className={`j-feedback ${game.error?'error':game.notice?'success':''}`} role={game.error?'alert':'status'}>{game.error||game.notice||(game.busy?'正在等待操作结果…':'任务与战斗进度会自动更新。')}</div>
   </aside>
  </div>
  <div className="j-below"><section className="j-journal" aria-label="近期旅程"><header><h2>刚刚发生</h2><button onClick={()=>openPanel('report')}>完整战报 <ArrowRight size={13}/></button></header><div>{s.logs.slice(-5).reverse().map((log:{id:string;at:number;text:string;kind:string})=><p key={log.id} className={log.kind==='quest'?'quest':''}><time>{Math.floor(log.at/60000)}:{String(Math.floor(log.at/1000)%60).padStart(2,'0')}</time><span>{log.text}</span></p>)}</div></section><section className="j-report" aria-label="详细战斗统计">{report()}</section></div>
  {s.pending.length>0&&<section className="j-loot"><span>有 {s.pending.length} 格战利品待拾取 · 背包 {s.bag.length}/{d.bagCapacity}</span><button className="j-button" disabled={!canInteract} onClick={()=>void game.send({type:'loot',uids:s.pending.map((i:{uid:string})=>i.uid)})}>全部拾取</button></section>}
  <details className="j-preview-tools"><summary>试玩说明与验收工具</summary><p>V2 只重做世界任务核心界面。20级预设五人队伍，已完成北郡介绍任务；任务数值与后续操作均由真实引擎结算。任务7用于完整流程验证。刷新重置，不读写正式存档。</p><div><a href="/classic-ui.html">打开保留的 V1</a><button disabled={game.busy} onClick={()=>void game.request('pause')}>{game.paused?<Play size={14}/>:<Pause size={14}/>} {game.paused?'继续模拟':'暂停模拟'}</button><label>试玩速度 <GameSelect aria-label="试玩速度" value={game.speed} onValueChange={v=>void game.request('speed',{speed:Number(v)})} disabled={game.busy}><GameSelectOption value={1}>1× 实时</GameSelectOption><GameSelectOption value={4}>4× 流程验证</GameSelectOption></GameSelect></label><button disabled={game.busy} onClick={()=>{setSelected(7);void game.request('reset');}}><RotateCcw size={14}/>重置试玩</button><label><input type="checkbox" checked={stress} onChange={e=>setStress(e.target.checked)}/>长名称排版样例（仅改变展示文案）</label><button disabled={!canInteract} onClick={()=>void game.send({type:'travel',to:s.location})}>验证失败反馈：重复前往当前位置</button></div><p>地下城、团本、PvP、经济和正式联网状态本轮尚未改造。自动拾取已开启。暂停/4×速度是试玩工具，不是正式玩法。</p></details>
  <Dialog.Root open={!!panel} onOpenChange={open=>{if(!open)setPanel(null);}}><Dialog.Portal><Dialog.Overlay className="j-overlay"/><Dialog.Content className="j-dialog" onCloseAutoFocus={event=>{event.preventDefault();returnFocus.current?.focus();}}><header><Icon name={menus.find(m=>m[0]===panel)?.[2]||'inv_misc_book_09'}/><div><Dialog.Title>{menus.find(m=>m[0]===panel)?.[1]}</Dialog.Title><Dialog.Description>{d.location.name} · {stateLabel}</Dialog.Description></div><Dialog.Close aria-label="关闭窗口"><X size={19}/></Dialog.Close></header><div className="j-dialog-body">
   {['quests','nearby','map'].includes(panel||'')&&<label className="j-search"><Search size={16}/><input aria-label="筛选当前列表" placeholder="输入名称筛选…" value={query} onChange={e=>setQuery(e.target.value)}/></label>}
   {panel==='quests'&&<>{available.filter(q=>q.name.includes(query)).map(q=><button key={q.id} className={`j-list-row ${q.id===quest?.id?'selected':''}`} aria-pressed={q.id===quest?.id} onClick={()=>{setSelected(q.id);setPanel(null);}}><span className="j-quest-mark">{q.completed?'✓':q.complete?'?':q.active?'◇':'!'}</span><span><b>{displayName(q.name)}</b><small>{q.giver} · {q.completed?'已交付':q.active?'进行中':'可接取'}</small></span><ArrowRight size={15}/></button>)}{!available.some(q=>q.name.includes(query))&&<div className="j-empty"><p>没有匹配的任务</p><button className="j-button" onClick={()=>setQuery('')}>清除筛选</button></div>}</>}
   {panel==='nearby'&&<>{d.interactions.filter((npc:Npc)=>npc.name.includes(query)).map((npc:Npc)=>{const ids=[...npc.accepts,...npc.turnIns];return <section className="j-npc" key={npc.key}><div><CreaturePortrait unit={{entry:npc.entry}}/><div><b>{displayName(npc.name)}</b><small>{npc.roles.includes('quests')?'任务人物':'当地服务'}</small></div></div>{ids.length?ids.map(id=>{const q=quests.find(q=>q.id===id);return q&&<button className="j-list-row" key={id} onClick={()=>{setSelected(id);setPanel(null);}}><span className="j-quest-mark">{q.complete?'?':'!'}</span><span>{q.name}</span><ArrowRight size={14}/></button>;}):<p>暂无可接取委托。{npc.roles.includes('quests')?'':'服务界面本轮尚未改造。'}</p>}</section>;})}{!d.interactions.some((npc:Npc)=>npc.name.includes(query))&&<div className="j-empty"><p>没有匹配的人物</p><button className="j-button" onClick={()=>setQuery('')}>清除筛选</button></div>}</>}
   {panel==='map'&&<><p className="j-note">当前：{d.location.name}。选择目的地后按真实路线旅行。</p>{d.map.filter((n:Node)=>n.region===d.location.region&&n.name.includes(query)).map((n:Node)=><button key={n.id} className={`j-list-row ${n.id===s.location?'selected':''}`} disabled={game.busy||fighting||s.hp<=0||(!['idle','hunt','travel'].includes(s.activity.type))||n.id===s.location||!Number.isFinite(n.travel)} onClick={async()=>{if(await game.send({type:'travel',to:n.id}))setPanel(null);}}><MapPin size={17}/><span><b>{displayName(n.name)}</b><small>{n.id===s.location?'当前位置':Number.isFinite(n.travel)?`预计 ${seconds(n.travel)}`:'当前不可抵达'}</small></span><ArrowRight size={15}/></button>)}{!d.map.some((n:Node)=>n.region===d.location.region&&n.name.includes(query))&&<div className="j-empty"><p>没有匹配的地点</p><button className="j-button" onClick={()=>setQuery('')}>清除筛选</button></div>}</>}
   {panel==='character'&&<><div className="j-character"><h3>{displayName(s.name)}</h3><p>{s.level} 级 · {d.raceName} {d.className}</p><Bar label="生命" value={s.hp} max={d.stats.maxHp}/><Bar label="法力" value={s.mana} max={d.stats.maxMana} tone="mana"/></div><h3 className="j-subtitle">背包 · {s.bag.length}/{d.bagCapacity}</h3><p className="j-note">本轮角色窗口展示实际属性、背包与物品说明，换装流程尚未改造。</p>{s.bag.length?s.bag.map((i:{uid:string;id:number;count:number})=><div className="j-item" key={i.uid}><ItemDisplay item={d.items[i.id]||{name:`物品 ${i.id}`}} instance={i}/><span>× {i.count}</span></div>):<div className="j-empty">背包为空，战斗后可获得物品。</div>}</>}
   {panel==='party'&&<><p className="j-note">当前五人小队 · 1 坦克 / 1 治疗 / 3 输出。生命由实时状态更新；招募和策略编辑本轮尚未改造。</p>{group()}</>}
   {panel==='report'&&<>{report()}<div className="j-report-log">{s.logs.slice(-30).reverse().map((l:{id:string;text:string})=><p key={l.id}>{l.text}</p>)}</div></>}
   {game.error&&<p className="j-dialog-error" role="alert">{game.error}</p>}
  </div></Dialog.Content></Dialog.Portal></Dialog.Root>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Journey/>);
