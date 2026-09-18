"use client";
import {useState} from 'react';
import {creatureVisual} from '@/lib/creature-visuals.js';

export default function CreaturePortrait({unit,className=''}:{unit:any;className?:string}){
 const visual=creatureVisual(unit),[failed,setFailed]=useState<string|null>(null);
 return <span className={`creature-portrait ${className}`} aria-hidden="true">{visual.src&&failed!==visual.src?<img src={visual.src} alt="" loading="lazy" decoding="async" onError={()=>setFailed(visual.src)}/>:<span className="missing-creature-model">贴图暂缺</span>}</span>;
}
