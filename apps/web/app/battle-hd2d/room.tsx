import {useEffect,useMemo} from 'react';
import {BufferGeometry,Float32BufferAttribute,AlwaysStencilFunc,ReplaceStencilOp,EqualStencilFunc,type Texture} from 'three';
import {worldPoint,worldRadius} from '@/lib/battle-hd2d.js';
import type {BattleLayout} from '@/lib/battle-hd2d-types';

// Navigation and drawing consume the same authored triangles; decorations never define collision.
export function BossRoom({layout,texture}:{layout:BattleLayout;texture:Texture}){
 const area=layout.area!,boundary=area.boundary!;
 const floorKey=`${area.geometryHash||JSON.stringify([boundary,area.navigation])}:${layout.originX}:${layout.originY}:${layout.scale}:${layout.scaleY}:${layout.zoom}`;
 const geometry=useMemo(()=>{
  const g=new BufferGeometry(),positions:number[]=[],uv:number[]=[];
  for(const p of boundary){const [x,,z]=worldPoint(layout,p);positions.push(x,-.015,z);uv.push((p.x-area.minX)/30,(p.y-area.minY)/30);}
  g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));
  g.setIndex(area.navigation!.triangles.flatMap(([a,b,c])=>[a,c,b]));g.computeVertexNormals();return g;
 // Public snapshots replace objects at 10Hz; static floor geometry must survive.
 },[floorKey]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 const wall=area.appearance?.wall||'#392e35',rim=area.appearance?.rim||'#aa7861';
 const cutawayY=area.minY+(area.maxY-area.minY)*.6;
 const boss=area.anchors?.boss,molten=area.ground==='molten';
 return <group name={`boss-room:${area.id}:${area.version}`}>
  <mesh name="boss-room-floor" geometry={geometry} renderOrder={-1} receiveShadow><meshStandardMaterial map={texture} color={area.appearance?.floor||'#68514c'} roughness={1} stencilWrite stencilRef={1} stencilFunc={AlwaysStencilFunc} stencilZPass={ReplaceStencilOp}/></mesh>
  {boundary.map((p,i)=>{
   const q=boundary[(i+1)%boundary.length],a=worldPoint(layout,p),b=worldPoint(layout,q),length=Math.hypot(b[0]-a[0],b[2]-a[2]);
   // Cut away the camera-facing wall; keep its collision rim visible.
   const height=worldRadius(layout,(p.y+q.y)/2>cutawayY?1:6),thickness=worldRadius(layout,.6);
   return <group key={i} name={`boss-room-wall:${i}`} position={[(a[0]+b[0])/2,0,(a[2]+b[2])/2]} rotation={[0,-Math.atan2(b[2]-a[2],b[0]-a[0]),0]}>
    <mesh position={[0,height/2,0]} castShadow receiveShadow><boxGeometry args={[length,height,thickness]}/><meshStandardMaterial color={wall} roughness={1}/></mesh>
    <mesh position={[0,worldRadius(layout,.15),0]}><boxGeometry args={[length,worldRadius(layout,.3),thickness*1.7]}/><meshStandardMaterial color={rim} roughness={1}/></mesh>
    {molten&&i%3===0&&(p.y+q.y)/2<=cutawayY&&<group name="room-wall-brazier" position={[0,height,0]}>
     <mesh><cylinderGeometry args={[thickness*.9,thickness*.65,thickness*.5,6]}/><meshStandardMaterial color={rim} roughness={1}/></mesh>
     <mesh position={[0,thickness*.65,0]}><octahedronGeometry args={[thickness*.55,0]}/><meshStandardMaterial color={rim} emissive={rim} emissiveIntensity={1.6} toneMapped={false}/></mesh>
    </group>}
   </group>;
  })}
  {molten&&boss&&<group name="boss-room-inlay" position={worldPoint(layout,boss) as [number,number,number]}>
   {[0,1].map(i=><mesh key={i} rotation={[-Math.PI/2,0,0]} position={[0,.001+i*.001,0]}>
    <ringGeometry args={[worldRadius(layout,5.7+i*.6),worldRadius(layout,5.82+i*.6),48]}/>
    <meshStandardMaterial color={rim} roughness={1} transparent opacity={.45} depthWrite={false} stencilWrite stencilRef={1} stencilFunc={EqualStencilFunc}/>
   </mesh>)}
  </group>}
  {['whelpNorth','whelpSouth'].map(key=>{
   const anchor=area.anchors?.[key];if(!anchor)return null;const p=worldPoint(layout,anchor),size=worldRadius(layout,1);
   return <group key={key} name={key} position={[p[0],0,p[2]]}>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.002,0]}><ringGeometry args={[size*1.8,size*2.5,24]}/><meshStandardMaterial color="#b17144" roughness={1}/></mesh>
    {[0,1,2,3,4].map(i=><mesh key={i} castShadow position={[Math.cos(i*1.3)*size*2,size*.7,Math.sin(i*1.3)*size*2]} scale={[size*.65,size,size*.65]}><icosahedronGeometry args={[.8,1]}/><meshStandardMaterial color={i%2?'#806451':'#ae8761'} roughness={.9}/></mesh>)}
   </group>;
  })}
 </group>;
}
