import {useEffect,useState,type FormEvent} from 'react';
type Release={phase:number;openedAt:number|null;phases:{phase:number;name:string;ready:boolean;features:string[]}[]};
export default function AdminContentRelease(){
 const [data,setData]=useState<Release|null>(null),[error,setError]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 async function request(body?:unknown){
  const response=await fetch('/api/admin/content-release',{credentials:'same-origin',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'版本请求失败');return result as Release;
 }
 useEffect(()=>{let active=true;request().then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 async function open(event:FormEvent){
  event.preventDefault();if(!data||busy)return;setBusy(true);setError('');setNotice('');
  try{setData(await request({phase:data.phase+1,reason}));setReason('');setNotice('新版本已全服开放，操作已记录审计。');}
  catch(e){setError((e as Error).message);try{setData(await request());}catch{/* Keep the original error. */}}
  finally{setBusy(false);}
 }
 const next=data?.phases.find(p=>p.phase===data.phase+1&&p.ready);
 return <section className="gm-panel gm-guide" aria-label="版本开放">
  {error&&<p role="alert" className="gm-error">{error}</p>}{notice&&<p role="status" className="gm-notice">{notice}</p>}
  {!data?<p role="status">正在加载版本…</p>:<>
   <h2>当前开放 P{data.phase} · {data.phases.find(p=>p.phase===data.phase)?.name}</h2>
   <p className="gm-muted">{data.openedAt?`开放时间：${new Date(data.openedAt).toLocaleString('zh-CN')}`:'服务器初始版本'}。新旧角色共用服务器阶段，在线角色在下一次同步时生效。</p>
   <div>{data.phases.map(p=><article key={p.phase}><h3>P{p.phase} · {p.name}</h3><span className="gm-tag">{p.phase<=data.phase?'已开放':p.ready?'待开放':'开发中'}</span><ul>{p.features.map(f=><li key={f}>{f}</li>)}</ul></article>)}</div>
   {next?<form onSubmit={open}><h3>开放 P{next.phase} · {next.name}</h3><p>开放后全服可使用以上新内容。版本只向前推进，不能回退。</p><label>开放原因<textarea required maxLength={500} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="gm-primary" disabled={busy||!reason.trim()}>{busy?'正在开放…':`确认全服开放 P${next.phase}`}</button></form>:<p>当前已开放全部已实现版本。</p>}
  </>}
 </section>;
}
