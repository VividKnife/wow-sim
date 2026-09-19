'use client';
import {useEffect,useState} from 'react';
import {classOptions,racesForClass,raceOptions} from './class-options.js';
import styles from './saves.module.css';

type Save={id:string;name:string;classId:number;raceId:number;level:number;location:string;lastSeenAt:number};
export default function Saves(){
 const [saves,setSaves]=useState<Save[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [name,setName]=useState(''),[classId,setClassId]=useState(8),[raceId,setRaceId]=useState(1),[boost,setBoost]=useState(false),[deleting,setDeleting]=useState<Save|null>(null);
 const [requestId,setRequestId]=useState('');
 async function load(){
  setError('');setLoading(true);
  try{const response=await fetch('/api/saves');const data=await response.json();if(!response.ok)throw new Error(data.error||'无法读取存档');setSaves(data.saves);}
  catch(e){setError(e instanceof Error?e.message:'连接失败，请重试');}finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 return <main className={styles.shell}>
  <header><div className="eyebrow">WOW SIM · 冒险档案</div><h1>选择你的角色</h1><p>每个角色都是一段独立旅程，拥有自己的装备、队友和任务进度。</p></header>
  {error&&<p className={styles.error} role="alert">{error} <button onClick={()=>void load()} disabled={busy}>重新读取</button></p>}
  <section aria-label="我的存档" className={styles.grid}>
   {loading?<p role="status">正在读取存档…</p>:saves.length===0?<p>还没有角色。创建一个，开始你的第一段旅程。</p>:saves.map(save=><article key={save.id} className={styles.card}>
    <small>{raceOptions.find(r=>r.id===save.raceId)?.name} · {classOptions.find(c=>c.id===save.classId)?.name}</small><h2>{save.name}</h2><strong className={styles.level}>等级 {save.level}</strong>
    <p>上次游玩：{new Date(save.lastSeenAt).toLocaleString('zh-CN')}</p>
    <div className={styles.actions}><a href={`/?saveId=${encodeURIComponent(save.id)}`}>进入游戏 →</a><button disabled={busy} onClick={()=>{setDeleting(save);setError('');}}>删除存档</button></div>
    {deleting?.id===save.id&&<div className={styles.confirm} role="alert"><p>永久删除「{save.name}」及其全部队友、装备和进度？此操作无法恢复。</p><button disabled={busy} onClick={async()=>{
     setBusy(true);setError('');try{const response=await fetch(`/api/saves?saveId=${encodeURIComponent(save.id)}`,{method:'DELETE'});const data=await response.json();if(!response.ok)throw new Error(data.error||'删除失败');setSaves(current=>current.filter(s=>s.id!==save.id));setDeleting(null);}catch(e){setError(e instanceof Error?e.message:'删除失败，请重试');}finally{setBusy(false);}
    }}>确认永久删除</button> <button disabled={busy} onClick={()=>setDeleting(null)}>取消</button></div>}
   </article>)}
  </section>
  <form className={styles.creation} onChange={()=>setRequestId('')} onSubmit={async event=>{
   event.preventDefault();setBusy(true);setError('');const id=requestId||crypto.randomUUID();setRequestId(id);
   try{const response=await fetch('/api/saves',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:name.trim(),classId,raceId,boost,requestId:id})});const data=await response.json();if(!response.ok)throw new Error(data.error||'创建失败');setRequestId('');setName('');await load();}
   catch(e){setError(e instanceof Error?e.message:'创建失败，请重试');}finally{setBusy(false);}
  }}><h2>新的旅程</h2><fieldset disabled={busy||loading}>
   <label>角色名字<input value={name} onChange={e=>setName(e.target.value)} required maxLength={16} placeholder="1–16 个字"/></label>
   <label>职业<select value={classId} onChange={e=>{const id=Number(e.target.value);setClassId(id);if(!racesForClass(id).some(r=>r.id===raceId))setRaceId(racesForClass(id)[0].id);}}>{classOptions.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>种族<select value={raceId} onChange={e=>setRaceId(Number(e.target.value))}>{racesForClass(classId).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
   <label>起始进度<select value={boost?'20':'1'} onChange={e=>setBoost(e.target.value==='20')}><option value="1">等级 1 · 从北郡启程</option><option value="20">等级 20 · 测试直升</option></select></label>
  </fieldset>
  {boost&&<p className={styles.boost}>测试直升礼包：20 级、本职业可用的任务装备、四个 14 格符文布背包、旅行棕马（移速 +60%，不限种族并附赠骑术）及 20 级以内的训练师技能。天赋由你分配。从闪金镇出发，前往暴风城完成「同路人」，解锁队伍并自行选择队友。</p>}
  <button type="submit" disabled={busy||loading||!name.trim()||saves.length>=20}>{busy?'处理中…':boost?'创建 20 级测试存档':'创建 1 级角色'}</button><small>最多保留 20 个独立存档。</small>
  </form>
 </main>;
}
