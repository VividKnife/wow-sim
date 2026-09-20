/* eslint-disable react-hooks/immutability -- Three.js line geometry and visibility belong to the imperative render loop. */
import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {BufferGeometry,Float32BufferAttribute,Group,Line as ThreeLine,LineBasicMaterial,Mesh,MeshBasicMaterial,Vector3,AdditiveBlending} from 'three';
import {actionProgress,battleTarget,schoolColor} from '@/lib/combat-view.js';
import {unitPoint,worldPoint,worldRadius,actorHeight,actorScale} from '@/lib/battle-hd2d.js';
import type {BattleScene,BattleProjectile,BattleEffect,BattleGroundEffect} from '@/lib/battle-hd2d-types';
import {useBattleFrame} from './frame';

function GroundArea({area,scene}:{area:BattleGroundEffect;scene:BattleScene}){
 const group=useRef<Group>(null),frame=useBattleFrame();
 const r=Math.max(.15,worldRadius(scene.layout,area.radius||5)),color=schoolColor(area.school);
 useFrame(()=>{if(!group.current)return;const f=frame.current;group.current.visible=area.until>f.clock;group.current.rotation.y=f.scene.reducedMotion?0:f.seconds*.18;});
 return <group ref={group} position={worldPoint(scene.layout,area.center) as [number,number,number]}>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.06,0]}><circleGeometry args={[r,48]}/><meshBasicMaterial color={color} transparent opacity={.1} depthWrite={false}/></mesh>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.065,0]}><ringGeometry args={[r*.97,r,64]}/><meshBasicMaterial color={color} transparent opacity={.8} toneMapped={false} depthWrite={false}/></mesh>
  {Array.from({length:scene.lowEffects?5:12},(_,i)=><AreaMote key={i} index={i} radius={r} color={color} frost={area.school===4} metric={actorScale(scene.layout)}/>)}
 </group>;
}
function AreaMote({index,radius,color,frost,metric}:{index:number;radius:number;color:string;frost:boolean;metric:number}){
 const mesh=useRef<Mesh>(null),frame=useBattleFrame();
 useFrame(()=>{if(!mesh.current)return;const f=frame.current,t=(f.seconds*.6+index*.137)%1,a=index*2.399;mesh.current.position.set(Math.cos(a)*radius*.8,(f.scene.reducedMotion?.08:frost?(1-t)*5:t*2.5)*metric,Math.sin(a)*radius*.8);mesh.current.rotation.y=f.seconds+index;});
 return <mesh ref={mesh} scale={metric}><octahedronGeometry args={[frost?.22:.14,0]}/><meshBasicMaterial color={color} transparent opacity={.65} toneMapped={false}/></mesh>;
}
function Projectile({flight}:{flight:BattleProjectile}){
 const group=useRef<Group>(null),frame=useBattleFrame(),color=schoolColor(flight.school);
 useFrame(()=>{
  if(!group.current)return;const f=frame.current,t=actionProgress(flight.startedAt,flight.landsAt,f.clock);
  group.current.visible=f.clock>=flight.startedAt&&f.clock<flight.landsAt;
  const a=worldPoint(f.layout,flight.from),b=worldPoint(f.layout,flight.to),metric=actorScale(f.layout),source=f.scene.units.find(u=>u.id===flight.actorId),target=f.scene.units.find(u=>u.id===flight.targetId);
  if(target){const p=unitPoint(f.layout,target.id);b[0]=p[0];b[2]=p[2];}
  const startHeight=actorHeight(f.layout,source||{})*.55,endHeight=actorHeight(f.layout,target||{})*.55;
  group.current.children.forEach((child,i)=>{const k=Math.max(0,t-i*.018);child.position.set(a[0]+(b[0]-a[0])*k,startHeight+(endHeight-startHeight)*k+Math.sin(k*Math.PI)*metric,a[2]+(b[2]-a[2])*k);child.scale.setScalar((1-i*.13)*(flight.school===4?.8:1)*metric*1.5);});
 });
 return <group ref={group}>{Array.from({length:5},(_,i)=><mesh key={i}><icosahedronGeometry args={[i===0?.22:.16,1]}/><meshBasicMaterial color={i===0?'#fff3d6':color} transparent opacity={1-i*.17} toneMapped={false} blending={AdditiveBlending} depthWrite={false}/></mesh>)}</group>;
}
function Impact({effect}:{effect:BattleEffect}){
 const group=useRef<Group>(null),ring=useRef<Mesh>(null),frame=useBattleFrame(),color=schoolColor(effect.school,effect.kind==='heal');
 useFrame(()=>{
  if(!group.current)return;const f=frame.current,age=f.wall-effect.shownAt,t=age/750;group.current.visible=age>=0&&age<750;
  group.current.position.fromArray(effect.center?worldPoint(f.layout,effect.center):unitPoint(f.layout,effect.targetId));group.current.scale.setScalar(actorScale(f.layout));
  if(ring.current){ring.current.scale.setScalar(f.scene.reducedMotion?1:.4+t*1.5);(ring.current.material as MeshBasicMaterial).opacity=Math.max(0,1-t)*.6;}
  group.current.children.slice(1).forEach((mesh,i)=>{const a=i*2.399,spread=f.scene.reducedMotion?.6:t*1.7;mesh.position.set(Math.cos(a)*spread,.6+Math.sin(a)*spread+(effect.kind==='heal'?t:0),Math.sin(a)*spread*.5);mesh.scale.setScalar(Math.max(0,1-t));});
 });
 return <group ref={group}><mesh ref={ring} rotation={[-Math.PI/2,0,0]} position={[0,.09,0]}><ringGeometry args={[.7,.82,40]}/><meshBasicMaterial color={color} transparent toneMapped={false} depthWrite={false}/></mesh>
  {Array.from({length:8},(_,i)=><mesh key={i}><octahedronGeometry args={[effect.critical?.16:.09,0]}/><meshBasicMaterial color={color} toneMapped={false} transparent blending={AdditiveBlending} depthWrite={false}/></mesh>)}
 </group>;
}

