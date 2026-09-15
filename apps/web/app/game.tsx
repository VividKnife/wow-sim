"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
export default function Game() {
  const [name,setName]=useState('星落'),[state,setState]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true);
  async function load(body?:any){setBusy(true);try{const r=await fetch('/api/game',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json();if(!r.ok)throw new Error(d.error);setState(d.state)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  useEffect(()=>{load()},[]);
  return <main className="game-shell"><header className="masthead"><a href="/" className="wordmark">WOW<span>SIM</span></a><span className="edition">经典旧世 · 2019 / 第一阶段</span><span className="online-dot">云端存档</span></header><section className="arrival"><div className="eyebrow">第一章 / 艾尔文的晨光</div><h1>你的故事，<br/><em>从北郡开始。</em></h1><p>穿过修道院的大门，学习第一个法术。<br/>从一名新晋法师，成长为死亡矿井的冒险者。</p>{!state?<div className="creation panel"><div className="portrait human"/><div><h2>人类 · 法师</h2><p>联盟 · 北郡山谷 · 等级 1</p></div><label>角色名字<input maxLength={16} value={name} onChange={e=>setName(e.target.value)}/></label><Button onClick={()=>load({type:'create',name,requestId:crypto.randomUUID()})} disabled={busy||!name.trim()}>踏入艾泽拉斯 →</Button></div>:<div className="panel"><h2>{state.name} · Lv. {state.level}</h2><p>北郡修道院 · 生命 {state.hp} · 法力 {state.mana}</p><p>你的角色已保存。</p></div>}{error&&<p className="error" role="alert">{error} <a href="/signin-with-chatgpt?return_to=/">登录并继续</a></p>}<div className="creation-notes"><span>01 原版数值参考</span><span>02 自动施法策略</span><span>03 五人副本</span></div></section><footer>1—20 级 · 人类法师旅程 <span>以经典数据为依据的 2D 单人改编</span></footer></main>
}
