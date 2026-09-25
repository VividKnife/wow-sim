'use client';
/* eslint-disable @next/next/no-img-element -- Local, attributed game screenshots. */
import {useState} from 'react';
import WorldBackdrop from './world-backdrop';

export default function SceneBackdrop({image,city,flying}:{image:string|null;city:boolean;flying:boolean}){
 const [failed,setFailed]=useState<string|null>(null);
 if(!image||failed===image)return <WorldBackdrop city={city} flying={flying}/>;
 // Two staggered passes: the upper pass resets while transparent; the lower
 // resets while covered. The static image serves reduced-motion mode.
 return <div key={image} className="world-scene-photography" aria-hidden="true">
  <img className="world-scene-photograph" src={image} alt="" onError={()=>setFailed(image)}/>
  {[0,1].map(pass=><img key={pass} className={`world-scene-photo-pass world-scene-photo-pass-${pass}`} src={image} alt="" onError={()=>setFailed(image)}/>)}
 </div>;
}
