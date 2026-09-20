import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {useTexture} from '@react-three/drei';
import {BufferGeometry,Float32BufferAttribute,Mesh,NearestFilter,Points,RepeatWrapping,SRGBColorSpace} from 'three';
import {groundTheme,sceneryLayout} from '@/lib/battle-hd2d.js';
import {useBattleFrame} from './frame';

type Theme=ReturnType<typeof groundTheme>;
function Tree({x,z,scale,turn,theme}:{x:number;z:number;scale:number;turn:number;theme:Theme}){
 return <group position={[x,0,z]} scale={scale} rotation={[0,turn,0]}>
  <mesh castShadow position={[0,2,0]}><cylinderGeometry args={[.28,.55,4,5]}/><meshStandardMaterial color="#66533f" roughness={1}/></mesh>
  {[0,1,2].map(i=><mesh key={i} castShadow position={[i===1?.2:0,3.4+i*1.4,0]} rotation={[0,i*.6,0]}><coneGeometry args={[2.35-i*.5,3.7-i*.35,7]}/><meshStandardMaterial color={i===1?theme.leaf:'#38604f'} roughness={1} flatShading/></mesh>)}
  <mesh position={[0,.15,0]} scale={[1.3,.3,1]}><dodecahedronGeometry args={[.8,0]}/><meshStandardMaterial color="#596d4e"/></mesh>
 </group>;
}
function Rock({x,z,scale,turn,theme}:{x:number;z:number;scale:number;turn:number;theme:Theme}){
 return <mesh castShadow receiveShadow position={[x,scale*.55,z]} rotation={[.2,turn,.13]} scale={[scale*1.8,scale,scale*1.3]}><dodecahedronGeometry args={[1,0]}/><meshStandardMaterial color={theme.rock} roughness={1} flatShading/></mesh>;
}
function Lantern({x,z,theme}:{x:number;z:number;theme:Theme}){
 const flame=useRef<Mesh>(null);const frame=useBattleFrame();
 useFrame(()=>{if(flame.current)flame.current.scale.setScalar(1+Math.sin(frame.current.seconds*7+x)*.08);});
 return <group position={[x,0,z]}>
  <mesh castShadow position={[0,1.25,0]}><boxGeometry args={[.22,2.5,.22]}/><meshStandardMaterial color="#594337"/></mesh>
  <mesh position={[0,2.55,0]}><boxGeometry args={[.65,.9,.65]}/><meshStandardMaterial color="#4c3c30" wireframe/></mesh>
  <mesh ref={flame} position={[0,2.5,0]}><octahedronGeometry args={[.23,0]}/><meshBasicMaterial color="#ffcc7d" toneMapped={false}/></mesh>
  <pointLight position={[0,2.5,0]} color={theme.accent} intensity={24} distance={12} decay={2}/>
 </group>;
}
function MineArch({x,z}:{x:number;z:number}){
 return <group position={[x,0,z]}>
  {[-4,4].map(a=><mesh key={a} castShadow position={[a,3,0]} rotation={[0,0,-a*.014]}><boxGeometry args={[.65,6,.65]}/><meshStandardMaterial color="#67513f"/></mesh>)}
  <mesh castShadow position={[0,5.9,0]}><boxGeometry args={[9,.8,.8]}/><meshStandardMaterial color="#78604a"/></mesh>
  {[-3.5,3.5].map(a=><mesh key={a} position={[a,5.1,0]} rotation={[0,0,a>0?-.7:.7]}><boxGeometry args={[.35,2,.55]}/><meshStandardMaterial color="#967557"/></mesh>)}
 </group>;
}
function Crate({x,z}:{x:number;z:number}){
 return <group position={[x,.8,z]} rotation={[0,.2,0]}>
  <mesh castShadow><boxGeometry args={[1.7,1.6,1.7]}/><meshStandardMaterial color="#8a6845" roughness={1}/></mesh>
  {[-.55,.55].map(a=><mesh key={a} position={[0,a,.86]}><boxGeometry args={[1.8,.12,.08]}/><meshStandardMaterial color="#bf9760"/></mesh>)}
  <mesh position={[0,0,.9]} rotation={[0,0,.7]}><boxGeometry args={[.16,2,.08]}/><meshStandardMaterial color="#bd965c"/></mesh>
 </group>;
}
function Atmosphere({theme,low}:{theme:Theme;low:boolean}){
 const points=useRef<Points>(null),frame=useBattleFrame();
 const geometry=useMemo(()=>{const a=new Float32Array((low?18:65)*3);for(let i=0;i<a.length;i+=3){a[i]=Math.sin(i*73.3)*25;a[i+1]=1+(i%9)*.6;a[i+2]=Math.cos(i*31.7)*16;}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(a,3));return g;},[low]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 useFrame(()=>{if(points.current){points.current.rotation.y=Math.sin(frame.current.seconds*.05)*.08;points.current.position.y=Math.sin(frame.current.seconds*.4)*.35;}});
 return <points ref={points} geometry={geometry}><pointsMaterial color={theme.accent} size={.055} transparent opacity={.55} depthWrite={false} sizeAttenuation/></points>;
}

