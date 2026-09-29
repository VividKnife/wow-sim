// Schema/default encoding is lossless, including own undefined properties and
// property order. References preserve shared objects without repeating rows.
export function packContent(root) {
 const nodes=[],schemas=[],seen=new WeakMap(),groups=new Map(),interned=new Map(),active=new WeakSet();
 function encode(value) {
  if(value===undefined)return [-1];
  if(value===null||typeof value!=='object')return value;
  if(seen.has(value))return [seen.get(value)];
  if(active.has(value))throw new Error('Cyclic source content');
  active.add(value);
  let node,group;
  if(Array.isArray(value))node=[-1,...value.map(encode)];
  else {
   const keys=Object.keys(value),signature=JSON.stringify(keys);
   group=groups.get(signature);
   if(!group){group={id:schemas.length,keys,rows:[]};groups.set(signature,group);schemas.push(null);}
   node=[group.id,keys.map(key=>encode(value[key]))];
  }
  active.delete(value);
  const fingerprint=JSON.stringify(node);
  if(interned.has(fingerprint)){const id=interned.get(fingerprint);seen.set(value,id);return [id];}
  const id=nodes.length;seen.set(value,id);interned.set(fingerprint,id);nodes.push(node);
  if(group)group.rows.push(id);
  return [id];
 }
 const [rootId]=encode(root);
 for(const group of groups.values()){
  const defaults=group.keys.map((_,column)=>{
   const counts=new Map();let best=null,max=0;
   for(const id of group.rows){const value=nodes[id][1][column];if(Array.isArray(value))continue;const count=(counts.get(value)||0)+1;counts.set(value,count);if(count>max){best=value;max=count;}}
   return best;
  });
  schemas[group.id]=[group.keys,defaults];
  for(const id of group.rows){const values=nodes[id][1],row=[group.id];values.forEach((v,i)=>{if(v!==defaults[i])row.push(i,v);});nodes[id]=row;}
 }
 return {format:1,root:rootId,schemas,nodes};
}
