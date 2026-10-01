import {useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {Tabs} from 'radix-ui';
import {ArrowDown,GripHorizontal,MessageCircle,Swords,X} from 'lucide-react';
import {SocialChat} from './social';
import {chatChannelLogs,chatLogCategory} from '@/lib/classic-chat-channels.js';
import {journeyTime} from '@/lib/journey-time.js';
import {useChatScroll} from '@/lib/use-chat-scroll';
import type {useHudDrag} from '@/lib/use-hud-drag';
import './classic-chat.css';

type Props={state:any;battle:ReactNode;hud:ReturnType<typeof useHudDrag>;onMeter:()=>void};
export default function ClassicChat({state,battle,hud:{ref:chatRef,style:chatStyle,handle:chatHandle},onMeter}:Props){
 const [expanded,setExpanded]=useState(()=>!window.matchMedia('(max-width:800px), (max-width:1000px) and (max-height:500px)').matches),[tab,setTab]=useState('world');
 const [viewport,setViewport]=useState<CSSProperties&{'--chat-keyboard-bottom'?:string}>({});
 const bubble=useRef<HTMLButtonElement>(null),tabs=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const media=window.matchMedia('(max-width:800px), (max-width:1000px) and (max-height:500px)'),resize=()=>setExpanded(!media.matches);
  media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);
 },[]);
 useEffect(()=>{
  const visual=window.visualViewport;if(!visual)return;
  const update=()=>setViewport({'--chat-vh':`${visual.height}px`,'--chat-content-height':visual.height<window.innerHeight-120?`${Math.max(0,visual.height-64)}px`:undefined,'--chat-keyboard-bottom':visual.height<window.innerHeight-120?`${Math.max(0,window.innerHeight-visual.height-visual.offsetTop)+8}px`:undefined} as CSSProperties);
  update();visual.addEventListener('resize',update);visual.addEventListener('scroll',update);
  return()=>{visual.removeEventListener('resize',update);visual.removeEventListener('scroll',update);};
 },[]);
 const close=()=>{setExpanded(false);requestAnimationFrame(()=>bubble.current?.focus());};
 return <>
  <aside className={`cu-lower-left cu-chat-window${expanded?'':' cu-chat-compact'}`} aria-label="聊天与冒险记录" data-keyboard={!!viewport['--chat-keyboard-bottom']} ref={chatRef} style={{...chatStyle,...viewport}} onKeyDown={e=>{if(e.key==='Escape'&&expanded){e.preventDefault();e.stopPropagation();close();}}}>
   <button ref={bubble} className="cu-chat-bubble" aria-label="打开聊天与战报" aria-expanded={expanded} onClick={()=>{setExpanded(true);requestAnimationFrame(()=>tabs.current?.querySelector<HTMLButtonElement>('[data-state=active]')?.focus());}}><MessageCircle size={21}/></button>
   <Tabs.Root className="cu-chat-channels" value={tab} onValueChange={setTab}>
    <div className="cu-chat-toolbar"><Tabs.List ref={tabs} aria-label="信息频道"><Tabs.Trigger value="world">世界</Tabs.Trigger><Tabs.Trigger value="party">队伍</Tabs.Trigger><Tabs.Trigger value="general">综合</Tabs.Trigger><Tabs.Trigger value="combat">战斗详情</Tabs.Trigger><Tabs.Trigger value="battle">战报</Tabs.Trigger></Tabs.List><div className="cu-chat-tools"><button className="cu-mobile-meter" onClick={onMeter} aria-label="打开伤害统计" title="伤害统计"><Swords size={14}/></button><button className="cu-hud-drag" aria-label="移动聊天框" title="拖动移动 · 方向键微调 · 双击或 Home 复位" {...chatHandle}><GripHorizontal size={14}/></button><button className="cu-chat-toggle" aria-label="收起信息频道" aria-expanded={expanded} onClick={close}><X size={14}/></button></div></div>
    {['world','party'].map(channel=><Tabs.Content key={channel} forceMount value={channel} hidden={tab!==channel} className="cu-chat-content"><SocialChat compact channel={channel} active={expanded&&tab===channel}/></Tabs.Content>)}
    <Tabs.Content value="general" className="cu-chat-content"><EventFeed state={state} channel="general" active={expanded}/></Tabs.Content>
    <Tabs.Content value="combat" className="cu-chat-content"><EventFeed state={state} channel="combat" active={expanded}/></Tabs.Content>
    <Tabs.Content value="battle" className="cu-chat-content cu-chat-scroll">{battle}</Tabs.Content>
   </Tabs.Root>
  </aside>
 </>;
}
function EventFeed({state,channel,active}:{state:any;channel:string;active:boolean}){
 const logs=chatChannelLogs(state.logs,channel,100).reverse();
 const {ref:feedRef,onScroll,unread,latest}=useChatScroll(logs.map((log:any)=>log.id),active);
 return <div className="cu-event-feed">
  <div className="cu-event-history" ref={feedRef} onScroll={onScroll} tabIndex={0} role="region" aria-label={channel==='general'?'综合记录':'战斗详情记录'}>
   {logs.map((log:any)=>{const time=journeyTime(log.at,state),category=chatLogCategory(log);return <div className={`cu-event-row cu-event-${category.id}`} key={log.id} data-kind={log.kind} title={time.label}><time dateTime={time.dateTime} title={time.label}>{time.label.split(' ').at(-1)}</time><p>{log.text}</p></div>;})}
   {!logs.length&&<p className="cu-chat-empty">{channel==='combat'?'尚无战斗记录。':'旅途、任务与收获会记录在这里。'}</p>}
  </div>{unread>0&&<button className="chat-new-messages" onClick={latest}><ArrowDown size={13}/>{unread} 条新记录</button>}
 </div>;
}
