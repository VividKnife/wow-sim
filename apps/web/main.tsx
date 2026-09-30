import {Component, lazy, Suspense, useEffect, useState, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import './app/globals.css';
import './app/journey.css';
const Login=lazy(()=>import('./app/login/page'));
const Game=lazy(()=>import('./app/game'));
const Saves=lazy(()=>import('./app/saves'));
const AccountMenu=lazy(()=>import('./app/account-menu'));
class LoadBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<main role="alert">界面加载失败，请检查网络后重试。<button onClick={()=>location.reload()}>重新加载</button></main>:this.props.children;}
}
function App(){
 const [user,setUser]=useState<{username:string}|null>(null),[error,setError]=useState('');
 const login=location.pathname==='/login';
 useEffect(()=>{
  if(login)return;
  const controller=new AbortController();
  void fetch('/api/auth/session',{signal:controller.signal}).then(async response=>{
   if(response.status===401){location.replace('/login');return;}
   if(!response.ok)throw new Error('账号服务暂时不可用，请稍后重试。');
   setUser((await response.json()).user);
  }).catch(failure=>{if(!controller.signal.aborted)setError(failure.message);});
  return()=>controller.abort();
 },[login]);
 if(login)return <Login/>;
 if(error)return <main role="alert">{error}<button onClick={()=>location.reload()}>重试</button></main>;
 if(!user)return <p role="status">正在连接艾泽拉斯…</p>;
 return <><AccountMenu username={user.username}/>{new URLSearchParams(location.search).get('saveId')?<Game/>:<Saves/>}</>;
}
createRoot(document.getElementById('root')!).render(<LoadBoundary><Suspense fallback={<p role="status">正在加载冒险界面…</p>}><App/></Suspense></LoadBoundary>);
