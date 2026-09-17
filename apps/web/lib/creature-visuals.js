import manifest from '../../../packages/game-data/data/creature-assets-manifest.json' with {type:'json'};

const assets=Object.fromEntries(manifest.assets.map(asset=>[asset.id,{src:'/'+asset.path,label:asset.label,kind:asset.kind}]));
// This small manifest avoids bringing server catalogue tables into the renderer.
export function creatureVisual(unit){
 const id=manifest.entries[unit?.entry]?.assetId
  ||manifest.models[unit?.modelId??unit?.ModelId1]
  ||manifest.families[unit?.family??unit?.Family]
  ||manifest.types[unit?.creatureType??unit?.CreatureType]
  ||'unknown';
 return {...(assets[id]||assets.unknown),species:id,creatureType:manifest.entries[unit?.entry]?.creatureType??unit?.creatureType};
}
