import {connectGameStream,gameStreamUrl} from '@/lib/game-stream';
import {SocialProvider} from './social';
import InputProgress from './input-progress';
import GmGifts from './gm-gifts';
import {saveFetch} from '../lib/save-fetch';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {lazy,Suspense} from 'react';
const World=lazy(()=>import('./world'));
const Character=lazy(()=>import('./character'));
import CharacterPicker from './character-picker';
const DungeonPage=lazy(()=>import('./dungeon-page'));
const RaidPage=lazy(()=>import('./raid-page'));
const Pvp=lazy(()=>import('./pvp'));
const Battle=lazy(()=>import('./battle'));
import {GroupLootPopup} from './group-loot';
import LootWindow from './loot-window';
const Party=lazy(()=>import('./party'));
import JourneyActivity from './journey-activity';
import JourneyLog from './journey-log';
import ZoneMusic from './zone-music';
import AccountControls from './account-controls';
import UnstuckControl from './unstuck-control';
import PlayerHud from './player-hud';
import AmmoRestockDialog from './ammo-restock-dialog';
import {BookOpen,Map as MapIcon,Castle,UserRound,UsersRound,Swords} from 'lucide-react';
import {createInputReceiptTracker,inputReceiptPending} from '@/lib/input-receipts.js';
import {createCommandQueue} from '@/lib/command-queue.js';
import {readGameResponse,responseMatchesSelection,mergeGameResponse,syncErrorMessage} from '@/lib/game-response.js';
import {createSnapshotPoller} from '@/lib/snapshot-poller.js';
import {combatPollDelay} from '@/lib/combat-playback.js';
import {inlineWorldBattle,opensBattleDialog} from '@/lib/battle-presentation.js';
import {playQuestSound} from '@/lib/quest-audio.js';
import DungeonMap from './dungeon-map';
import ClassicGame from './classic-game';
import ExperienceNotifications from './experience-notifications';
import LevelUpNotification from './level-up-notification';
import BuffBar from './buff-bar';
import GameSettings from './game-settings';
import {useInterfaceStyle} from '@/lib/interface-style';
import {webTabForClassic} from '@/lib/classic-interface.js';
import {loadContent} from '@/lib/content-loader.js';
const gameErrorMessage=(error:any)=>error?.status===undefined&&['TypeError','AbortError','TimeoutError'].includes(error?.name)?'连接失败，请稍后重试。':error?.message||'连接失败，请稍后重试。';
export default function Game(){
 const [activeTab,setActiveTab]=useState('world');
 const [interfaceStyle,setInterfaceStyle]=useInterfaceStyle();
 const [classicPanel,setClassicPanel]=useState<string|null>(null);
 const classicActive=useRef(true);
 useEffect(()=>{classicActive.current=interfaceStyle==='classic';},[interfaceStyle]);
 const [characterSection,setCharacterSection]=useState('装备与背包');
 const [connectionError,setConnectionError]=useState('');
 const[game,setGame]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[signedIn,setSignedIn]=useState(true),[selectedCharacter,setSelectedCharacter]=useState('');const [battleOpen,setBattleOpen]=useState(false);const manualPending=useRef(0),lastRevision=useRef(-1),selectedCharacterRef=useRef('');
 const receiptTracker=useRef(createInputReceiptTracker());
 const [waitingForInput,setWaitingForInput]=useState(false);
 useEffect(()=>()=>receiptTracker.current.cancel(),[]);
 const acceptedResponse=useRef<any>(null),combatPolling=useRef(false),playbackRef=useRef<any>(null);
 const inlineBattle=inlineWorldBattle(activeTab,game?.state?.dungeon);
 const inlineBattleRef=useRef(inlineBattle);inlineBattleRef.current=inlineBattle;
 combatPolling.current=!!game?.state?.combat&&(battleOpen||inlineBattle||interfaceStyle==='classic');playbackRef.current=game?.playback;
 const apply=useCallback(async(data:any)=>{
  if(!responseMatchesSelection(data,selectedCharacterRef.current,lastRevision.current,acceptedResponse.current))return false;
  const content=await loadContent(data.contentVersion,data.snapshot);
  if(!responseMatchesSelection(data,selectedCharacterRef.current,lastRevision.current,acceptedResponse.current))return false;
  const actorId=data.snapshot?.player?.id||'';
  const merged=mergeGameResponse(acceptedResponse.current,data);if(!merged)return false;
  if(!selectedCharacterRef.current&&actorId){selectedCharacterRef.current=actorId;setSelectedCharacter(actorId);}
  acceptedResponse.current=merged;lastRevision.current=data.revision;receiptTracker.current.observe(merged);
  const snapshot=merged.snapshot;
  setGame({...merged,state:snapshot?.player||null,view:snapshot?{...content,...snapshot.view}:null});
  return true;
 },[]);
 const streamConnected=useRef(false);
 useEffect(()=>{
  if(!signedIn||!selectedCharacter)return;

  const stream=connectGameStream({url:gameStreamUrl(location.href),characterId:selectedCharacter,onSnapshot:apply,onConnection:connected=>{streamConnected.current=connected;}});
  return()=>stream.close();
 },[signedIn,selectedCharacter,apply]);
 const pollEtags=useRef(new Map<string,string>());
 const queue=useRef<ReturnType<typeof createCommandQueue>|null>(null);
 if(!queue.current)queue.current=createCommandQueue(async(command:any)=>{
  const current=acceptedResponse.current?.execution;
  if(!current||current.actorId!==command.characterId)throw new Error('尚未取得角色执行权，请稍后重试。');
  const execution={instanceId:current.instanceId,controllerGeneration:current.controllerGeneration,clientSequence:current.clientSequence+1};
  const response=await saveFetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...command,execution}),signal:AbortSignal.timeout(15000)});
  try{
   const data=await readGameResponse(response);await apply(data);
   const waiting=receiptTracker.current.wait(data.commandReceipt,data.execution);
   receiptTracker.current.observe(acceptedResponse.current);
   setWaitingForInput(inputReceiptPending(data.commandReceipt));
   try{return await waiting;}finally{setWaitingForInput(false);}
  }
  catch(error){
   // Rejections consume a server input sequence too. Refresh its cursor without
   // retrying an uncertain mutation or letting a queued command reuse it.
   try{await apply(await readGameResponse(await saveFetch(`/api/game?characterId=${encodeURIComponent(command.characterId)}`)));}catch{}
   throw error;
  }
 });
 const getAmmoSnapshot=useCallback(()=>acceptedResponse.current?.snapshot?.player?.id===selectedCharacterRef.current?acceptedResponse.current.snapshot:null,[]);
 const send=useCallback(async(body:any)=>{manualPending.current++;setBusy(true);setError('');try{const characterId=selectedCharacterRef.current;const success=await queue.current!({...body,...(characterId?{characterId}:{}),requestId:crypto.randomUUID()});if(success){setConnectionError('');playQuestSound(body);}if(success&&['enterDungeon','goldLaunch'].includes(body.type)){setActiveTab('world');if(classicActive.current)setClassicPanel(null);}if(success&&classicActive.current&&['hunt','travel','navigateQuest','goldStart','raidStart','dungeonNext','dungeonNavigate','raidNavigate','goldNavigate'].includes(body.type))setClassicPanel(null);if(success&&!classicActive.current&&opensBattleDialog(body,inlineBattleRef.current))setBattleOpen(true);return success;}catch(e:any){if(e.status===401){setSignedIn(false);setConnectionError('');setError('');return false;}if(body.type==='goldBid'&&e.status>=400&&e.status<500){try{const id=selectedCharacterRef.current;await apply(await readGameResponse(await saveFetch(`/api/game?${new URLSearchParams(id?{characterId:id}:{})}`)));}catch{/* Keep the original rejection when refresh is unavailable. */}}setError(gameErrorMessage(e));return false;}finally{manualPending.current--;setBusy(manualPending.current>0);}},[]);
 useEffect(()=>{
  let cancelled=false;
  const retryable=(e:any)=>!e.status||e.status===408||e.status===429||e.status>=500;
  const poller=createSnapshotPoller({delay:()=>1000,stopOnSuccess:true,shouldRetry:retryable,
   request:async(signal:AbortSignal)=>{const data=await readGameResponse(await saveFetch('/api/game',{signal}));if(!cancelled&&!signal.aborted)await apply(data);},
   onError:(e:any)=>{if(cancelled)return;if(!e){setError('');setLoading(false);return;}if(e.status===401)setSignedIn(false);setLoading(retryable(e));setError(gameErrorMessage(e)+(retryable(e)?' 正在自动重试…':''));},
  });
  return()=>{cancelled=true;poller.stop();};
 },[apply]);
 const selectCharacter=useCallback(async(characterId:string)=>{if(!characterId||characterId===selectedCharacterRef.current)return;setBusy(true);setError('');try{const select=async()=>{pollEtags.current.clear();selectedCharacterRef.current=characterId;setSelectedCharacter(characterId);lastRevision.current=-1;const response=await saveFetch(`/api/game?characterId=${encodeURIComponent(characterId)}`);await apply(await readGameResponse(response));};await select();}catch(e:any){setError(e.message||'连接失败，请稍后重试。');}finally{setBusy(false);}},[apply]);
 useEffect(()=>{
  if(!game?.state||!signedIn)return;
  let cancelled=false;
  const poller=createSnapshotPoller({
   delay:()=>streamConnected.current?5000:combatPollDelay(playbackRef.current,combatPolling.current),
   isVisible:()=>document.visibilityState==='visible',
   request:async(signal:AbortSignal)=>{
    if(streamConnected.current)return;
    const characterId=selectedCharacterRef.current;
    const hasBaseline=acceptedResponse.current?.snapshot?.player?.id===characterId;
    const scope=combatPolling.current&&hasBaseline?'combat':'full',key=`${characterId}:${scope}`;
    const etag=pollEtags.current.get(key),query=new URLSearchParams({...(characterId?{characterId}:{}),scope});
    const response=await saveFetch(`/api/game?${query}`,{signal,headers:etag?{'If-None-Match':etag}:{}});
    if(cancelled||signal.aborted)return;
    if(response.status!==304){
     const data=await readGameResponse(response);if(cancelled||signal.aborted)return;
     const accepted=await apply(data),nextTag=response.headers.get('etag');
     if(accepted&&nextTag)pollEtags.current.set(key,nextTag);
     if(!accepted&&data.scope==='combat'){
      const full=await readGameResponse(await saveFetch(`/api/game?${new URLSearchParams({characterId})}`,{signal}));
      if(!cancelled&&!signal.aborted)await apply(full);
     }
    }
   },
   onError:(e:any)=>{if(!cancelled){setConnectionError(syncErrorMessage(e));if(e?.status===404||e?.status===401)receiptTracker.current.cancel(e.status===404?'角色或存档已不存在，请返回角色选择。':'登录已过期；请重新登录后核对指令结果。');}},
  });
  const visible=()=>{if(document.visibilityState==='visible')void poller.refresh();};
  document.addEventListener('visibilitychange',visible);
  return()=>{cancelled=true;poller.stop();document.removeEventListener('visibilitychange',visible);};
 },[!!game?.state,signedIn,selectedCharacter,battleOpen,apply]);

 const priorRaidActive=useRef(false);
 useEffect(()=>{const active=!!(game?.view?.goldRaid?.active);if(active&&!priorRaidActive.current)setActiveTab('raid');priorRaidActive.current=active;},[game?.view?.goldRaid?.active]);
 const lastDungeonBattle=useRef<string|null>(null);
 useEffect(()=>{const b=game?.state?.combat,key=b?.dungeon?`${b.runId}:${b.startedAt}`:null;if(key&&key!==lastDungeonBattle.current){if(classicActive.current){setBattleOpen(false);}}lastDungeonBattle.current=key;},[game?.state?.combat?.runId,game?.state?.combat?.startedAt,!!game?.state?.combat]);
 const s=game?.state,d=game?.view,props={roster:game?.roster,state:s,data:d,busy:busy||!!game?.execution?.pendingInputs,revision:game?.revision,playback:game?.playback,contentVersion:game?.contentVersion,send};const labels:any={battlegroundPrepare:'战场准备',battlegroundCombat:'战歌峡谷夺旗战',arenaPrepare:'竞技场准备',arenaCombat:'竞技场战斗',goldRecovery:'金团休整',partyBuffs:'全团补充增益',stockadesQuestEvent:'调查暴风城密谋',classChannel:'引导职业技能',classSpell:'施放职业技能',mount:'召唤坐骑',escortMove:'跟随迪菲亚叛徒',teleport:'传送中',hearth:'炉石返回中',dungeonCannon:'点燃火炮',resurrect:'复活队友',idle:'等待行动',hunt:s?.combat?'战斗中':s?.activity.paused?'狩猎已暂停':s?.rest?'补给恢复':'自动狩猎',travel:'旅行中',conjure:'制造补给',professionGather:'自动采集资源',gather:s?.activity.target==null?'等待采集目标刷新':'采集中',questItem:'使用任务物品',dead:'角色已死亡',revive:'返回尸体'};
 const journeyOverview=s&&d?<JourneyActivity {...props} hideTravelProgress={interfaceStyle==='classic'} hideGatherProgress={interfaceStyle==='classic'} activityLabel={labels[s.activity.type]||s.activity.type} onObserve={()=>setBattleOpen(true)} onOpenBag={()=>{setCharacterSection('装备与背包');if(interfaceStyle==='classic')setClassicPanel('bag');else setActiveTab('character');}}/>:null;
 const accountPanel=s&&d?<details className="panel account-drawer" open={interfaceStyle==='classic'?true:undefined}><summary><span>角色与后台活动</span><small>角色切换 · 生产与采集</small></summary> {<section className="panel account-overview" aria-label="账号角色与活动"><div className="section-heading"><div><h2>账号队伍</h2></div>{game.roster?.length>1&&<CharacterPicker label="当前角色" roster={game.roster} value={selectedCharacter||s.id} disabled={busy} onChange={id=>void selectCharacter(id)}/>}</div>{game.activities?.length>0&&<div className="activity-roster">{game.activities.map((activity:any)=>{const actor=game.roster?.find((member:any)=>member.id===activity.actorId);return <div key={activity.id}><strong>{actor?.name||activity.actorId}</strong><span>{activity.type} · {activity.status}{activity.location?` · ${activity.location}`:''}</span>{activity.nextEventAt&&activity.nextEventAt<Number.MAX_SAFE_INTEGER&&<small>下次结算 {new Date(activity.nextEventAt).toLocaleTimeString()}</small>}{['craft','gather'].includes(activity.type)&&['running','returning'].includes(activity.status)&&<Button size="sm" variant="outline" disabled={busy||activity.status==='returning'} onClick={()=>send({type:'recall',activityId:activity.id})}>{activity.status==='returning'?'召回中':'召回'}</Button>}</div>})}</div>}</section>}
  <AccountControls game={game} busy={busy} send={send}/>
