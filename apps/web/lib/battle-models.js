import {battleModel as baseBattleModel} from '../../../packages/game-data/battle-models.js';
import ranged from '../../../packages/game-data/visuals/classic-ranged-manifest.json' with {type:'json'};

// Client presentation only. Adding an animation or a sound must not invalidate
// the server's pinned simulation rules or its persisted checkpoints.
export function battleModel(unit,clock=0){
 const model=baseBattleModel(unit,clock);
 if(!model?.appearanceKey||unit.classId!==3)return model;
 const body=`${unit.raceId||1}-${unit.gender==='female'?1:0}`,animation=ranged.bodies[body];
 if(!animation)return model;
 const style=ranged.itemStyles[unit.equipment?.[18]?.id]||([3,6].includes(unit.raceId)?'rifle':'bow');
 return {...model,rangedStyle:style,animationSrc:animation.path,animations:[...model.animations,...animation.animations],
  attachments:[...model.attachments.map(a=>a.point===1?{...a,mode:'melee'}:a),ranged.models[style]]};
}
