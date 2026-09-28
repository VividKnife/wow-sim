// Derived values belong to the runtime, never to saves, replays or the wire.
// Rules mutate nested plain data in place, so object identity and tick numbers
// cannot invalidate a cache correctly. Compare a flat snapshot of dependencies
// instead; no JSON allocation, hash collisions or Infinity/null conflation.
const objectStart=Symbol('object'),arrayStart=Symbol('array'),end=Symbol('end');
export function memoizeDerived(fields,calculate){
 const entries=new WeakMap();
 return owner=>{
  let entry=entries.get(owner);
  if(!entry){entry={values:[],ready:false};entries.set(owner,entry);}
  let cursor=0,changed=!entry.ready;
  const value=next=>{if(!Object.is(entry.values[cursor],next)||cursor>=entry.values.length){entry.values[cursor]=next;changed=true;}cursor++;};
  const visit=next=>{
   if(next===null||typeof next!=='object'){value(next);return;}
   if(Array.isArray(next)){
    value(arrayStart);value(next.length);
    // Dependency arrays are JSON data: only indexed values affect rules.
    for(let i=0;i<next.length;i++)visit(next[i]);
   }else{
    value(objectStart);
    for(const key in next)if(Object.hasOwn(next,key)){value(key);visit(next[key]);}
   }
   value(end);
  };
  for(const field of fields){
   let dependency=owner;
   if(Array.isArray(field)){for(const key of field)dependency=dependency?.[key];}
   else dependency=owner[field];
   visit(dependency);
  }
  if(cursor!==entry.values.length){entry.values.length=cursor;changed=true;}
  if(changed){
   entry.ready=false;
   entry.result=calculate(owner);
   entry.ready=true;
  }
  return entry.result;
 };
}
