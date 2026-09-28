import creatures from './data/classic-battle-models-manifest.json' with {type:'json'};
import characters from './data/classic-characters-manifest.json' with {type:'json'};
import portraits from './data/npc-models-manifest.json' with {type:'json'};
import {moltenCoreModel} from './molten-core-models.js';
import {modelYards,characterYards} from './model-scale.js';
const demons={imp:4449,voidwalker:1132,succubus:4162,felhunter:850,infernal:169,doomguard:1912};
const portraitPaths=new Map(portraits.assets.map(asset=>[asset.displayId,'/'+asset.path]));
function descriptor(asset,entry){return asset?{src:asset.path,displayId:asset.displayId,portrait:portraitPaths.get(asset.displayId),
 height:asset.height,minY:asset.minY,yards:modelYards(asset,entry),animations:asset.animations}:null;}
export function battleModel(unit,clock=0){
 if(unit.polyUntil>clock)return descriptor(creatures.models[856]);
 if(unit.form==='bear')return descriptor(creatures.models[unit.raceId===6?2289:2281]);
 if(unit.form==='cat')return descriptor(creatures.models[unit.raceId===6?8571:892]);
 if(unit.classId&&!unit.petUnit&&!unit.totemUnit&&!unit.entry){
  const gender=unit.gender==='female'?1:0,race=unit.raceId||1;
  const appearance=characters.appearances?.[`${race}-${gender}-${unit.classId}-${unit.level>=60?'t1':'starter'}`];
  const body=appearance&&characters.bodies?.[appearance.body],model=descriptor(body);
  if(model)model.yards=characterYards(body,appearance.body);
  if(model){model.appearanceKey=`${race}-${gender}-${unit.classId}-${appearance.tier}`;model.textures=appearance.textures;model.geosets=appearance.geosets;model.attachments=appearance.attachments;model.twoHanded=appearance.twoHanded;}
  return model;
 }
 const mc=moltenCoreModel(unit.entry);if(mc)return mc;
 const totem=unit.totemUnit?({fire:4589,earth:4588,water:4587,air:4590})[unit.id?.split('-').at(-1)]:null;
 const display=portraits.entries[unit.entry]?.displayId||unit.modelId||unit.ModelId1||demons[unit.kind]||totem;
 return descriptor(creatures.models[display],unit.entry);
}
