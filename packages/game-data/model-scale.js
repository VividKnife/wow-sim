import scales from './data/model-scales.json' with {type:'json'};

// GLBs retain M2 coordinates. Template Scale replaces (never multiplies) the
// display default, matching Classic creature_template semantics.
export function modelYards(asset,entry){
 return asset.height*(scales.entries[entry]??scales.displays[asset.displayId]??1);
}
export function characterYards(asset,body){
 return asset.height*(scales.characters[body]??1);
}
