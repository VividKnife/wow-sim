import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import type {Rules} from '../../../../packages/game-domain/src/model';
import '../../app/globals.css';
import World from '../../app/world';
import Battle from '../../app/battle';
import {Button} from '../../components/ui/button';
import type {GameProps} from '../../app/game-ui';

const content=clientContent();
function PerformanceReadout(){
 const [sample,setSample]=useState('采样中…');
 useEffect(()=>{
  let frame=0,start=performance.now(),previous=start,count=0,longest=0;
  const tick=(now:number)=>{
   longest=Math.max(longest,now-previous);previous=now;count++;
   if(now-start>=2000){setSample(`${Math.round(count*1000/(now-start))} FPS · 最长帧 ${Math.round(longest)} ms`);start=now;count=0;longest=0;}
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[]);
 return <details style={{fontSize:11,color:'#a9b29e',marginBottom:12}}><summary>演示性能</summary><output aria-label="页面帧率">{sample}</output></details>;
}
function Demo(){
 const [snapshot,setSnapshot]=useState<{player:Rules;view:Rules}|null>(null),[mode,setMode]=useState('idle'),[error,setError]=useState(''),[open,setOpen]=useState(false),[mobile,setMobile]=useState(false);
 const worker=useRef<Worker|null>(null),sequence=useRef(0),pending=useRef(new Map<number,(ok:boolean)=>void>());
 useEffect(()=>{
  const instance=new Worker(new URL('./world-scene.worker.ts',import.meta.url),{type:'module'});worker.current=instance;
  const requests=pending.current;
  instance.onmessage=event=>{
   const message=event.data;
   if(message.snapshot)setSnapshot(message.snapshot);
   if(message.mode)setMode(message.mode);
   setError(message.error||'');
   if(message.requestId){requests.get(message.requestId)?.(!message.error);requests.delete(message.requestId);}
  };
  instance.onerror=()=>{setError('演示模拟未能启动，请刷新重试。');for(const resolve of requests.values())resolve(false);requests.clear();};
  const visibility=()=>instance.postMessage({type:'visibility',active:!document.hidden});
  document.addEventListener('visibilitychange',visibility);visibility();
  return()=>{instance.terminate();worker.current=null;document.removeEventListener('visibilitychange',visibility);for(const resolve of requests.values())resolve(false);requests.clear();};
 },[]);
 const data=useMemo(()=>snapshot?{...content,...snapshot.view}:null,[snapshot]);
 const command=(type:string,extra:Record<string,unknown>={})=>worker.current?.postMessage({type,...extra});
 const send:GameProps['send']=action=>new Promise(resolve=>{
  if(!worker.current){resolve(false);return;}
  const requestId=++sequence.current;pending.current.set(requestId,resolve);command('action',{action,requestId});
 });
 const s=snapshot?.player;
 return <main className="journey-content" style={{margin:'auto',maxWidth:1260,padding:'24px 20px 60px'}}>
  <div style={{marginBottom:22}}><span style={{color:'#d8b775',fontSize:11,letterSpacing:3}}>WORLD SCENE / 02</span><h1 style={{fontSize:27,margin:'8px 0'}}>走进艾泽拉斯</h1><p style={{color:'#a4b0a2',fontSize:13}}>45° 俯视第三人称 · 独立角色，不连接玩家存档。切换动作、换装，或乘鸟点航班。</p></div>
  <nav className="action-row" aria-label="演示控制" style={{marginBottom:18,flexWrap:'wrap'}}>
   {Object.entries({idle:'驻足 · 待机',run:'步行 · 奔跑',ride:'上马 · 赶路',fly:'鸟点 · 飞行',combat:'遭遇 · 战斗'}).map(([key,label])=><Button key={key} disabled={!s} variant={mode===key?'default':'outline'} type="button" aria-pressed={mode===key} onClick={()=>command('mode',{mode:key})}>{label}</Button>)}
   {s?.activity.flight&&<Button variant="outline" onClick={()=>command('arrive')}>抵达鸟点</Button>}
   <Button variant="outline" onClick={()=>command('equip')} disabled={!s||!!s.combat||!['idle','hunt'].includes(s.activity.type)}>更换长袍</Button>
   <Button variant="outline" disabled={!s} onClick={()=>command('region')}>切换地区</Button>
   <Button variant="outline" aria-pressed={mobile} onClick={()=>setMobile(value=>!value)}>{mobile?'桌面布局':'手机布局'}</Button>
  </nav>
  <p style={{fontSize:11,color:'#a9b29e'}}>探索外观：Wowhead Classic · 地区背景：地图风格示意 · 练习战斗自动补充生命与法力，使用现有职业外观</p>
  <PerformanceReadout/>
  {error&&<p role="alert">{error}</p>}
  {s&&data?<><div style={{maxWidth:mobile?390:undefined,margin:'auto'}}><World state={s} data={data} busy={false} send={send} onObserve={()=>setOpen(true)}/></div>{open&&<Battle state={s} data={data} busy={false} send={send} open={open} onOpenChange={setOpen}/>}</>:<p role="status">正在准备旅途…</p>}
 </main>;
}
const element=document.getElementById('root') as HTMLElement&{previewRoot?:Root};
element.previewRoot??=createRoot(element);element.previewRoot.render(<Demo/>);
