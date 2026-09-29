import {initializeContent,prepareContentForState} from '../../../packages/game-domain/src/rules/runtime-content.browser.js';
const queued:MessageEvent[]=[];
let started:(state:unknown)=>void;
const firstStart=new Promise(resolve=>{started=resolve;});
self.onmessage=event=>{queued.push(event);if(event.data.type==='start')started(event.data.state);};
// Fetch class packs as soon as the state arrives, alongside the boot pack.
Promise.all([initializeContent(),firstStart.then(prepareContentForState)]).then(()=>import('./local-simulation-runtime')).then(()=>{
 const handler=self.onmessage!;
 for(const event of queued.splice(0))handler.call(self,event);
}).catch((error:unknown)=>{
 const failed=(event:MessageEvent)=>{const data=event.data;if(data.type==='start')self.postMessage({type:'error',generation:data.generation,code:(error as {code?:string})?.code||'LOCAL_CONTENT',error:error instanceof Error?error.message:'冒险资料加载失败'});};
 self.onmessage=failed;for(const event of queued.splice(0))failed(event);
});
