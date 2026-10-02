import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {GameProps,Icon,ItemDisplay,money,duration} from './game-ui';
import {Bank,Auction} from './storage-market';
import Professions from './professions';
import BatchTrade from './batch-trade';

export type CityService={id:string;name:string;npc:string;description:string;greeting:string};

export default function CityServicePanel({service,...props}:GameProps&{service:CityService}){
 const {state:s,data:d,busy,send}=props;
 const [search,setSearch]=useState(''),[count,setCount]=useState(1),[shopMode,setShopMode]=useState('购买'),[trainerTab,setTrainerTab]=useState('class');
 const locked=busy||!d.city?.canInteract;
 const nested={...props,busy:locked};
 if(service.id==='bank')return <Bank {...nested}/>;
 if(service.id==='auction')return <Auction {...nested}/>;
 if(service.id==='professions')return <Professions {...nested}/>;
 if(service.id==='trainer'){
  const weapon=trainerTab==='weapon';
  const tabSkills=d.skills.filter((a:any)=>(a.acquisition==='weapon')===weapon);
  const skills=tabSkills.filter((a:any)=>!a.known&&(a.name+' '+a.nameEn).toLowerCase().includes(search.toLowerCase()));
  return <Tabs value={trainerTab} onValueChange={value=>{setTrainerTab(value);setSearch('');}} className="city-service-body trainer-tabs"><TabsList aria-label="训练技能分类" className="trainer-tabs-list"><TabsTrigger value="class">学习职业技能</TabsTrigger><TabsTrigger value="weapon">学习武器技能</TabsTrigger></TabsList><TabsContent value={trainerTab}><div className="city-service-toolbar"><div><h3>{weapon?'武器技能':d.className+'训练'}</h3><p>可学习 {tabSkills.filter((a:any)=>a.canTrain).length} 项 · 当前等级 {s.level}</p></div><input aria-label={weapon?'搜索武器技能':'搜索职业技能'} placeholder="搜索技能…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
   <div className="city-stock">{skills.map((a:any)=><div className="city-stock-row" key={a.spellId}><Icon src={a.icon} name={a.name}/><div className="grow"><strong>{a.name} <small>{a.rank?.replace('Rank','等级')}</small></strong><small>需要等级 {a.requiredLevel} · {a.canTrain?'可以学习':a.blockedReason}</small></div><Button variant="outline" disabled={locked||!a.canTrain} onClick={()=>send({type:'train',id:a.spellId})}>{money(a.costCopper||0)} · 学习</Button></div>)}{!skills.length&&<p className="empty">没有符合条件的未学技能。</p>}</div>
   {!weapon&&<div className="city-service-toolbar"><div><h3>重新分配天赋</h3><p>{d.canResetTalents?'清空已投入的天赋点，重新规划成长方向。':d.talentResetBlockedReason}</p></div><Button variant="outline" disabled={locked||!d.canResetTalents} onClick={()=>send({type:'resetTalents'})}>重置天赋 · {money(d.talentResetCost)}</Button></div>}</TabsContent>
  </Tabs>;
 }
 if(service.id==='shop'){
  const tabs=<div className="filterbar" aria-label="商人交易">{['购买','出售'].map(mode=><button key={mode} className={shopMode===mode?'active':''} aria-pressed={shopMode===mode} onClick={()=>setShopMode(mode)}>{mode}</button>)}</div>;
  if(shopMode==='出售')return <section className="city-service-body">{tabs}<BatchTrade key={s.id+':'+s.location} {...nested}/></section>;
  const supplies=new Set([159,117,2070,4540,1179,1205,3371,4496,4498]);
  const stock=d.shop.filter((i:any)=>i.name.toLowerCase().includes(search.toLowerCase())||String(i.id)===search).sort((a:any,b:any)=>Number(supplies.has(b.id))-Number(supplies.has(a.id)));
  const valid=Number.isInteger(count)&&count>=1&&count<=20;
  return <section className="city-service-body">{tabs}<div className="city-service-toolbar"><input aria-label="搜索主城商品" placeholder="食物、饮水、背包…" value={search} onChange={e=>setSearch(e.target.value)}/><label>购买份数 <input aria-label="主城购买份数" className="city-quantity" type="number" min={1} max={20} value={count} onChange={e=>setCount(Number(e.target.value))}/></label><Button variant="outline" disabled={locked||!d.city.junkCount||!d.shop.length} onClick={()=>send({type:'sellJunk'})}>出售灰色杂物（{d.city.junkCount} 组）</Button></div><p>点击或悬停商品可查看每份数量和属性；装备与已锁定物品不会被一键出售。</p>
   <div className="city-stock">{stock.map((i:any)=><div className="city-stock-row" key={i.id}><ItemDisplay inspectOnClick className="grow" item={d.items[i.id]||i} details={<>每份 ×{i.count} · {money(i.price)}</>}/><Button variant="outline" disabled={locked||!valid||s.money<i.price*count} onClick={()=>send({type:'buy',id:i.id,count})}>{valid?money(i.price*count):'数量无效'} · 购买</Button></div>)}{!stock.length&&<p className="empty">当前没有符合条件的商品。贸易区有更多日常补给。</p>}</div>
  </section>;
 }
 if(service.id==='inn')return <section className="city-service-body city-inn"><div><h3>在这里安家</h3><p>当前炉石绑定：{d.hearthstone.destinationName}。{d.hearthstone.remaining>0?`冷却剩余 ${duration(d.hearthstone.remaining)}。`:'炉石已经就绪。'}重新绑定不会重置冷却。</p><Button disabled={locked||!d.hearthstone.canBind} onClick={()=>send({type:'bindHearth'})}>{s.hearth===s.location&&d.hearthstone.hasItem?'已将这里设为家':'将炉石绑定在这里'}</Button></div><div><h3>在出发前休整</h3><p>按照当前恢复设置使用随身食物与饮水。没有补给时，脱离战斗也会自然恢复生命与法力。</p><Button variant="outline" disabled={locked} onClick={()=>send({type:'rest'})}>使用补给休息</Button></div></section>;
 if(service.id==='flight')return <section className="city-service-body"><div className="city-service-toolbar"><div><h3>飞行管理员</h3><p>{d.flight?.discovered?`你已经掌握了${d.location.name}的飞行路线。`:`经过${d.location.name}时自动发现飞行点。`}</p></div></div>{d.flight?.routes.map((f:any)=><div className="city-stock-row" key={f.to}><div className="grow"><strong>{f.name}</strong><small>{duration(f.duration)} · {money(f.cost)}{!f.unlocked?' · 需要先发现两端飞行点':''}</small></div><Button variant="outline" disabled={locked||!f.unlocked||s.money<f.cost} onClick={()=>send({type:'fly',to:f.to})}>开始飞行</Button></div>)}</section>;
 if(service.id==='tram')return <section className="city-service-body"><h3>下一站 · 铁炉堡</h3><p>列车在地下穿行，约 3 分钟抵达铁炉堡信使驿站。免费乘坐，途中不能办理城区服务。</p><Button disabled={locked} onClick={()=>send({type:'travel',to:'ironforge'})}>乘坐矿道地铁 · 3 分钟</Button></section>;
 return null;
}
