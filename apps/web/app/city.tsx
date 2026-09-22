"use client";
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps,duration} from './game-ui';
import CityServicePanel,{type CityService} from './city-services';
import './city.css';
import CreaturePortrait from './creature-portrait';
import {serviceModels} from '../../../packages/game-data/creature-visuals.js';

type District={id:string;name:string;subtitle:string;description:string;point:number[];travel:number|null;visited:boolean;services:CityService[]};

export default function City(props:GameProps){
 const {state:s,data:d,busy,send}=props,city=d.city;
 const [selection,setSelection]=useState<{id:string;origin:string}|null>(null);
 const [opened,setOpened]=useState<{id:string;location:string}|null>(null);
 const [filter,setFilter]=useState('all');
 const serviceRef=useRef<HTMLDivElement>(null),districtRef=useRef<HTMLElement>(null);
 if(!city)return null;
 const districts:District[]=city.districts;
 const selected=districts.find(x=>x.id===(selection&&selection.origin===s.location?selection.id:s.location))||districts[0];
 const current=districts.find(x=>x.id===s.location)!;
 const here=selected.id===s.location,locked=busy||!city.canInteract;
 const active=opened&&opened.location===s.location&&here?selected.services.find(x=>x.id===opened.id):null;
 const choose=(id:string)=>{setSelection({id,origin:s.location});setOpened(null);};
 const open=(service:CityService)=>{
  if(service.id==='quests'){document.getElementById('local-people')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  setOpened({id:service.id,location:s.location});
  requestAnimationFrame(()=>serviceRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'}));
 };
 const guide=(id:string)=>{setFilter(id);const dest=id==='trainer'?city.trainer:districts.find(x=>x.services.some(a=>a.id===id))?.id;if(dest)choose(dest);};
 const visitService=(id:string)=>{const dest=id==='trainer'?city.trainer:districts.find(x=>x.services.some(a=>a.id===id))?.id;if(!dest)return;choose(dest);districtRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});if(dest===s.location){const service=current.services.find(a=>a.id===id);if(service)open(service);}};
 const moving=s.activity.type==='travel';
 const travelLocked=busy||!!s.combat||s.hp<=0||(locked&&!(moving&&!s.activity.flight));
 const free=d.bagCapacity-s.bag.length;
 const checklist=[
  {label:'整理行囊',detail:`背包剩余 ${free} 格${city.junkCount?` · ${city.junkCount} 组灰色杂物`:''}`,ready:free>=4&&!city.junkCount,service:'shop',action:'拜访商人'},
  {label:'存放材料',detail:city.materialCount?`${city.materialCount} 组材料可存入银行`:'材料已整理妥当',ready:!city.materialCount,service:'bank',action:'前往银行'},
  {label:'旅途休整',detail:`生命 ${Math.ceil(s.hp)}/${d.stats.maxHp}${d.resource.max&&d.resource.name==='法力'?` · 法力 ${Math.floor(d.resource.value)}/${d.resource.max}`:''}`,ready:s.hp>=d.stats.maxHp&&(d.resource.name!=='法力'||d.resource.value>=d.resource.max),service:'inn',action:'前往旅店'},
  {label:'炉石归处',detail:`已绑定：${d.hearthstone.destinationName}`,ready:s.hearth==='stormwind',service:'inn',action:'设置归处'},
  {label:'狮鹫航线',detail:s.flightPoints.includes('stormwind')?'暴风城飞行点已发现':'与狮鹫管理员交谈',ready:s.flightPoints.includes('stormwind'),service:'flight',action:'发现航线'},
 ];
 return <section className="city" aria-label="暴风城主城">
  <header className="city-header"><div><div className="city-kicker">人类王国 · 联盟主城</div><h1>暴风城 <span>STORMWIND</span></h1><p>高墙之内，片刻安宁。整顿行装，再赴远方。</p></div><div className="city-location"><span className="city-location-light"/>{moving?'旅途中':'当前所在'}<strong>{moving?(d.map.find((n:any)=>n.id===s.activity.to)?.name||'目的地'):current.name}</strong></div></header>
  <div className="city-guide"><span>✧ 卫兵指路</span><label><span className="sr-only">寻找主城服务</span><GameSelect aria-label="寻找主城服务" value={filter} onValueChange={nextValue=>nextValue==='all'?setFilter('all'):guide(nextValue)}><GameSelectOption value="all">你想去哪里？</GameSelectOption>{[['bank','银行'],['auction','拍卖行'],['trainer',d.className+'训练师'],['professions','生活职业与工坊'],['inn','旅店'],['shop','商人'],['flight','狮鹫管理员'],['tram','矿道地铁']].map(([id,name])=><GameSelectOption key={id} value={id}>{name}</GameSelectOption>)}</GameSelect></label><p>{filter==='all'?'点选城区查看服务，或请卫兵为你指路。':`已标出目的地：${selected.name}。${here?'你就在附近。':'抵达后即可办理。'}`}</p><button className="city-text-button" onClick={()=>{setFilter('all');choose(s.location);}}>定位自己</button></div>
  <div className="city-explore">
   <div className="city-map-wrap"><div className="city-map"><img src="/maps/stormwind-classic.jpg" alt="暴风城城区地图"/><div className="city-map-shade"/>{districts.map((district,index)=><button key={district.id} className={'city-pin '+(selected.id===district.id?'selected ':'')+(s.location===district.id?'current ':'')+(filter!=='all'&&!district.services.some(a=>a.id===filter)?'dimmed':'')} style={{left:district.point[0]+'%',top:district.point[1]+'%'}} onClick={()=>choose(district.id)} aria-label={`查看${district.name}${s.location===district.id?'，当前位置':''}`} aria-pressed={selected.id===district.id}><span>{s.location===district.id?'◆':String(index+1).padStart(2,'0')}</span><b>{district.name}</b></button>)}</div><div className="city-map-caption"><span>◆ 当前位置</span><span>金色 · 选中城区</span><span>点选预览 · 道路计时旅行</span></div></div>
   <aside ref={districtRef} className="city-district" aria-label="城区详情"><div className="city-kicker">{String(districts.indexOf(selected)+1).padStart(2,'0')} / {selected.subtitle}</div><h2>{selected.name}</h2><p>{selected.description}</p><div className="city-district-status"><span>{here?'◆ 你在这里':selected.visited?'曾经到访':'尚未到访'}</span><span>{here?'步行即可办理':selected.travel===null?'暂无连通路线':`路程 ${duration(selected.travel)}`}</span></div>{(!here||moving)&&<Button className="city-travel" disabled={travelLocked||selected.travel===null||moving&&selected.id===s.activity.to} onClick={()=>send({type:'travel',to:selected.id})}>{moving?'改道前往':'前往'}{selected.name} ↗</Button>}
    <div className="city-service-list">{selected.services.map(service=><button key={service.id} className={active?.id===service.id?'active':''} disabled={!here||locked} onClick={()=>open(service)}><CreaturePortrait unit={{entry:serviceModels[service.id as keyof typeof serviceModels]}} className="city-service-portrait"/><div><strong>{service.name}</strong><small>{here?service.npc:'抵达后办理'}</small></div><span aria-hidden="true">↗</span></button>)}</div>{locked&&<p className="city-blocked" role="status">{busy?'正在办理，请稍候…':city.blockedReason}{moving&&` 剩余 ${duration(s.activity.endsAt-s.clock)}`}</p>}
   </aside>
  </div>
  <nav className="city-district-nav" aria-label="暴风城城区列表">{districts.map((district,index)=><button key={district.id} aria-pressed={selected.id===district.id} onClick={()=>choose(district.id)} className={selected.id===district.id?'active':''}><small>{String(index+1).padStart(2,'0')}</small>{district.name}</button>)}</nav>
  {active&&<div className="city-service-panel" ref={serviceRef} aria-label={active.name+'服务面板'}><div className="city-npc"><CreaturePortrait unit={{entry:serviceModels[active.id as keyof typeof serviceModels]}} className="city-service-portrait"/><div className="grow"><div className="city-kicker">{current.name} / {active.name}</div><h2>{active.npc}</h2><p>“{active.greeting}”</p></div><Button variant="ghost" aria-label="关闭主城服务" onClick={()=>setOpened(null)}>关闭 ×</Button></div><CityServicePanel key={active.id+':'+s.location} service={active} {...props}/></div>}
  <div className="city-bottom"><section className="city-readiness"><div className="city-section-heading"><div><div className="city-kicker">出发前的片刻</div><h2>整装待发</h2></div><span>{checklist.filter(c=>c.ready).length} / {checklist.length} 项就绪</span></div><div className="city-checklist">{checklist.map(item=><div key={item.label}><span className={item.ready?'ready':''}>{item.ready?'✓':'○'}</span><div className="grow"><strong>{item.label}</strong><small>{item.detail}</small></div><button className="city-text-button" onClick={()=>visitService(item.service)}>{item.ready?'查看':item.action} ↗</button></div>)}</div></section>
   <section className="city-departures"><div className="city-kicker">城门之外</div><h2>下一段旅程</h2><p>沿熟悉的道路，回到你的冒险中。</p>{city.departures.map((dest:any)=><button key={dest.to} disabled={travelLocked||dest.travel===null||moving&&dest.to===s.activity.to} onClick={()=>send({type:'travel',to:dest.to})}><div><strong>{dest.name}</strong><small>{dest.description}</small></div><span>{dest.travel===null?'不可达':duration(dest.travel)} ↗</span></button>)}</section>
  </div>
 </section>;
}
