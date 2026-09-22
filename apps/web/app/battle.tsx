"use client";
import {createBattleClock} from '@/lib/battle-clock.js';
import {useCombatPlayback} from '@/lib/use-combat-playback';
import {useLocalCombat} from '@/lib/local-combat-store';
import BattleHD2D from './battle-hd2d';
import {sceneLayout} from '@/lib/battle-scene.js';
import CombatRecoveryActions from './combat-recovery-actions';
import {memo,useEffect,useMemo,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {actionProgress,classAttackStatus,meleeStatus,enemyMeleeProgress,unitCondition,conditionRemaining,recentCombatEvents,mergeCombatEffects,battleTarget,presentationProjectiles} from '@/lib/combat-view.js';
import {distance} from '../../../packages/sim-core/src/geometry.js';
import DamageMeter from './damage-meter';
import Strategy from './strategy';
import {BattleUnitStatus,BattleCompanions,BattleClassHint} from './battle-class-panel';
import {creatureVisual} from '@/lib/creature-visuals.js';
import type {BattleScene} from '@/lib/battle-hd2d-types';
import {GameProps,duration} from './game-ui';
const MemoDamageMeter=memo(DamageMeter),MemoStrategy=memo(Strategy);
function LiveDamageMeter(props:React.ComponentProps<typeof DamageMeter>){
 const saved=useRef({props,at:performance.now()});
 if(props.battle?.id!==saved.current.props.battle?.id||props.battle?.endedAt!==saved.current.props.battle?.endedAt||performance.now()-saved.current.at>=500)saved.current={props,at:performance.now()};
 return <MemoDamageMeter {...saved.current.props}/>;
}
const emptyUnits:any[]=[];
function BattleStrategy(props:GameProps){
 const [mounted,setMounted]=useState(false);
 return <details className="battle-strategy" onToggle={e=>{if(e.currentTarget.open)setMounted(true);}}><summary>职业战斗策略 · {props.data.battleView.units[props.state.id].className}</summary><p>保存后按新优先级自动施法；检查已学习等级、天赋、当前姿态、资源和冷却。</p>{mounted&&<MemoStrategy {...props}/>}</details>;
}
const MemoBattleStrategy=memo(BattleStrategy);
const colors:Record<number,string>={1:'#c69b6d',2:'#f48cba',3:'#aad372',4:'#fff468',5:'#eeeeee',7:'#0070dd',8:'#3fc7eb',9:'#8788ee',11:'#ff7c0a'};
const swingLabels:Record<string,string>={ended:'战斗已结束',dead:'已倒下',casting:'施法中',waitingTarget:'等待目标',approaching:'接近目标中',ready:'准备攻击',stunned:'击晕中',feared:'恐惧中',rooted:'定身中',nonMelee:'远程支援',waiting:'等待挥击'};


export default function Battle({state,data,playback,contentVersion,simulationStatus,busy,send,open,onOpenChange,canLead=true,historical=false}:{historical?:boolean;open:boolean;onOpenChange:(open:boolean)=>void;canLead?:boolean}&GameProps){
 const local=useLocalCombat(state,data,open&&!historical);
 const localLive=local.state!==state;
 const {state:s,data:d,status:playbackStatus}=useCombatPlayback(local.state,local.data,historical?null:playback,contentVersion,open);
 const skills=d.combatSkills||d.skills;
 const pendingPull=s.combat?.pull?.engagedAt==null?s.combat?.pull:null;
 // Countdown time is deterministic, so it may advance locally up to (but not
 // beyond) the authoritative pull deadline. Ordinary combat stays capped at
 // one second of prediction while waiting for another server snapshot.
 const predictionMs=pendingPull&&pendingPull.startsAt>s.clock?pendingPull.startsAt-s.clock:1000;
 const [clock,setClock]=useState(s.clock),[effects,setEffects]=useState<any[]>([]),[lowEffects,setLowEffects]=useState(false),[reducedMotion,setReducedMotion]=useState(false),[selectedId,setSelectedId]=useState(s.id),[zoom,setZoom]=useState(1);
 const cursor=useRef(s.logSequence),observed=useRef(createBattleClock(s.clock,performance.now())),encounter=useRef(s.combat?.id||s.lastCombat?.id);
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReducedMotion(query.matches);update();setLowEffects(matchMedia('(max-width: 700px)').matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
 useEffect(()=>{const key=s.combat?.id||s.lastCombat?.id,now=performance.now();observed.current.observe(s.clock,now,key!==encounter.current);encounter.current=key;if(!localLive)setClock(observed.current.read(now,!!s.combat,predictionMs));const events=recentCombatEvents(s.logs,cursor.current,s.clock);cursor.current=s.logSequence;if(open&&events.length){setEffects(old=>mergeCombatEffects(old,events,Date.now(),s.combat?.projectiles||[]));}},[s.logSequence,s.clock,open,predictionMs]);
 useEffect(()=>{if(!open){cursor.current=s.logSequence;setEffects([]);return;}if(localLive)return;const timer=setInterval(()=>{if(document.hidden)return;setClock(observed.current.read(performance.now(),!!s.combat,predictionMs));setEffects(old=>old.some(e=>Date.now()-e.shownAt>=1500)?old.filter(e=>Date.now()-e.shownAt<1500):old);},100);return()=>clearInterval(timer);},[open,!!s.combat,predictionMs,localLive]);
 const battle=s.combat||s.lastCombat,projection=d.battleView;
 const raid=d.goldRaid?.active?d.goldRaid:d.guildRaid?.active?d.guildRaid:null;
 const routeAdvancing=!!(raid?.map?.autoAdvance||d.dungeon?.autoAdvance);
 const pauseCommand=raid?(d.goldRaid?.active?'goldPause':'raidPause'):d.dungeon?.autoAdvance?'dungeonPause':'stop';
 const actors:any[]=projection?.actors||battle?.actorsSnapshot||emptyUnits;
 const baseUnits=useMemo(()=>!battle||!projection?emptyUnits:[...actors.map(u=>({...u,foe:false})),...battle.enemies.map((u:any)=>({...u,foe:!projection.units[u.id]?.controlled}))].map(u=>{
  const ui=projection.units[u.id],visual=ui?.portrait?{...ui.portrait,label:ui.className,kind:'class'}:u.totemUnit?{src:skills.find((a:any)=>a.spellId===u.spell)?.icon||'/icons/assets/spell_nature_forceofnature.png',label:'图腾',kind:'icon'}:creatureVisual({...u,creatureType:u.creatureType||(u.petUnit?(u.kind==='beast'?1:3):undefined)});
  return {...u,cast:ui?.cast,maxHp:ui?.maxHp||u.maxHp,visual};
 }),[actors,battle,projection,skills]);
 const layout=useMemo(()=>battle?sceneLayout(actors,battle.enemies,zoom,battle.area):null,[actors,battle,baseUnits,zoom]);
 if(!battle||!projection||!layout)return null;
 const viewClock=s.combat?Math.min(localLive?s.clock:clock,s.playbackUntil??Infinity):battle.endedAt??clock;
 const pullCountdown=s.combat?.pull?Math.max(0,Math.ceil((s.combat.pull.startsAt-viewClock)/1000)):0;
 const opening=!!s.combat?.pull&&s.combat.pull.engagedAt==null;
 const units=baseUnits.map(u=>({...u,swing:s.combat&&!u.petUnit?(u.foe?enemyMeleeProgress(u,actors,viewClock):classAttackStatus(u,battle,viewClock,projection.units[u.id]?.attack).progress):0}));
 const player=units.find(u=>u.id===s.id),playerUi=projection.units[s.id];
 const selected=units.find(u=>u.id===selectedId)||units[0],target=battleTarget(selected,units,viewClock),castSkill=skills.find((skill:any)=>skill.spellId===selected.cast?.spell),range=Number(castSkill?.range||castSkill?.radius||5);
 const scene:BattleScene={encounterId:battle.id,live:!!s.combat,sampledAt:performance.now(),ground:(d.guildRaid?.active||d.goldRaid?.active)?'molten':battle.ground||'grass',endClock:s.playbackUntil,layout,units,clock:viewClock,selectedId:selected.id,range,projectiles:presentationProjectiles(s.combat?battle.projectiles||[]:[],effects,viewClock,Date.now(),units),effects:effects.filter(e=>e.shownAt<=Date.now()),groundEffects:s.combat?[...projection.groundEffects,...actors.filter((u:any)=>u.cast?.channel&&u.cast?.center).map((u:any)=>{const skill=skills.find((a:any)=>a.spellId===u.cast.spell);return {...u.cast,actorId:u.id,spellId:u.cast.spell,radius:skill?.radius||8,school:skill?.school};})]:[],lowEffects,reducedMotion};
 const attack=classAttackStatus(player,s.combat,viewClock,playerUi.attack),swing=attack.status,swingProgress=attack.progress,speed=projection.units[selected.id].movement.speed;
 const remaining=conditionRemaining(selected,viewClock);
 const baseSpeed=projection.units[selected.id].movement.baseSpeed,slow=baseSpeed>0?Math.max(0,1-speed/baseSpeed):0;

 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="battle-dialog" showCloseButton={false}><header className="battle-heading"><div><div className="eyebrow">{(d.guildRaid?.active||d.goldRaid?.active)?'熔火之心':d.location.name} / {(d.guildRaid?.active||d.goldRaid?.active)?(d.goldRaid?.active?'25人金团':'25人公会远征'):battle.dungeon?'五人小队':'野外遭遇'}</div><DialogTitle>{pullCountdown?'准备开怪':opening?'坦克开怪中':s.combat?'战斗进行中':player.hp<=0?'你倒下了':'战斗结束'}</DialogTitle><DialogDescription>3D 战场 · 实时战斗演出 · 选择角色查看目标</DialogDescription></div><Button variant="outline" onClick={()=>onOpenChange(false)}>{(d.guildRaid?.active||d.goldRaid?.active)?'返回远征营地 ↙':'返回世界 ↙'}</Button></header>{(simulationStatus||playbackStatus)&&<p role="status">{simulationStatus||playbackStatus}</p>}<div className="battle-toolbar"><span>{units.filter(u=>u.foe&&u.hp>0&&!u.removed).length} 个敌人 · {actors.filter(a=>a.hp>0&&!a.totemUnit&&!a.petUnit).length} 名队员</span><div className="battle-zoom" role="group" aria-label="战斗视野缩放"><button type="button" aria-label="缩小战斗视野" disabled={zoom<=.5} onClick={()=>setZoom(z=>Math.max(.5,Math.round((z-.1)*10)/10))}>−</button><output aria-live="polite">{Math.round(zoom*100)}%</output><button type="button" aria-label="放大战斗视野" disabled={zoom>=3} onClick={()=>setZoom(z=>Math.min(3,Math.round((z+.1)*10)/10))}>＋</button><button type="button" aria-pressed={zoom===1} onClick={()=>setZoom(1)}>自动取景</button></div><label><input type="checkbox" checked={lowEffects} onChange={e=>setLowEffects(e.target.checked)}/>简化特效</label>{reducedMotion&&<small>减少动态效果</small>}</div><div className="battle-raid-timers">{(d.guildRaid?.active||d.goldRaid?.active)&&s.combat&&<><strong>{raid?.map?.route.find((b:any)=>b.id===raid.activeBoss)?.name}</strong>{(d.goldRaid?.active?d.goldRaid:d.guildRaid).nextMechanics.map((m:any)=><span key={m.name}>{m.name} <b>{duration(Math.max(0,m.at-viewClock))}</b></span>)}</>}</div><div className="battle-room"><BattleHD2D scene={scene} skills={skills} onSelect={setSelectedId} active={open}/>{opening&&<div className="battle-pull-countdown" role="status" aria-live="polite" aria-atomic="true">{pullCountdown>0?<><span>准备开怪</span><strong>{pullCountdown}</strong><span>倒计时结束后由坦克先手</span></>:<span>坦克正在开怪</span>}</div>}</div><div className="battle-roster" aria-label="选择战斗单位">{units.map(u=><button key={u.id} className={`${selected.id===u.id?'selected':''} ${u.hp<=0?'fallen':''}`} onClick={()=>setSelectedId(u.id)}><span style={{color:u.foe?'#df9e89':colors[u.classId]}}>{u.name}</span><small>{Math.max(0,Math.round(u.hp/Math.max(1,u.maxHp)*100))}%</small></button>)}</div><div className="battle-unit-detail"><strong>{selected.name}</strong><span>{unitCondition(selected,viewClock)|| (selected.cast?`${castSkill?.name||'施法'}中`:selected.hp<=0?'已倒下':'可行动')}{remaining>0?` · ${duration(remaining)}`:''}</span><span>目标距离 {target?distance(selected,target).toFixed(1)+' 码':'—'}</span><span>移速 {speed.toFixed(1)} 码/秒{slow>0?` · 降低 ${Math.round(slow*100)}%`:''}</span><small>{selected.visual.label} · 圆环 {range} 码</small></div>
 {selected.id!==player.id&&<BattleUnitStatus unit={selected} ui={projection.units[selected.id]} clock={viewClock} live={!!s.combat}/>}
 <div className="battle-bottom"><section className="battle-player"><BattleUnitStatus unit={player} ui={playerUi} clock={viewClock} live={!!s.combat}/><BattleClassHint classId={player.classId}/><div className="action-meter"><span>{attack.label} <small>{swing.kind==='waiting'?duration(swing.remaining):swingLabels[swing.kind]||swing.kind}</small></span><div role="progressbar" aria-label={attack.label+'进度'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(swingProgress*100)}><i style={{width:swingProgress*100+'%'}}/></div></div>{playerUi.offhand&&s.combat&&<div className="action-meter"><span>副手攻击 <small>{duration(playerUi.offhand.until-viewClock)}</small></span><div><i style={{width:(['waiting','ready'].includes(meleeStatus(player,s.combat,viewClock).kind)?actionProgress(playerUi.offhand.startedAt,playerUi.offhand.until,viewClock)*100:0)+'%'}}/></div></div>}<BattleCompanions state={s} data={d} busy={busy} send={send} units={units} clock={viewClock} live={!!s.combat} targetId={selected.id}/>
 {!historical&&<div className="action-row"><CombatRecoveryActions state={s} busy={busy} send={send} canLead={canLead} onRevive={()=>onOpenChange(false)}/>{d.questTools?.filter((t:any)=>t.id===7247&&t.location===s.location).map((t:any)=><Button key={t.id} disabled={busy||!t.available} onClick={()=>send({type:'useQuestItem',id:t.id})}>{t.label}</Button>)}<Button variant="outline" disabled={busy||!canLead||(!routeAdvancing&&(!s.combat||s.activity.type==='idle'))} onClick={()=>send({type:pauseCommand})}>{routeAdvancing?'暂停自动推进':'本场结束后停止'}</Button>{d.dungeon?.advanceReason&&<span role="status">{d.dungeon.advanceReason}</span>}</div>}</section><LiveDamageMeter battle={battle} dungeon={s.dungeon} clock={s.clock} skills={skills}/><details className="battle-events"><summary>{historical?'战斗记录（最近 140 条）':'刚刚发生'}</summary>{[...s.logs].filter((l:any)=>l.encounterId?l.encounterId===(battle.id||battle.encounterId):l.at>=battle.startedAt).slice(historical?-140:-7).reverse().map((l:any)=><div className={'event-line log-'+l.kind} key={l.id}><small>{duration(l.at-battle.startedAt)}</small><span>{l.text}</span></div>)}</details></div>{!historical&&<MemoBattleStrategy state={state} data={data} busy={busy} send={send}/>}</DialogContent></Dialog>;
}
