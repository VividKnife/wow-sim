// Production Game UI + production HTTP/WS server; isolated in-memory simulation.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {createGameServer} from '../../game-server/src/server.ts';
import {makeItem} from '../../../packages/game-domain/src/rules/character.js';
import {ResidentInstance} from '../../simulation-host/src/instance.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';
const app=fileURLToPath(new URL('../',import.meta.url)),origin='http://127.0.0.1:5221',token=crypto.randomUUID();
const state=localScenarios()[process.env.PREVIEW_SCENE==='raid'?'raid':'dungeon'];state.settings.autoLoot=true;state.combat.command={paused:true,marks:{},orders:[],focusId:null,holdFire:false};
if(process.env.PREVIEW_SCENE==='recovery'){state.combat=null;state.activity={type:'hunt',target:299};state.nextPull=state.clock+300000;state.bag.push(makeItem(state,2570));}
const runtime=new ResidentInstance({instanceId:'live-preview',ownerEpoch:1,state,controllers:[{actorId:state.id,accountId:'preview',generation:1,canPause:true}]});
const accounts={session:async value=>value===token?{id:'preview',username:'preview'}:null,logout:async()=>{},login:async()=>{throw Error('Fixture only');},register:async()=>{throw Error('Fixture only');}};
let started=performance.now(),wall=runtime.wallAt;
const tick=setInterval(()=>{try{runtime.advance(wall+Math.floor(performance.now()-started),100);}catch(error){console.error(error);clearInterval(tick);}},25);
const snapshot=async(_account,_actor,_online,scope='full')=>({response:runtime.presentation('preview',state.id,scope),state:null,revision:0,account:null,roster:[],activities:[],instanceId:'live-preview'});
const service={snapshot,socialSnapshot:async()=>({self:{id:state.id,name:state.name,roles:['dps']},incoming:[],outgoing:[],proposal:null,group:null,messages:{world:[],party:[]},friends:[],players:[],npcs:[],dungeons:[]}),socialCommand:async()=>{throw Error('Fixture social commands disabled');},createAccount:async()=>{throw Error('Fixture only');},work:async()=>({}),gmInbox:async()=>[],command:async(_account,body)=>{
 const {execution,requestId,characterId,...action}=body;
 const receipt=runtime.input('preview',{instanceId:'live-preview',actorId:state.id,controllerGeneration:execution.controllerGeneration,clientSequence:execution.clientSequence,requestId,command:{kind:'action',action}});
 if(receipt.status==='rejected')throw Error(receipt.reason);const checkpoint=runtime.checkpoint();runtime.confirmCheckpoint(checkpoint.inputSequence,checkpoint.appliedInputSequence);
 const result=await snapshot();result.response={...result.response,commandReceipt:{...receipt,confirmation:'durable',durable:true}};return result;
}};
const api=createGameServer({service,accounts,appOrigin:origin});await new Promise(resolve=>api.server.listen(5222,'127.0.0.1',resolve));
const web=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react()],resolve:{alias:{'@':app}},optimizeDeps:{entries:['live-combat.html']},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:5221,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]},proxy:{'/api':{target:'http://127.0.0.1:5222',ws:true,headers:{cookie:'wow_session='+token}}}}});
await web.listen();console.log(origin+'/live-combat.html');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{clearInterval(tick);await web.close();await api.close();process.exit(0);});
