// Explicit actions are never discarded by background polling.
export function createCommandQueue(execute){
 let tail=Promise.resolve(),pending=0;
 return command=>{
  if(command.type==='sync'&&pending)return Promise.resolve(false);
  pending++;
  const result=tail.then(()=>execute(command)).finally(()=>{pending--;});
  tail=result.catch(()=>{});
  return result;
 };
}