</details>:null;
 if(!s||!d)return <main className="game-shell"><section className="panel"><h1>{loading?'正在读取存档…':'无法进入游戏'}</h1>{error&&<p role="alert">{error}</p>}<a href={signedIn?'/':'/login'}>{signedIn?'返回角色选择':'重新登录'}</a></section>{!loading&&signedIn&&error&&<UnstuckControl busy={busy} send={send}/>}</main>;
 const overlays=<>{signedIn&&<GroupLootPopup {...props}/>}{s&&signedIn&&!d.goldRaid?.active&&!d.groupLoot?.pending.length&&(!game.instance||game.instance.leaderId===s.id)&&<LootWindow settingsInMenu={interfaceStyle==='classic'} key={`${s.id}:${s.lastCombat?.id||'pending'}`} {...props}/>}
{s&&d.ammoPrompt&&<AmmoRestockDialog key={`${s.id}:${d.ammoPrompt.memberId}:${d.ammoPrompt.visit}`} actorId={s.id} getSnapshot={getAmmoSnapshot} prompt={d.ammoPrompt} item={d.items[d.ammoPrompt.itemId]} busy={busy} send={send}/>}
{error&&<div className="error toast" role="alert">{error}<button aria-label="关闭提示" onClick={()=>setError('')}>×</button></div>}</>;
 const toggleInterface=()=>{
  if(interfaceStyle==='classic'){setActiveTab(webTabForClassic(classicPanel));setInterfaceStyle('web');}
  else {setClassicPanel(activeTab==='world'?null:activeTab);setBattleOpen(false);setInterfaceStyle('classic');}
 };
 const openClassic=(panel:string|null)=>{if(panel==='bag')setCharacterSection('装备与背包');if(panel==='mounts')setCharacterSection('坐骑');setClassicPanel(panel);};
 const status=<>{s.presence?.paused&&<div className="activity-strip" role="status">{s.presence.reason}</div>}<InputProgress execution={game?.execution} waiting={waitingForInput}/>{!signedIn&&<section className="activity-strip" role="alert"><span>登录已过期，请重新登录以继续冒险。</span><a href="/login">重新登录 →</a></section>}{signedIn&&connectionError&&<div className="activity-strip" role="status">{connectionError}</div>}</>;
 const renderClassicPanel=(panel:string)=>{
  if(panel==='map'&&(s.dungeon||d.goldRaid?.active))return <DungeonMap {...props} key={d.goldRaid?.active?'gold':s.dungeon?.id} raid={d.goldRaid?.active?'gold':undefined}/>;
  if(['nearby','quests','map','activities'].includes(panel))return <Suspense fallback={<p role="status">正在加载界面…</p>}><World {...props} surface={panel as 'nearby'|'quests'|'map'|'activities'} onNavigate={()=>setClassicPanel('map')} onOpenDungeon={()=>setClassicPanel('dungeon')} onObserve={()=>setBattleOpen(true)}/></Suspense>;
  if(['character','bag','mounts'].includes(panel))return <>{game.roster?.length>1&&<CharacterPicker roster={game.roster} value={selectedCharacter||s.id} disabled={busy} onChange={id=>void selectCharacter(id)}/>}<Suspense fallback={<p role="status">正在加载界面…</p>}><Character key={s.id} {...props} section={characterSection} onSectionChange={setCharacterSection}/></Suspense></>;
  if(panel==='party'||panel==='finder')return <Suspense fallback={<p role="status">正在加载界面…</p>}><Party {...props}/></Suspense>;
  if(panel==='dungeon')return <Suspense fallback={<p role="status">正在加载界面…</p>}><DungeonPage {...props} onObserve={()=>setBattleOpen(true)} onOpenParty={()=>setClassicPanel('party')} onConfigure={()=>{setCharacterSection('策略');setClassicPanel('character');}}/></Suspense>;
  if(panel==='raid')return <Suspense fallback={<p role="status">正在加载界面…</p>}><RaidPage {...props} onObserve={()=>setBattleOpen(true)}/></Suspense>;
  if(panel==='pvp')return <Suspense fallback={<p role="status">正在加载界面…</p>}><Pvp {...props}/></Suspense>;
  if(panel==='log')return <JourneyLog {...props} onObserve={()=>setBattleOpen(true)}/>;
  if(panel==='account')return accountPanel;
  if(panel==='settings')return <GameSettings state={s} busy={busy} send={send} onClose={()=>setClassicPanel(null)}/>;
  return null;
 };
 const gmGifts=signedIn?<GmGifts characterId={s.id} busy={busy} send={send} error={error} onBag={()=>{setCharacterSection('装备与背包');if(interfaceStyle==='classic')openClassic('bag');else setActiveTab('character');}}/>:null;
 if(interfaceStyle==='classic')return <SocialProvider key={s.id} actorId={s.id}><main className="classic-game-root" data-interface="classic">{gmGifts}<ExperienceNotifications key={s.id} state={s}/><LevelUpNotification key={`level-${s.id}`} state={s}/><ClassicGame {...props} canLead={!game.instance||game.instance.leaderId===s.id} panel={classicPanel} onPanelChange={openClassic} renderPanel={renderClassicPanel} onStyleChange={toggleInterface} modalBattleOpen={battleOpen} onObserve={()=>{setClassicPanel(null);setBattleOpen(true);}} activityLabel={labels[s.activity.type]||s.activity.type} overview={journeyOverview} status={status} utilities={<ZoneMusic location={d.location} dungeon={!!s.dungeon} active={signedIn} controls={false}/>}/>{battleOpen&&(s.combat||s.lastCombat)&&<Suspense fallback={<p role="status">正在加载界面…</p>}><Battle {...props} canLead={!game.instance||game.instance.leaderId===s.id} open={battleOpen} onOpenChange={setBattleOpen}/></Suspense>} {overlays}</main></SocialProvider>;
 return <SocialProvider key={s.id} actorId={s.id}><main className="game-shell journey-shell" data-interface="web">{gmGifts}
 <ExperienceNotifications key={s.id} state={s}/><LevelUpNotification key={`level-${s.id}`} state={s}/>
 <div className="web-style-switch"><Button variant="outline" onClick={toggleInterface}>切换为经典 UI</Button></div>

 <Tabs value={activeTab} onValueChange={setActiveTab} className="game-tabs adventure-tabs"><aside className="journey-rail"><a href="/" className="rail-brand"><span className="rail-sigil"><MapIcon size={21}/></span><span><strong>WOW SIM</strong><small>经典旧世 · 第一阶段</small></span></a><span className="rail-section">冒险</span><TabsList className="main-nav"><TabsTrigger value="world"><MapIcon/>世界</TabsTrigger><TabsTrigger value="character"><UserRound/>角色</TabsTrigger><TabsTrigger value="party"><UsersRound/>社交与组队</TabsTrigger><TabsTrigger value="dungeon"><Castle/>地下城</TabsTrigger><TabsTrigger value="raid"><UsersRound/>团本</TabsTrigger><TabsTrigger value="pvp"><Swords/>PVP</TabsTrigger><TabsTrigger value="log"><BookOpen/>战报</TabsTrigger></TabsList><ZoneMusic location={d.location} dungeon={!!s.dungeon} active={signedIn}/></aside><div className="journey-content"><BuffBar state={s} data={d} playback={props.playback} contentVersion={props.contentVersion}/>{!signedIn&&<section className="activity-strip" role="alert"><span>登录已过期，请重新登录以继续冒险。</span><Button asChild><a href="/login">重新登录 →</a></Button></section>}{signedIn&&connectionError&&<div className="activity-strip" role="status">{connectionError}</div>}{activeTab!=='world'&&<><PlayerHud state={s} data={d} playback={props.playback} contentVersion={props.contentVersion}/>{journeyOverview}</>}{battleOpen&&(s.combat||s.lastCombat)&&<Suspense fallback={<p role="status">正在加载界面…</p>}><Battle {...props} canLead={!game.instance||game.instance.leaderId===s.id} open={battleOpen} onOpenChange={setBattleOpen}/></Suspense>}<TabsContent value="world"><Suspense fallback={<p role="status">正在加载界面…</p>}><World {...props} sceneActive={!battleOpen} overview={journeyOverview} onObserve={()=>setBattleOpen(true)} onOpenDungeon={()=>setActiveTab('dungeon')}/></Suspense></TabsContent><TabsContent value="character">{game.roster?.length>1&&<section className="panel"><CharacterPicker roster={game.roster} value={selectedCharacter||s.id} disabled={busy} onChange={id=>void selectCharacter(id)}/></section>}<Suspense fallback={<p role="status">正在加载界面…</p>}><Character key={s.id} {...props} section={characterSection} onSectionChange={setCharacterSection}/></Suspense></TabsContent><TabsContent value="party"><Suspense fallback={<p role="status">正在加载界面…</p>}><Party {...props}/></Suspense></TabsContent><TabsContent value="dungeon"><Suspense fallback={<p role="status">正在加载界面…</p>}><DungeonPage {...props} onObserve={()=>setBattleOpen(true)} onOpenParty={()=>{if(d.partyUnlocked)setActiveTab('party');}} onConfigure={()=>{setCharacterSection('策略');setActiveTab('character');}}/></Suspense></TabsContent><TabsContent value="raid"><Suspense fallback={<p role="status">正在加载界面…</p>}><RaidPage {...props} onObserve={()=>setBattleOpen(true)}/></Suspense></TabsContent><TabsContent value="pvp"><Suspense fallback={<p role="status">正在加载界面…</p>}><Pvp {...props}/></Suspense></TabsContent><TabsContent value="log"><JourneyLog {...props} onObserve={()=>setBattleOpen(true)}/></TabsContent>
 {accountPanel}

<UnstuckControl key={s.id} busy={busy} send={send}/>
<footer className="site-footer"><span>1—60 级 · 九职业经典旅程</span><span>经典旧世 · 冒险模拟</span></footer></div></Tabs>
{overlays}</main></SocialProvider>
}
