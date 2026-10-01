import {assertGameResponse,PROTOCOL_VERSION,type GameResponse} from './game.ts';

export type PatchPath = readonly (string | number)[];
export type ProjectedStateOperation =
 | Readonly<{op:'set';path:PatchPath;value:unknown}>
 | Readonly<{op:'remove';path:PatchPath}>
 | Readonly<{op:'splice';path:PatchPath;index:number;deleteCount:number;values:readonly unknown[]}>;

export type GameSnapshotEvent = GameResponse & Readonly<{type:'snapshot';sequence:number}>;
export type GameDeltaEvent = Readonly<{
 type:'delta';
 protocolVersion:typeof PROTOCOL_VERSION;
 contentVersion:string;
 baseRevision:number;
 revision:number;
 baseSequence:number;
 sequence:number;
 operations:readonly ProjectedStateOperation[];
}>;
export type GameStateEvent = GameSnapshotEvent | GameDeltaEvent;

const unsafeSegments=new Set(['__proto__','prototype','constructor']);
const own=(value:object,key:string|number)=>Object.hasOwn(value,key);

function safeInteger(value:unknown,name:string){
 if(!Number.isSafeInteger(value)||(value as number)<0)throw new TypeError(`${name} must be a non-negative safe integer`);
 return value as number;
}

function validatePath(path:unknown):asserts path is (string|number)[]{
 if(!Array.isArray(path)||path.length>64)throw new TypeError('invalid patch path');
 for(const segment of path){
  if(typeof segment==='number'){
   if(!Number.isSafeInteger(segment)||segment<0)throw new TypeError('invalid patch path index');
  }else if(typeof segment!=='string'||!segment||segment.length>200||unsafeSegments.has(segment))throw new TypeError('invalid patch path segment');
 }
}

function cloneJson(value:unknown,depth=0):any{
 if(depth>100)throw new TypeError('projected state is too deep');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value))return value.map(item=>cloneJson(item,depth+1));
 if(value&&typeof value==='object'){
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null)throw new TypeError('projected state must contain plain JSON objects');
  const result:Record<string,unknown>={};
  for(const [key,nested] of Object.entries(value)){
   if(unsafeSegments.has(key))throw new TypeError('projected state contains an unsafe key');
   result[key]=cloneJson(nested,depth+1);
  }
  return result;
 }
 throw new TypeError('projected state must be JSON serializable');
}

// Validate boundary values without allocating a second copy of the whole graph.
function validateJson(value:unknown,depth=0):void{
 if(depth>100)throw new TypeError('projected state is too deep');
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
 if(Array.isArray(value)){for(const item of value)validateJson(item,depth+1);return;}
 if(value&&typeof value==='object'){
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null)throw new TypeError('projected state must contain plain JSON objects');
  for(const [key,nested] of Object.entries(value)){
   if(unsafeSegments.has(key))throw new TypeError('projected state contains an unsafe key');
   validateJson(nested,depth+1);
  }
  return;
 }
 throw new TypeError('projected state must be JSON serializable');
}

function samePrimitive(left:unknown,right:unknown){return Object.is(left,right);}

export function diffProjectedState(previous:unknown,next:unknown):ProjectedStateOperation[]{
 validateJson(previous);validateJson(next);
 const operations:ProjectedStateOperation[]=[];
 const walk=(left:any,right:any,path:(string|number)[])=>{
  if(samePrimitive(left,right))return;
  if(Array.isArray(left)&&Array.isArray(right)){
   // Logs are a bounded chronological window. Retain its overlap by record ID
   // instead of replacing the window (or changing every shifted array index).
   if(path.at(-1)==='logs'&&left.length&&right.length){
    const offset=left.findIndex(row=>row?.id!==undefined&&row.id===right[0]?.id);
    const overlap=Math.min(left.length-offset,right.length);
    if(offset>=0&&right.slice(0,overlap).every((row,index)=>row?.id!==undefined&&row.id===left[offset+index]?.id)){
     if(offset)operations.push({op:'splice',path,index:0,deleteCount:offset,values:[]});
     for(let index=0;index<overlap;index++)walk(left[offset+index],right[index],[...path,index]);
     if(left.length-offset!==overlap||right.length!==overlap)operations.push({op:'splice',path,index:overlap,deleteCount:left.length-offset-overlap,values:cloneJson(right.slice(overlap))});
     return;
    }
   }
   if(left.length!==right.length){operations.push({op:'set',path,value:cloneJson(right)});return;}
   for(let index=0;index<right.length;index++)walk(left[index],right[index],[...path,index]);
   return;
  }
  if(left&&right&&typeof left==='object'&&typeof right==='object'&&!Array.isArray(left)&&!Array.isArray(right)){
   for(const key of Object.keys(left).sort())if(!own(right,key))operations.push({op:'remove',path:[...path,key]});
   for(const key of Object.keys(right).sort()){
    const child=[...path,key];validatePath(child);
    if(!own(left,key))operations.push({op:'set',path:child,value:cloneJson(right[key])});else walk(left[key],right[key],child);
   }
   return;
  }
  operations.push({op:'set',path,value:cloneJson(right)});
 };
 walk(previous,next,[]);
 return operations;
}

