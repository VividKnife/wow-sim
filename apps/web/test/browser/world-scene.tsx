import React,{useEffect,useMemo,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {createGame,act,advance,view,stats} from '../../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../../packages/game-domain/src/rules/combat.js';
import {addItem} from '../../../../packages/game-domain/src/rules/character.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import {companionSkills} from '../../../../packages/game-domain/src/rules/party.js';
import type {Rules} from '../../../../packages/game-domain/src/model';
import '../../app/globals.css';
import World from '../../app/world';
import Battle from '../../app/battle';
import {Button} from '../../components/ui/button';
import type {GameProps} from '../../app/game-ui';

const content=clientContent();
function fixture(){
 const s:Rules=createGame('林间旅人',283,0,{raceId:1,classId:8});
 s.location='goldshire';s.level=20;s.money=50000;s.riding={horse:true};s.mounts=[900020];
 s.learned=companionSkills(s);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;addItem(s,7509);return s;
}
function Demo(){
 const [s,setState]=useState(fixture),[mode,setMode]=useState('idle'),[error,setError]=useState(''),[open,setOpen]=useState(false),[mobile,setMobile]=useState(false);
 useEffect(()=>{
  const timer=setInterval(()=>{if(!document.hidden)setState(current=>{
   const next=advance(current,current.wallAt+100).state;
   if(next.combat){next.hp=stats(next).maxHp;next.mana=stats(next).maxMana;}
   return next;
  });},100);
  return()=>clearInterval(timer);
 },[]);
 const snapshot=useMemo(()=>projectClientSnapshot(s,view(s)),[s]);
 const data={...content,...snapshot.view};
 const send:GameProps['send']=async(action)=>{try{const next=act(s,action,s.wallAt);setState(next);setError('');return true;}catch(e){setError((e as Error).message);return false;}};
 const choose=(next:string)=>{
  setMode(next);setError('');setState(current=>{
   const n=fixture();n.clock=current.clock;n.wallAt=current.wallAt;n.equipment=current.equipment;n.bag=current.bag;
   if(next==='fly'){
    n.location='stormwind';n.flightPoints=['stormwind','ironforge'];
    return act(n,{type:'fly',to:'ironforge'},n.wallAt);
   }
   if(next==='run'||next==='ride'){
    if(next==='run')n.mounts=[];
    else n.mounted=900020;
    return act(n,{type:'travel',to:'logging'},n.wallAt);
   }
   if(next==='combat'){
    startCombat(n,[124,124],false);n.activity={type:'idle'};
    // Durable, low-damage demo opponents leave time to inspect the transition.
    // Movement, targeting, spell resolution and the ending use the real engine.
    for(const enemy of n.combat.enemies){enemy.hp=enemy.maxHp=1600;enemy.minDamage=1;enemy.maxDamage=2;}
   }
   return n;
  });
 };
 const equip=()=>{const next=s.equipment[5]?.id===56?7509:56,instance=s.bag.find((i:{id:number;uid:string})=>i.id===next);if(instance)void send({type:'equip',uid:instance.uid});};
 const props={state:snapshot.player,data,busy:false,send};
 return <main className="journey-content" style={{margin:'auto',maxWidth:1260,padding:'24px 20px 60px'}}>
  <div style={{marginBottom:22}}><span style={{color:'#d8b775',fontSize:11,letterSpacing:3}}>WORLD SCENE / 01</span><h1 style={{fontSize:27,margin:'8px 0'}}>走进艾泽拉斯</h1><p style={{color:'#a4b0a2',fontSize:13}}>第三人称视角实验 · 独立角色，不连接玩家存档。切换动作、换装，或进入一场真实战斗。</p></div>
  <nav className="action-row" aria-label="演示控制" style={{marginBottom:18,flexWrap:'wrap'}}>
   {Object.entries({idle:'驻足 · 待机',run:'步行 · 奔跑',ride:'上马 · 赶路',fly:'鸟点 · 飞行',combat:'遭遇 · 战斗'}).map(([key,label])=><Button key={key} variant={mode===key?'default':'outline'} type="button" aria-pressed={mode===key} onClick={()=>choose(key)}>{label}</Button>)}
   {s.activity.flight&&<Button variant="outline" onClick={()=>setState(current=>advance(current,current.wallAt+current.activity.endsAt-current.clock).state)}>抵达鸟点</Button>}
   <Button variant="outline" onClick={equip} disabled={!!s.combat||!['idle','hunt'].includes(s.activity.type)}>更换长袍</Button>
   <Button variant="outline" onClick={()=>{const location=s.location==='ironforge'?'goldshire':'ironforge';choose('idle');setState(current=>({...current,location}));}}>切换地区</Button>
   <Button variant="outline" aria-pressed={mobile} onClick={()=>setMobile(value=>!value)}>{mobile?'桌面布局':'手机布局'}</Button>
  </nav>
  <p style={{fontSize:11,color:'#a9b29e'}}>探索外观：Wowhead Classic · 地区背景：地图风格示意 · 练习战斗自动补充生命与法力，使用现有职业外观</p>
  {error&&<p role="alert">{error}</p>}
  <div style={{maxWidth:mobile?390:undefined,margin:'auto'}}><World {...props} onObserve={()=>setOpen(true)}/></div>
  {open&&<Battle {...props} open={open} onOpenChange={setOpen}/>}
 </main>;
}
const element=document.getElementById('root') as HTMLElement&{previewRoot?:Root};
element.previewRoot??=createRoot(element);element.previewRoot.render(<Demo/>);
