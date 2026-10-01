import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import SocialPanel,{SocialProvider} from '../../app/social';
import '../../app/globals.css';
import '../../app/journey.css';
function Preview(){const [ready,setReady]=useState(false),[actor,setActor]=useState(new URLSearchParams(location.search).get('actor')==='bob'?'bob':'alice');
 return <main className="game-shell" style={{maxWidth:950,margin:'24px auto',padding:16}}><h1>社交与查找器验证</h1><p>独立 SQL 数据，真实社交服务与认证路由；不连接正式存档或战斗实例。</p>{!ready?<button onClick={async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'social-qa',password:'preview'})});if(r.ok)setReady(true);}}>进入测试角色</button>:<><div className="filterbar"><button onClick={()=>setActor('alice')}>切换艾琳法师</button><button onClick={()=>setActor('bob')}>切换伯恩牧师</button></div><SocialProvider key={actor} actorId={actor}><SocialPanel state={{id:actor,level:20}} data={{npcWorld:{ready:true}}} busy={false} send={async(action:any)=>action.type==='npcMatchSupply'}/></SocialProvider></>}</main>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Preview/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
