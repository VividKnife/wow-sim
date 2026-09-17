import type {CSSProperties} from 'react';
import {unitBody} from '@/lib/battle-scene.js';
const colors:Record<number,string>={1:'#ae9677',2:'#df9cbd',3:'#a2bd75',4:'#ddcb75',5:'#dbdad1',7:'#6899c6',8:'#85cbe2',9:'#a193c9',11:'#cb9266'};
/** Original vector miniatures, anchored at their feet; no portrait collision offsets. */
export default function BattleFigure({unit,scale,facing=1}:{unit:any;scale:number;facing?:number}){
 const {kind}=unitBody(unit,scale),caster=[5,7,8,9].includes(unit.classId)||/法师|招魂|巫师|术士/.test(unit.name||''),color=colors[unit.classId]||(unit.foe?'#aa7660':'#8aa88a');
 return <svg className="battle-miniature" viewBox="0 0 64 72" preserveAspectRatio="none" aria-hidden="true" style={{'--body-color':color} as CSSProperties}>
 <ellipse cx="32" cy="66" rx="19" ry="5" fill="#050a0c" opacity=".6"/>
 <ellipse className="miniature-ring" cx="32" cy="66" rx="22" ry="7" fill="none" stroke={unit.foe?'#df927b':'#90c7ae'} strokeWidth="1.5"/>
 <g transform={facing<0?'translate(64 0) scale(-1 1)':undefined}><g className="miniature-body" stroke="#20272b" strokeWidth="2" strokeLinejoin="round" fill="var(--body-color)">
 {kind==='mechanical'?<><path d="M21 48L18 64H28L30 48M36 48L38 64H48L44 48" fill="#65717a"/><rect x="17" y="23" width="30" height="29" rx="5" fill="#8b9699"/><rect x="22" y="9" width="20" height="17" rx="3" fill="#aab3af"/><path d="M26 17H38" stroke="#f7d584" strokeWidth="4"/><path d="M16 29L8 34L9 49M48 29L55 35L54 49" stroke="#8b9699" strokeWidth="7"/><circle cx="32" cy="38" r="7" fill="#c0a46e"/></>:kind==='totem'?<><path d="M23 63L25 24H39L41 63Z" fill="#785d42"/><path d="M18 28L32 17L46 28L32 38Z"/><path d="M28 24L32 30L36 24" stroke="#b2f0de"/></>:kind==='spider'?<><path d="M24 44L10 32L3 49M24 50L7 47L2 61M40 44L54 32L61 49M40 50L57 47L62 61" fill="none" stroke="#b38b78" strokeWidth="4"/><ellipse cx="32" cy="42" rx="13" ry="18"/><circle cx="32" cy="57" r="9"/><path d="M27 57H29M35 57H37" stroke="#efbc74"/></>:kind==='beast'||kind==='dragon'?<><path d="M12 44L7 30L2 25M16 49L13 63H20L25 48M39 49L40 63H47L46 47" fill="#64584c"/><ellipse cx="30" cy="42" rx="22" ry="12"/><path d="M42 40L43 24L49 30L56 28L55 43L62 47L56 53L43 48Z"/><path d="M48 36H53" stroke="#f4d89d"/>{kind==='dragon'&&<path d="M27 38L9 9L9 31L1 34L25 48M32 35L48 5L49 29L62 30L40 44" fill="#927e68"/>}</>:kind==='elemental'?<><path d="M19 64L26 53L15 43L22 24L32 9L44 28L49 46L37 56L44 64Z" fill="#69a9b9"/><path d="M27 32L33 22L37 41L27 49" fill="#b6e5e5" stroke="none"/></>:<>
 <path d="M24 45L21 63H29L32 48L35 63H43L40 44" fill="#555760"/>
 <path d={caster?'M25 26L19 60Q32 65 45 60L39 26Z':'M23 27L20 46Q32 51 44 46L41 27Z'}/>
 <path d="M23 28L16 31L14 46L20 49L25 36M41 28L48 32L49 45L43 48L39 35"/>
 <path d="M21 27L15 29L17 37L25 35M39 27L48 29L48 37L39 35" fill="#909ca3"/>
 <path d="M25 12Q32 7 39 12L39 23L34 28H29L24 22Z" fill="#c4a286"/>
 <path d={caster?'M22 17L32 3L42 18Z':'M23 18L24 10L32 7L40 11L41 19L34 16L31 22L28 16Z'} fill={caster?color:'#819298'}/>
 <path d="M28 21H30M34 21H36" stroke="#30353b"/>
 {caster?<><path d="M50 63L52 17" stroke="#a98e68" strokeWidth="3"/><path d="M52 9L57 16L52 23L47 16Z" fill="#a9e4ec"/></>:<><path d="M49 47L49 19L53 15L56 20L53 47Z" fill="#c5cfd3"/><path d="M45 45H58" stroke="#cfb17b" strokeWidth="3"/>{unit.classId!==4&&<path d="M10 38L21 35L25 40L23 51L17 57L10 49Z" fill="#788e9b"/>}</>}
 {kind==='demon'&&<path d="M25 13L18 3L20 18M39 13L47 3L44 20" fill="#aa7660"/>}
 </>}
 </g></g></svg>;
}
