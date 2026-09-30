import AdminRewards from './admin-rewards';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Activity,ArrowLeft,BookOpen,ChevronLeft,ChevronRight,LayoutDashboard,LogOut,RefreshCw,Search,ShieldCheck,Users,X} from 'lucide-react';
import './admin.css';

type AdminUser={id:string;username:string};
type Row=Record<string,unknown>;
const sections=[{id:'overview',label:'运营概览',icon:LayoutDashboard},{id:'players',label:'玩家管理',icon:Users},{id:'saves',label:'存档与角色',icon:BookOpen},{id:'activities',label:'活动巡检',icon:Activity},{id:'rewards',label:'礼包与 Buff',icon:BookOpen},{id:'audit',label:'操作审计',icon:ShieldCheck}];
const actions:Record<string,string>={ban:'封禁账号',unban:'解除封禁',revoke:'强制退出',register:'创建管理员',saveGift:'保存礼包',sendGift:'发放礼包',issueBuff:'发布 Buff',revokeBuff:'撤销 Buff'};
const columns:Record<string,[string,string][]>= {
 players:[['username','玩家'],['id','账号 ID'],['saves','存档数'],['created_at','注册时间'],['blocked_reason','账号状态']],
 saves:[['name','角色'],['username','所属玩家'],['level','等级'],['class_id','职业 ID'],['created_at','创建时间']],
 activities:[['id','活动 ID'],['account_id','存档 ID'],['type','类型'],['status','状态'],['next_event_at','下次处理']],
 audit:[['created_at','操作时间'],['action','操作'],['target','目标'],['reason','原因'],['admin_id','管理员 ID']],
};
async function api(path:string,body?:unknown){
 const response=await fetch(`/api/admin/${path}`,{credentials:'same-origin',...(body!==undefined?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
 const result=await response.json();
 if(!response.ok)throw Object.assign(new Error(result.error||'请求失败，请重试。'),{status:response.status});
 return result;
}
function display(key:string,value:unknown){
 if(key==='blocked_reason')return value?`已封禁 · ${value}`:'正常';
 if(value===null||value===undefined||value==='')return '—';
 if(['created_at','next_event_at'].includes(key))return new Date(Number(value)).toLocaleString('zh-CN',{hour12:false});
 if(key==='action')return actions[String(value)]||String(value);
 return String(value);
}
export default function Admin(){
 const [admin,setAdmin]=useState<AdminUser|null>(null),[setup,setSetup]=useState(false),[ready,setReady]=useState(false);
 const [section,setSection]=useState('overview'),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(0),[revision,setRevision]=useState(0);
 const [rawData,setData]=useState<{rows?:Row[];hasMore?:boolean;[key:string]:unknown}|null>(null),[loadedKey,setLoadedKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [pending,setPending]=useState<{action:string;target:string;username:string}|null>(null),[reason,setReason]=useState(''),[detail,setDetail]=useState<unknown>(null);
 const requestKey=JSON.stringify([admin?.id,section,query,page,revision]);
 const loading=!!admin&&loadedKey!==requestKey;
 const data=loading?null:rawData;
 const dialog=useRef<HTMLDialogElement>(null),detailDialog=useRef<HTMLDialogElement>(null);
 const refresh=()=>setRevision(value=>value+1);
 const failure=(value:Error&{status?:number})=>{setError(value.message);if(value.status===401){setAdmin(null);setData(null);setDetail(null);setPending(null);}};
 useEffect(()=>{let active=true;api('session').then(value=>{if(active){setAdmin(value.admin);setSetup(value.setupRequired);setReady(true);}}).catch(value=>{if(active){setError(value.message);setReady(true);}});return()=>{active=false;};},[]);
 useEffect(()=>{
  if(!admin||section==='rewards')return;
  let active=true;
  api(`${section}?search=${encodeURIComponent(query)}&page=${page}`).then(value=>{if(active){setData(value);setError('');}}).catch(value=>{if(active){setData(null);failure(value);}}).finally(()=>{if(active)setLoadedKey(requestKey);});
  return()=>{active=false;};
 },[admin,section,query,page,revision,requestKey]);
 useEffect(()=>{if(pending)dialog.current?.showModal();else dialog.current?.close();},[pending]);
 useEffect(()=>{if(detail)detailDialog.current?.showModal();else detailDialog.current?.close();},[detail]);
 async function authenticate(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setError('');
  try{const result=await api(setup?'register':'login',{username:form.get('username'),password:form.get('password')});setAdmin(result.admin);setSetup(false);}
  catch(value){failure(value as Error);try{setSetup((await api('session')).setupRequired);}catch{/* Retain the original error. */}}
  finally{setBusy(false);}
 }
 async function moderate(event:FormEvent){
  event.preventDefault();if(!pending)return;setBusy(true);setError('');
  try{await api('moderate',{action:pending.action,target:pending.target,reason});setNotice(`${actions[pending.action]}成功，已记录操作审计。`);setPending(null);setReason('');refresh();}
  catch(value){failure(value as Error);}finally{setBusy(false);}
 }
 if(!ready)return <main className="gm-root gm-auth"><p role="status">正在连接管理服务…</p></main>;
 if(!admin)return <main className="gm-root gm-auth"><form className="gm-auth-card" onSubmit={authenticate}>
  <div className="gm-brand"><ShieldCheck size={30}/><span>AZEROTH <small>GAME MASTER CONSOLE</small></span></div>
  <p className="gm-eyebrow">安全管理入口 / ADMIN</p><h1>{setup?'创建首位管理员':'管理员登录'}</h1>
  <p className="gm-muted">{setup?'尚未配置管理员。首个注册成功的账号将成为管理员，此后注册入口自动关闭。':'使用独立的 GM 账号访问运营控制台。'}</p>
  <label>管理员用户名<input name="username" autoComplete="username" pattern="[a-zA-Z0-9_-]{3,32}" minLength={3} maxLength={32} required placeholder="3–32 位字母、数字、_ 或 -"/></label>
  <label>密码<input name="password" type="password" autoComplete={setup?'new-password':'current-password'} minLength={12} maxLength={128} required placeholder="至少 12 个字符"/></label>
  {error&&<p className="gm-error" role="alert">{error}</p>}
  <button className="gm-primary" disabled={busy}>{busy?'正在验证…':setup?'创建管理员并进入':'进入管理后台'}</button>
  <a href="/"><ArrowLeft size={15}/>返回游戏</a><p className="gm-muted gm-small">会话有效期 8 小时 · 管理操作全程留痕</p>
 </form></main>;
 return <div className="gm-root gm-shell">
  <aside className="gm-sidebar"><div className="gm-brand"><ShieldCheck size={28}/><span>AZEROTH<small>GM 管理后台</small></span></div>
   <p className="gm-eyebrow">管理工作台</p><nav aria-label="管理导航">{sections.map(item=><button key={item.id} aria-current={section===item.id?'page':undefined} onClick={()=>{setSection(item.id);setQuery('');setSearch('');setPage(0);setNotice('');}}><item.icon size={18}/>{item.label}</button>)}</nav>
   <div className="gm-sidebar-footer"><span className="gm-indicator"/>管理员 · {admin.username}<a href="/"><ArrowLeft size={15}/>返回游戏</a><button disabled={busy} onClick={async()=>{setBusy(true);try{await api('logout',{});setAdmin(null);setData(null);setDetail(null);}catch(value){failure(value as Error);}finally{setBusy(false);}}}><LogOut size={15}/>退出登录</button></div>
  </aside>
  <main className="gm-main"><header className="gm-header"><div><p className="gm-eyebrow">AZEROTH / OPERATIONS</p><h1>{sections.find(item=>item.id===section)?.label}</h1><p className="gm-muted">{section==='overview'?'掌握世界状态，管理每一段冒险。':section==='players'?'查询玩家账号，处理访问权限与登录会话。':section==='saves'?'查看存档归属与角色数据，辅助定位游戏问题。':section==='activities'?'检查活动状态与调度时间，定位运行异常。':section==='rewards'?'配置礼包、发放奖励和定制服务器增益。':'追溯管理行为、目标与处理原因。'}</p></div><button onClick={refresh} disabled={loading&&section!=='rewards'}><RefreshCw size={16}/>刷新</button></header>
   {error&&<p role="alert" className="gm-error">{error}</p>}{notice&&<p role="status" className="gm-notice">{notice}</p>}
   {section==='rewards'?<AdminRewards key={revision}/>:section==='overview'?<><div className="gm-stats">{[['players','注册玩家'],['saves','游戏存档'],['characters','角色总数'],['online','近 1 分钟活跃存档'],['active','进行中活动'],['instances','进行中副本'],['blocked','已封禁玩家']].map(([key,label])=><article key={key}><span>{label}</span><strong>{loading?'…':String(data?.[key]??'—')}</strong></article>)}</div>
   <section className="gm-panel gm-guide"><h2>日常管理</h2><div><article><Users/><h3>玩家支持</h3><p>通过用户名定位账号；封禁、解封和强制退出均需填写原因。</p><button onClick={()=>setSection('players')}>查看玩家 →</button></article><article><BookOpen/><h3>问题排查</h3><p>检查角色存档与运行活动，了解等级、持有货币及角色状态。</p><button onClick={()=>setSection('saves')}>查看存档 →</button></article><article><ShieldCheck/><h3>操作追溯</h3><p>查询管理员执行的操作，核对目标账号、处理时间及原因。</p><button onClick={()=>setSection('audit')}>查看审计 →</button></article></div></section><p className="gm-muted gm-small">活跃存档按最近 1 分钟连接记录统计；点击刷新获取最新数据。</p></>:
   <section className="gm-panel"><form className="gm-search" onSubmit={event=>{event.preventDefault();setQuery(search.trim());setPage(0);refresh();}}><Search size={18}/><input aria-label="搜索" value={search} maxLength={100} placeholder={section==='players'?'搜索用户名或账号 ID':section==='saves'?'搜索角色名、玩家或存档 ID':'搜索 ID、状态或审计内容'} onChange={event=>setSearch(event.target.value)}/><button type="submit">搜索</button></form>
    <div className="gm-table-wrap" aria-busy={loading}><table><thead><tr>{columns[section].map(([key,label])=><th key={key}>{label}</th>)}{['players','saves'].includes(section)&&<th>操作</th>}</tr></thead><tbody>
     {data?.rows?.map(row=><tr key={String(row.id)}>{columns[section].map(([key])=><td key={key} title={display(key,row[key])}>{key==='blocked_reason'?<span className={row[key]?'gm-tag gm-tag-danger':'gm-tag'}>{display(key,row[key])}</span>:display(key,row[key])}</td>)}
      {section==='players'&&<td><div className="gm-actions">{[row.blocked_reason?'unban':'ban','revoke'].map(action=><button key={action} onClick={()=>{setReason('');setError('');setPending({action,target:String(row.id),username:String(row.username)});}}>{actions[action]}</button>)}</div></td>}
      {section==='saves'&&<td><button disabled={busy} onClick={async()=>{setBusy(true);try{setDetail(await api(`save?id=${encodeURIComponent(String(row.id))}`));}catch(value){failure(value as Error);}finally{setBusy(false);}}}>查看详情</button></td>}
     </tr>)}
     {(!data?.rows?.length)&&<tr><td className="gm-empty" colSpan={columns[section].length+1}>{loading?'正在加载数据…':error?'数据加载失败，请重试。':'暂无匹配记录'}</td></tr>}
    </tbody></table></div><footer className="gm-pagination"><span>第 {page+1} 页 · 每页 25 条</span><div><button aria-label="上一页" disabled={page===0||loading} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={16}/></button><button aria-label="下一页" disabled={!data?.hasMore||loading} onClick={()=>setPage(value=>value+1)}><ChevronRight size={16}/></button></div></footer>
   </section>}
  </main>
  <dialog ref={dialog} className="gm-dialog" onCancel={event=>{if(busy)event.preventDefault();else setPending(null);}}><form onSubmit={moderate}><h2>{pending&&actions[pending.action]}</h2><p>目标玩家：<strong>{pending?.username}</strong></p><p className="gm-muted">{pending?.action==='ban'?'将阻止登录并撤销现有会话。':pending?.action==='revoke'?'将撤销全部登录会话，玩家可以重新登录。':'玩家将可以重新登录游戏。'}</p><label>操作原因<textarea value={reason} onChange={event=>setReason(event.target.value)} required maxLength={500} rows={4} placeholder="填写处理依据，记录到操作审计"/></label>{error&&<p role="alert" className="gm-error">{error}</p>}<div className="gm-dialog-actions"><button type="button" disabled={busy} onClick={()=>setPending(null)}>取消</button><button className="gm-primary" disabled={busy||!reason.trim()}>{busy?'正在提交…':'确认执行'}</button></div></form></dialog>
  <dialog ref={detailDialog} className="gm-dialog gm-detail" onCancel={()=>setDetail(null)}><header><h2>存档与角色详情</h2><button aria-label="关闭详情" onClick={()=>setDetail(null)}><X size={18}/></button></header><p className="gm-muted">角色状态及钱包余额（铜币），用于排查存档问题。</p><pre>{JSON.stringify(detail,null,2)}</pre></dialog>
 </div>;
}
