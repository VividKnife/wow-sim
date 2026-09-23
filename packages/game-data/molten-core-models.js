import manifest from './data/molten-core-models-manifest.json' with {type:'json'};
import classic from './data/classic-battle-models-manifest.json' with {type:'json'};
import portraits from './data/npc-models-manifest.json' with {type:'json'};
const portraitPaths=new Map(portraits.assets.map(a=>[a.displayId,'/'+a.path]));

// Heights are encounter presentation in yards, independent of native model units.
// Lucifron needs to stand above the melee group (even 3.8-yard tauren).
const heights={11502:9,11982:5,11988:6,12057:5,12056:5,12098:4.5,12118:7,12259:4,12264:4,12018:4,
 11658:4.5,11659:4.8,11671:2.7,11672:3.2,11673:3.2,11669:1.6,12101:3.2,11665:3.2,
 11668:3.5,11661:3,11662:3,12076:3,12119:3,12129:3.5,12099:2.7,11663:3.2,11664:3,12143:3};
export function moltenCoreModel(entry){
 if(!heights[entry])return null;
 const identity=manifest.entries[entry]||portraits.entries[entry],asset=identity&&(manifest.models[identity.displayId]||classic.models[identity.displayId]);
 if(!asset)return null;
 return {src:asset.path,portrait:portraitPaths.get(asset.displayId)||asset.portrait,displayId:asset.displayId,height:asset.height,minY:asset.minY,
  yards:heights[entry],animations:asset.animations};
}
