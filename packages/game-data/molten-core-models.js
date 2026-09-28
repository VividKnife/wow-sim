import manifest from './data/molten-core-models-manifest.json' with {type:'json'};
import classic from './data/classic-battle-models-manifest.json' with {type:'json'};
import portraits from './data/npc-models-manifest.json' with {type:'json'};
import {modelYards} from './model-scale.js';
// Flamewaker Protector uses a model from the shared Classic manifest.
const entries=new Set([...Object.keys(manifest.entries).map(Number),12129]);
const portraitPaths=new Map(portraits.assets.map(a=>[a.displayId,'/'+a.path]));

export function moltenCoreModel(entry){
 if(!entries.has(Number(entry)))return null;
 const identity=manifest.entries[entry]||portraits.entries[entry],asset=identity&&(manifest.models[identity.displayId]||classic.models[identity.displayId]);
 if(!asset)return null;
 return {src:asset.path,portrait:portraitPaths.get(asset.displayId)||asset.portrait,displayId:asset.displayId,height:asset.height,minY:asset.minY,
  yards:modelYards(asset,entry),animations:asset.animations};
}
