"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Item} from './game-ui';
import {journalLootPage} from '../lib/dungeon-journal.js';
import {useContentPack} from '../lib/use-content-pack';

export type JournalBoss=(typeof import('../../../packages/game-domain/src/rules/dungeon-journal.js').dungeonJournal)[number]['bosses'][number];

const slots:Record<number,string>={1:'头部',2:'颈部',3:'肩部',4:'衬衣',5:'胸部',6:'腰部',7:'腿部',8:'脚',9:'腕部',10:'手',11:'手指',12:'饰品',13:'单手',14:'盾牌',15:'远程',16:'背部',17:'双手',20:'胸部',21:'主手',22:'副手',23:'副手物品',25:'投掷',26:'远程'};

type BossSummary=Omit<JournalBoss,'loot'>&{loot?:JournalBoss['loot'];lootPack?:string;contentVersion?:string};
export default function BossLoot({boss}:{boss:BossSummary}){
 const {data,error,retry}=useContentPack(boss.contentVersion,boss.lootPack);
 if(boss.loot)return <LoadedBossLoot key={boss.id} boss={boss as JournalBoss}/>;
 if(!data)return <div role="status"><h3>{boss.name}</h3>{error||'正在加载首领掉落…'}{error&&<Button onClick={retry}>重试</Button>}</div>;
 return <LoadedBossLoot key={boss.lootPack} boss={{...boss,loot:data.loot} as JournalBoss}/>;
}

function LoadedBossLoot({boss}:{boss:JournalBoss}){
 const [includeShared,setIncludeShared]=useState(false),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 const result=journalLootPage(boss.loot,{includeShared,query,page});
 return <>
  <div className="eyebrow">{boss.rare?'稀有首领':'首领档案'}</div><h3>{boss.name}</h3><p>{boss.description}</p>
  <div className="section-heading"><h4>战利品</h4><small>{result.total} 件{query?'匹配':'收录'}物品</small></div>
  <div className="journal-loot-toolbar"><label className="journal-search"><span>搜索该首领的掉落</span><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="输入物品名称"/></label>{result.hiddenShared>0&&<label className="journal-shared-toggle"><input type="checkbox" checked={includeShared} onChange={e=>{setIncludeShared(e.target.checked);setPage(1);}}/>包含共享掉落（{result.hiddenShared}）</label>}</div>
  {result.items.length>0?<ul className="journal-loot-list">{result.items.map((item:JournalBoss['loot'][number])=><li key={item.id}><Item item={item}/><div className="journal-loot-meta"><span>{slots[item.slot]||'其他物品'}{item.chance!=null&&` · 掉落率 ${item.chance}%`}</span><span>{item.source||boss.name}</span></div></li>)}</ul>:<p className="journal-empty">{query?'没有匹配的掉落物品。':result.hiddenShared&&!includeShared?'暂无专属掉落，可勾选查看共享掉落。':'暂无收录的装备掉落。'}</p>}
  {result.pages>1&&<nav className="journal-pagination" aria-label="掉落分页"><Button size="sm" variant="outline" disabled={result.page===1} onClick={()=>setPage(result.page-1)}>上一页</Button><span>第 {result.page} / {result.pages} 页</span><Button size="sm" variant="outline" disabled={result.page===result.pages} onClick={()=>setPage(result.page+1)}>下一页</Button></nav>}
  <p className="footnote">经典旧世资料 · 掉落率为参考值，单次挑战不保证获得。</p>
 </>;
}

