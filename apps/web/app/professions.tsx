"use client";
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {saveFetch} from '../lib/save-fetch';
import {contentLoader,referencedItemIds} from '../lib/content-loader.js';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps,Icon,ItemDisplay,money,duration} from './game-ui';
import './economy.css';
import type {Profession,Recipe,Resource,Material} from './economy-types';

export function Gathering({state:s,data:d,busy,send}:GameProps){
 const locked=busy||!!s.combat||!['idle','hunt'].includes(s.activity.type),resources=d.resources||[];
 if(!resources.length)return null;
 return <section className="panel gathering-panel"><div className="section-heading"><div><h2>区域资源 <small>{resources.filter((r:Resource)=>r.available).length} 处可采集</small></h2></div><Button disabled={locked||!resources.some((r:Resource)=>r.available)} onClick={()=>send({type:'gatherAll'})}>自动采集本区</Button></div><p>每次采集 3 秒，采完后 5 分钟刷新。自动采集完成本区可采资源后停止；满包时暂停。学习剥皮后，击杀野兽会自动收集皮革。</p><div className="resource-cards">{resources.map((r:Resource)=><div className="resource-card" key={r.id}><Icon src={d.items[r.item]?.icon} name={r.name}/><div className="grow"><strong>{r.name}</strong><small>{d.professions.find((p:Profession)=>p.id===r.profession)?.name} {r.required} · {r.readyAt>s.clock?'刷新中 '+duration(r.readyAt-s.clock):r.available?'可以采集':r.learned?'熟练度不足':'尚未学习'}</small></div><Button size="sm" variant="outline" disabled={locked||!r.available} onClick={()=>send({type:'gatherResource',id:r.id})}>采集</Button></div>)}</div></section>;
}

