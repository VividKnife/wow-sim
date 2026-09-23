"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Item,Icon} from './game-ui';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {journalLootPage} from '../lib/dungeon-journal.js';
import {useContentPack} from '../lib/use-content-pack';

export type JournalBoss=(typeof import('../../../packages/game-domain/src/rules/dungeon-journal.js').dungeonJournal)[number]['bosses'][number];



type BossSummary=Omit<JournalBoss,'loot'>&{loot?:JournalBoss['loot'];lootPack?:string;contentVersion?:string};
export default function BossLoot({boss}:{boss:BossSummary}){
 const {data,error,retry}=useContentPack(boss.contentVersion,boss.lootPack);
 if(boss.loot)return <LoadedBossLoot key={boss.id} boss={boss as JournalBoss}/>;
 if(!data)return <div role="status"><h3>{boss.name}</h3>{error||'正在加载首领掉落…'}{error&&<Button onClick={retry}>重试</Button>}</div>;
 return <LoadedBossLoot key={boss.lootPack} boss={{...boss,...data} as JournalBoss}/>;
}

function LoadedBossLoot({boss}:{boss:JournalBoss}){
 const [includeShared,setIncludeShared]=useState(false),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 const [category,setCategory]=useState('equipment');
 const result=journalLootPage(category==='equipment'?boss.loot.filter(item=>item.slot>0):boss.loot,{includeShared,query,page});
 return <>
  <div className="journal-boss-profile">{boss.portrait&&<img src={boss.portrait} alt={boss.name} className="journal-boss-portrait"/>}<div><div className="eyebrow">{boss.rare?'稀有首领':'首领档案'}</div><h3>{boss.name}</h3><p>{boss.description}</p></div></div>
  {boss.strategy&&<p className="journal-strategy">{boss.strategy}</p>}
  {boss.abilities?.length>0&&<details className="journal-abilities"><summary>技能 · {boss.abilities.length}</summary><ul>{boss.abilities.map(ability=><li key={ability.id}><Icon src={ability.icon} name={ability.name} size={26}/><span>{ability.name}{ability.cooldown&&<small>间隔 {Array.isArray(ability.cooldown)?ability.cooldown.map(n=>n/1000).join('—'):ability.cooldown/1000} 秒</small>}</span></li>)}</ul></details>}
  <div className="section-heading"><h4>战利品</h4><small>{result.total} 件{query?'匹配':'收录'}物品</small></div>
  <div className="journal-loot-toolbar"><label className="journal-search"><span>搜索该首领的掉落</span><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="输入物品名称"/></label><GameSelect aria-label="战利品类型" value={category} onValueChange={value=>{setCategory(value);setPage(1);}}><GameSelectOption value="equipment">装备</GameSelectOption><GameSelectOption value="all">全部物品</GameSelectOption></GameSelect>{result.hiddenShared>0&&<label className="journal-shared-toggle"><input type="checkbox" checked={includeShared} onChange={e=>{setIncludeShared(e.target.checked);setPage(1);}}/>包含共享掉落（{result.hiddenShared}）</label>}</div>
  {result.items.length>0?<ul className="journal-loot-list">{result.items.map((item:JournalBoss['loot'][number])=><li key={item.id}><Item item={item} details={<>{item.chance!=null&&<div>掉落率 {item.chance}%</div>}<div>来源：{item.source||boss.name}</div></>}/></li>)}</ul>:<p className="journal-empty">{query?'没有匹配的掉落物品。':result.hiddenShared&&!includeShared?'暂无专属掉落，可勾选查看共享掉落。':'暂无收录的装备掉落。'}</p>}
  {result.pages>1&&<nav className="journal-pagination" aria-label="掉落分页"><Button size="sm" variant="outline" disabled={result.page===1} onClick={()=>setPage(result.page-1)}>上一页</Button><span>第 {result.page} / {result.pages} 页</span><Button size="sm" variant="outline" disabled={result.page===result.pages} onClick={()=>setPage(result.page+1)}>下一页</Button></nav>}
  <p className="footnote">经典旧世资料 · 掉落率为参考值，单次挑战不保证获得。</p>
 </>;
}

