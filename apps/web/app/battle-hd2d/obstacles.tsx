import {battleObstacles,worldPoint,worldRadius} from '@/lib/battle-hd2d.js';
import type {BattleLayout} from '@/lib/battle-hd2d-types';

// Render collision geometry in the same yard coordinates as actors and spells.
// The scene never writes geometry back into the simulation.
export function BattleObstacles({layout}:{layout:BattleLayout}){
 const area=layout.area;
 if(!area?.obstacles?.length)return null;
 const width=worldRadius(layout,area.maxX-area.minX),depth=worldRadius(layout,area.maxY-area.minY);
 const center=worldPoint(layout,{x:(area.minX+area.maxX)/2,y:(area.minY+area.maxY)/2});
 const rim=worldRadius(layout,.35);
 return <group name="arena-terrain">
  <mesh position={[center[0],-.05,center[2]]} receiveShadow><boxGeometry args={[width,.08,depth]}/><meshStandardMaterial color="#807760" roughness={1}/></mesh>
  {[-1,1].map(side=><group key={side}>
   <mesh position={[center[0],.02,center[2]+side*depth/2]} receiveShadow><boxGeometry args={[width,rim,rim]}/><meshStandardMaterial color="#c1aa7e" roughness={1}/></mesh>
   <mesh position={[center[0]+side*width/2,.02,center[2]]} receiveShadow><boxGeometry args={[rim,rim,depth]}/><meshStandardMaterial color="#c1aa7e" roughness={1}/></mesh>
   <mesh rotation={[-Math.PI/2,0,0]} position={[center[0]+side*(width/2-worldRadius(layout,4)),.002,center[2]]}><planeGeometry args={[worldRadius(layout,7),depth-rim]}/><meshBasicMaterial color={side<0?'#4589ae':'#b65743'} transparent opacity={.18} depthWrite={false}/></mesh>
  </group>)}
  {battleObstacles(layout).map((pillar,index)=><group key={index} name={`arena-pillar-${index}`} position={pillar.position as [number,number,number]}>
   <mesh castShadow receiveShadow position={[0,pillar.height/2,0]}><cylinderGeometry args={[pillar.radius*.93,pillar.radius,pillar.height,16]}/><meshStandardMaterial color="#a2977d" roughness={.9} flatShading/></mesh>
   {[.12,.9].map(y=><mesh key={y} castShadow receiveShadow position={[0,pillar.height*y,0]}><cylinderGeometry args={[pillar.radius,pillar.radius,pillar.height*.13,16]}/><meshStandardMaterial color="#c3b491" roughness={.85}/></mesh>)}
   <mesh position={[0,pillar.height+.01,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[pillar.radius*.62,pillar.radius*.78,32]}/><meshStandardMaterial color="#6d624e" roughness={1}/></mesh>
  </group>)}
 </group>;
}
