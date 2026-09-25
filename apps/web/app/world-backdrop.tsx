import {useId} from 'react';

// Layered map-like illustration: the region changes its palette; location kind
// changes the skyline. No remote background requests or invented world geometry.
export default function WorldBackdrop({city=false,flying=false}:{city?:boolean;flying?:boolean}){
 const id=useId().replace(/:/g,'');
 if(flying)return <svg className="world-backdrop world-aerial-backdrop" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect width="1440" height="600" fill="var(--scene-ground)"/>
  <path d="M0 40Q340 210 600 40T1440 140V360Q960 190 620 310T0 260Z" fill="var(--scene-far)"/>
  <path d="M0 480Q330 300 700 500T1440 360V600H0Z" fill="var(--scene-near)" opacity=".65"/>
  <path d="M990-50C480 150 1110 270 760 395S610 590 290 670" fill="none" stroke="#76a9b2" strokeWidth="46"/>
  <path d="M990-50C480 150 1110 270 760 395S610 590 290 670" fill="none" stroke="#b4ceca" strokeWidth="4" opacity=".5"/>
  <path d="M-20 370Q360 290 650 350T1470 140" fill="none" stroke="var(--scene-road)" strokeWidth="14"/>
  {Array.from({length:65},(_,i)=><g key={i} transform={`translate(${(i*173)%1440} ${(i*83)%600})`}><ellipse rx="18" ry="13" fill="var(--scene-trunk)" opacity=".25"/><path d="m0-29-17 35 17-8 17 8Z" fill="var(--scene-near)"/><path d="m0-29-2 26 19 9Z" fill="var(--scene-far)"/></g>)}
  <g fill="var(--scene-light)" stroke="var(--scene-trunk)" strokeWidth="4"><path d="M280 245h38v28h-38zm46 22h30v34h-30zm-65 25h35v25h-35z"/></g>
  <rect width="1440" height="600" fill="#97c5cd" opacity=".19"/>
 </svg>;
 return <svg className="world-backdrop" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
   <linearGradient id={id+'sky'} x2="0" y2="1"><stop stopColor="var(--scene-sky)"/><stop offset="1" stopColor="var(--scene-light)"/></linearGradient>
   <linearGradient id={id+'road'} x2="0" y2="1"><stop stopColor="var(--scene-light)"/><stop offset="1" stopColor="var(--scene-road)"/></linearGradient>
   <radialGradient id={id+'sun'}><stop stopColor="#ffedbc" stopOpacity=".7"/><stop offset="1" stopColor="#ffedbc" stopOpacity="0"/></radialGradient>
   <g id={id+'tree'}><path d="M-9 0 0-165 10 0" fill="var(--scene-trunk)"/><path d="m0-225-53 85 24-7-47 70 45-10-54 65 86-20 78 18-48-63 36 9-43-70 23 7Z" fill="currentColor"/><path d="m0-225-5 193-75 10 49-65-45 10 47-70-24 7Z" fill="#0a1e21" opacity=".16"/></g>
  </defs>
  <path fill={'url(#'+id+'sky)'} d="M0 0h1440v600H0z"/>
  <circle cx="880" cy="145" r="270" fill={'url(#'+id+'sun)'}/>
  <path d="M0 230 180 108 308 225 450 154 606 268 787 195 893 228 1052 100 1248 236 1360 143 1440 207V600H0Z" fill="var(--scene-mountain)" opacity=".54"/>
  <path d="m0 278 165-67 178 86 217-44 183 54 216-48 270-78 211 89v330H0Z" fill="var(--scene-far)"/>
  <g fill="var(--scene-mountain)" opacity=".8">
   {city?<><path d="M616 313V217h28v-38h22v-37h30v37h24v38h29v95M755 315V236h32v-47h34v-52h32v52h36v47h28v79"/><path d="M599 265h343v70H599z"/><path d="M640 217 681 142 718 217M780 236 836 143 893 236" fill="var(--scene-trunk)"/></>:<><path d="M786 310v-67h99v68"/><path d="m767 244 70-54 68 54Z" fill="var(--scene-trunk)"/><path d="M817 255h15v21h-15m30-21h15v21h-15" fill="var(--scene-light)"/></>}
  </g>
  <path d="M0 331Q271 244 610 328T1440 287V600H0Z" fill="var(--scene-ground)"/>
  <path d="M825 304c-90 59-154 24-165 84s117 118 258 212H412c39-96 183-155 208-215s135-37 205-81" fill={'url(#'+id+'road)'} opacity=".87"/>
  <g color="var(--scene-far)">{[100,230,362,465,1020,1130,1248,1370].map((x,i)=><use key={x} href={'#'+id+'tree'} transform={`translate(${x} ${330+i%3*10}) scale(${.5+i%3*.12})`}/>)}</g>
  <g color="var(--scene-near)"><use href={'#'+id+'tree'} transform="translate(130 470) scale(1.65)"/><use href={'#'+id+'tree'} transform="translate(305 435) scale(1.06)"/><use href={'#'+id+'tree'} transform="translate(1330 490) scale(1.9)"/><use href={'#'+id+'tree'} transform="translate(1150 418) scale(1.06)"/></g>
  <path d="M0 465q250-58 477 135H0m1440-130q-218-63-438 130h438" fill="var(--scene-near)"/>
  <g stroke="var(--scene-light)" strokeWidth="2" opacity=".2" fill="none"><path d="m70 520 12-32 5 30 17-18m1072 0 15-41 4 38 17-21M251 551l18-34 4 38 14-20"/><path d="m520 516 37-9m126-96 35 5m-83-39 24-3m-127 192 69-13m160-94 47 11"/></g>
 </svg>;
}
