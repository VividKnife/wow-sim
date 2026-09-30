import {useEffect,useMemo,useState} from 'react';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {Button} from '@/components/ui/button';
import {GameProps,ItemDisplay,money,duration} from './game-ui';
import BatchTrade from './batch-trade';
import {useContentPack} from '../lib/use-content-pack';
import {auctionContentError} from '../lib/auction-content.js';
import {marketAvailability} from '../../../packages/sim-core/src/market-stock.js';
import type {MarketItem,AuctionListing,MarketRecord,InventoryItem} from './economy-types';
import phaseReference from '../../../packages/game-data/data/market-content-phases.json';
import './auction-house.css';

const categories=[['all','所有物品'],['weapons','武器'],['armor','护甲'],['containers','容器'],['consumables','消耗品'],['materials','商品'],['projectiles','弹药'],['quivers','箭袋'],['recipes','配方'],['reagents','施法材料'],['enchants','附魔羊皮纸'],['misc','杂项']];
const tabs=['浏览','拍卖','成交记录'];
const PAGE_SIZE=8;
const armorOrder=['布甲','皮甲','锁甲','板甲','盾牌','披风','饰品与杂项'];
const slotOrder=['头部','颈部','肩部','背部','胸部','衬衣','战袍','手腕','手部','腰部','腿部','脚部','手指','饰品','副手','其他'];
export function AuctionMoney({value}:{value:number}){
 const coins=[['gold',Math.floor(value/10000)],['silver',Math.floor(value%10000/100)],['copper',value%100]] as const;
 return <span className="ah-money" aria-label={money(value)}>{coins.map(([kind,n])=><span key={kind} aria-hidden="true">{n}<img src={`/interface/classic/moneyframe/ui-${kind}icon.png`} alt=""/></span>)}</span>;
}
export default function Auction(props:GameProps){
 const {data,error,retry}=useContentPack(props.data.contentVersion,props.data.market?.length?undefined:'market');
 const catalogError=useMemo(()=>props.data.market?.length?auctionContentError(props.data):'', [props.data]);
 if(catalogError)return <section className="panel" role="alert">{catalogError}<Button onClick={()=>window.location.reload()}>刷新页面</Button></section>;
 if(props.data.market?.length)return <AuctionContent {...props}/>;
 if(!data)return <section className="panel" role={error?'alert':'status'}>{error||'正在加载拍卖商品…'}{error&&<><Button onClick={retry}>重试</Button><Button onClick={()=>window.location.reload()}>刷新页面</Button></>}</section>;
 return <AuctionContent {...props} data={{...props.data,...data,items:{...props.data.items,...data.items}}}/>;
}
export function AuctionContent({state:s,data:d,busy,send}:GameProps){
 const [tab,setTab]=useState('浏览'),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[category,setCategory]=useState('all');
 const [subcategory,setSubcategory]=useState(''),[slot,setSlot]=useState(''),[expanded,setExpanded]=useState('');
 const [quality,setQuality]=useState('all'),[minLevel,setMinLevel]=useState(''),[maxLevel,setMaxLevel]=useState(''),[levelOnly,setLevelOnly]=useState(false);
 const [count,setCount]=useState(1),[page,setPage]=useState(0),[selected,setSelected]=useState<number|null>(null),[sort,setSort]=useState('name'),[descending,setDescending]=useState(false),[notice,setNotice]=useState('');
 const clockBase=s.marketClock??s.clock;
 const [elapsed,setElapsed]=useState(0);
 useEffect(()=>{setElapsed(0);const start=performance.now();const timer=setInterval(()=>setElapsed(performance.now()-start),1000);return()=>clearInterval(timer);},[s.id,clockBase]);
 const marketClock=clockBase+(s.marketClock===undefined?0:elapsed);
 const locked=busy||!!s.combat||!!s.dungeon||!!s.escort||s.hp<=0||!['idle','hunt'].includes(s.activity.type);
 const valid=Number.isInteger(count)&&count>=1&&count<=100;
 const catalog=useMemo(()=>(d.market as MarketItem[]).filter(r=>r.phase<=phaseReference.currentPhase),[d.market]);
 const children=useMemo(()=>Object.fromEntries(categories.map(([id])=>[id,[...new Set(catalog.filter(r=>r.category===id).map(r=>r.subcategory))].sort((a,b)=>id==='armor'?armorOrder.indexOf(a)-armorOrder.indexOf(b):a.localeCompare(b,'zh-CN'))])),[catalog]);
 const childSlots=(id:string,child:string)=>[...new Set(catalog.filter(r=>r.category===id&&r.subcategory===child&&r.slot).map(r=>r.slot))].sort((a,b)=>slotOrder.indexOf(a)-slotOrder.indexOf(b));
 function chooseCategory(id:string,child='',part=''){setCategory(id);setSubcategory(child);setSlot(part);setPage(0);setSelected(null);setNotice('');}
 const market=useMemo(()=>catalog.filter(r=>{const i=d.items[r.id];return i&&i.name.toLowerCase().includes(query.trim().toLowerCase())&&(category==='all'||r.category===category)&&(!subcategory||r.subcategory===subcategory)&&(!slot||r.slot===slot)&&(quality==='all'||i.quality===Number(quality))&&(!minLevel||i.level>=Number(minLevel))&&(!maxLevel||i.level<=Number(maxLevel))&&(!levelOnly||i.level<=s.level);}).sort((a,b)=>{
  const diff=sort==='price'?a.buy-b.buy:sort==='level'?d.items[a.id].level-d.items[b.id].level:d.items[a.id].name.localeCompare(d.items[b.id].name,'zh-CN');return (diff||a.id-b.id)*(descending?-1:1);
 }),[catalog,d.items,query,category,subcategory,slot,quality,minLevel,maxLevel,levelOnly,s.level,sort,descending]);
 const pages=Math.max(1,Math.ceil(market.length/PAGE_SIZE)),current=Math.min(page,pages-1),visible=market.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE);
 const chosen=visible.find(r=>r.id===selected),stock=chosen?marketAvailability(s.marketStock,marketClock,chosen):null,total=chosen&&valid?chosen.buy*count:0;
 const reason=locked?'当前无法交易':!chosen?'请先选择一件物品':!valid?'请输入 1—100 的整数':stock!.available<count?'库存不足，请等待补货':s.money<total?'金币不足':'';
 const sellable=s.bag.filter((i:InventoryItem)=>d.inventoryActions[i.uid]?.tradable&&d.items[i.id]?.quality<=3);
 const net=sellable.reduce((sum:number,i:InventoryItem)=>sum+Math.floor(d.inventoryActions[i.uid].quote.sell*i.count*.95),0);
 function changeSort(next:string){setDescending(sort===next?!descending:false);setSort(next);setPage(0);}
 function reset(){setSearch('');setQuery('');setCategory('all');setQuality('all');setMinLevel('');setMaxLevel('');setLevelOnly(false);setPage(0);setSelected(null);setSubcategory('');setSlot('');setExpanded('');setNotice('');}
 async function buy(){if(reason||!chosen)return;const ok=await send({type:'auctionBuy',id:chosen.id,count});if(ok)setNotice(`已购入 ${d.items[chosen.id].name} ×${count}，花费 ${money(total)}`);}
 const sortButton=(key:string,label:string)=><button type="button" onClick={()=>changeSort(key)}>{label}{sort===key?(descending?' ▾':' ▴'):''}</button>;
 return <section className="ah-frame" aria-label="拍卖行">
  <header className="ah-title"><img src="/interface/classic/gossipframe/auctioneergossipicon.png" alt=""/><h2>拍卖行</h2><span>P{phaseReference.currentPhase} · 艾泽拉斯联合拍卖行</span></header>
  <div className="ah-content">
  {tab==='浏览'&&<>
   <form className="ah-search" onSubmit={e=>{e.preventDefault();setQuery(search);setPage(0);setSelected(null);}}>
    <label className="ah-name-search">名称<input aria-label="搜索拍卖商品" placeholder="输入物品名称" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <fieldset><legend>等级范围</legend><input aria-label="最低物品等级" type="number" min={0} max={60} value={minLevel} onChange={e=>{setMinLevel(e.target.value);setPage(0);}}/><span>—</span><input aria-label="最高物品等级" type="number" min={0} max={60} value={maxLevel} onChange={e=>{setMaxLevel(e.target.value);setPage(0);}}/></fieldset>
    <label className="ah-quality">品质<GameSelect aria-label="拍卖物品品质" value={quality} onValueChange={v=>{setQuality(v);setPage(0);}}>{[['all','所有品质'],['1','普通'],['2','优秀'],['3','精良'],['4','史诗']].map(([value,name])=><GameSelectOption key={value} value={value}>{name}</GameSelectOption>)}</GameSelect></label>
    <button className="ah-button" type="submit">搜索</button>
   </form>
   <div className="ah-browse">
    <aside className="ah-categories" aria-label="拍卖商品分类"><h3>物品分类</h3><div className="ah-category-tree">{categories.map(([id,name])=>{
     const branches=children[id]||[],open=expanded===id;
     return <div className="ah-category-group" key={id}>
      <button type="button" aria-pressed={category===id&&!subcategory} aria-expanded={branches.length?open:undefined} className={category===id&&!subcategory?'is-active':''} onClick={()=>{chooseCategory(id);setExpanded(open?'':id);}}><span className={branches.length?'ah-disclosure':'ah-leaf'} aria-hidden="true">{branches.length?(open?'−':'+'):'·'}</span>{name}</button>
      {open&&branches.length>0&&<div className="ah-subcategories" aria-label={`${name}子分类`}>{branches.map(child=>{
       const parts=childSlots(id,child),active=category===id&&subcategory===child;
       return <div key={child}><button type="button" aria-pressed={active&&!slot} aria-expanded={parts.length?active:undefined} className={active&&!slot?'is-active':''} onClick={()=>chooseCategory(id,active?'':child)}><span className={parts.length?'ah-disclosure':'ah-leaf'} aria-hidden="true">{parts.length?(active?'−':'+'):'·'}</span>{child}</button>
        {active&&parts.length>0&&<div className="ah-slots" aria-label={`${child}部位`}>{parts.map(part=><button type="button" key={part} aria-pressed={slot===part} className={slot===part?'is-active':''} onClick={()=>chooseCategory(id,child,part)}>{part}</button>)}</div>}
       </div>;
      })}</div>}
     </div>;
    })}</div><label className="ah-level-only"><input type="checkbox" checked={levelOnly} onChange={e=>{setLevelOnly(e.target.checked);setPage(0);setSelected(null);}}/>等级符合</label><button type="button" className="ah-button ah-reset" onClick={reset}>重置筛选</button></aside>
    <div className="ah-results">
     <div className="ah-breadcrumb">{[categories.find(([id])=>id===category)?.[1],subcategory,slot].filter(Boolean).join(' › ')}<span>P{phaseReference.currentPhase}</span></div>
     <div className="ah-table-scroll"><table className="ah-table"><thead><tr><th aria-sort={sort==='name'?(descending?'descending':'ascending'):'none'}>{sortButton('name','物品名称')}</th><th aria-sort={sort==='level'?(descending?'descending':'ascending'):'none'}>{sortButton('level','等级')}</th><th>库存</th><th>卖家</th><th aria-sort={sort==='price'?(descending?'descending':'ascending'):'none'}>{sortButton('price','一口价 / 件')}<small>收购价 / 件</small></th></tr></thead><tbody>
      {visible.map(r=>{const availability=marketAvailability(s.marketStock,marketClock,r);return <tr key={r.id} className={`${selected===r.id?'is-selected':''} ${availability.available===0?'is-sold-out':''}`} onClick={()=>setSelected(r.id)}>
       <td><button type="button" className="ah-item-button" aria-label={`选择 ${d.items[r.id].name}`} aria-pressed={selected===r.id} onClick={()=>setSelected(r.id)}><ItemDisplay item={d.items[r.id]} focusable={false} size={32} details={<>售价 {money(r.buy)} / 件<br/>收购 {money(r.sell)} / 件（另扣 5%）</>}/></button></td>
       <td className={d.items[r.id].level>s.level?'ah-level-high':''}>{d.items[r.id].level||'—'}</td><td><b>{availability.available||'售罄'}</b></td><td className="ah-seller">{r.category==='reagents'?'材料供应商':'贸易商人'}</td><td><AuctionMoney value={r.buy}/><small><AuctionMoney value={r.sell}/></small></td>
      </tr>;})}
     </tbody></table>{!visible.length&&<p className="ah-empty">没有找到匹配的拍卖物品。<button type="button" onClick={reset}>清除筛选</button></p>}</div>
     <div className="ah-pagination"><span>共 {market.length} 件 · 第 {current+1} / {pages} 页</span><button className="ah-button" type="button" aria-label="上一页" disabled={current===0} onClick={()=>{setPage(current-1);setSelected(null);}}>‹</button><button className="ah-button" type="button" aria-label="下一页" disabled={current>=pages-1} onClick={()=>{setPage(current+1);setSelected(null);}}>›</button></div>
    </div>
   </div>
   <div className="ah-purchase"><div className="ah-purchase-summary">{chosen?<><strong>{d.items[chosen.id].name}</strong><small>每件收购净额 <AuctionMoney value={Math.floor(chosen.sell*.95)}/></small></>:<span>选中物品查看价格与库存</span>}</div><label>数量<input aria-label="购买数量" type="number" min={1} max={100} value={count} onChange={e=>setCount(Number(e.target.value))}/></label><div className="ah-total"><small>合计</small><AuctionMoney value={total}/></div><button className="ah-button" type="button" disabled={!!reason} title={reason||`购买 ${count} 件`} onClick={buy}>一口价</button></div>
   {reason&&chosen&&<p className="ah-trade-reason" role="status">{reason}{stock&&stock.available<count&&<> · 预计 {duration(Math.max(0,stock.restockAt-marketClock))} 后补足</>}</p>}
  </>}
  {tab==='拍卖'&&<div className="ah-auctions"><div className="ah-posting"><h3>创建拍卖</h3><p>按收购价上架，30 秒后自动成交，收取 5% 手续费。</p><Button className="ah-button" disabled={locked||!sellable.length||s.auctions.length+sellable.length>100} onClick={()=>send({type:'auctionSellAll'})}>快捷上架 {sellable.length} 组 · 预计 {money(net)}</Button><BatchTrade key={s.id} state={s} data={d} busy={locked} send={send} auction/></div><div className="ah-my-auctions"><h3>我的拍卖 <small>({s.auctions.length}/100)</small></h3>{s.auctions.map((a:AuctionListing)=><article key={a.id}><ItemDisplay item={d.items[a.item.id]} instance={a.item} size={32}/><span>×{a.item.count}</span><small>{duration(Math.max(0,a.endsAt-s.clock))} 后成交</small><span>预计 <AuctionMoney value={a.net}/></span><button type="button" className="ah-button" disabled={locked} onClick={()=>send({type:'auctionCancel',id:a.id})}>取消拍卖</button></article>)}{!s.auctions.length&&<p className="ah-empty">你没有正在进行的拍卖。</p>}</div></div>}
  {tab==='成交记录'&&<div className="ah-history"><h3>最近的成交</h3>{s.marketHistory.map((a:MarketRecord)=><div className="storage-row" key={a.id}><ItemDisplay className="grow" item={d.items[a.item]} instance={{count:a.count}}/><span>×{a.count}</span><span>收购到账 <AuctionMoney value={a.net}/></span></div>)}{!s.marketHistory.length&&<p className="ah-empty">尚无成交记录。售出物品后在这里保留最近 30 条记录。</p>}</div>}
  <div className="ah-status"><span role="status" aria-live="polite">{notice||'一口价即时交货 · 收购成交扣除 5% 手续费'}</span><span className="ah-wallet">余额 <AuctionMoney value={s.money}/></span></div>
  </div>
  <nav className="ah-tabs" aria-label="拍卖行页面">{tabs.map(name=><button type="button" key={name} aria-pressed={tab===name} className={tab===name?'is-active':''} onClick={()=>{setTab(name);setNotice('');}}>{name}</button>)}</nav>
  <details className="ah-help"><summary>交易规则</summary><p>当前开放 P{phaseReference.currentPhase} 商品，后续阶段成品、配方和专属材料随阶段开放。这是采用经典拍卖行界面的单人模拟市场：按参考价一口价购买或上架收购，无玩家竞标和邮寄等待。收购价为税前单价，每组扣除 5% 后取整到账；锁定、绑定、任务物品不可上架。普通材料、商人消耗品与施法材料每 5 分钟补货，普通成品每 15 分钟补货，较贵材料、装备、配方与附魔每 30 分钟补货，10 金以上或史诗货物每 60 分钟补货。每批补至库存上限，不累计囤货。附魔羊皮纸是本作便捷功能。历史市场价随服务器浮动，本作价格为参考估算。</p></details>
 </section>;
}
