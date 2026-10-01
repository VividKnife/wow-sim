export const inputReceiptPending=receipt=>!receipt||receipt.status==='queued'||receipt.status==='applied'&&receipt.confirmation==='durable'&&!receipt.durable;
/** Wait for the server-selected applied or durable boundary. A queued acknowledgement never
 * triggers successful-action UI, and observing a snapshot never resends input. */
export function createInputReceiptTracker(){
 const pending=new Map();
 const key=(instanceId,actorId,requestId)=>JSON.stringify([instanceId,actorId,requestId]);
 const settle=(entry,receipt)=>{
  if(inputReceiptPending(receipt))return false;
  pending.delete(entry.key);
  if(receipt.status==='rejected')entry.reject(Object.assign(new Error(receipt.reason||'操作未完成'),{status:409,code:'COMMAND_REJECTED'}));
  else entry.resolve(true);
  return true;
 };
 return {
  wait(receipt,execution){
   if(!receipt||!execution)return Promise.reject(new Error('操作回执缺失，请刷新后核对当前状态。'));
   const id=key(execution.instanceId,execution.actorId,receipt.requestId),existing=pending.get(id);
   if(existing)return existing.promise;
   let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
   const entry={key:id,instanceId:execution.instanceId,actorId:execution.actorId,ownerEpoch:execution.ownerEpoch,controllerGeneration:execution.controllerGeneration,receipt,resolve,reject,promise};
   pending.set(id,entry);settle(entry,receipt);return promise;
  },
  observe(response){
   const execution=response?.execution;if(!execution)return;
   for(const entry of pending.values()){
    if(entry.actorId!==execution.actorId||execution.instanceId===entry.instanceId&&execution.ownerEpoch<entry.ownerEpoch)continue;
    const receipt=execution.receipts.find(row=>row.requestId===entry.receipt.requestId);
    if(entry.instanceId!==execution.instanceId){
     if(response.scope==='full'&&execution.controllerGeneration>entry.controllerGeneration&&receipt){
      entry.instanceId=execution.instanceId;entry.ownerEpoch=execution.ownerEpoch;entry.controllerGeneration=execution.controllerGeneration;
      settle(entry,receipt);continue;
     }
     pending.delete(entry.key);entry.reject(new Error('角色已进入新的实例，请核对指令结果。'));continue;
    }
    if(receipt){settle(entry,receipt);continue;}
    if(execution.ownerEpoch>entry.ownerEpoch){pending.delete(entry.key);entry.reject(new Error('实例已恢复，未找到这条指令的保存记录，请核对当前状态。'));continue;}
    if(execution.receipts.length===80&&execution.receipts.every(row=>row.inputSequence>entry.receipt.inputSequence)){
     pending.delete(entry.key);entry.reject(new Error('指令回执已超出保留窗口，请核对当前状态。'));
    }
   }
  },
  cancel(message='已离开当前页面；已保存的指令仍由服务器执行。'){for(const entry of pending.values())entry.reject(new Error(message));pending.clear();},
 };
}