export function applyProjectedState(previous:unknown,operations:readonly ProjectedStateOperation[]):unknown{
 if(!Array.isArray(operations)||operations.length>100_000)throw new TypeError('invalid projected state operations');
 validateJson(previous);
 const owned=new WeakSet<object>();
 const fork=(value:any)=>{
  if(!value||typeof value!=='object'||owned.has(value))return value;
  const copy=Array.isArray(value)?value.slice():{...value};owned.add(copy);return copy;
 };
 let result=fork(previous);
 for(const operation of operations){
  if(!operation||typeof operation!=='object'||(operation.op!=='set'&&operation.op!=='remove'&&operation.op!=='splice'))throw new TypeError('invalid projected state operation');
  validatePath(operation.path);
  if(operation.op==='splice'){
   safeInteger(operation.index,'splice index');safeInteger(operation.deleteCount,'splice delete count');
   if(!Array.isArray(operation.values))throw new TypeError('splice values must be an array');
   let target=result;
   for(const segment of operation.path){
    if(!target||typeof target!=='object'||!own(target,segment))throw new TypeError('patch path does not exist');
    const child=fork(target[segment as any]);target[segment as any]=child;target=child;
   }
   if(!Array.isArray(target)||operation.index>target.length||operation.deleteCount>target.length-operation.index)throw new TypeError('invalid splice range');
   const values=cloneJson(operation.values);
   // Avoid argument-count limits on an untrusted replacement array.
   const tail=target.slice(operation.index+operation.deleteCount);target.length=operation.index;
   for(const value of values)target.push(value);for(const value of tail)target.push(value);
   continue;
  }
  if(operation.path.length===0){
   if(operation.op!=='set')throw new TypeError('cannot remove the projected state root');
   result=cloneJson(operation.value);continue;
  }
  let parent=result;
  for(const segment of operation.path.slice(0,-1)){
   if(!parent||typeof parent!=='object'||!own(parent,segment))throw new TypeError('patch path does not exist');
   const child=fork(parent[segment as any]);
   parent[segment as any]=child;parent=child;
  }
  const key=operation.path.at(-1)!;
  if(!parent||typeof parent!=='object')throw new TypeError('patch path parent is not an object');
  if(Array.isArray(parent)){
   if(typeof key!=='number'||key>parent.length)throw new TypeError('invalid patch path index');
   if(operation.op==='remove'){
    if(key>=parent.length)throw new TypeError('patch path does not exist');
    parent.splice(key,1);
   }else parent[key]=cloneJson(operation.value);
  }else{
   if(typeof key!=='string')throw new TypeError('object patch paths require string keys');
   if(operation.op==='remove'){
    if(!own(parent,key))throw new TypeError('patch path does not exist');
    delete parent[key];
   }else parent[key]=cloneJson(operation.value);
  }
 }
 return result;
}

function responseOf(event:GameSnapshotEvent):GameResponse{
 const {type:_type,sequence:_sequence,...response}=event;
 return response;
}

function assertDeltaOwner(previous:GameResponse,next:GameResponse){
 const before=previous.execution,after=next.execution;
 if(!before&&!after)return;
 if(!before||!after||before.instanceId!==after.instanceId||before.ownerEpoch!==after.ownerEpoch||
   before.actorId!==after.actorId||before.controllerGeneration!==after.controllerGeneration||
   previous.snapshot?.player.id!==next.snapshot?.player.id||next.contentVersion!==previous.contentVersion)
  throw new RangeError('delta owner requires a new snapshot');
 if(after.streamSequence<before.streamSequence)throw new RangeError('delta owner stream is stale');
}

export function createDeltaEvent(previous:GameSnapshotEvent,next:GameSnapshotEvent):GameDeltaEvent{
 assertGameResponse(previous);assertGameResponse(next);
 assertDeltaOwner(previous,next);
 safeInteger(previous.sequence,'base sequence');safeInteger(next.sequence,'sequence');
 if(next.revision<previous.revision||next.sequence<previous.sequence||(next.revision===previous.revision&&next.sequence===previous.sequence))throw new RangeError('delta event must advance revision or sequence');
 return Object.freeze({type:'delta',protocolVersion:PROTOCOL_VERSION,contentVersion:next.contentVersion,baseRevision:previous.revision,revision:next.revision,baseSequence:previous.sequence,sequence:next.sequence,operations:diffProjectedState(responseOf(previous),responseOf(next))});
}

export function applyGameEvent(current:GameSnapshotEvent|null,event:GameStateEvent):GameSnapshotEvent{
 if(event.type==='snapshot'){
  safeInteger(event.sequence,'sequence');assertGameResponse(event);
  return cloneJson(event);
 }
 if(event.type!=='delta'||event.protocolVersion!==PROTOCOL_VERSION)throw new TypeError('invalid game state event');
 safeInteger(event.baseRevision,'base revision');safeInteger(event.revision,'revision');safeInteger(event.baseSequence,'base sequence');safeInteger(event.sequence,'sequence');
 if(!current)throw new RangeError('delta event requires a snapshot');
 if(current.revision!==event.baseRevision)throw new RangeError('delta base revision does not match');
 if(current.sequence!==event.baseSequence)throw new RangeError('delta base sequence does not match');
 if(event.revision<event.baseRevision||event.sequence<event.baseSequence||(event.revision===event.baseRevision&&event.sequence===event.baseSequence))throw new RangeError('delta event does not advance state');
 const response=applyProjectedState(responseOf(current),event.operations);
 assertGameResponse(response);
 assertDeltaOwner(current,response);
 if(response.revision!==event.revision||response.contentVersion!==event.contentVersion)throw new RangeError('delta result metadata does not match');
 return {type:'snapshot',sequence:event.sequence,...response};
}
