// Versioned structured metadata + Float64 numeric deltas. Numbers retain the
// authoritative precision; dictionary indices, masks and sequences are uint32.
export const COMBAT_STREAM_VERSION=1;
const MAX_PATHS=65536,HEADER=16;
const unsafe=key=>['__proto__','constructor','prototype'].includes(String(key));
const pathKey=path=>JSON.stringify(path);
const number=value=>typeof value==='number'&&Number.isFinite(value);
function diff(previous,next,path,numeric,patches){
 if(Object.is(previous,next))return;
 if(number(next)){numeric.push([path,next]);return;}
 if(previous&&next&&typeof previous==='object'&&typeof next==='object'&&Array.isArray(previous)===Array.isArray(next)){
  if(Array.isArray(next)&&previous.length!==next.length){patches.push({path,value:next});return;}
  for(const key of Object.keys(previous))if(!Object.hasOwn(next,key))patches.push({path:[...path,key],remove:true});
  for(const key of Object.keys(next)){if(unsafe(key))throw new Error('Unsafe stream key');diff(previous[key],next[key],[...path,key],numeric,patches);}return;
 }
 patches.push({path,value:next});
}
export class CombatStreamSender{
 constructor(){this.reset();this.pool=[];}
 reset(){this.sequence=0;this.previous=null;this.paths=new Map();this.inflight=null;}
 rebase(){this.previous=null;this.paths.clear();this.inflight=null;}
 get ready(){return this.inflight===null;}
 acknowledge(sequence,buffer){
  if(this.inflight!==sequence)return false;
  this.inflight=null;
  if(buffer instanceof ArrayBuffer&&buffer.byteLength<=1048576&&this.pool.length<2)this.pool.push(buffer);
  return true;
 }
 encode(snapshot,{baseline=false}={}){
  if(!this.ready)return null; // Caller coalesces before projection, never drops a delta.
  if(this.sequence>=0xffffffff)throw new Error('Stream sequence exhausted; start a new session');
  if(this.paths.size>MAX_PATHS){baseline=true;this.paths.clear();}
  const sequence=++this.sequence,base=baseline||!this.previous?0:sequence-1;
  if(!base){this.paths.clear();this.previous=snapshot;this.inflight=sequence;return {version:COMBAT_STREAM_VERSION,sequence,base,snapshot};}
  const numeric=[],patches=[],dictionary=[];diff(this.previous,snapshot,[],numeric,patches);
  const groups=new Map();
  for(const [path,value]of numeric){const key=pathKey(path);let index=this.paths.get(key);if(index===undefined){index=this.paths.size;this.paths.set(key,index);dictionary.push([index,path]);}const group=index>>>5,bit=index&31;let row=groups.get(group);if(!row){row=new Map();groups.set(group,row);}row.set(bit,value);}
  const bytes=HEADER+groups.size*8+numeric.length*8;
  const reusable=this.pool.findIndex(b=>b.byteLength>=bytes);const buffer=reusable<0?new ArrayBuffer(bytes):this.pool.splice(reusable,1)[0];
  const view=new DataView(buffer);view.setUint32(0,COMBAT_STREAM_VERSION,true);view.setUint32(4,sequence,true);view.setUint32(8,base,true);view.setUint32(12,bytes,true);let offset=HEADER;
  for(const [group,values]of groups){let mask=0;for(const bit of values.keys())mask|=1<<bit;view.setUint32(offset,group,true);view.setUint32(offset+4,mask>>>0,true);offset+=8;for(let bit=0;bit<32;bit++)if(values.has(bit)){view.setFloat64(offset,values.get(bit),true);offset+=8;}}
  this.previous=snapshot;this.inflight=sequence;
  return {version:COMBAT_STREAM_VERSION,sequence,base,dictionary,patches,buffer,bytes};
 }
}
function assign(root,path,value,remove,mutable){
 if(!Array.isArray(path)||path.some(unsafe))throw new Error('Invalid stream path');
 if(!path.length)return value;
 const copy=value=>{const clone=Array.isArray(value)?value.slice():{...value};mutable.add(clone);return clone;};
 if(!mutable.has(root))root=copy(root);
 let parent=root;
 for(const key of path.slice(0,-1)){
  if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,key))throw new Error('Missing stream parent');
  const child=parent[key];if(!child||typeof child!=='object')throw new Error('Invalid stream parent');
  if(!mutable.has(child))parent[key]=copy(child);parent=parent[key];
 }
 const key=path.at(-1);if(remove)delete parent[key];else parent[key]=value;return root;
}
export class CombatStreamReceiver{
 constructor(){this.reset();}
 reset(){this.sequence=0;this.snapshot=null;this.paths=new Map();}
 apply(packet){
  if(packet.version!==COMBAT_STREAM_VERSION||!Number.isSafeInteger(packet.sequence)||packet.sequence<=0)throw new Error('Unsupported stream protocol');
  if(packet.sequence<=this.sequence)return {status:'duplicate',snapshot:this.snapshot};
  if(packet.base&&packet.base!==this.sequence)return {status:'baseline-required'};
  if(!packet.base){this.snapshot=structuredClone(packet.snapshot);this.sequence=packet.sequence;this.paths.clear();return {status:'applied',snapshot:this.snapshot};}
  const paths=new Map(this.paths);for(const [index,path]of packet.dictionary||[]){if(!Number.isInteger(index)||index<0||index>MAX_PATHS||!Array.isArray(path)||path.some(unsafe))throw new Error('Invalid dictionary');paths.set(index,path);}
  const view=new DataView(packet.buffer),bytes=view.getUint32(12,true);
  if(view.getUint32(0,true)!==COMBAT_STREAM_VERSION||view.getUint32(4,true)!==packet.sequence||view.getUint32(8,true)!==packet.base||bytes>view.byteLength||bytes<HEADER)throw new Error('Invalid delta header');
  let snapshot=this.snapshot;const mutable=new WeakSet();
  for(const patch of packet.patches||[])snapshot=assign(snapshot,patch.path,structuredClone(patch.value),patch.remove,mutable);
  let offset=HEADER;
  while(offset<bytes){if(offset+8>bytes)throw new Error('Truncated delta');const group=view.getUint32(offset,true),mask=view.getUint32(offset+4,true);offset+=8;
   for(let bit=0;bit<32;bit++)if(mask&(1<<bit)){const path=paths.get(group*32+bit);if(!path||offset+8>bytes)throw new Error('Invalid numeric field');const value=view.getFloat64(offset,true);if(!Number.isFinite(value))throw new Error('Invalid numeric value');snapshot=assign(snapshot,path,value,false,mutable);offset+=8;}
  }
  this.snapshot=snapshot;this.paths=paths;this.sequence=packet.sequence;return {status:'applied',snapshot};
 }
}
// Event IDs use safe integers and are independent of display packet sequence.
export function eventBatch(logs,after){
 const events=(logs||[]).filter(e=>e.id>after),first=events[0]?.id;
 return {after,through:events.at(-1)?.id??after,gap:first!=null&&first>after+1,events};
}

export function hydrateCombatFrame(frame){
 const actors=frame.actors||{};
 return {player:{...frame.player,party:(frame.player.party||[]).map((id)=>actors[id])},view:{...frame.view,battleView:frame.view.battleView?{...frame.view.battleView,actors:frame.view.battleView.actors.map((id)=>actors[id])}:frame.view.battleView}};
}
