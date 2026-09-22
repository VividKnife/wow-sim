import manifest from './data/npc-models-manifest.json' with {type:'json'};
import species from './data/creature-assets-manifest.json' with {type:'json'};
import {moltenCoreModel} from './molten-core-models.js';
import {battleModel} from './battle-models.js';

const assets=new Map(manifest.assets.map(asset=>[asset.id,asset]));
const models=new Map(manifest.assets.map(asset=>[asset.displayId,asset]));
const types={1:'野兽',2:'龙类',3:'恶魔',4:'元素生物',5:'巨人',6:'亡灵',7:'人型生物',8:'小动物',9:'机械'};
// Authored service roles use representative models, not an invented NPC identity.
export const serviceModels={bank:332,auction:8670,shop:54,inn:6740,trainer:197,professions:78,flight:352,tram:914,quests:68};
export function creatureVisual(unit){
 const model=moltenCoreModel(unit?.entry)||battleModel(unit||{});
 if(model)return {src:model.portrait,kind:'npc-model-render',label:'Classic 原版骨骼模型',model};
 const record=manifest.entries[unit?.entry];
 const asset=assets.get(record?.assetId)||models.get(unit?.modelId??unit?.ModelId1);
 const creatureType=record?.creatureType??unit?.creatureType??unit?.CreatureType;
 return {src:asset?'/'+asset.path:null,kind:asset?'npc-model-render':'missing-model',
  label:asset?`${types[creatureType]||'生物'} · 2D 模型贴图`:'模型贴图暂缺',
  species:species.entries[unit?.entry]?.assetId||species.models[unit?.modelId??unit?.ModelId1],creatureType};
}
