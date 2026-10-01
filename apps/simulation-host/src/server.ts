import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {SimulationDirectory} from './directory.ts';
import {validateServiceRequest,type SimulationServiceRequest} from '../../../packages/protocol/src/simulation-service.ts';

export function createSimulationServer(directory:SimulationDirectory,options:{token:string;maxPending?:number;maxBodyBytes?:number}){
 if(!/^[A-Za-z0-9_-]{32,128}$/.test(options.token))throw new Error('Simulation service token must contain 32–128 URL-safe characters');
 const secret=Buffer.from(`Bearer ${options.token}`),maximum=options.maxPending??64,bodyLimit=options.maxBodyBytes??16*1024*1024;
 if(!Number.isSafeInteger(maximum)||maximum<1||!Number.isSafeInteger(bodyLimit)||bodyLimit<1024||bodyLimit>64*1024*1024)throw new Error('Invalid service limits');
 let pending=0,closing=false;
 const reply=(response:ServerResponse,status:number,value:unknown)=>{
  if(response.destroyed||response.writableEnded)return;
  response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(value));
 };
 const server=createServer({requestTimeout:10_000,headersTimeout:10_000,connectionsCheckingInterval:1000},async(request,response)=>{
  const supplied=Buffer.from(request.headers.authorization??'');
  if(supplied.length!==secret.length||!timingSafeEqual(supplied,secret)){reply(response,403,{error:'Service authentication required'});return;}
  if(request.method!=='POST'||request.url!=='/rpc'){reply(response,404,{error:'Unknown simulation endpoint'});return;}
  if(closing||pending>=maximum){reply(response,503,{error:'Simulation service busy'});return;}
  if(request.headers['content-type']!=='application/json'){reply(response,415,{error:'JSON required'});return;}
  pending++;
  try{
   let message:SimulationServiceRequest;
   try{message=JSON.parse(await readBody(request,bodyLimit));validateServiceRequest(message);}
   catch(error){reply(response,400,{error:(error as Error).message});return;}
   let result:unknown;
   switch(message.operation){
    case 'deleteSave':result=await directory.deleteSave(message.userId,message.saveId);break;
    case 'openCharacter':result=await directory.openCharacter(message.accountId,message.characterId);break;
    case 'presentation':result=await directory.presentation(message.instanceId,message.accountId,message.actorId,message.scope,message.online);break;
    case 'open':result=await directory.open(message.admission);break;
    case 'input':result=await directory.input(message.accountId,message.input);break;
    case 'leaveDungeon':result=await directory.leaveDungeon(message.accountId,message.input);break;
    case 'enterDungeon':result=await directory.enterDungeon(message.accountId,message.input);break;
    case 'project':result=await directory.project(message.instanceId,message.full);break;
    case 'checkpoint':result=await directory.checkpoint(message.instanceId);break;
    case 'remove':await directory.remove(message.instanceId);result={removed:true};break;
    case 'inspect':result=directory.inspect();break;
   }
   reply(response,200,{result});
  }catch(error){const failure=error as Error&{status?:number;code?:string};
   const status=typeof failure.status==='number'&&Number.isInteger(failure.status)&&failure.status>=400&&failure.status<=599?failure.status:409;
   reply(response,status,{error:failure.message,code:failure.code});}
  finally{pending--;}
 });
 server.maxConnections=maximum*2;server.keepAliveTimeout=5000;
 return {server,async close(){
  closing=true;
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await directory.close();
 }};
}
async function readBody(request:IncomingMessage,limit:number){
 const declared=Number(request.headers['content-length']);
 if(Number.isFinite(declared)&&declared>limit)throw new Error('Simulation request too large');
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of request){size+=chunk.length;if(size>limit)throw new Error('Simulation request too large');chunks.push(chunk);}
 return Buffer.concat(chunks).toString('utf8');
}