export function Environment({ground,low,reduced}:{ground:string;low:boolean;reduced:boolean}){
 const theme=groundTheme(ground),original=useTexture(`/battle/ground/${theme.id}.webp`);
 const texture=useMemo(()=>{const t=original.clone();t.wrapS=t.wrapT=RepeatWrapping;t.repeat.set(5,4);t.colorSpace=SRGBColorSpace;t.magFilter=NearestFilter;t.needsUpdate=true;return t;},[original]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 const frame=useBattleFrame();
 useFrame(()=>{if(ground==='water'&&!reduced)texture.offset.set(Math.sin(frame.current.seconds*.08)*.015,frame.current.seconds*.003);});
 const props=useMemo(()=>sceneryLayout(theme.id),[theme.id]);
 return <>
  <color attach="background" args={[theme.sky]}/><fog attach="fog" args={[theme.sky,34,theme.fog]}/>
  <ambientLight intensity={.6} color={theme.ambient}/><hemisphereLight args={[theme.ambient,'#292b31',1.35]}/>
  <directionalLight position={[-14,24,6]} intensity={2.3} color={theme.light} castShadow={!low} shadow-mapSize={[1024,1024]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={25} shadow-camera-bottom={-25} shadow-camera-far={80} shadow-bias={-.0005} shadow-normalBias={.07}/>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.025,0]} receiveShadow><planeGeometry args={[90,70]}/><meshStandardMaterial map={texture} color="#c2c6be" roughness={ground==='water'?.36:1} metalness={ground==='water'?.22:0}/></mesh>
  {/* A shallow raised floor gives the diorama real silhouettes at its edge. */}
  <mesh position={[0,-.65,0]} receiveShadow><boxGeometry args={[62,1.2,42]}/><meshStandardMaterial color={theme.rock} roughness={1}/></mesh>
  {props.slice(0,low?18:32).map(p=>ground==='deck'?p.index%3===0?<Crate key={p.index} x={p.x} z={p.z}/>:null:ground==='grass'&&p.index%3!==0?<Tree key={p.index} {...p} theme={theme}/>:<Rock key={p.index} {...p} theme={theme}/>)}
  {ground==='grass'&&[-1,1].map(s=><group key={s}>{Array.from({length:8},(_,i)=><mesh key={i} position={[s*(13+i*.9),.2,8+Math.sin(i*3)*2]} rotation={[0,i,0]}><coneGeometry args={[.25,.8,4]}/><meshStandardMaterial color={i%2?'#809059':'#547857'}/></mesh>)}</group>)}
  {ground==='cave'&&<><MineArch x={-11} z={-12}/><MineArch x={10} z={-14}/>{[-17,17].map(x=><mesh key={x} position={[x,1,-5]} rotation={[0,0,x*.02]}><octahedronGeometry args={[1.1,0]}/><meshStandardMaterial color="#84b9d8" emissive="#315a91" emissiveIntensity={.7} roughness={.3}/></mesh>)}</>}
  {ground==='deck'&&<>{[-14,14].map(z=><group key={z}>{Array.from({length:11},(_,i)=><mesh castShadow key={i} position={[-25+i*5,1,z]}><boxGeometry args={[.3,2,.3]}/><meshStandardMaterial color="#685541"/></mesh>)}<mesh position={[0,1.8,z]}><boxGeometry args={[53,.18,.18]}/><meshStandardMaterial color="#b49b6e"/></mesh></group>)}<Crate x={-17} z={-9}/><Crate x={16} z={-10}/><Crate x={18} z={-9}/></>}
  {ground==='dirt'&&<><Crate x={-17} z={-7}/><Crate x={-18} z={-9}/></>}
  <Lantern x={-14} z={-8} theme={theme}/><Lantern x={15} z={-9} theme={theme}/>
  {!reduced&&<Atmosphere theme={theme} low={low}/>}
 </>;
}
