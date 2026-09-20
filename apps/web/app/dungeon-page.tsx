"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps,Item} from './game-ui';
import {filterJournal,journalSelection,journalLootPage} from '../lib/dungeon-journal.js';
import Dungeon from './dungeon';
import './dungeon-page.css';

const slots:Record<number,string>={1:'头部',2:'颈部',3:'肩部',4:'衬衣',5:'胸部',6:'腰部',7:'腿部',8:'脚',9:'腕部',10:'手',11:'手指',12:'饰品',13:'单手',14:'盾牌',15:'远程',16:'背部',17:'双手',20:'胸部',21:'主手',22:'副手',23:'副手物品',25:'投掷',26:'远程'};

function BossLoot({boss}:{boss:any}){
 const [includeShared,setIncludeShared]=useState(false),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 const result=journalLootPage(boss.loot,{includeShared,query,page});
 return <>
  <div className="eyebrow">{boss.rare?'稀有首领':'首领档案'}</div><h3>{boss.name}</h3><p>{boss.description}</p>
  <div className="section-heading"><h4>战利品</h4><small>{result.total} 件{query?'匹配':'收录'}物品</small></div>
  <div className="journal-loot-toolbar"><label className="journal-search"><span>搜索该首领的掉落</span><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="输入物品名称"/></label>{result.hiddenShared>0&&<label className="journal-shared-toggle"><input type="checkbox" checked={includeShared} onChange={e=>{setIncludeShared(e.target.checked);setPage(1);}}/>包含共享掉落（{result.hiddenShared}）</label>}</div>
  {result.items.length>0?<ul className="journal-loot-list">{result.items.map((item:any)=><li key={item.id}><Item item={item}/><div className="journal-loot-meta"><span>{slots[item.slot]||'其他物品'}{item.chance!=null&&` · 掉落率 ${item.chance}%`}</span><span>{item.source||boss.name}</span></div></li>)}</ul>:<p className="journal-empty">{query?'没有匹配的掉落物品。':result.hiddenShared&&!includeShared?'暂无专属掉落，可勾选查看共享掉落。':'暂无收录的装备掉落。'}</p>}
  {result.pages>1&&<nav className="journal-pagination" aria-label="掉落分页"><Button size="sm" variant="outline" disabled={result.page===1} onClick={()=>setPage(result.page-1)}>上一页</Button><span>第 {result.page} / {result.pages} 页</span><Button size="sm" variant="outline" disabled={result.page===result.pages} onClick={()=>setPage(result.page+1)}>下一页</Button></nav>}
  <p className="footnote">经典旧世资料 · 掉落率为参考值，单次挑战不保证获得。</p>
 </>;
}

