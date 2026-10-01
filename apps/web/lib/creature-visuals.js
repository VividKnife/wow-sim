import {creatureVisual as resolveCreatureVisual} from '../../../packages/game-data/creature-visuals.js';
import {publicAsset} from './public-asset.ts';

export function creatureVisual(unit){
 const visual=resolveCreatureVisual(unit);
 // Manifest paths are joined at runtime, outside Vite's literal URL rewrite.
 return {...visual,src:visual.src?publicAsset(visual.src):visual.src};
}