const colorNames:Record<string,string>={red:'未解锁',orange:'必定提升',yellow:'较易提升',green:'偶尔提升',gray:'不再提升'};
const pageSize=24;
export default function Professions({state:s,data:baseData,busy,revision,send}:GameProps){
 const [selected,setSelected]=useState('alchemy'),[count,setCount]=useState(1),[buyMissing,setBuyMissing]=useState(true),[search,setSearch]=useState(''),[filter,setFilter]=useState('全部'),[page,setPage]=useState(0);
 const [workshop,setWorkshop]=useState<any>({recipes:[],total:0,page:0,pageSize}),[workshopError,setWorkshopError]=useState(''),[workshopLoading,setWorkshopLoading]=useState(false);
 const d={...baseData,items:{...baseData.items,...workshop.items}};
 useEffect(()=>{
  const controller=new AbortController(),params=new URLSearchParams({characterId:s.id,version:d.contentVersion,profession:selected,search,filter,page:String(page),pageSize:String(pageSize)});
  setWorkshopLoading(true);setWorkshopError('');
  saveFetch(`/api/game/workshop?${params}`,{signal:controller.signal}).then(async response=>{const result:any=await response.json().catch(()=>null);if(!response.ok)throw new Error(response.status<500&&typeof result?.error==='string'?result.error:'工坊报价暂时无法加载。');if(result?.contentVersion!==d.contentVersion||!Array.isArray(result?.recipes)||!Number.isInteger(result?.revision))throw new Error('工坊报价响应不完整。');result.items=await contentLoader.ensureItems(d.contentVersion,referencedItemIds(result.recipes));return result;}).then(result=>{if(!controller.signal.aborted)setWorkshop(result);}).catch(error=>{if(error.name!=='AbortError'&&!controller.signal.aborted)setWorkshopError(error.message);}).finally(()=>{if(!controller.signal.aborted)setWorkshopLoading(false);});
  return()=>controller.abort();
 },[s.id,selected,search,filter,page,revision,d.contentVersion]);
 const p:Profession=d.professions.find((p:Profession)=>p.id===selected),rank=p.nextRank;
 const locked=busy||!!s.combat||!!s.dungeon||!['idle','hunt'].includes(s.activity.type),valid=Number.isInteger(count)&&count>=1&&count<=100;
 const recipes:Recipe[]=workshop.recipes,pages=Math.max(1,Math.ceil(workshop.total/pageSize)),current=Math.min(page,pages-1);
 const pagination=<div className="economy-toolbar recipe-pagination"><small>共 {workshop.total} 条 · 第 {current+1} / {pages} 页{workshopLoading?' · 更新中…':''}</small><Button size="sm" variant="outline" disabled={current===0||workshopLoading} onClick={()=>setPage(current-1)}>上一页</Button><Button size="sm" variant="outline" disabled={current>=pages-1||workshopLoading} onClick={()=>setPage(current+1)}>下一页</Button></div>;
 return <div className="economy-layout">
  <aside className="panel profession-sidebar"><div className="eyebrow">经典旧世 · 1—300</div><h2>艾泽拉斯工坊</h2><p>12 项职业 · {d.professionRecipeCount} 条配方。包含经典旧世各阶段配方；{s.growthPolicy==='companion'?'队友最多选择两项生活职业，初始75点。':'每名角色最多学习两个主要专业，副职业不占名额。'}</p><div className="profession-list">{d.professions.map((x:Profession)=><button type="button" aria-pressed={selected===x.id} key={x.id} className={selected===x.id?'active':''} onClick={()=>{setSelected(x.id);setPage(0);setSearch('');}}><span>{x.name}<small>{x.recipeCount?x.recipeCount+' 条配方':x.kind}</small></span><b>{x.learned?`${x.skill} / ${x.cap}`:'未学习'}</b></button>)}</div></aside>
  <div className="economy-main"><section className="panel"><div className="section-heading"><div><div className="eyebrow">{p.kind}</div><h2>{p.name}</h2></div>{p.learned&&<span className="skill-number">{p.skill} / {p.cap}</span>}</div><p>{p.description}</p>
   {p.learned&&<div className="profession-progress"><span style={{width:p.skill/p.cap*100+'%'}}/></div>}
   {rank?<div className="action-row"><small>{rank.name} · 上限 {rank.cap} · 需要等级 {rank.level}、熟练度 {rank.skill}{!d.canTrainProfession?' · 请前往城镇':''}</small><Button size="sm" disabled={locked||!p.learned&&s.growthPolicy==='companion'&&Object.keys(s.professions).length>=2||!d.canTrainProfession||(p.skill||0)<rank.skill||s.level<rank.level||s.money<rank.cost} onClick={()=>send({type:p.learned?'upgradeProfession':'learnProfession',id:p.id})}>{p.learned?'进阶':'学习'} · {money(rank.cost)}</Button></div>:<p>大师级 · 熟练度上限 300</p>}
   {!!p.specializations.length&&<div className="economy-callout"><h3>专业专精</h3><p>当前：{p.specializations.find(x=>x.id===p.specialization)?.name||'未选择'}。初次免费，重选花费 5 金；武器锻造可进一步选择武器大师。</p><div className="specialization-list">{p.specializations.map(x=><Button key={x.id} size="sm" variant="outline" disabled={locked||!d.canTrainProfession||!p.learned||p.skill<x.skill||s.level<x.level||p.specialization===x.id||!!x.parent&&p.specialization!==x.parent&&!p.specializations.some(y=>y.id===p.specialization&&y.parent===x.parent)||!!p.specialization&&s.money<50000} onClick={()=>send({type:'specializeProfession',id:x.id})}>{x.name} · {x.skill} / 等级 {x.level}</Button>)}</div></div>}
   {p.id==='skinning'&&<p>学习后自动处理击杀的野兽；高等级野兽需要更高熟练度。轻皮至硬甲皮均已纳入材料目录，当前地图保持原有资源。</p>}
   {p.id==='enchanting'&&<div className="economy-callout"><h3>装备分解</h3><p>按经典旧世物品的分解表产出尘、精华、碎片与水晶。一键分解仅处理背包中的绿色、蓝色装备；锁定、任务和已装备物品受保护。满包产物保留为待拾取战利品。</p><Button variant="outline" disabled={locked||!d.disenchantable.length} onClick={()=>send({type:'disenchantAll'})}>一键分解 {d.disenchantable.length} 件装备</Button></div>}
  </section>
  {p.recipeCount>0?<section className="panel"><div className="section-heading"><h2>配方制造 <small>{p.recipeCount} 条</small></h2><input aria-label="搜索配方" placeholder="中文、英文或配方编号…" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></div>
   <div className="economy-toolbar"><GameSelect aria-label="筛选配方" value={filter} onValueChange={nextValue=>{setFilter(nextValue);setPage(0);}}>{['全部','已解锁','可提升','专精配方','冷却配方'].map(x=><GameSelectOption value={x} key={x}>{x}</GameSelectOption>)}</GameSelect><label>制造次数 <input aria-label="制造次数" type="number" min={1} max={100} value={count} onChange={e=>setCount(Number(e.target.value))}/></label><label><input type="checkbox" checked={buyMissing} onChange={e=>setBuyMissing(e.target.checked)}/> 拍卖行自动补齐材料与工具</label></div>
   <details className="crafting-help"><summary>材料与制造规则</summary><p>达到熟练度后自动解锁配方。优先消耗背包内未锁定材料，工具保留；银行材料需先取出。有冷却的配方每次制造一次。需要熔炉、铁砧或月亮井时，请到城镇工坊。</p></details>{pagination}
   {workshopError&&<p className="error" role="alert">{workshopError}</p>}<div className="recipe-list">{recipes.map(r=>{
    const cost=r.materials.reduce((n:number,m:Material)=>n+Math.max(0,m.count*count-m.have)*m.price,0)+r.tools.filter(t=>!t.have).reduce((n,t)=>n+t.price,0);
    const cooldown=r.readyAt>s.clock,reason=!r.known?'熟练度或专精不足':!r.facilityReady?'需要城镇工坊':cooldown?'冷却中':r.cooldown&&count!==1?'每次限制造一次':'';
    return <article className={'recipe-card '+(!r.known?'recipe-locked':'')} key={r.id}>
     <div className="recipe-title"><div><ItemDisplay item={d.items[r.item]||{name:r.name}}/><small>需要 {p.name} {r.skill} · 产出 ×{r.output*(valid?count:1)}{r.outputMax>r.output?'—'+r.outputMax*(valid?count:1):''} <span className={'skill-color skill-'+r.color}>{colorNames[r.color]}</span></small></div></div>
     <p className="recipe-source">原始来源：{r.source}{r.specialization?' · '+p.specializations.find(x=>x.id===r.specialization)?.name:''}{r.cooldown?' · 制造冷却 '+duration(r.cooldown):''}{cooldown?' · 剩余 '+duration(r.readyAt-s.clock):''}</p>

     <div className="recipe-materials">{r.materials.map(m=><span className={m.have<m.count*count?'material-missing':''} key={m.id}><ItemDisplay item={d.items[m.id]} size={28}/> <b>{m.have} / {m.count*(valid?count:1)}</b>{m.bank>0&&<small>银行 {m.bank}</small>}</span>)}</div>
     {!!r.tools.length&&<p className="recipe-tools">工具（不消耗）：{r.tools.map(t=><span className={t.have?'':'material-missing'} key={t.id}><ItemDisplay item={d.items[t.id]} size={28}/> {t.have?'✓':'需补购'}　</span>)}</p>}
     <div className="recipe-actions"><small>补购合计：{money(valid?cost:0)}</small><Button size="sm" variant="outline" disabled={locked||!valid||!r.known||cost===0||s.money<cost} onClick={()=>send({type:'buyMaterials',id:r.id,count})}>一键补齐</Button><Button size="sm" disabled={locked||!valid||!!reason||(buyMissing?s.money<cost:cost>0)} onClick={()=>send({type:'craft',id:r.id,count,buyMissing})}>{reason||(buyMissing&&cost>0?'补齐并制造':'制造')}</Button></div>
    </article>;
   })}</div>{!recipes.length&&!workshopLoading&&!workshopError&&<p className="empty">没有匹配的配方。</p>}{workshop.total>pageSize&&pagination}
  </section>:<Gathering state={s} data={d} busy={busy} send={send}/>}

 </div></div>;
}