export default function DungeonPage(props:GameProps&{onOpenParty:()=>void;onConfigure:()=>void}){
 const {state:s,data:d,onOpenParty,onConfigure}=props;
 const [query,setQuery]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null),[bossId,setBossId]=useState<string|null>(null);
 const journal=d.dungeonJournal||[],matches=filterJournal(journal,query);
 const {selected,boss,entry,expedition}=journalSelection(d,selectedId,bossId);
 const members=d.recovery?.members||[],roles=d.strategyMembers||[];
 const hasRole=(role:string)=>roles.some((member:any)=>member.role===role);
 return <div className="dungeon-page">
  <header className="panel dungeon-page-intro"><div><div className="eyebrow">冒险指南 · 经典旧世</div><h1>地下城手册</h1><p>从艾泽拉斯的幽深矿道到古老城塞，查阅首领与战利品，规划下一场冒险。</p></div><span className="dungeon-page-status">{journal.length} 座地下城 · {journal.filter((x:any)=>x.playable).length} 座可挑战</span></header>
  {expedition&&<Dungeon {...props} data={{...d,dungeon:expedition}}/>}
  <section className="panel dungeon-journal" aria-label="地下城手册">
   {selected?<>
    <div className="journal-breadcrumb"><Button variant="outline" size="sm" onClick={()=>{setSelectedId(null);setBossId(null);}}>← 所有地下城</Button><span>经典旧世 / {selected.name}</span></div>
    <header className={'journal-detail-header '+(selected.playable?'is-playable':'')}><div className="journal-emblem" aria-hidden="true">⚔</div><div><div className="eyebrow">{selected.zone} · {selected.groupSize||5} 人地下城</div><h2>{selected.name}</h2><p>{selected.description}</p><div className="journal-tags"><span>最低等级 {selected.minimumLevel}</span><span>建议等级 {selected.recommendedLevel}</span><span className={selected.playable?'journal-playable':'journal-info'}>{selected.playable?'可挑战':'仅供查阅 · 尚未开放挑战'}</span></div></div></header>
    <div className="journal-detail-body"><nav className="journal-bosses" aria-label="选择首领"><div className="eyebrow">首领 · {selected.bosses.length}</div>{selected.bosses.map((b:any,index:number)=><button type="button" key={b.id} aria-pressed={boss?.id===b.id} onClick={()=>setBossId(b.id)}><span className="journal-boss-number">{String(index+1).padStart(2,'0')}</span><span>{b.name}{b.rare&&<small>稀有首领</small>}</span><span aria-hidden="true">›</span></button>)}</nav>
     <div className="journal-loot" aria-live="polite">{boss?<BossLoot key={`${selected.id}:${boss.id}`} boss={boss}/>:<p className="journal-empty">暂无收录的首领资料。</p>}</div>
    </div>
    {entry&&<Dungeon {...props} data={{...d,dungeon:entry}}/>}
    {expedition&&selected.playable&&<p className="footnote">当前冒险显示在手册上方。离开当前副本后，可前往此地下城入口。</p>}
   </>:<>
    <div className="journal-toolbar"><div><h2>探索地下城</h2><p>选择地下城，查看首领档案与掉落。</p></div><label className="journal-search"><span>搜索地下城、区域或首领</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="例如：监狱、范克里夫"/></label></div>
    <p className="journal-result-count" role="status">{query?`找到 ${matches.length} 座地下城`:`已收录 ${journal.length} 座地下城`}</p>
    <div className="journal-grid">{matches.map((dungeon:any,index:number)=><button type="button" key={dungeon.id} className={'journal-card '+(dungeon.playable?'is-playable':'')} onClick={()=>{setSelectedId(dungeon.id);setBossId(null);}}><div className="journal-card-top"><span className="journal-card-index" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><span className={dungeon.playable?'journal-playable':'journal-info'}>{dungeon.playable?'可挑战':'仅供查阅'}</span></div><span className="eyebrow">{dungeon.zone}</span><h3>{dungeon.name}</h3><p>{dungeon.description}</p><div className="journal-card-bottom"><span>最低 {dungeon.minimumLevel} · 建议 {dungeon.recommendedLevel} 级</span><span aria-hidden="true">查阅 →</span></div></button>)}</div>
    {!matches.length&&<p className="journal-empty">没有找到匹配的地下城。试试其他名称或首领。</p>}
   </>}
  </section>
  {!expedition&&<section className="panel" aria-label="地下城准备"><div className="section-heading"><h2>出发检查</h2><small>建议搭配坦克、治疗与输出</small></div><div className="dungeon-preparation">
   <div><small>小队成员</small><strong>{members.length||s.party.length+1} / 5 人</strong><Button variant="outline" onClick={onOpenParty}>管理队伍</Button></div>
   <div><small>战斗配置</small><strong>{hasRole('tank')?'坦克已就位':'建议配置坦克'} · {hasRole('healer')?'治疗已就位':'建议配置治疗'}</strong><Button variant="outline" onClick={onConfigure}>配置角色天赋与策略</Button></div>
   <div><small>共享补给</small><strong>食物 {d.recovery?.food??0} · 饮水 {d.recovery?.water??0}</strong><span>倒下成员 {members.filter((member:any)=>member.hp<=0).length} 人</span></div>
  </div></section>}
 </div>;
}
