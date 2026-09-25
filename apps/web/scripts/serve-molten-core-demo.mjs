// Local single-player demo server. Does not connect to production accounts or DB.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createMoltenCoreDemo,startMoltenCoreBoss,advanceMoltenCore,configureMoltenCore,retreatMoltenCore,moltenCoreView,moltenCoreBosses,guildSquadNames} from '../../../packages/game-domain/src/molten-core-demo.ts';
const app=fileURLToPath(new URL('../',import.meta.url)),repo=fileURLToPath(new URL('../../../',import.meta.url));
const port=Number(process.env.PREVIEW_PORT||5189),directory=repo+'.cache/molten-core-demo',savePath=directory+'/run.json';
await mkdir(directory,{recursive:true});
let run;
try{const saved=JSON.parse(await readFile(savePath,'utf8'));if(saved.version===2&&saved.state&&Array.isArray(saved.cleared))run=saved;}catch(error){if(error.code!=='ENOENT')console.warn('Demo checkpoint could not be loaded; starting a fresh demo.');}
run??=createMoltenCoreDemo();
let paused=true,speed=1,lastAt=performance.now(),queue=Promise.resolve();
async function save(){const temporary=savePath+'.tmp';await writeFile(temporary,JSON.stringify(run));await rename(temporary,savePath);}
function settle(){
 const now=performance.now();if(now-lastAt>5000)paused=true;
 const elapsed=Math.min(2000,Math.max(0,Math.floor((now-lastAt)*speed/100)*100));
 if(!paused&&run.status==='combat'&&elapsed>0)run=advanceMoltenCore(run,elapsed);
 // Computation does not recursively create more work when the demo is accelerated.
 lastAt=performance.now();if(run.status!=='combat')paused=true;
}
function snapshot(){return {...moltenCoreView(run),paused,speed,bosses:moltenCoreBosses,squadNames:guildSquadNames};}
async function body(req){let value='';for await(const chunk of req){value+=chunk;if(value.length>4096)throw new Error('请求过大。');}return JSON.parse(value||'{}');}
const api={name:'molten-core-demo',configureServer(server){server.middlewares.use((req,res,next)=>{
 if(req.url!=='/api/molten-core-demo')return next();
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 queue=queue.then(async()=>{
  if(!['GET','POST'].includes(req.method)){res.statusCode=405;res.end(JSON.stringify({error:'不支持的请求方法。'}));return;}
  if(req.method==='POST'&&(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`||!req.headers['content-type']?.startsWith('application/json'))){res.statusCode=403;res.end(JSON.stringify({error:'仅接受同源JSON操作。'}));return;}
  settle();
  if(req.method==='POST'){
   const command=await body(req);
   switch(command.type){
    case 'start':run=startMoltenCoreBoss(run,command.bossId);paused=false;break;
    case 'tactics':run=configureMoltenCore(run,command.patch);break;
    case 'pause':paused=true;break;
    case 'resume':if(run.status!=='combat')throw new Error('当前没有进行中的战斗。');paused=false;break;
    case 'speed':if(![1,2].includes(command.speed))throw new Error('无效的演示速度。');speed=command.speed;break;
    case 'retreat':run=retreatMoltenCore(run);paused=true;break;
    case 'reset':run=createMoltenCoreDemo();paused=true;break;
    default:throw new Error('未知操作。');
   }
  }
  await save();res.end(JSON.stringify(snapshot()));
 }).catch(error=>{res.statusCode=400;res.end(JSON.stringify({error:error.message}));});
});}};
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),api],
 resolve:{alias:{'@':app}},optimizeDeps:{entries:['molten-core-demo.html']},css:{postcss:{plugins:[tailwind()]}},
 server:{host:'127.0.0.1',port,strictPort:true,hmr:false,fs:{allow:[repo]}}});
await server.listen();console.log(`Molten Core 25-player demo: http://127.0.0.1:${port}/molten-core-demo.html`);
console.log(`Local checkpoint: ${savePath}. Restart resumes paused; no offline progression.`);
