/* eslint-disable @next/next/no-img-element -- Standalone Vite preview uses local game assets without the Next image server. */
import React, {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import {createRoot} from 'react-dom/client';
import {Dialog} from 'radix-ui';
import {ChevronDown, Compass, Footprints, Pause, Play, Swords, X} from 'lucide-react';
import {createGame, act, advance, stats, view} from '../../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../../packages/game-domain/src/rules/combat.js';
import {createNpcMember, companionSkills} from '../../../../packages/game-domain/src/rules/party.js';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import {meterRows} from '../../../../packages/sim-core/src/combat-meter.js';
import type {Rules} from '../../../../packages/game-domain/src/model';
import WorldScene from '../../app/world-scene';
import DamageMeter from '../../app/damage-meter';
import type {GameProps} from '../../app/game-ui';
import '../../app/globals.css';
import './classic-ui.css';

const content = clientContent();
const icons = '/icons/assets/';
const menuItems = [
 {id:'nearby', name:'附近人物', icon:'spell_holy_magicalsentry', key:'N'},
 {id:'quests', name:'任务日志', icon:'inv_misc_book_09', key:'L'},
 {id:'character', name:'角色', icon:'inv_helmet_03', key:'C'},
 {id:'bag', name:'背包', icon:'inv_misc_bag_08', key:'B'},
 {id:'dungeon', name:'地下城', icon:'inv_misc_head_dragon_01', key:'I'},
 {id:'pvp', name:'PvP', icon:'inv_sword_04', key:'H'},
 {id:'party', name:'队伍', icon:'spell_holy_prayerofhealing', key:'P'},
 {id:'map', name:'世界地图', icon:'inv_misc_map_01', key:'M'},
];
const classColors:Record<number,string>={1:'#c69b6d',4:'#fff468',5:'#eee9da',8:'#69ccef',9:'#ad91e3'};
const classNames:Record<number,string>={1:'战士',4:'盗贼',5:'牧师',8:'法师',9:'术士'};
const maps=[{id:'goldshire',name:'闪金镇',region:'艾尔文森林',image:'elwynn-classic.jpg',desc:'林间小径 · 狮王之傲旅店'}, {id:'ironforge',name:'铁炉堡',region:'丹莫罗',image:'dun-morogh-classic.jpg',desc:'雪山之巅 · 矮人的家园'}];
const percent=(n:number,max:number)=>Math.min(100,Math.max(0,n/Math.max(1,max)*100));
const fmt=(n:number)=>Math.round(n).toLocaleString('en-US');
const time=(n:number)=>`${String(Math.floor(n/60000)).padStart(2,'0')}:${String(Math.floor(n/1000)%60).padStart(2,'0')}`;
function fixture(location='goldshire'){
 const s:Rules=createGame('林间旅人',283,0,{raceId:1,classId:8,gender:'female'});
 s.location=location;s.level=20;s.xp=7820;s.money=128450;s.learned=companionSkills(s);
 s.riding={horse:true};s.mounts=[900020];s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 for(const [id,role] of [['warrior','tank'],['priest','healer'],['rogue','melee'],['warlock','ranged']])createNpcMember(s,id,{role});
 return s;
}
function Icon({name}:{name:string}){return <img src={`${icons}${name}.png`} alt="" draggable={false}/>;}
function Vital({label,value,max,mana=false}:{label:string;value:number;max:number;mana?:boolean}){
 return <div className={`cu-vital ${mana?'mana':''}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}><i style={{width:percent(value,max)+'%'}}/><span>{fmt(value)} / {fmt(max)}</span></div>;
}
function Demo(){
 const [s,setState]=useState(()=>fixture()),[menu,setMenuState]=useState<string|null>(null),[paused,setPaused]=useState(false),[error,setError]=useState(''),[raid,setRaid]=useState(false),[tracking,setTracking]=useState(true),[note,setNote]=useState('欢迎来到闪金镇。你的队友已经准备好出发。');
 const [questAccepted,setQuestAccepted]=useState(false);
 const previousFocus=useRef<HTMLElement|null>(null);
 const setMenu=useCallback((next:string|null)=>{if(next&&!menu)previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setMenuState(next);},[menu]);
 useEffect(()=>{if(paused)return;const timer=setInterval(()=>{if(!document.hidden)setState(current=>advance(current,current.wallAt+100).state);},100);return()=>clearInterval(timer);},[paused]);
 useEffect(()=>{const keydown=(event:KeyboardEvent)=>{
  if(event.altKey||event.metaKey||event.ctrlKey||event.repeat||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;
  const item=menuItems.find(item=>item.key.toLowerCase()===event.key.toLowerCase());
  if(item&&!menu){event.preventDefault();setMenu(item.id);}
 };window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);},[menu,setMenu]);
 const snapshot=useMemo(()=>projectClientSnapshot(s,view(s)),[s]);
 const data:GameProps['data']={...content,...snapshot.view};
 const battling=!!s.combat,battle=s.combat||s.lastCombat;
 const currentMap=maps.find(m=>m.id===s.location)||maps[0];
 const units=[s,...s.party];
 const meter=meterRows(battle,s.clock);
 const totalDamage=meter.reduce((sum,row)=>sum+row.damage,0);
 const totalDps=meter.reduce((sum,row)=>sum+row.dps,0);
 const moving=s.activity.type==='travel';
 const elapsed=battle?(battle.endedAt??s.clock)-battle.startedAt:0;
 const send:GameProps['send']=async action=>{try{setState(current=>act(current,action,current.wallAt));return true;}catch(e){setError((e as Error).message);return false;}};
 function chooseMotion(motion:'idle'|'run'|'ride'){
  setError('');setPaused(false);
  setState(current=>{const n=fixture(current.location);n.mounted=motion==='ride'?900020:undefined;
   if(motion==='idle')return n;
   // Long local preview journey: the model runs in place while the camera stays fixed.
   n.activity={type:'travel',from:n.location,to:n.location==='ironforge'?'kharanos':'logging',startedAt:n.clock,endsAt:n.clock+600000};
   return n;
  });setNote(motion==='idle'?'在旅店旁稍作休息。':motion==='ride'?'已骑上棕马，正在赶路。':'沿着林间小径出发。');
 }
 function fight(dungeon=false){
  setError('');setMenu(null);setPaused(false);
  setState(current=>{const n=fixture(current.location);startCombat(n,dungeon?[636,636,1729]:[124,124],true);n.activity={type:'idle'};
   if(n.combat){n.combat.ground=dungeon?'cave':'grass';for(const e of n.combat.enemies){e.hp=e.maxHp=2400;e.minDamage=3;e.maxDamage=5;}}
   return n;
  });setNote(dungeon?'小队已进入地下城。战斗自动进行，向下滚动查看技能伤害。':'发现敌人！队伍已进入战斗。');
 }
 const groupFrames=(compact=false)=><div className={`cu-group ${compact?'compact':''}`}>
  {units.map((unit,i)=>{const st=stats(unit);return <button key={unit.id} className="cu-member" onClick={()=>{setMenu('party');setNote(`${unit.name} · ${classNames[unit.classId]} · ${unit.role||'远程输出'}`);}} style={{'--class-color':classColors[unit.classId]||'#bdad8e'} as CSSProperties}>
   <span className="cu-role">{i===1?'◆':i===2?'✚':'✦'}</span><span className="cu-member-bars"><b>{unit.name}<small>{unit.level}</small></b><span className="cu-member-hp"><i style={{width:percent(unit.hp,st.maxHp)+'%'}}/></span><span className="cu-member-mp"><i style={{width:percent(unit.mana,st.maxMana)+'%'}}/></span></span><em>{Math.round(percent(unit.hp,st.maxHp))}%</em>
  </button>;})}
 </div>;
 const compactMeter=<section className="cu-meter cu-glass"><header><span>伤害输出</span><small>{battle?time(elapsed):'等待开战'}</small></header>
  {meter.length?meter.slice(0,5).map((row,i)=><div className="cu-meter-row" key={row.actorId}><i style={{width:percent(row.damage,Math.max(1,...meter.map(r=>r.damage)))+'%',background:classColors[row.classId]||'#938eb9'}}/><span>{i+1}. {row.name}</span><b>{fmt(row.dps)}</b></div>):<p>开启一场遭遇战<br/><small>在这里实时查看小队 DPS</small></p>}
  <footer><span>小队 DPS</span><b>{fmt(totalDps)}</b></footer>
 </section>;
 return <main className="cu-demo">
  <div className="cu-previewbar"><a href="#details">AZEROTH <span>/ 界面实验 01</span></a><span>独立试玩 · 20 级五人小队</span><button onClick={()=>{setState(fixture());setPaused(false);setQuestAccepted(false);setTracking(true);setRaid(false);setNote('演示已重置。欢迎回到闪金镇。');}}>重置试玩</button></div>
  <section className={`cu-viewport ${battling?'cu-in-combat':''}`} aria-label="经典游戏主界面">
   <div className={`cu-world ${currentMap.id==='goldshire'?'cu-forest':''}`}><WorldScene state={snapshot.player} data={data} busy={false} send={send} animationPaused={paused}/></div>
   <div className="cu-shade"/>
   <div className="cu-topline"><span>艾泽拉斯 · 经典旧世</span><span>{battling?'● 战斗中':moving?'● 旅途中':'● 休息区'}</span></div>
   <button className="cu-player" onClick={()=>setMenu('character')} aria-label="查看角色">
    <span className="cu-portrait"><img src="/interface/classic/characterframe/temporaryportrait-female-human.png" alt="人类法师头像"/><b>{s.level}</b></span>
    <span className="cu-player-bars"><strong>{s.name}<small>人类 · 法师</small></strong><Vital label="生命" value={s.hp} max={data.stats.maxHp}/><Vital label="法力" value={s.mana} max={data.stats.maxMana} mana/></span>
   </button>
   <div className="cu-zone-title"><small>{battling?'ENCOUNTER':currentMap.region==='丹莫罗'?'DUN MOROGH':'ELWYNN FOREST'}</small><h1>{battling?(s.combat?.ground==='cave'?'地下城遭遇战':'林间遭遇战'):currentMap.region}</h1><p>{battling?'五人小队 · 自动战斗':currentMap.desc}</p></div>
   <button className="cu-minimap" onClick={()=>setMenu('map')} aria-label="打开世界地图"><span className="cu-map-circle" style={{backgroundImage:`url(/maps/${currentMap.image})`}}><i>▲</i><b>!</b><small>N</small></span><span>{currentMap.name}</span><em>地图 · M</em></button>
   <aside className="cu-left-hud"><div className="cu-hud-heading"><span>{raid?'团队框架预览':'冒险小队'}</span><button onClick={()=>setRaid(v=>!v)}>{raid?'5 人':'25 人'}</button></div>
    {raid?<div className="cu-raid">{Array.from({length:25},(_,i)=><button key={i} onClick={()=>setMenu('party')} style={{'--class-color':classColors[units[i%5].classId]} as CSSProperties}><span>{i<5?units[i].name:`队员 ${i+1}`}</span><i style={{width:i<5?percent(units[i].hp,stats(units[i]).maxHp)+'%':'100%'}}/></button>)}<small>布局示意 · 当前战斗仍为 5 人</small></div>:groupFrames(true)}
   </aside>
   <aside className="cu-right-hud">{tracking&&<button className="cu-quest-tracker" onClick={()=>setMenu('quests')}><h2>任务追踪 <span>1</span></h2><b>!　{questAccepted?'林间的威胁':'闪金镇的召唤'}</b><p>{questAccepted?'前往林间小径，调查异常动静。':'与治安官杜汉交谈'}</p><small>{questAccepted?'点击查看任务详情':'闪金镇 · 可接取'}</small></button>}{compactMeter}</aside>
   <div className="cu-scene-caption">{!battling&&<><span className="cu-nameplate">{s.name}</span><small>〈艾泽拉斯的旅人〉</small></>}</div>
   <div className="cu-lower-left"><div className="cu-chat"><span>[小队]</span> {note}</div><small>原地动画演示 · 地图与菜单均可点击</small></div>
   <div className="cu-actions" aria-label="场景操作">
    <button disabled={battling} className={!moving&&!battling?'active':''} onClick={()=>chooseMotion('idle')}><Compass size={16}/><span>驻足</span></button>
    <button disabled={battling} className={moving&&!s.mounted?'active':''} onClick={()=>chooseMotion('run')}><Footprints size={16}/><span>移动</span></button>
    <button disabled={battling} className={s.mounted?'active':''} onClick={()=>chooseMotion('ride')}><Icon name="ability_mount_ridinghorse"/><span>骑马</span></button>
    <button className="cu-fight-button" onClick={()=>battling?chooseMotion('idle'):fight()}><Swords size={17}/><span>{battling?'返回探索':'遭遇战'}</span></button>
    <button onClick={()=>setPaused(v=>!v)} aria-label={paused?'继续演示':'暂停演示'} aria-pressed={paused}>{paused?<Play size={16}/>:<Pause size={16}/>}</button>
   </div>
   {paused&&<div className="cu-paused" role="status">演示已暂停</div>}
   <footer className="cu-bottom-ui">
    <div className="cu-xp" role="progressbar" aria-label="经验值" aria-valuemin={0} aria-valuemax={data.nextXp} aria-valuenow={s.xp}><i style={{width:percent(s.xp,data.nextXp)+'%'}}/><span>等级 {s.level} <b>经验 {fmt(s.xp)} / {fmt(data.nextXp)}</b> {Math.round(percent(s.xp,data.nextXp))}%</span></div>
    <nav className="cu-menu" aria-label="游戏菜单"><div className="cu-menu-wing">✥<small>WORLD OF</small><b>AZEROTH</b></div>{menuItems.map(item=><button key={item.id} onClick={()=>setMenu(item.id)} title={`${item.name} (${item.key})`} aria-label={item.name} aria-haspopup="dialog"><span className="cu-icon-frame"><Icon name={item.icon}/><kbd>{item.key}</kbd>{item.id==='quests'&&!questAccepted&&<i/>}</span><span>{item.name}</span></button>)}<div className="cu-menu-wing cu-wallet"><b>12 <i>●</i> 84 <em>●</em></b><small>背包 8 / 48</small><span>20 级 · 联盟</span></div></nav>
   </footer>
  </section>
  <a className="cu-scroll-hint" href="#details"><ChevronDown size={15}/> 向下查看战斗统计与小队详情 <span>桌面横屏时，核心信息同时保留在主界面</span></a>
  <section id="details" className="cu-details"><header><div><small>ADVENTURE JOURNAL</small><h2>每一段旅途，都有迹可循</h2></div><span>{battle?`${battling?'当前':'上一场'}战斗 · ${time(elapsed)}`:'等待下一场冒险'}</span></header>
   <div className="cu-detail-grid"><section className="cu-detail-panel"><header><h3>小队状态</h3><span>5 / 5</span></header>{groupFrames()}<p>点击队员查看队伍；主界面可切换 25 人团队布局预览。</p></section><section className="cu-detail-panel cu-full-meter">{battle?<DamageMeter battle={battle} dungeon={null} clock={s.clock} skills={data.combatSkills||data.skills}/>:<><header><h3>战斗统计</h3><span>DAMAGE / DPS</span></header><div className="cu-meter-empty"><Swords size={30}/><h3>拔剑之前，享受片刻宁静</h3><p>开始遭遇战后，这里显示真实技能伤害、DPS 与占比。</p><button className="cu-gold-button" onClick={()=>fight()}>开始一场遭遇战</button></div></>}</section><section className="cu-detail-panel"><header><h3>旅途记录</h3><span>{battling?'实时':'营地'}</span></header><div className="cu-logs">{battle?s.logs.slice(-7).reverse().map((log:{id:string;at:number;text:string})=><p key={log.id}><time>{time(Math.max(0,log.at-battle.startedAt))}</time>{log.text}</p>):<><p><time>现在</time>你抵达了{currentMap.name}。</p><p><time>小队</time>加瑞克、艾琳、洛恩、塞拉加入了队伍。</p><p><time>提示</time>点击底部图标打开人物、任务、地下城与地图。</p></>}</div><div className="cu-total"><small>累计有效伤害</small><b>{fmt(totalDamage)}</b></div></section></div>
   <p className="cu-disclaimer">界面概念试玩 · 使用独立临时角色，刷新后重置。战斗为现有引擎的五人训练遭遇；菜单中的任务、背包与 PvP 为交互示意。</p>
  </section>
  {error&&<p className="cu-error" role="alert">{error}</p>}
  <Dialog.Root open={!!menu} onOpenChange={open=>{if(!open)setMenu(null);}}><Dialog.Portal><Dialog.Overlay className="cu-dialog-overlay"/><Dialog.Content className="cu-dialog" onCloseAutoFocus={event=>{event.preventDefault();previousFocus.current?.focus();}}><header className="cu-dialog-header"><span className="cu-dialog-medallion"><Icon name={menuItems.find(item=>item.id===menu)?.icon||'inv_misc_book_09'}/></span><div><Dialog.Title>{menuItems.find(item=>item.id===menu)?.name}</Dialog.Title><Dialog.Description>艾泽拉斯旅程 · 界面试玩</Dialog.Description></div><Dialog.Close className="cu-close" aria-label="关闭窗口"><X size={20}/></Dialog.Close></header><div className="cu-dialog-body">
   {menu==='nearby'&&<><p className="cu-panel-intro">{currentMap.name} · 附近人物</p>{[['治安官杜汉','守护森林的安宁','inv_misc_note_01'],['旅店老板法雷','休息，准备下一段旅程','inv_misc_bag_08'],['法师训练师','研习奥术与寒冰','spell_frost_frostbolt02']].map(([name,desc,icon])=><button className="cu-option" key={name} onClick={()=>{setNote(`${name}：欢迎来到${currentMap.name}，旅行者。`);if(name==='治安官杜汉')setMenu('quests');else setNote(`${name}：${name==='法师训练师'?'你的 20 级训练技能已经准备就绪。':'愿你在这里获得片刻安宁。'}`);}}><Icon name={icon}/><span><b>{name}</b><small>{desc}</small></span><em>交谈 ›</em></button>)}<p className="cu-dialog-note" role="status">{note}</p></>}
   {menu==='quests'&&<div className="cu-parchment"><small>艾尔文森林 · 20 级 · 演示任务</small><h2>{questAccepted?'林间的威胁':'闪金镇的召唤'}</h2><p>旅行者，林间小径最近并不太平。召集你的同伴，去看看森林深处发生了什么。</p><h3>任务目标</h3><p>{questAccepted?'探索林间小径，并体验一场遭遇战。':'与闪金镇的治安官杜汉交谈。'}</p><h3>示意奖励</h3><p>1,250 经验值 · 12 银币</p><label><input type="checkbox" checked={tracking} onChange={e=>setTracking(e.target.checked)}/> 在主界面追踪任务</label><button className="cu-gold-button" onClick={()=>{if(questAccepted)fight();else {setQuestAccepted(true);setNote('已接受演示任务：林间的威胁。');}}}>{questAccepted?'前往遭遇战':'接受任务'}</button><small>此任务用于体验窗口交互，不结算到正式游戏。</small></div>}
   {menu==='character'&&<><div className="cu-character-summary"><img src="/interface/classic/characterframe/temporaryportrait-female-human.png" alt="角色头像"/><div><h2>{s.name}</h2><p>{s.level} 级 人类法师</p><small>寒冰与奥术的研习者</small></div></div><div className="cu-stat-grid">{[['生命',`${fmt(s.hp)} / ${fmt(data.stats.maxHp)}`],['法力',`${fmt(s.mana)} / ${fmt(data.stats.maxMana)}`],['当前区域',currentMap.region],['专精','寒冰'],['身份','联盟 · 人类'],['队伍','五人冒险小队']].map(([name,value])=><div key={name}><small>{name}</small><b>{value}</b></div>)}</div><p className="cu-dialog-note">状态跟随演示战斗实时更新。</p></>}
   {menu==='bag'&&<><p className="cu-panel-intro">旅行者的背包 · 示例物品</p><div className="cu-bag-grid">{['inv_misc_book_09','inv_misc_map_01','inv_sword_04','inv_helmet_03','ability_mount_ridinghorse','spell_frost_frostbolt02','inv_misc_note_01','inv_misc_bag_08',...Array(16).fill('')].map((icon,i)=><button key={i} disabled={!icon} aria-label={icon?`查看示例物品 ${i+1}`:'空背包格'} onClick={()=>setNote(`示例物品 ${i+1}：可用于装备、任务或旅行。此窗口展示背包布局。`)}>{icon&&<><Icon name={icon}/><small>{i===0?5:1}</small></>}</button>)}</div><p className="cu-dialog-note" role="status">{note}</p></>}
   {menu==='dungeon'&&<><div className="cu-dungeon-art"><small>WESTFALL</small><h2>死亡矿井</h2><p>五人地下城 · 迪菲亚兄弟会</p></div><p className="cu-panel-intro">深入矿井，体验主场景切换与小队战斗。演示使用三名训练敌人。</p><div className="cu-stat-grid"><div><small>建议等级</small><b>18 — 22</b></div><div><small>队伍配置</small><b>1 坦克 / 1 治疗 / 3 输出</b></div></div><button className="cu-gold-button" onClick={()=>fight(true)}>进入地下城演示</button></>}
   {menu==='pvp'&&<><div className="cu-pvp-banner"><Swords size={46}/><h2>为荣耀而战</h2><p>玩家对战 · 界面预览</p></div>{['战歌峡谷 · 10 对 10 夺旗战','阿拉希盆地 · 15 对 15 资源争夺'].map(name=><button className="cu-option" key={name} onClick={()=>setNote(`${name}：你已加入演示队列。此 Demo 不会匹配其他玩家。`)}><Icon name="inv_sword_04"/><span><b>{name}</b><small>独立示意队列</small></span><em>加入 ›</em></button>)}<p className="cu-dialog-note" role="status">{note}</p></>}
   {menu==='party'&&<><p className="cu-panel-intro">小队已集结 · 1 坦克 / 1 治疗 / 3 输出</p>{groupFrames()}<div className="cu-dialog-actions"><button className="cu-gold-button" onClick={()=>{setRaid(v=>!v);setMenu(null);}}>{raid?'切换五人小队框架':'预览 25 人团队框架'}</button><button className="cu-gold-button" onClick={()=>fight()}>出发战斗</button></div><p className="cu-dialog-note">25 人模式只预览界面密度，不改变当前五人战斗队伍。</p></>}
   {menu==='map'&&<><div className="cu-atlas" style={{backgroundImage:`url(/maps/${currentMap.image})`}}><span>✦ {currentMap.name}</span></div><p className="cu-panel-intro">选择地区，预览对应的地图场景</p>{maps.map(map=><button key={map.id} className="cu-option" onClick={()=>{setState(fixture(map.id));setPaused(false);setMenu(null);setNote(`你抵达了${map.name}。`);}}><Icon name="inv_misc_map_01"/><span><b>{map.region} · {map.name}</b><small>{map.desc}</small></span><em>{currentMap.id===map.id?'当前位置':'前往 ›'}</em></button>)}</>}
  </div><footer className="cu-dialog-footer">ESC 关闭窗口 <span>独立 UI DEMO</span></footer></Dialog.Content></Dialog.Portal></Dialog.Root>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Demo/>);
