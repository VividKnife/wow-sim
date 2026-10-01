// Attribution is deliberately separate from a live caster. It never contains
// equipment, talents, wallets, controllers or mutable proc state.
const fields=new Set(['id','name','classId','ownerId','petUnit','kind']);
export function validEffectSource(source,id){
 return !!source&&typeof source==='object'&&!Array.isArray(source)&&source.id===id&&typeof id==='string'&&!!id&&
  typeof source.name==='string'&&!!source.name&&Number.isSafeInteger(source.classId)&&source.classId>=0&&
  (source.ownerId===undefined||typeof source.ownerId==='string')&&(source.petUnit===undefined||typeof source.petUnit==='boolean')&&
  (source.kind===undefined||typeof source.kind==='string')&&Object.keys(source).every(key=>fields.has(key));
}
export function effectSource(caster){
 if(!caster)throw new Error('Periodic effect requires a local caster at application');
 const source={id:caster.id,name:caster.name||caster.id,classId:caster.classId||0};
 for(const field of ['ownerId','petUnit','kind'])if(caster[field]!==undefined)source[field]=caster[field];
 if(!validEffectSource(source,caster.id))throw new Error('Invalid periodic effect source');
 return source;
}
