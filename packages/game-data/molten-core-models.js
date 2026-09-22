import manifest from './data/molten-core-models-manifest.json' with {type:'json'};

// Heights are encounter presentation in yards, independent of native model units.
const heights={11502:9,11982:5,11988:6,12057:5,12056:5,12098:4.5,12118:4,12259:4,12264:4,12018:4,
 11658:4.5,11659:4.8,11671:2.7,11672:3.2,11673:3.2,11669:1.6,12101:3.2,11665:3.2,
 11668:3.5,11661:3,11662:3,12076:3,12119:3,12099:2.7,11663:3.2,11664:3,12143:3};
export function moltenCoreModel(entry){
 const identity=manifest.entries[entry],asset=identity&&manifest.models[identity.displayId];
 if(!asset)return null;
 return {src:asset.path,portrait:asset.portrait,displayId:asset.displayId,height:asset.height,minY:asset.minY,
  yards:heights[entry],animations:asset.animations};
}
