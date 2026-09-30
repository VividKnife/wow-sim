import BattleHD2D from './battle-hd2d';
import {sceneLayout} from '@/lib/battle-scene.js';
import {creatureVisual} from '@/lib/creature-visuals.js';
import './boss-target.css';
export default function RaidBossPreview({boss,active}:{boss:any;active:boolean}){
 const unit={...boss,id:'preview-'+boss.id,hp:boss.hp||1,maxHp:boss.hp||1,foe:true,rank:3,position:0,positionY:0,visual:creatureVisual(boss)};
 return <div className="raid-boss-preview"><BattleHD2D active={active} skills={[]} onSelect={()=>{}} scene={{encounterId:unit.id,live:false,clock:0,layout:sceneLayout([],[unit],3),units:[unit],selectedId:'',range:0,projectiles:[],effects:[],groundEffects:[],lowEffects:true,reducedMotion:true,ground:boss.id==='onyxia'?'onyxia':'molten'}}/><div className="raid-boss-preview-heading" role="status"><strong>{boss.name}</strong><span>首领就在前方 · 下一次推进战斗将挑战此首领</span></div></div>;
}
