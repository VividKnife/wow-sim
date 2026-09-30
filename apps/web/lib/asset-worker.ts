export function assetWorker(url:string):Worker {
 const absolute=new URL(url,location.href);
 if(absolute.origin===location.origin)return new Worker(absolute,{type:'module'});
 const bootstrap=URL.createObjectURL(new Blob([`import ${JSON.stringify(absolute.href)};`],{type:'text/javascript'}));
 try {
  const worker=new Worker(bootstrap,{type:'module'}),terminate=worker.terminate.bind(worker);
  worker.terminate=()=>{terminate();URL.revokeObjectURL(bootstrap);};
  return worker;
 } catch(error){URL.revokeObjectURL(bootstrap);throw error;}
}
