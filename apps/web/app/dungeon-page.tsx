"use client";
import QuestScenes from './quest-scenes';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps} from './game-ui';
import {filterJournal,journalSelection,journalLevelStatus} from '../lib/dungeon-journal.js';
import Dungeon from './dungeon';
import AdventureHall from './adventure-hall';
import BossLoot from './boss-loot';
import JournalAtlas from './journal-atlas';
import './dungeon-page.css';

export default function DungeonPage(props:GameProps&{onOpenParty:()=>void;onConfigure:()=>void;onObserve:()=>void}){
 const {state:s,data:d,onOpenParty,onConfigure}=props;
 const [query,setQuery]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null),[bossId,setBossId]=useState<string|null>(null);
 const [view,setView]=useState<'bosses'|'map'>('bosses');
 const [levelOnly,setLevelOnly]=useState(false);
 const journal=d.dungeonJournal||[],matches=filterJournal(journal,query).filter((dungeon:any)=>!levelOnly||journalLevelStatus(dungeon,s.level).eligible);
 const {selected,boss,entry,expedition}=journalSelection(d,selectedId,bossId);
 const members=d.recovery?.members||[];
 const roles=d.npcWorld?.selected?[d.strategyMembers?.find((member:any)=>member.id===s.id),...d.npcWorld.selected].filter(Boolean):d.strategyMembers||[];
 const hasRole=(role:string)=>roles.some((member:any)=>member.role===role);
 return <div className="dungeon-page">
  <header className="panel dungeon-page-intro"><div><h1>地下城手册</h1><p>查阅首领与掉落，选择地下城后前往入口。</p></div><span className="dungeon-page-status">{journal.length} 座地下城 · {journal.filter((x:any)=>x.playable).length} 座已开放</span></header>
  {!expedition&&<section className="panel dungeon-ready" aria-label="地下城准备"><div className="section-heading"><h2>出发准备</h2><small>建议搭配坦克、治疗与输出</small></div><div className="dungeon-preparation">
   <div><small>小队成员</small><strong>{(d.npcWorld?.selected.length??s.party.length)+1} / 5 人</strong><Button variant="outline" disabled={!d.partyUnlocked} title={!d.partyUnlocked?'18级解锁冒险者大厅':undefined} onClick={onOpenParty}>管理队伍</Button></div>
   <div><small>战斗配置</small><strong>{hasRole('tank')?'坦克已就位':'建议配置坦克'} · {hasRole('healer')?'治疗已就位':'建议配置治疗'}</strong><Button variant="outline" onClick={onConfigure}>调整策略</Button></div>
   <div><small>共享补给</small><strong>食物 {d.recovery?.food??0} · 饮水 {d.recovery?.water??0}</strong><span>倒下成员 {members.filter((member:any)=>member.hp<=0).length} 人</span></div>
  </div></section>}
  {!expedition&&<details className="panel dungeon-roster"><summary>副本出征名单 <small>邀请持久 NPC 玩家</small></summary><AdventureHall {...props} compact/></details>}
  {expedition&&<Dungeon {...props} data={{...d,dungeon:expedition}}/>}
  {expedition&&<QuestScenes {...props}/>}<section className="panel dungeon-journal" aria-label="地下城手册">
   {selected?<>
    <div className="journal-breadcrumb"><Button variant="outline" size="sm" onClick={()=>{setSelectedId(null);setBossId(null);}}>← 所有地下城</Button><span>经典旧世 / {selected.name}</span></div>
    <header className={'journal-detail-header '+(selected.playable?'is-playable':'')} style={{backgroundImage:`linear-gradient(90deg,rgba(17,15,12,.96),rgba(17,15,12,.48)),url(${selected.background})`}}><div className="journal-emblem" aria-hidden="true">⚔</div><div><div className="eyebrow">{selected.zone} · {selected.groupSize||5} 人地下城</div><h2>{selected.name}</h2><p>{selected.description}</p><div className="journal-tags"><span>最低等级 {selected.minimumLevel}</span><span>建议等级 {selected.recommendedLevel}</span><span className={journalLevelStatus(selected,s.level).eligible?'journal-playable':'journal-info'}>{journalLevelStatus(selected,s.level).label}</span></div></div></header>
    {entry&&<Dungeon {...props} data={{...d,dungeon:entry}}/>}
    <div className="journal-view-tabs" aria-label="手册内容"><Button variant={view==='bosses'?'default':'outline'} aria-pressed={view==='bosses'} onClick={()=>setView('bosses')}>首领与战利品</Button><Button variant={view==='map'?'default':'outline'} aria-pressed={view==='map'} onClick={()=>setView('map')} disabled={!selected.atlas&&!selected.atlasPack}>副本地图</Button></div>
    {view==='map'?<JournalAtlas key={selected.id} dungeon={selected} onSelectBoss={id=>{setBossId(id);setView('bosses');}}/>:<div className="journal-detail-body"><nav className="journal-bosses" aria-label="选择首领"><div className="eyebrow">首领 · {selected.bosses.length}</div>{selected.bosses.map((b:any,index:number)=><button type="button" key={b.id} aria-pressed={boss?.id===b.id} onClick={()=>setBossId(b.id)}>{b.portrait&&<img className="journal-boss-thumb" src={b.portrait} alt="" loading="lazy"/>}<span className="journal-boss-number">{String(index+1).padStart(2,'0')}</span><span>{b.name}{b.rare&&<small>稀有首领</small>}</span><span aria-hidden="true">›</span></button>)}</nav>
     <div className="journal-loot" aria-live="polite">{boss?<BossLoot key={`${selected.id}:${boss.id}`} boss={boss}/>:<p className="journal-empty">暂无收录的首领资料。</p>}</div>
    </div>}
    {expedition&&selected.playable&&<p className="footnote">当前冒险显示在手册上方。离开当前副本后，可前往此地下城入口。</p>}
   </>:<>
    <div className="journal-toolbar"><div><h2>探索地下城</h2><p>选择地下城，查看首领档案与掉落。</p></div><label className="journal-search"><span>搜索地下城、区域或首领</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="例如：监狱、范克里夫"/></label></div>
    <div className="journal-filter-row"><div className="filterbar" aria-label="地下城等级筛选"><button type="button" aria-pressed={!levelOnly} className={!levelOnly?'active':''} onClick={()=>setLevelOnly(false)}>全部地下城</button><button type="button" aria-pressed={levelOnly} className={levelOnly?'active':''} onClick={()=>setLevelOnly(true)}>等级符合</button></div><p className="journal-result-count" role="status">{matches.length} 座 · 当前 {s.level} 级</p></div>
    <div className="journal-grid">{matches.map((dungeon:any,index:number)=><button type="button" key={dungeon.id} className={'journal-card '+(dungeon.playable?'is-playable':'')} onClick={()=>{setSelectedId(dungeon.id);setBossId(null);setView('bosses');}}><img className="journal-card-art" src={dungeon.background} alt="" loading="lazy"/><div className="journal-card-top"><span className="journal-card-index" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><span className={journalLevelStatus(dungeon,s.level).eligible?'journal-playable':'journal-info'}>{journalLevelStatus(dungeon,s.level).label}</span></div><span className="eyebrow">{dungeon.zone}</span><h3>{dungeon.name}</h3><div className="journal-card-bottom"><span>最低 {dungeon.minimumLevel} · 建议 {dungeon.recommendedLevel} 级</span><span aria-hidden="true">查阅 →</span></div></button>)}</div>
    {!matches.length&&<p className="journal-empty">没有找到匹配的地下城。试试其他名称或首领。</p>}
   </>}
  </section>

 </div>;
}
