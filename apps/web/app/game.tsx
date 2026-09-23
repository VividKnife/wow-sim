"use client";
import {saveFetch} from '../lib/save-fetch';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import dynamic from 'next/dynamic';
const World=dynamic(()=>import('./world'),{loading:()=> <p role="status">正在加载世界…</p>});
const Character=dynamic(()=>import('./character'),{loading:()=> <p role="status">正在加载角色…</p>});
import CharacterPicker from './character-picker';
const DungeonPage=dynamic(()=>import('./dungeon-page'),{loading:()=> <p role="status">正在加载地下城…</p>});
const RaidPage=dynamic(()=>import('./raid-page'),{loading:()=> <p role="status">正在加载团本…</p>});
const Pvp=dynamic(()=>import('./pvp'),{loading:()=> <p role="status">正在加载 PVP…</p>});
const Battle=dynamic(()=>import('./battle'));
import LootWindow from './loot-window';
const Party=dynamic(()=>import('./party'),{loading:()=> <p role="status">正在加载队伍…</p>});
import JourneyActivity from './journey-activity';
import JourneyLog from './journey-log';
import ZoneMusic from './zone-music';
import AccountControls from './account-controls';
import UnstuckControl from './unstuck-control';
import PlayerHud from './player-hud';
import AmmoRestockDialog from './ammo-restock-dialog';
import {BookOpen,Map as MapIcon,Castle,UserRound,UsersRound,Swords} from 'lucide-react';
import {createCommandQueue} from '@/lib/command-queue.js';
import {readGameResponse,responseMatchesSelection,mergeGameResponse} from '@/lib/game-response.js';
import {createSnapshotPoller} from '@/lib/snapshot-poller.js';
import {combatPollDelay} from '@/lib/combat-playback.js';
import {inlineWorldBattle,opensBattleDialog} from '@/lib/battle-presentation.js';
import {playQuestSound} from '@/lib/quest-audio.js';
import {LocalSimulationClient} from '@/lib/local-simulation-client';
import {loadContent,contentLoader,referencedItemIds} from '@/lib/content-loader.js';
export default function Game(){
 const [activeTab,setActiveTab]=useState('world');
 const [characterSection,setCharacterSection]=useState('装备与背包');
 const [connectionError,setConnectionError]=useState('');
 const [localStatus,setLocalStatus]=useState('');
 const localClient=useRef<LocalSimulationClient|null>(null);
 const battleVisible=useRef(false);
 const[game,setGame]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[signedIn,setSignedIn]=useState(true),[selectedCharacter,setSelectedCharacter]=useState('');const [battleOpen,setBattleOpen]=useState(false);const manualPending=useRef(0),lastRevision=useRef(-1),selectedCharacterRef=useRef('');
 const acceptedResponse=useRef<any>(null),combatPolling=useRef(false),playbackRef=useRef<any>(null);
 const inlineBattle=inlineWorldBattle(activeTab,game?.state?.dungeon);
 const inlineBattleRef=useRef(inlineBattle);inlineBattleRef.current=inlineBattle;
 combatPolling.current=!!game?.state?.combat&&(battleOpen||inlineBattle);playbackRef.current=game?.playback;
 // The inline scene still needs the one-second overview for the world HUD.
 battleVisible.current=battleOpen;
 const apply=useCallback(async(data:any)=>{
  if(!responseMatchesSelection(data,selectedCharacterRef.current,lastRevision.current))return false;
  const content=await loadContent(data.contentVersion,data.snapshot);
  if(!responseMatchesSelection(data,selectedCharacterRef.current,lastRevision.current))return false;
  const actorId=data.snapshot?.player?.id||'';
  const local=localClient.current;
  const live=local&&local.ownerId===data.localSimulation?.ownerId&&local.latest?.player.id===actorId?local.latest:null;
  if(live)content.items=await contentLoader.ensureItems(data.contentVersion,referencedItemIds(live));
  if(!responseMatchesSelection(data,selectedCharacterRef.current,lastRevision.current))return false;
  const merged=mergeGameResponse(acceptedResponse.current,data);if(!merged)return false;
  if(!selectedCharacterRef.current&&actorId){selectedCharacterRef.current=actorId;setSelectedCharacter(actorId);}
  acceptedResponse.current=merged;lastRevision.current=data.revision;
  setGame((previous:any)=>{
   // A Worker overview may have advanced while the HTTP snapshot was hydrating.
   const current=previous?.contentVersion===data.contentVersion&&previous.state?.id===actorId&&local?.active&&previous.state.clock>(live||merged.snapshot)?.player?.clock;
   const snapshot=current?{player:previous.state,view:previous.view}:live||merged.snapshot;
   return {...merged,playback:local?.active?null:merged.playback,state:snapshot?.player||null,
    view:snapshot?{...content,...snapshot.view,items:{...content.items,...(current?previous.view.items:{})}}:null};
  });
  local?.observe(merged.localSimulation,merged.contentVersion,actorId);return true;
 },[]);
 useEffect(()=>{
  const refresh=async()=>{const id=selectedCharacterRef.current;await apply(await readGameResponse(await saveFetch(`/api/game?${new URLSearchParams(id?{characterId:id}:{})}`)));};
  const client=new LocalSimulationClient({refresh,onStatus:setLocalStatus,onFull:snapshot=>{
   // Only the one-second overview reaches Game. Battle subscribes directly to
   // the small 10 Hz combat stream through useSyncExternalStore.
   if(snapshot.player.id!==selectedCharacterRef.current)return;
   const version=acceptedResponse.current?.contentVersion;
   if(version)void contentLoader.ensureItems(version,referencedItemIds(snapshot)).then(items=>{
    // A slow item fetch must never restore an older tick or another character.
    if(client.latest!==snapshot||snapshot.player.id!==selectedCharacterRef.current)return;
    setGame((previous:any)=>{
     if(!previous||previous.contentVersion!==version)return previous;
     if(battleVisible.current&&snapshot.player.combat&&previous.state.combat?.id===snapshot.player.combat.id)return previous;
     return {...previous,playback:null,state:snapshot.player,view:{...previous.view,...snapshot.view,items}};
    });
   }).catch(error=>setConnectionError(error.message));
  }});
  localClient.current=client;
  const hide=()=>client.release();window.addEventListener('pagehide',hide);
  const baseline=acceptedResponse.current;if(baseline)client.observe(baseline.localSimulation,baseline.contentVersion,selectedCharacterRef.current);
  return()=>{window.removeEventListener('pagehide',hide);client.dispose();localClient.current=null;};
 },[apply]);
 useEffect(()=>{const update=()=>localClient.current?.visibility(!document.hidden,battleOpen||inlineBattle||activeTab==='pvp');update();document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[battleOpen,inlineBattle,activeTab]);
 const pollEtags=useRef(new Map<string,string>());
 const queue=useRef<ReturnType<typeof createCommandQueue>|null>(null);
 if(!queue.current)queue.current=createCommandQueue(async(command:any)=>{const execute=async(credentials:any,prepare=(value:any)=>value)=>{const response=await saveFetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...prepare(command),...credentials})});await apply(await readGameResponse(response));return true;};return localClient.current&&command.type!=='unstuck'?localClient.current.command(execute):execute({});});
 const send=useCallback(async(body:any)=>{manualPending.current++;setBusy(true);setError('');try{const characterId=selectedCharacterRef.current;const success=await queue.current!({...body,...(characterId?{characterId}:{}),requestId:crypto.randomUUID()});if(success){setConnectionError('');playQuestSound(body);}if(success&&body.type==='enterDungeon')setActiveTab(['molten-core','molten-core-gold'].includes(body.contentId)?'raid':'dungeon');if(success&&opensBattleDialog(body,inlineBattleRef.current))setBattleOpen(true);return success;}catch(e:any){if(e.status===401){setSignedIn(false);setConnectionError('');setError('');return false;}if(body.type==='goldBid'&&e.status>=400&&e.status<500){try{const id=selectedCharacterRef.current;await apply(await readGameResponse(await saveFetch(`/api/game?${new URLSearchParams(id?{characterId:id}:{})}`)));}catch{/* Keep the original rejection when refresh is unavailable. */}}setError(e.status===undefined?'连接失败，请稍后重试。':e.message);return false;}finally{manualPending.current--;setBusy(manualPending.current>0);}},[]);
 useEffect(()=>{let cancelled=false;saveFetch('/api/game').then(readGameResponse).then(d=>cancelled?false:apply(d)).catch(e=>{if(cancelled)return;if(e.status===401)setSignedIn(false);else setError(e.status===undefined?'连接失败，请稍后重试。':e.message);}).finally(()=>!cancelled&&setLoading(false));return()=>{cancelled=true}},[apply]);
 const selectCharacter=useCallback(async(characterId:string)=>{if(!characterId||characterId===selectedCharacterRef.current)return;setBusy(true);setError('');try{const select=async()=>{pollEtags.current.clear();selectedCharacterRef.current=characterId;setSelectedCharacter(characterId);lastRevision.current=-1;const response=await saveFetch(`/api/game?characterId=${encodeURIComponent(characterId)}`);await apply(await readGameResponse(response));};if(localClient.current)await localClient.current.command(select);else await select();}catch(e:any){setError(e.message||'连接失败，请稍后重试。');}finally{setBusy(false);}},[apply]);
 useEffect(()=>{
  if(!game?.state||!signedIn)return;
  let cancelled=false;
  const poller=createSnapshotPoller({
   delay:()=>localClient.current?.active?10000:combatPollDelay(playbackRef.current,combatPolling.current),
   isVisible:()=>document.visibilityState==='visible',
   request:async(signal:AbortSignal)=>{
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
     if(!accepted&&data.scope==='combat'&&data.contentVersion!==acceptedResponse.current?.contentVersion){
      const full=await readGameResponse(await saveFetch(`/api/game?${new URLSearchParams({characterId})}`,{signal}));
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

 const priorRaidActive=useRef(false);
 useEffect(()=>{const active=!!(game?.view?.guildRaid?.active||game?.view?.goldRaid?.active);if(active&&!priorRaidActive.current)setActiveTab('raid');priorRaidActive.current=active;},[game?.view?.guildRaid?.active,game?.view?.goldRaid?.active]);
 const lastDungeonBattle=useRef<string|null>(null);
 useEffect(()=>{const b=game?.state?.combat,key=b?.dungeon?`${b.runId}:${b.startedAt}`:null;if(key&&key!==lastDungeonBattle.current)setBattleOpen(true);lastDungeonBattle.current=key;},[game?.state?.combat?.runId,game?.state?.combat?.startedAt,!!game?.state?.combat]);
 const s=game?.state,d=game?.view,props={roster:game?.roster,state:s,data:d,busy,revision:game?.revision,playback:game?.playback,contentVersion:game?.contentVersion,simulationStatus:localStatus,send};const labels:any={battlegroundPrepare:'战场准备',battlegroundCombat:'战歌峡谷夺旗战',arenaPrepare:'竞技场准备',arenaCombat:'竞技场战斗',goldRecovery:'金团休整',raidRecovery:'公会营地休整',stockadesQuestEvent:'调查暴风城密谋',classChannel:'引导职业技能',classSpell:'施放职业技能',mount:'召唤坐骑',escortMove:'跟随迪菲亚叛徒',teleport:'传送中',hearth:'炉石返回中',dungeonCannon:'点燃火炮',resurrect:'复活队友',idle:'等待行动',hunt:s?.combat?'战斗中':s?.rest?'补给恢复':'自动狩猎',travel:'旅行中',conjure:'制造补给',professionGather:'自动采集资源',gather:'调查中',questItem:'使用任务物品',dead:'角色已死亡',revive:'返回尸体'};
 const journeyOverview=s&&d?<JourneyActivity {...props} activityLabel={labels[s.activity.type]||s.activity.type} onObserve={()=>setBattleOpen(true)}/>:null;
 if(!s||!d)return <main className="game-shell"><section className="panel"><h1>{loading?'正在读取存档…':'无法进入游戏'}</h1>{error&&<p role="alert">{error}</p>}<a href={signedIn?'/':'/login'}>{signedIn?'返回角色选择':'重新登录'}</a></section></main>;
 return <main className="game-shell journey-shell">
 {localStatus&&<div className="activity-strip" role="status">{localStatus}</div>}
 <Tabs value={activeTab==='party'&&!d.partyUnlocked?'world':activeTab} onValueChange={setActiveTab} className="game-tabs adventure-tabs"><aside className="journey-rail"><a href="/" className="rail-brand"><span className="rail-sigil"><MapIcon size={21}/></span><span><strong>WOW SIM</strong><small>经典旧世 · 第一阶段</small></span></a><span className="rail-section">冒险</span><TabsList className="main-nav"><TabsTrigger value="world"><MapIcon/>世界</TabsTrigger><TabsTrigger value="character"><UserRound/>角色</TabsTrigger><TabsTrigger value="party" disabled={!d.partyUnlocked} title={d.partyUnlocked?"队友系统已开通":"10级解锁队友系统"}><UsersRound/>队友</TabsTrigger><TabsTrigger value="dungeon"><Castle/>地下城</TabsTrigger><TabsTrigger value="raid"><UsersRound/>团本</TabsTrigger><TabsTrigger value="pvp"><Swords/>PVP</TabsTrigger><TabsTrigger value="log"><BookOpen/>战报</TabsTrigger></TabsList><ZoneMusic location={d.location} dungeon={!!s.dungeon} active={signedIn}/></aside><div className="journey-content">{activeTab==='world'&&d.partyUnlocked&&s.growthPolicy!=='companion'&&s.party.length===0&&<section className="activity-strip" role="status"><span>队伍还有 4 个空位。招募队友可一起练级与挑战副本。</span><Button variant="outline" onClick={()=>setActiveTab('party')}>招募队友</Button></section>}{!signedIn&&<section className="activity-strip" role="alert"><span>登录已过期，请重新登录以继续冒险。</span><Button asChild><a href="/login">重新登录 →</a></Button></section>}{signedIn&&connectionError&&<div className="activity-strip" role="status">{connectionError}</div>}{activeTab!=='world'&&<><PlayerHud state={s} data={d}/>{journeyOverview}</>}{battleOpen&&(s.combat||s.lastCombat)&&<Battle {...props} canLead={!game.instance||game.instance.leaderId===s.id} open={battleOpen} onOpenChange={setBattleOpen}/>}<TabsContent value="world"><World {...props} sceneActive={!battleOpen} overview={journeyOverview} onObserve={()=>setBattleOpen(true)} onOpenDungeon={()=>setActiveTab('dungeon')}/></TabsContent><TabsContent value="character">{game.roster?.length>1&&<section className="panel"><CharacterPicker roster={game.roster} value={selectedCharacter||s.id} disabled={busy} onChange={id=>void selectCharacter(id)}/></section>}<Character key={s.id} {...props} section={characterSection} onSectionChange={setCharacterSection}/></TabsContent><TabsContent value="party"><Party {...props}/></TabsContent><TabsContent value="dungeon"><DungeonPage {...props} onObserve={()=>setBattleOpen(true)} onOpenParty={()=>{if(d.partyUnlocked)setActiveTab('party');}} onConfigure={()=>{setCharacterSection('策略');setActiveTab('character');}}/></TabsContent><TabsContent value="raid"><RaidPage {...props} onObserve={()=>setBattleOpen(true)}/></TabsContent><TabsContent value="pvp"><Pvp {...props}/></TabsContent><TabsContent value="log"><JourneyLog {...props} onObserve={()=>setBattleOpen(true)}/></TabsContent>
 <details className="panel account-drawer"><summary><span>角色与后台活动</span><small>角色切换 · 生产与采集</small></summary> {<section className="panel account-overview" aria-label="账号角色与活动"><div className="section-heading"><div><h2>账号队伍</h2></div>{game.roster?.length>1&&<CharacterPicker label="当前角色" roster={game.roster} value={selectedCharacter||s.id} disabled={busy} onChange={id=>void selectCharacter(id)}/>}</div>{game.activities?.length>0&&<div className="activity-roster">{game.activities.map((activity:any)=>{const actor=game.roster?.find((member:any)=>member.id===activity.actorId);return <div key={activity.id}><strong>{actor?.name||activity.actorId}</strong><span>{activity.type} · {activity.status}{activity.location?` · ${activity.location}`:''}</span>{activity.nextEventAt&&activity.nextEventAt<Number.MAX_SAFE_INTEGER&&<small>下次结算 {new Date(activity.nextEventAt).toLocaleTimeString()}</small>}{['craft','gather'].includes(activity.type)&&['running','returning'].includes(activity.status)&&<Button size="sm" variant="outline" disabled={busy||activity.status==='returning'} onClick={()=>send({type:'recall',activityId:activity.id})}>{activity.status==='returning'?'召回中':'召回'}</Button>}</div>})}</div>}</section>}
  <AccountControls game={game} busy={busy} send={send}/>
</details>
<UnstuckControl key={s.id} busy={busy} send={send}/>
<footer className="site-footer"><span>1—60 级 · 九职业经典旅程</span><span>经典旧世 · 冒险模拟</span></footer></div></Tabs>
{s&&signedIn&&!d.goldRaid?.active&&(!game.instance||game.instance.leaderId===s.id)&&<LootWindow key={`${s.id}:${s.lastCombat?.id||'pending'}`} {...props}/>}
{s&&d.ammoPrompt&&<AmmoRestockDialog key={`${d.ammoPrompt.memberId}:${d.ammoPrompt.trigger}`} prompt={d.ammoPrompt} item={d.items[d.ammoPrompt.itemId]} busy={busy} send={send}/>}
{error&&<div className="error toast" role="alert">{error}<button aria-label="关闭提示" onClick={()=>setError('')}>×</button></div>}</main>
}
