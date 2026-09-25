'use client';
import {useEffect,useState} from 'react';
import {createExperienceNotifications} from '@/lib/experience-notifications.js';
import './experience-notifications.css';

type Reward={id:number;amount:number};
type Snapshot={id:string;logSequence:number;logs:Reward[]};
export default function ExperienceNotifications({state}:{state:Snapshot}){
 const [consume]=useState(()=>createExperienceNotifications(state));
 const [rewards,setRewards]=useState<Reward[]>([]);
 useEffect(()=>{
  const added=consume(state);
  if(!added.length)return;
  // New reward events append once; ordinary snapshot updates preserve animations.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setRewards(previous=>[...previous,...added].slice(-4));
 },[state,consume]);
 useEffect(()=>{
  if(!rewards.length)return;
  const timer=setTimeout(()=>setRewards([]),2800);
  return()=>clearTimeout(timer);
 },[rewards]);
 return <div className="experience-notifications" role="status" aria-live="polite" aria-atomic="false">{rewards.map(reward=><div className="experience-notification" key={reward.id} onAnimationEnd={()=>setRewards(current=>current.filter(row=>row.id!==reward.id))}>获得 {reward.amount.toLocaleString('en-US')} 点经验</div>)}</div>;
}
