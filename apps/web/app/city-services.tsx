"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps,Icon,money,duration} from './game-ui';
import {Bank,Auction} from './storage-market';
import Professions from './professions';

export type CityService={id:string;name:string;npc:string;description:string;greeting:string};

export default function CityServicePanel({service,...props}:GameProps&{service:CityService}){
 const {state:s,data:d,busy,send}=props;
 const [search,setSearch]=useState(''),[count,setCount]=useState(1);
 const locked=busy||!d.city?.canInteract;
 const nested={...props,busy:locked};
 if(service.id==='bank')return <Bank {...nested}/>;
 if(service.id==='auction')return <Auction {...nested}/>;
 if(service.id==='professions')return <Professions {...nested}/>;
 if(service.id==='trainer'){
  const skills=d.skills.filter((a:any)=>!a.known&&(a.name+' '+a.nameEn).toLowerCase().includes(search.toLowerCase()));
  return <section className="city-service-body"><div className="city-service-toolbar"><div><h3>{d.className}训练</h3><p>可学习 {d.skills.filter((a:any)=>a.canTrain).length} 项 · 当前等级 {s.level}</p></div><input aria-label="搜索主城训练技能" placeholder="搜索技能…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
   <div className="city-stock">{skills.map((a:any)=><div className="city-stock-row" key={a.spellId}><Icon src={a.icon} name={a.name}/><div className="grow"><strong>{a.name} <small>{a.rank?.replace('Rank','等级')}</small></strong><small>需要等级 {a.requiredLevel} · {a.canTrain?'可以学习':a.blockedReason}</small></div><Button variant="outline" disabled={locked||!a.canTrain} onClick={()=>send({type:'train',id:a.spellId})}>{money(a.costCopper||0)} · 学习</Button></div>)}{!skills.length&&<p className="empty">没有符合条件的未学技能。</p>}</div>
   <div className="city-service-toolbar"><div><h3>重新分配天赋</h3><p>{d.canResetTalents?'清空已投入的天赋点，重新规划成长方向。':d.talentResetBlockedReason}</p></div><Button variant="outline" disabled={locked||!d.canResetTalents} onClick={()=>send({type:'resetTalents'})}>重置天赋 · {money(d.talentResetCost)}</Button></div>
  </section>;
 }
 if(service.id==='shop'){
  const supplies=new Set([159,117,2070,4540,1179,1205,3371,4496,4498]);
  const stock=d.shop.filter((i:any)=>i.name.toLowerCase().includes(search.toLowerCase())||String(i.id)===search).sort((a:any,b:any)=>Number(supplies.has(b.id))-Number(supplies.has(a.id)));
  const valid=Number.isInteger(count)&&count>=1&&count<=20;
  return <section className="city-service-body"><div className="city-service-toolbar"><input aria-label="搜索主城商品" placeholder="食物、饮水、背包…" value={search} onChange={e=>setSearch(e.target.value)}/><label>购买份数 <input aria-label="主城购买份数" className="city-quantity" type="number" min={1} max={20} value={count} onChange={e=>setCount(Number(e.target.value))}/></label><Button variant="outline" disabled={locked||!d.city.junkCount||!d.shop.length} onClick={()=>send({type:'sellJunk'})}>出售灰色杂物（{d.city.junkCount} 组）</Button></div><p>每份数量标在商品名旁；装备与已锁定物品不会被一键出售。</p>
   <div className="city-stock">{stock.map((i:any)=><div className="city-stock-row" key={i.id}><Icon src={i.icon} name={i.name}/><div className="grow"><strong>{i.name}</strong><small>每份 ×{i.count} · {money(i.price)}</small></div><Button variant="outline" disabled={locked||!valid||s.money<i.price*count} onClick={()=>send({type:'buy',id:i.id,count})}>{valid?money(i.price*count):'数量无效'} · 购买</Button></div>)}{!stock.length&&<p className="empty">当前没有符合条件的商品。贸易区有更多日常补给。</p>}</div>
  </section>;
 }
 if(service.id==='inn')return <section className="city-service-body city-inn"><div><h3>在这里安家</h3><p>当前炉石绑定：{d.hearthstone.destinationName}。{d.hearthstone.remaining>0?`冷却剩余 ${duration(d.hearthstone.remaining)}。`:'炉石已经就绪。'}重新绑定不会重置冷却。</p><Button disabled={locked||!d.hearthstone.canBind} onClick={()=>send({type:'bindHearth'})}>{s.hearth===s.location&&d.hearthstone.hasItem?'已将这里设为家':'将炉石绑定在这里'}</Button></div><div><h3>在出发前休整</h3><p>按照当前恢复设置使用随身食物与饮水。没有补给时，脱离战斗也会自然恢复生命与法力。</p><Button variant="outline" disabled={locked} onClick={()=>send({type:'rest'})}>使用补给休息</Button></div></section>;
 if(service.id==='flight')return <section className="city-service-body"><div className="city-service-toolbar"><div><h3>狮鹫塔</h3><p>{s.flightPoints.includes('stormwind')?'你已经掌握了暴风城的飞行路线。':'与管理员交谈，发现暴风城飞行点。'}</p></div><Button disabled={locked||s.flightPoints.includes('stormwind')} onClick={()=>send({type:'unlockFlight'})}>{s.flightPoints.includes('stormwind')?'飞行点已发现':'发现飞行点'}</Button></div>{d.city.flights.map((f:any)=><div className="city-stock-row" key={f.to}><div className="grow"><strong>{f.name}</strong><small>{duration(f.duration)} · {money(f.cost)}{!f.unlocked?' · 需要先发现两端飞行点':''}</small></div><Button variant="outline" disabled={locked||!f.unlocked||s.money<f.cost} onClick={()=>send({type:'fly',to:f.to})}>乘坐狮鹫</Button></div>)}</section>;
 if(service.id==='tram')return <section className="city-service-body"><h3>下一站 · 铁炉堡</h3><p>列车在地下穿行，约 3 分钟抵达铁炉堡信使驿站。免费乘坐，途中不能办理城区服务。</p><Button disabled={locked} onClick={()=>send({type:'travel',to:'ironforge'})}>乘坐矿道地铁 · 3 分钟</Button></section>;
 return null;
}
