'use client';
import {useEffect,useState,type CSSProperties} from 'react';
import CharacterModel from './character-model';
import {classOptions,raceOptions} from './class-options.js';
import styles from './character-selection.module.css';

export type Save={id:string;name:string;classId:number;raceId:number;level:number;location:string;lastSeenAt:number};
type Appearance={raceId:number;classId:number;equipment:Record<string,{id:number}>;items:Record<string,{slot:number}>;location:string};
const backgrounds:Record<number,string>={1:'elwynn',2:'durotar',3:'dun-morogh',4:'teldrassil',5:'tirisfal-glades',6:'mulgore',7:'dun-morogh',8:'durotar'};
const colors:Record<number,string>={1:'#c79c6e',2:'#f58cba',3:'#abd473',4:'#fff569',5:'#fff',7:'#52aaff',8:'#69ccf0',9:'#9482c9',11:'#ff7d0a'};

function SavedModel({save}:{save:Save}){
 const [appearance,setAppearance]=useState<Appearance|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  async function load(){
   const response=await fetch(`/api/game?saveId=${encodeURIComponent(save.id)}`,{signal:controller.signal});
   const game=await response.json();if(!response.ok)throw new Error(game.error||'无法读取角色外观');
   const player=game.snapshot?.player;if(!player?.equipment||!game.contentVersion)throw new Error('角色外观数据不完整');
   const contentResponse=await fetch(`/api/game/content?version=${encodeURIComponent(game.contentVersion)}`,{signal:controller.signal});
   const content=await contentResponse.json();if(!contentResponse.ok||!content.items||content.contentVersion!==game.contentVersion)throw new Error('装备外观数据暂不可用');
   if(!controller.signal.aborted)setAppearance({raceId:player.raceId,classId:player.classId,equipment:player.equipment,items:content.items,location:game.snapshot.view?.location?.name||save.location});
  }
  void load().catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'无法加载角色');});
  return()=>controller.abort();
 },[save.id,save.location,attempt]);
 if(!appearance)return <div className={styles.loading} role="status">{error||'正在读取角色装备…'}{error&&<button onClick={()=>{setError('');setAttempt(n=>n+1);}}>重新加载</button>}</div>;
 return <><CharacterModel raceId={appearance.raceId} classId={appearance.classId} equipment={appearance.equipment} items={appearance.items} title={`${save.name} · 实际装备 3D 预览`} fallback={<div className={styles.loading}>正在召唤 {save.name}…</div>}/><span className={styles.location}>{appearance.location}</span></>;
}

export default function CharacterSelection({saves,loading,error,onCreate,onDelete,onReload}:{saves:Save[];loading:boolean;error:string;onCreate:()=>void;onDelete:(save:Save)=>Promise<void>;onReload:()=>void}){
 const [selectedId,setSelectedId]=useState(''),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[deleteError,setDeleteError]=useState('');
 const selected=saves.find(save=>save.id===selectedId)||saves[0];
 const race=raceOptions.find(r=>r.id===selected?.raceId),cls=classOptions.find(c=>c.id===selected?.classId);
 const style={'--scene':`url(/maps/${backgrounds[selected?.raceId||1]}-classic.jpg)`,'--class-color':colors[selected?.classId||8]} as CSSProperties;
 return <main className={styles.screen} style={style}>
  <header className={styles.header}><div className={styles.logo}><small>WORLD OF</small><strong>WOW SIM</strong><span>经典旧世</span></div><h1>角色选择</h1><span className={styles.realm}>艾泽拉斯 · 经典旧世</span></header>
  <div className={styles.layout}>
   <section className={styles.stage} aria-label="当前角色预览">{selected?<><div className={styles.identity}><h2>{selected.name}</h2><p>等级 {selected.level} · {race?.name} {cls?.name}</p></div><div className={styles.model}><SavedModel key={selected.id} save={selected}/></div></>:<div className={styles.empty}><h2>{loading?'正在读取角色…':'新的冒险在等待'}</h2><p>{loading?'':error?'请重新读取角色列表。':'创建你的第一个角色，踏入艾泽拉斯。'}</p></div>}</section>
   <aside className={styles.roster}><h2>你的角色 <small>{saves.length} / 20</small></h2><div className={styles.list} role="group" aria-label="选择角色">{saves.map(save=><button key={save.id} disabled={busy} aria-pressed={selected?.id===save.id} className={selected?.id===save.id?styles.selected:''} style={{'--entry-color':colors[save.classId]} as CSSProperties} onClick={()=>{setSelectedId(save.id);setConfirm(false);setDeleteError('');}}><strong>{save.name}</strong><span>等级 {save.level} · {raceOptions.find(r=>r.id===save.raceId)?.name} {classOptions.find(c=>c.id===save.classId)?.name}</span><small>上次冒险 {new Date(save.lastSeenAt).toLocaleDateString('zh-CN')}</small></button>)}</div><button className={styles.redButton} disabled={busy||loading||saves.length>=20} onClick={onCreate}>创建新角色</button><button className={styles.delete} disabled={busy||!selected} onClick={()=>{setConfirm(true);setDeleteError('');}}>删除角色</button></aside>
  </div>
  {error&&<div className={styles.error} role="alert">{error} <button onClick={onReload}>重新读取</button></div>}
  <footer className={styles.footer}><span>{selected?`${race?.faction==='Alliance'?'联盟':'部落'} · ${saves.length} 个角色`:'每个角色拥有独立冒险进度'}</span><button className={styles.enter} disabled={!selected||busy||loading} onClick={()=>selected&&window.location.assign(`/?saveId=${encodeURIComponent(selected.id)}`)}>进入游戏</button><span>选择角色，继续你的冒险</span></footer>
  {confirm&&selected&&<div className={styles.scrim}><section className={styles.confirm} role="alertdialog" aria-modal="true" aria-labelledby="delete-character-title"><h2 id="delete-character-title">删除 {selected.name}？</h2><p>该角色及其全部队友、装备和进度将永久删除，无法恢复。</p>{deleteError&&<p role="alert">{deleteError}</p>}<div><button className={styles.redButton} disabled={busy} onClick={async()=>{setBusy(true);try{await onDelete(selected);setConfirm(false);}catch(e){setDeleteError(e instanceof Error?e.message:'删除失败，请重试');}finally{setBusy(false);}}}>{busy?'正在删除…':'确认永久删除'}</button><button autoFocus className={styles.redButton} disabled={busy} onClick={()=>setConfirm(false)}>取消</button></div></section></div>}
 </main>;
}
