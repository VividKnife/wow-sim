import {fork} from 'node:child_process';
import {randomBytes} from 'node:crypto';

// One container, separate API and simulation processes. The private RPC port
// remains loopback-only; only the API port is exposed. A failed child ends the
// deployment unit so the platform restarts it from durable ownership/state.
export async function runGameRuntime({environment=process.env,signals=process,startupMs=60000,shutdownMs=15000,
 launch=(role,env)=>fork(new URL(`../apps/${role==='api'?'game-server':'simulation-host'}/src/main.ts`,import.meta.url),[],{env,stdio:['ignore','inherit','inherit','ipc']})}={}){
 const port=Number(environment.SIMULATION_PORT??8790);
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Invalid SIMULATION_PORT');
 const url=`http://127.0.0.1:${port}`;
 if(environment.SIMULATION_URL&&new URL(environment.SIMULATION_URL).origin!==url)throw new Error('Combined game runtime requires its local SIMULATION_URL; use SERVICE_ROLE=api for an external host');
 const token=environment.SIMULATION_TOKEN||randomBytes(32).toString('base64url');
 if(!/^[A-Za-z0-9_-]{32,128}$/.test(token))throw new Error('Invalid SIMULATION_TOKEN');
 const env={...environment,SIMULATION_PORT:String(port),SIMULATION_URL:url,SIMULATION_TOKEN:token};
 const children=[];let stopping=false,code=0,resolveDone;
 const done=new Promise(resolve=>resolveDone=resolve);
 const stop=async(failed=false)=>{
  if(failed)code=1;
  if(stopping)return done;stopping=true;
  // Stop incoming requests before sealing the simulation checkpoint.
  for(const row of [...children].reverse()){
   if(row.exited)continue;
   row.child.kill('SIGTERM');
   const timer=setTimeout(()=>row.child.kill('SIGKILL'),shutdownMs);
   try{await row.exit;}finally{clearTimeout(timer);}
  }
  resolveDone(code);
 };
 const onSignal=()=>{void stop();};
 signals.once('SIGTERM',onSignal);signals.once('SIGINT',onSignal);
 async function start(role){
  if(stopping)return;
  const child=launch(role,env);let resolveExit,rejectReady,resolveReady;
  const row={child,exited:false,exit:new Promise(resolve=>resolveExit=resolve)};children.push(row);
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const onReady=message=>{if(message?.type==='ready'&&message.service===role)resolveReady();};
  child.on('message',onReady);
  child.once('error',error=>{rejectReady(error);});
  child.once('close',(status,signal)=>{
   if(stopping&&(status!==0||signal))code=1;
   row.exited=true;resolveExit();rejectReady(new Error(`${role} exited before startup completed`));
   if(!stopping)void stop(true);
  });
  const timeout=setTimeout(()=>rejectReady(new Error(`${role} startup timed out`)),startupMs);
  try{await ready;}finally{clearTimeout(timeout);child.off('message',onReady);}
 }
 try{
  await start('simulation');if(!stopping)await start('api');
  return await done;
 }catch(error){if(stopping&&!code)return await done;await stop(true);throw error;}
 finally{signals.off('SIGTERM',onSignal);signals.off('SIGINT',onSignal);}
}
