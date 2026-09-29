import reference from '../../../game-data/data/raid-spell-reference.json' with {type:'json'};
import {roll} from './character.js';

// Unscaled ClassicDB spell effects. Damage still uses the shared mitigation path.
export function raidSpellValue(s,id,effect=1){
 const spell=reference.spells[id];
 if(!spell)throw new Error(`缺少团本法术参考：${id}`);
 return spell[`EffectBasePoints${effect}`]+roll(s,1,Math.max(1,spell[`EffectDieSides${effect}`]));
}
