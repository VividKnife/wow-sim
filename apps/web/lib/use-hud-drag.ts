'use client';
import {useCallback,useEffect,useRef,useState,type CSSProperties,type PointerEvent,type KeyboardEvent} from 'react';

type Point={x:number;y:number};

/** Positions are local to the scene; the menu below it remains reachable. */
export function useHudDrag(){
 const ref=useRef<HTMLElement|null>(null);
 const attach=useCallback((node:HTMLElement|null)=>{ref.current=node;},[]);
 const [position,setPosition]=useState<Point|null>(null);
 const positionRef=useRef<Point|null>(null);
 const gesture=useRef<{id:number;start:Point;origin:Point}|null>(null);
 const bounds=(point:Point):Point=>{
  const node=ref.current,parent=node?.offsetParent as HTMLElement|null;
  if(!node||!parent)return point;
  const footer=parent.querySelector<HTMLElement>('.cu-bottom-ui');
  return {x:Math.max(4,Math.min(point.x,parent.clientWidth-node.offsetWidth-4)),y:Math.max(4,Math.min(point.y,parent.clientHeight-(footer?.offsetHeight||0)-node.offsetHeight-4))};
 };
 const move=(point:Point|null)=>{const next=point?bounds(point):null;positionRef.current=next;setPosition(next);};
 const origin=()=>({x:ref.current?.offsetLeft||0,y:ref.current?.offsetTop||0});
 useEffect(()=>{
  const observer=new ResizeObserver(()=>{
   if(positionRef.current){const next=bounds(positionRef.current);positionRef.current=next;setPosition(current=>current?.x===next.x&&current?.y===next.y?current:next);}
  });
  const node=ref.current,parent=node?.offsetParent;
  if(node)observer.observe(node);
  if(parent){observer.observe(parent);const footer=parent.querySelector('.cu-bottom-ui');if(footer)observer.observe(footer);}
  return()=>observer.disconnect();
 },[]);
 const handle={
  onPointerDown:(event:PointerEvent<HTMLButtonElement>)=>{
   if(event.button!==0)return;
   event.preventDefault();event.stopPropagation();event.currentTarget.focus();
   gesture.current={id:event.pointerId,start:{x:event.clientX,y:event.clientY},origin:origin()};
   event.currentTarget.setPointerCapture(event.pointerId);
  },
  onPointerMove:(event:PointerEvent<HTMLButtonElement>)=>{
   const drag=gesture.current;if(!drag||drag.id!==event.pointerId)return;
   const dx=event.clientX-drag.start.x,dy=event.clientY-drag.start.y;
   if(Math.abs(dx)+Math.abs(dy)<3)return;
   move({x:drag.origin.x+dx,y:drag.origin.y+dy});
  },
  onPointerUp:()=>{gesture.current=null;},
  onPointerCancel:()=>{gesture.current=null;},
  onLostPointerCapture:()=>{gesture.current=null;},
  onDoubleClick:()=>move(null),
  onKeyDown:(event:KeyboardEvent<HTMLButtonElement>)=>{
   if(event.key==='Home'){event.preventDefault();move(null);return;}
   const delta:Record<string,Point>={ArrowLeft:{x:-10,y:0},ArrowRight:{x:10,y:0},ArrowUp:{x:0,y:-10},ArrowDown:{x:0,y:10}};
   const step=delta[event.key];if(!step)return;
   event.preventDefault();event.stopPropagation();const at=origin();move({x:at.x+step.x,y:at.y+step.y});
  },
 };
 const style:CSSProperties|undefined=position?{left:position.x,top:position.y,right:'auto',bottom:'auto'}:undefined;
 return {ref:attach,style,handle,reset:()=>move(null)};
}
