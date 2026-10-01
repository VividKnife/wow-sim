import {useLayoutEffect,useRef,useState} from 'react';

/** Follow the live edge only while the reader is already there. */
export function useChatScroll(ids:Array<string|number>,active=true){
 const ref=useRef<HTMLDivElement>(null),following=useRef(true),previous=useRef<Array<string|number>>([]);
 const [unread,setUnread]=useState(0);
 const latest=()=>{const node=ref.current;if(node)node.scrollTop=node.scrollHeight;following.current=true;setUnread(0);};
 useLayoutEffect(()=>{
  if(!active)return;
  const node=ref.current;if(!node)return;
  const old=previous.current,added=old.length?ids.filter(id=>!old.includes(id)).length:0;
  previous.current=ids;
  if(following.current)node.scrollTop=node.scrollHeight;
  else if(added)setUnread(count=>count+added);
 },[ids,active]);
 useLayoutEffect(()=>{
  const node=ref.current;if(!node)return;
  const observer=new ResizeObserver(()=>{if(active&&following.current)node.scrollTop=node.scrollHeight;});
  observer.observe(node);return()=>observer.disconnect();
 },[active]);
 const onScroll=()=>{const node=ref.current;if(!node)return;following.current=node.scrollHeight-node.scrollTop-node.clientHeight<32;if(following.current)setUnread(0);};
 return {ref,onScroll,unread,latest};
}
