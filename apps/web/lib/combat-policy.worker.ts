import {initializeContent} from '../../../packages/game-domain/src/rules/runtime-content.browser.js';
const queued:MessageEvent[]=[];
self.onmessage=event=>{queued.push(event);};
initializeContent().then(()=>import('./combat-policy-runtime')).then(()=>{
 const handler=self.onmessage!;for(const event of queued.splice(0))handler.call(self,event);
}).catch((error:unknown)=>{
 const failed=(event:MessageEvent)=>{const data=event.data;if(data.type==='connect')data.port.postMessage({type:'policyError',error:String(error)});};
 self.onmessage=failed;for(const event of queued.splice(0))failed(event);
});
