'use client';
import {useId,useState,type CSSProperties} from 'react';
import {Button} from '@/components/ui/button';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {ItemDisplay,type GameProps} from './game-ui';
import './gold-auction.css';
const gold=(v:number)=>(v/10000).toLocaleString('zh-CN',{maximumFractionDigits:4});
const colors:Record<number,string>={0:'#9d9d9d',1:'#eee',2:'#1eff00',3:'#5aabff',4:'#bc72f4',5:'#ff8000'};
const timer=(ms:number)=>{const n=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
function AuctionRow({lot:a,state:s,data:d,busy,send,closed=false}:GameProps&{lot:any;closed?:boolean}){
 const [expanded,setExpanded]=useState(false),[offer,setOffer]=useState(''),[limit,setLimit]=useState(a.playerLimit==null?'':String(a.playerLimit/10000)),[target,setTarget]=useState(a.eligible?.[0]?.id||'');
 const detailsId=useId(),item=d.items[a.itemId]||{name:a.name},leading=a.leader==='player',remaining=closed?0:Math.max(0,a.endsAt-s.clock),expired=!closed&&remaining===0;
 const amount=offer===''?a.minimum:Math.round(Number(offer)*10000),eligible=a.eligible?.some((c:any)=>c.id===target);
 const reason=closed?(a.winnerId?'已成交':'已流拍'):leading?'你已领先':expired?'正在落槌':!eligible?'无法使用':a.playerPassed?'已放弃':a.playerLimit!=null&&amount>a.playerLimit?'已达上限':amount>s.money?'金币不足':!Number.isSafeInteger(amount)||amount<a.minimum?'报价过低':null;
 const placeBid=()=>send({type:'goldBid',lotId:a.id,amount,quotedMinimum:a.minimum,recipient:target});
 return <article className={`gold-lot ${closed?'is-closed':''} ${leading?'is-leading':''} ${!closed&&remaining<=4000?'is-ending':''}`} style={{'--loot-color':colors[item.quality??1]} as CSSProperties} aria-label={`${a.name} · ${closed?'竞拍结果':'竞拍中'}`}>
  <div className="gold-lot-main">
   <div className="gold-lot-item"><ItemDisplay item={item} instance={{count:a.count}} auction size={42}/><small>{a.count>1&&<span>×{a.count} · </span>}{closed?(a.winnerId?`${a.winner} 拍得`:'无人出价'):leading?'你的出价领先':a.winner?`${a.winner} 领先`:'等待首次出价'}</small></div>
   <div className="gold-lot-price"><strong>{gold(a.price||(!closed?a.minimum:0))} <span>金</span></strong><time aria-label={closed?'竞拍已结束':`剩余 ${timer(remaining)}`}>{timer(remaining)}</time></div>
   <Button className="gold-lot-bid" variant="outline" disabled={busy||!!reason} onClick={placeBid}>{reason||`出价 ${gold(amount)} G`}</Button>
  </div>
  {!closed&&<div className="gold-lot-progress" role="progressbar" aria-label="竞拍剩余时间" aria-valuenow={Math.ceil(remaining/1000)} aria-valuemin={0} aria-valuemax={a.windowMs/1000}><i style={{width:`${Math.min(100,remaining/a.windowMs*100)}%`}}/></div>}
  {!closed&&<div className="gold-lot-tools"><span>{a.playerLimit!=null?`上限 ${gold(a.playerLimit)} 金`:`每次加价 ${gold(a.step)} 金`}</span><button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={()=>setExpanded(!expanded)}>{expanded?'收起设置 −':'出价设置 ＋'}</button></div>}
  {!closed&&a.bidNotice&&<p className="gold-lot-notice" role="status">{a.bidNotice}</p>}
  {!closed&&expanded&&<div className="gold-lot-details" id={detailsId}>
   {a.eligible.length>1&&<label>领取角色<GameSelect aria-label={`${a.name} 领取角色`} value={target} onValueChange={setTarget} disabled={busy}>{a.eligible.map((c:any)=><GameSelectOption value={c.id} key={c.id}>{c.name}</GameSelectOption>)}</GameSelect></label>}
   <label>本次出价（金）<input aria-label={`${a.name} 本次出价`} type="number" min={a.minimum/10000} step={a.step/10000} placeholder={gold(a.minimum)} value={offer} disabled={busy||leading} onChange={e=>setOffer(e.target.value)}/></label>
   <label>出价上限（金）<input aria-label={`${a.name} 出价上限`} type="number" min="0.0001" step="1" placeholder="不限" value={limit} disabled={busy} onChange={e=>setLimit(e.target.value)}/></label>
   <div className="gold-lot-actions"><Button size="sm" variant="outline" disabled={busy||limit!==''&&(!Number.isFinite(Number(limit))||Number(limit)<=0)} onClick={()=>send({type:'goldBidLimit',lotId:a.id,amount:limit===''?null:Math.round(Number(limit)*10000)})}>保存上限</Button><Button size="sm" variant="ghost" disabled={busy||leading} onClick={()=>send({type:'goldPass',lotId:a.id})}>{a.playerPassed?'恢复竞拍':'放弃此件'}</Button>{offer!==''&&<Button size="sm" variant="ghost" onClick={()=>setOffer('')}>使用最低价</Button>}</div>
   <small>上限仅限制手动出价，不会自动追价。被超过时，托管金币全额退回。</small>
   {!!a.bids.length&&<ol className="gold-lot-history">{a.bids.slice(-5).reverse().map((b:any,i:number)=><li key={i}><span>{b.name}</span><span>{gold(b.amount)} 金</span></li>)}</ol>}
  </div>}
 </article>;
}
export function GoldAuctionPanel(props:GameProps){
 const {data:d,state:s}=props,g=d.goldRaid,[collapsed,setCollapsed]=useState(false),[history,setHistory]=useState(true),bodyId=useId();
 const active=g.auctions.length,escrow=g.auctions.filter((a:any)=>a.leader==='player').reduce((sum:number,a:any)=>sum+a.price,0);
 return <section className="gold-auction-panel" aria-label="金团竞拍">
  <header className="gold-auction-header"><div><h2>战利品竞拍 <span>{active} 件进行中</span></h2><small>可用 {gold(s.money)} 金{escrow>0&&` · 已托管 ${gold(escrow)} 金`}</small></div><button type="button" aria-expanded={!collapsed} aria-controls={bodyId} onClick={()=>setCollapsed(!collapsed)}>{collapsed?'展开 ＋':'折叠 −'}</button></header>
  <div id={bodyId} hidden={collapsed}><div className="gold-auction-list">{g.auctions.map((a:any)=><AuctionRow {...props} lot={a} key={a.id}/>)}{!active&&<p className="gold-auction-empty">本批竞拍已结束</p>}{history&&g.sales.slice(-8).reverse().map((a:any)=><AuctionRow {...props} lot={a} key={a.id} closed/>)}</div>
   <footer className="gold-auction-footer"><small>每件独立竞拍 · 加价后重置 12 秒 · 可继续战斗</small>{g.sales.length>0&&<button type="button" aria-expanded={history} onClick={()=>setHistory(!history)}>{history?'收起成交':'近期成交'} ({g.sales.length})</button>}</footer>
  </div>
 </section>;
}

export function GoldAuctionDock(props:GameProps){
 const [open,setOpen]=useState(false),bodyId=useId(),g=props.data.goldRaid;
 return <aside className="gold-auction-dock" aria-label="战斗中竞拍" onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
  <button type="button" className="gold-auction-dock-toggle" aria-expanded={open} aria-controls={bodyId} onClick={()=>setOpen(!open)}>战利品竞拍 · {g.auctions.length} 件 {open?'收起 −':'展开 ＋'}</button>
  {open&&<div id={bodyId}><GoldAuctionPanel {...props}/></div>}
 </aside>;
}