function Selection(){
 const ring=useRef<Mesh>(null),frame=useBattleFrame();
 const line=useMemo(()=>{const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(new Float32Array(6),3));return new ThreeLine(geometry,new LineBasicMaterial({color:'#ecc88c',transparent:true,opacity:.5,depthWrite:false}));},[]);
 useEffect(()=>()=>{line.geometry.dispose();line.material.dispose();},[line]);
 useFrame(()=>{
  const f=frame.current,u=f.scene.units.find(a=>a.id===f.scene.selectedId),target=u?battleTarget(u,f.scene.units,f.clock):null;
  line.visible=!!target;
  if(!u)return;
  const a=unitPoint(f.layout,u.id);
  if(ring.current){ring.current.position.set(a[0],.045,a[2]);ring.current.scale.setScalar(worldRadius(f.layout,f.scene.range));ring.current.visible=u.hp>0;}
  if(target){const b=unitPoint(f.layout,target.id),attribute=line.geometry.getAttribute('position');attribute.setXYZ(0,a[0],.1,a[2]);attribute.setXYZ(1,b[0],.1,b[2]);attribute.needsUpdate=true;line.geometry.computeBoundingSphere();line.material.color.set(!!target.foe===!!u.foe?'#7ed2a2':'#e4a080');}
 });
 return <><primitive object={line}/><mesh ref={ring} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.994,1,96]}/><meshBasicMaterial color="#e4c994" transparent opacity={.2} depthWrite={false}/></mesh></>;
}
function Boundary({scene}:{scene:BattleScene}){
 const area=scene.layout.area;
 const line=useMemo(()=>{
  if(!area)return null;
  const points=[[area.minX,area.minY],[area.maxX,area.minY],[area.maxX,area.maxY],[area.minX,area.maxY],[area.minX,area.minY]].map(([x,y])=>{const p=worldPoint(scene.layout,{x,y});return new Vector3(p[0],.035,p[2]);});
  return new ThreeLine(new BufferGeometry().setFromPoints(points),new LineBasicMaterial({color:'#d4b881',transparent:true,opacity:.27}));
 },[scene.layout,area]);
 useEffect(()=>()=>{line?.geometry.dispose();line?.material.dispose();},[line]);
 return line?<primitive object={line}/>:null;
}
export function BattleEffects({scene}:{scene:BattleScene}){
 return <><Selection/><Boundary scene={scene}/>{scene.groundEffects.filter(a=>a.center&&a.until>scene.clock).slice(0,scene.lowEffects?5:12).map((a,i)=><GroundArea key={a.id||`${a.actorId}:${a.startedAt}:${i}`} area={a} scene={scene}/>)}
 {scene.projectiles.slice(0,scene.lowEffects?12:32).map(p=><Projectile key={p.id} flight={p}/>)}
 {scene.effects.filter(e=>e.amount||e.kind==='miss'||e.center).slice(-(scene.lowEffects?8:20)).map(e=><Impact key={e.id} effect={e}/>)}</>;
}
