import {talents} from './catalog.js';

export const combatRoles=['auto','tank','melee','ranged','healer'];
export function dominantTalentTree(c){
 const points=new Map();
 for(const [id,rank] of Object.entries(c.talents||{})){
  const tree=talents[id]?.tree;if(tree&&rank>0)points.set(tree,(points.get(tree)||0)+rank);
 }
 return [...points].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0]||null;
}
export function combatRole(c){
 const selected=c.strategyPolicy?.role;
 if(selected&&selected!=='auto'&&combatRoles.includes(selected))return selected;
 const tree=dominantTalentTree(c);
 if(c.classId===1)return tree&&tree!==163?'melee':'tank';
 if(c.classId===2)return tree===382?'healer':tree===383?'tank':'melee';
 if(c.classId===4)return 'melee';
 if(c.classId===5)return tree===203?'ranged':'healer';
 if(c.classId===7)return tree===262?'healer':tree===263?'melee':'ranged';
 if(c.classId===11)return c.form==='bear'?'tank':c.form==='cat'?'melee':tree===282?'healer':tree===281?'melee':'ranged';
 return 'ranged';
}
export const isBackline=c=>['ranged','healer'].includes(combatRole(c));
