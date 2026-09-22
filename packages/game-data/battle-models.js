import creatures from './data/classic-battle-models-manifest.json' with {type:'json'};
import characters from './data/classic-characters-manifest.json' with {type:'json'};
import portraits from './data/npc-models-manifest.json' with {type:'json'};
import {moltenCoreModel} from './molten-core-models.js';

const raceHeights={1:2.8,2:3,3:2.2,4:3.2,5:2.7,6:3.8,7:1.7,8:3.3};
const demons={imp:4449,voidwalker:1132,succubus:4162,felhunter:850,infernal:169};
function descriptor(asset,yards){return asset?{src:asset.path,displayId:asset.displayId,portrait:asset.portrait,
 height:asset.height,minY:asset.minY,yards,animations:asset.animations}:null;}
export function battleModel(unit,clock=0){
 if(unit.polyUntil>clock)return descriptor(creatures.models[856],1.4);
 if(unit.form==='bear')return descriptor(creatures.models[unit.raceId===6?2289:2281],2.8);
 if(unit.form==='cat')return descriptor(creatures.models[unit.raceId===6?8571:892],2);
 if(unit.classId&&!unit.petUnit&&!unit.totemUnit&&!unit.entry){
  const gender=unit.gender==='female'?1:0,race=unit.raceId||1;
  const asset=characters.characters[`${race}-${gender}-${unit.classId}`];
  const model=descriptor(asset,raceHeights[race]||2.8);
  if(model){model.weapon=characters.weapons[asset.weaponDisplay]?.path;model.twoHanded=asset.weaponDisplay===472;}
  return model;
 }
 const mc=moltenCoreModel(unit.entry);if(mc)return mc;
 const display=portraits.entries[unit.entry]?.displayId||unit.modelId||unit.ModelId1||demons[unit.kind];
 const yards=unit.totemUnit?1.8:unit.rank===3?5:unit.rank===1?3.8:unit.creatureType===5?4.5:unit.petUnit?2:2.8;
 return descriptor(creatures.models[display],yards);
}
