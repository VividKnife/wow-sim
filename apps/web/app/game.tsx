"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import World from './world';
import Character from './character';
import CharacterPicker from './character-picker';
import DungeonPage from './dungeon-page';
import Battle from './battle';
import LootWindow from './loot-window';
import Party from './party';
import JourneyActivity from './journey-activity';
import JourneyLog from './journey-log';
import ZoneMusic from './zone-music';
import AccountControls from './account-controls';
import UnstuckControl from './unstuck-control';
import PlayerHud from './player-hud';
import {BookOpen,Map as MapIcon,Castle,UserRound,UsersRound} from 'lucide-react';
import {createCommandQueue} from '@/lib/command-queue.js';
import {readGameResponse,responseMatchesSelection,mergeGameResponse} from '@/lib/game-response.js';
import {buildCreateCommand,classOptions,racesForClass,raceOptions} from './class-options.js';
import {createSnapshotPoller} from '@/lib/snapshot-poller.js';
import {combatPollDelay} from '@/lib/combat-playback.js';
const factionName=(faction:string)=>faction==='Horde'?'部落':'联盟';
const contentCache=new Map<string,Promise<any>>();
function loadContent(version:string){
 let pending=contentCache.get(version);
 if(!pending){pending=fetch(`/api/game/content?version=${encodeURIComponent(version)}`).then(async response=>{if(!response.ok)throw new Error('游戏内容暂时无法加载，请稍后重试。');const content:any=await response.json();if(content?.contentVersion!==version)throw new Error('游戏内容版本不匹配，请刷新页面。');return content;}).catch(error=>{contentCache.delete(version);throw error;});contentCache.set(version,pending);}
 return pending;
}
export default function Game(){
 const [activeTab,setActiveTab]=useState('world');
 const [characterSection,setCharacterSection]=useState('装备与背包');
 const [connectionError,setConnectionError]=useState('');
 const[name,setName]=useState('星落'),[classId,setClassId]=useState(8),[raceId,setRaceId]=useState(1),[game,setGame]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[signedIn,setSignedIn]=useState(true),[selectedCharacter,setSelectedCharacter]=useState('');const [battleOpen,setBattleOpen]=useState(false);const manualPending=useRef(0),lastRevision=useRef(-1),selectedCharacterRef=useRef('');
 const acceptedResponse=useRef<any>(null),combatPolling=useRef(false),playbackRef=useRef<any>(null);
 combatPolling.current=!!game?.state?.combat&&battleOpen;playbackRef.current=game?.playback;
 const apply=useCallback(async(data:any)=>{const expected=selectedCharacterRef.current;if(!responseMatchesSelection(data,expected,lastRevision.current))return false;const content=await loadContent(data.contentVersion);if(!responseMatchesSelection(data,selectedCharacterRef.current,lastRevision.current))return false;const actorId=data.snapshot?.player?.id||'';if(!selectedCharacterRef.current&&actorId){selectedCharacterRef.current=actorId;setSelectedCharacter(actorId);}const merged=mergeGameResponse(acceptedResponse.current,data);if(!merged)return false;acceptedResponse.current=merged;lastRevision.current=data.revision;setGame({...merged,state:merged.snapshot?.player||null,view:merged.snapshot?{...content,...merged.snapshot.view}:null});return true;},[]);
 const pollEtags=useRef(new Map<string,string>());
 const queue=useRef<ReturnType<typeof createCommandQueue>|null>(null);
 if(!queue.current)queue.current=createCommandQueue(async(command:any)=>{const response=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});await apply(await readGameResponse(response));return true;});
 const send=useCallback(async(body:any)=>{manualPending.current++;setBusy(true);setError('');try{const characterId=selectedCharacterRef.current;const success=await queue.current!({...body,...(characterId?{characterId}:{}),requestId:crypto.randomUUID()});if(success)setConnectionError('');if(success&&body.type==='enterDungeon')setActiveTab('dungeon');if(success&&(body.type==='hunt'||body.type==='useQuestItem'&&body.id===7308))setBattleOpen(true);return success;}catch(e:any){if(e.status===401){setSignedIn(false);setConnectionError('');setError('');return false;}setError(e.status===undefined?'连接失败，请稍后重试。':e.message);return false;}finally{manualPending.current--;setBusy(manualPending.current>0);}},[]);
 useEffect(()=>{let cancelled=false;fetch('/api/game').then(readGameResponse).then(d=>cancelled?false:apply(d)).catch(e=>{if(cancelled)return;if(e.status===401)setSignedIn(false);else setError(e.status===undefined?'连接失败，请稍后重试。':e.message);}).finally(()=>!cancelled&&setLoading(false));return()=>{cancelled=true}},[apply]);
 const selectCharacter=useCallback(async(characterId:string)=>{if(!characterId||characterId===selectedCharacterRef.current)return;pollEtags.current.clear();selectedCharacterRef.current=characterId;setSelectedCharacter(characterId);lastRevision.current=-1;setBusy(true);setError('');try{const response=await fetch(`/api/game?characterId=${encodeURIComponent(characterId)}`);await apply(await readGameResponse(response));}catch(e:any){setError(e.status===undefined?'连接失败，请稍后重试。':e.message);}finally{setBusy(false);}},[apply]);
 useEffect(()=>{
  if(!game?.state||!signedIn)return;
  let cancelled=false;
  const poller=createSnapshotPoller({
   delay:()=>combatPollDelay(playbackRef.current,combatPolling.current),
   isVisible:()=>document.visibilityState==='visible',
   request:async(signal:AbortSignal)=>{
    const characterId=selectedCharacterRef.current;
    const hasBaseline=acceptedResponse.current?.snapshot?.player?.id===characterId;
    const scope=combatPolling.current&&hasBaseline?'combat':'full',key=`${characterId}:${scope}`;
    const etag=pollEtags.current.get(key),query=new URLSearchParams({...(characterId?{characterId}:{}),scope});
    const response=await fetch(`/api/game?${query}`,{signal,headers:etag?{'If-None-Match':etag}:{}});
    if(cancelled||signal.aborted)return;
    if(response.status!==304){
     const data=await readGameResponse(response);if(cancelled||signal.aborted)return;
     const accepted=await apply(data),nextTag=response.headers.get('etag');
     if(accepted&&nextTag)pollEtags.current.set(key,nextTag);
     if(!accepted&&data.scope==='combat'&&data.contentVersion!==acceptedResponse.current?.contentVersion){
      const full=await readGameResponse(await fetch(`/api/game?${new URLSearchParams({characterId})}`,{signal}));
      if(!cancelled&&!signal.aborted)await apply(full);
     }
    }
   },
   onError:(e:any)=>{if(!cancelled)setConnectionError(!e?'':e.status===401?'登录已过期，请重新登录。':'暂时无法同步，正在重试。恢复连接后会更新进度。');},
  });
  const visible=()=>{if(document.visibilityState==='visible')void poller.refresh();};
  document.addEventListener('visibilitychange',visible);
  return()=>{cancelled=true;poller.stop();document.removeEventListener('visibilitychange',visible);};
 },[!!game?.state,signedIn,selectedCharacter,battleOpen,apply]);

 const lastDungeonBattle=useRef<string|null>(null);
 useEffect(()=>{const b=game?.state?.combat,key=b?.dungeon?`${b.runId}:${b.startedAt}`:null;if(key&&key!==lastDungeonBattle.current)setBattleOpen(true);lastDungeonBattle.current=key;},[game?.state?.combat?.runId,game?.state?.combat?.startedAt,!!game?.state?.combat]);
 const s=game?.state,d=game?.view,props={state:s,data:d,busy,revision:game?.revision,playback:game?.playback,contentVersion:game?.contentVersion,send};const labels:any={classChannel:'引导职业技能',classSpell:'施放职业技能',mount:'召唤坐骑',escortMove:'跟随迪菲亚叛徒',teleport:'传送中',hearth:'炉石返回中',dungeonCannon:'点燃火炮',resurrect:'复活队友',idle:'等待行动',hunt:s?.combat?'战斗中':s?.rest?'补给恢复':'自动狩猎',travel:'旅行中',conjure:'制造补给',professionGather:'自动采集资源',gather:'调查中',questItem:'使用任务物品',dead:'角色已死亡',revive:'返回尸体'};
 const availableRaces=racesForClass(classId),selectedClass=classOptions.find(option=>option.id===classId)!,selectedRace=raceOptions.find(option=>option.id===raceId)||availableRaces[0];
 const journeyOverview=s&&d?<JourneyActivity {...props} activityLabel={labels[s.activity.type]||s.activity.type} onObserve={()=>setBattleOpen(true)}/>:null;
 return <main className={'game-shell '+(s&&d?'journey-shell':'')}>
 {(!s||!d)&&<header className="masthead"><a href="/" className="wordmark">WOW<span>SIM</span></a><span className="edition">经典旧世 · 2019 / 第一阶段</span><span className="online-dot">{signedIn?'云端存档':'等待登录'}</span></header>}
 {(!s||!d)?<section className="arrival"><div className="eyebrow">第一章 / 共同的起点</div><h1>选择你的道路，<br/><em>从北郡启程。</em></h1><p>九种经典职业与八个可玩种族，都在同一张北郡冒险地图中展开。<br/>这是清晰的二维改编，不代表各族原生出生区域已实现。</p><div className="creation panel"><div className="identity-crest" aria-hidden="true">{selectedClass.name.slice(0,1)}</div><div><h2>{selectedRace.name} · {selectedClass.name}</h2><p>{factionName(selectedRace.faction)} · 共享北郡地图 · 等级 1</p></div><div className="creation-selects"><label>职业<select aria-label="职业" value={classId} onChange={e=>{const next=Number(e.target.value),races=racesForClass(next);setClassId(next);if(!races.some(r=>r.id===raceId))setRaceId(races[0].id);}}>{classOptions.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}</select></label><label>种族<select aria-label="种族" value={selectedRace.id} onChange={e=>setRaceId(Number(e.target.value))}>{availableRaces.map(option=><option key={option.id} value={option.id}>{option.name} · {factionName(option.faction)}</option>)}</select></label></div><label>角色名字<input aria-label="角色名字" maxLength={16} value={name} onChange={e=>setName(e.target.value)}/></label>{signedIn?<Button disabled={busy||loading||!name.trim()} onClick={()=>send(buildCreateCommand(name,classId,selectedRace.id))}>{loading?'读取存档…':'踏入艾泽拉斯 →'}</Button>:<Button asChild><a href="/login">登录并开始冒险 →</a></Button>}</div><div className="creation-notes"><span>01 九种经典职业</span><span>02 合法种族组合</span><span>03 共享北郡改编</span></div></section>:
 <Tabs value={activeTab} onValueChange={setActiveTab} className="game-tabs adventure-tabs"><aside className="journey-rail"><a href="/" className="rail-brand"><span className="rail-sigil"><MapIcon size={21}/></span><span><strong>WOW SIM</strong><small>经典旧世 · 第一阶段</small></span></a><span className="rail-section">冒险</span><TabsList className="main-nav"><TabsTrigger value="world"><MapIcon/>世界</TabsTrigger><TabsTrigger value="character"><UserRound/>角色</TabsTrigger><TabsTrigger value="party"><UsersRound/>队伍</TabsTrigger><TabsTrigger value="dungeon"><Castle/>地下城</TabsTrigger><TabsTrigger value="log"><BookOpen/>战报</TabsTrigger></TabsList><ZoneMusic location={d.location} dungeon={!!s.dungeon} active={signedIn}/></aside><div className="journey-content">{!signedIn&&<section className="activity-strip" role="alert"><span>登录已过期，请重新登录以继续冒险。</span><Button asChild><a href="/login">重新登录 →</a></Button></section>}{signedIn&&connectionError&&<div className="activity-strip" role="status">{connectionError}</div>}{activeTab!=='world'&&<><PlayerHud state={s} data={d}/>{journeyOverview}</>}{(s.combat||s.lastCombat)&&<Battle {...props} canLead={!game.instance||game.instance.leaderId===s.id} open={battleOpen} onOpenChange={setBattleOpen}/>}<TabsContent value="world"><World {...props} overview={journeyOverview} onOpenDungeon={()=>setActiveTab('dungeon')}/></TabsContent><TabsContent value="character">{game.roster?.length>1&&<section className="panel"><CharacterPicker roster={game.roster} value={selectedCharacter||s.id} disabled={busy} onChange={id=>void selectCharacter(id)}/></section>}<Character key={s.id} {...props} section={characterSection} onSectionChange={setCharacterSection}/></TabsContent><TabsContent value="party"><Party {...props}/></TabsContent><TabsContent value="dungeon"><DungeonPage {...props} onOpenParty={()=>setActiveTab('party')} onConfigure={()=>{setCharacterSection('策略');setActiveTab('character');}}/></TabsContent><TabsContent value="log"><JourneyLog {...props} onObserve={()=>setBattleOpen(true)}/></TabsContent>
 <details className="panel account-drawer"><summary><span>角色与后台活动</span><small>管理角色、组队与后台生产 · 点击展开</small></summary> {<section className="panel account-overview" aria-label="账号角色与活动"><div className="section-heading"><div><div className="eyebrow">账号队伍</div><h2>账号队伍</h2></div>{game.roster?.length>1&&<CharacterPicker label="当前角色" roster={game.roster} value={selectedCharacter||s.id} disabled={busy} onChange={id=>void selectCharacter(id)}/>}</div>{game.activities?.length>0&&<div className="activity-roster">{game.activities.map((activity:any)=>{const actor=game.roster?.find((member:any)=>member.id===activity.actorId);return <div key={activity.id}><strong>{actor?.name||activity.actorId}</strong><span>{activity.type} · {activity.status}{activity.location?` · ${activity.location}`:''}</span>{activity.nextEventAt&&<small>下次结算 {new Date(activity.nextEventAt).toLocaleTimeString()}</small>}{['craft','gather'].includes(activity.type)&&['running','returning'].includes(activity.status)&&<Button size="sm" variant="outline" disabled={busy||activity.status==='returning'} onClick={()=>send({type:'recall',activityId:activity.id})}>{activity.status==='returning'?'召回中':'召回'}</Button>}</div>})}</div>}</section>}
  <AccountControls game={game} busy={busy} send={send}/>
</details>
<UnstuckControl key={s.id} busy={busy} send={send}/>
<footer className="site-footer"><span>1—60 级 · 九职业经典旅程</span><span>共享北郡地图 · 社区经典数据参考 · 2D 冒险改编</span></footer></div></Tabs>}
{s&&signedIn&&(!game.instance||game.instance.leaderId===s.id)&&<LootWindow key={`${s.id}:${s.lastCombat?.id||'pending'}`} {...props}/>}
{error&&<div className="error toast" role="alert">{error}<button aria-label="关闭提示" onClick={()=>setError('')}>×</button></div>}</main>
}
