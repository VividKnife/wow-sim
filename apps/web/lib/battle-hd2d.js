import {fieldPoint,unitCondition} from './combat-view.js';
import {unitBody} from './battle-scene.js';

export const WORLD_SCALE=25;
export const CAMERA_TILT=.62;
export function worldPoint(layout,point){const p=fieldPoint(layout,point),scale=WORLD_SCALE*(layout.zoom||1);return [(p.x-500)/scale,0,(p.y-220)/(scale*CAMERA_TILT)];}
export function unitPoint(layout,id){const p=layout.units[id],scale=WORLD_SCALE*(layout.zoom||1);return p?[(p.left*10-500)/scale,0,(p.top-220)/(scale*CAMERA_TILT)]:[0,0,0];}
export function worldRadius(layout,radius){return radius*layout.scale/((layout.zoom||1)*WORLD_SCALE);}
// Every visual dimension uses the same yards-to-world conversion as the floor.
// A minimum sprite scale made a humanoid almost 14 yards tall in a 90-yard room.
export function actorScale(layout){return worldRadius(layout,1);}
export function actorHeight(layout,unit){
 if(unit.visual?.model)return unit.visual.model.yards*actorScale(layout);
 const kind=unitBody(unit,20).kind;
 const yards=unit.rank===3?5:unit.rank===1?3.8:unit.petUnit?2:kind==='giant'?4.5:2.8;
 return yards*actorScale(layout);
}
export function cameraFit(layout,units,size){
 const metric=actorScale(layout),manual=layout.zoom||1;
 const positions=units.filter(u=>!u.removed).map(u=>unitPoint(layout,u.id));
 if(!positions.length)return{x:0,z:0,zoom:manual*Math.min(size.width/(44*metric),size.height/(24*metric))};
 if(layout.area?.name){const a=layout.area;positions.push(worldPoint(layout,{x:a.minX,y:a.minY}),worldPoint(layout,{x:a.maxX,y:a.maxY}));}
 const xs=positions.map(p=>p[0]),zs=positions.map(p=>p[2]);
 const headroom=Math.max(...units.filter(u=>!u.removed).map(u=>actorHeight(layout,u)))*1.5+4*metric;
 return{x:(Math.min(...xs)+Math.max(...xs))/2,z:(Math.min(...zs)+Math.max(...zs))/2,zoom:manual*Math.min(size.width/Math.max(44*metric,Math.max(...xs)-Math.min(...xs)+10*metric),size.height/Math.max(24*metric,(Math.max(...zs)-Math.min(...zs))*CAMERA_TILT+headroom))};
}
const themes={
 onyxia:{id:'onyxia',name:'奥妮克希亚的巢穴',texture:'cave',sky:'#211a23',floor:'#68514c',rock:'#392e35',leaf:'#735636',light:'#ffc295',ambient:'#b59aab',accent:'#ff924b',fog:78},
 arena:{id:'arena',name:'竞技场',texture:'cave',sky:'#202a30',floor:'#827861',rock:'#625b4c',leaf:'#617363',light:'#ffe0ad',ambient:'#bbc9ca',accent:'#dec492',fog:78},
 molten:{id:'molten',name:'熔火之心',sky:'#291510',floor:'#57463c',rock:'#382b29',leaf:'#735636',light:'#ffb470',ambient:'#dd9270',accent:'#ff7438',fog:64},
 grass:{id:'grass',name:'林间旷野',sky:'#182d31',floor:'#71856b',rock:'#71817d',leaf:'#48795d',light:'#ffe0a3',ambient:'#adcbd3',accent:'#e5c67c',fog:72},
 dirt:{id:'dirt',name:'暮色荒野',sky:'#40342f',floor:'#b29766',rock:'#a78a67',leaf:'#9a9856',light:'#ffd29a',ambient:'#c1c7d4',accent:'#efbd6e',fog:78},
 cave:{id:'cave',name:'幽深矿洞',sky:'#101c2b',floor:'#657381',rock:'#4d596c',leaf:'#47696c',light:'#8baedc',ambient:'#9eb5d4',accent:'#efa96b',fog:64},
 deck:{id:'deck',name:'暮港甲板',sky:'#1d303b',floor:'#9a7856',rock:'#75634e',leaf:'#5e806c',light:'#ffdaa5',ambient:'#a6ccd4',accent:'#ffba64',fog:76},
 water:{id:'water',name:'碧水浅滩',sky:'#163440',floor:'#609f9f',rock:'#718988',leaf:'#3c776c',light:'#d9f2cf',ambient:'#b7dce4',accent:'#8edfcc',fog:80},
};
export function groundTheme(key){return themes[key]||themes.grass;}
export function groundTexture(key){const theme=groundTheme(key);return `/battle/ground/${theme.texture||(key==='molten'?'cave':theme.id)}.webp`;}
/** @param {import('./battle-hd2d-types').BattleLayout} layout */
export function battleObstacles(layout){return (layout.area?.obstacles||[]).map(o=>({position:worldPoint(layout,o),radius:worldRadius(layout,o.radius),height:worldRadius(layout,3.8)}));}
export function renderClock(scene,now){return Math.min(scene.endClock??Infinity,scene.clock+(scene.live?Math.min(1000,Math.max(0,now-(scene.sampledAt??now))):0));}
export function unitAnimation(unit,effects,clock,wall,moving){
 if(unit.hp<=0||unit.removed)return 'dead';
 const condition=unitCondition(unit,clock);
 if(condition==='变形')return 'polymorph';
 if(condition==='击晕')return 'stun';
 const recent=effects.filter(e=>wall>=e.shownAt&&wall-e.shownAt<420);
 if(recent.some(e=>e.targetId===unit.id&&e.amount>0&&e.kind!=='heal'&&wall-e.shownAt<220))return 'hurt';
 if(unit.cast?.until>clock)return 'cast';
 const event=recent.findLast(e=>e.actorId===unit.id&&!e.periodic&&['damage','incoming','cast','heal','launch','miss'].includes(e.kind));
 if(event)return event.spellId||event.kind==='heal'||event.kind==='cast'?'cast':'attack';
 return moving&&condition!=='定身'?'walk':'idle';
}
export function spriteRole(unit){
 if(unit.form==='bear'||unit.form==='cat'||unit.creatureType===1||unit.kind==='beast')return 'wolf';
 if(unit.classId)return ({1:'knight',2:'knight',3:'ranger',4:'rogue',5:'priest',7:'shaman',8:'mage',9:'mage',11:'shaman'})[unit.classId]||'knight';
 return 'enemy';
}
export function spriteAppearance(unit,clock){
 const form=unit.polyUntil>clock?'sheep':unit.form;
 if(['bear','cat','sheep'].includes(form))return{src:'/battle/hd2d/forms.png',columns:6,rows:3,row:{bear:0,cat:1,sheep:2}[form],anchor:.875};
 if(unit.visual?.kind==='npc-model-render'&&unit.visual.src)return{src:unit.visual.src,columns:1,rows:1,row:0,anchor:1};
 return{src:'/battle/hd2d/characters.png',columns:6,rows:8,row:{knight:0,ranger:1,rogue:2,mage:3,priest:4,shaman:5,wolf:6,enemy:7}[spriteRole(unit)],anchor:.875};
}
export function sceneryLayout(theme){
 let seed=Array.from(theme).reduce((a,c)=>a*31+c.charCodeAt(0),7)>>>0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 return Array.from({length:36},(_,i)=>{const side=i%4;return{x:side<2?(side?-1:1)*(17+random()*10):(random()-.5)*55,z:side<2?(random()-.5)*38:(side===2?-1:1)*(12+random()*7),scale:.65+random()*1.15,turn:random()*Math.PI,index:i};});
}
