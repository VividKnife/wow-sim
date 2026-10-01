const role=process.env.SERVICE_ROLE||'game';
const modules={api:'game-server',worker:'game-worker',simulation:'simulation-host'};
try{
 if(role==='game'){
  const {runGameRuntime}=await import('./game-runtime.mjs');
  process.exitCode=await runGameRuntime();
 }else{
  if(!Object.hasOwn(modules,role))throw new Error('SERVICE_ROLE must be game, api, worker or simulation');
  const {main}=await import(`../apps/${modules[role]}/src/main.ts`);await main();
 }
}catch(error){console.error(error);process.exitCode=1;}
