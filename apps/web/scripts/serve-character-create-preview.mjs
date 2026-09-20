import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {handleModelRequest} from '../lib/wowhead-model-assets.js';
import {characterPreview} from '../lib/character-preview.js';
const app=fileURLToPath(new URL('../',import.meta.url));
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),{name:'read-only-model-preview',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://127.0.0.1:5181');
 if(url.pathname==='/api/game'){const tauren=url.searchParams.get('saveId')==='tauren-fixture',preview=characterPreview(tauren?6:1,tauren?1:8,!tauren);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({contentVersion:tauren?'tauren-fixture':'human-fixture',snapshot:{player:preview,view:{location:{name:tauren?'北郡':'闪金镇'}}}}));return;}
 if(url.pathname==='/api/game/content'){const tauren=url.searchParams.get('version')==='tauren-fixture',preview=characterPreview(tauren?6:1,tauren?1:8,!tauren);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({contentVersion:tauren?'tauren-fixture':'human-fixture',items:preview.items}));return;}
 if(url.pathname.startsWith('/api/model-viewer/')){const response=await handleModelRequest(new Request(url));if(!response.ok)console.warn('Preview asset failed',response.status,url.pathname,url.search);res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));return;}
 if(url.pathname==='/api/character-preview'){try{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(characterPreview(Number(url.searchParams.get('raceId')),Number(url.searchParams.get('classId')),url.searchParams.get('level')==='20')));}catch{res.statusCode=400;res.end('{}');}return;}next();
 });}}],resolve:{alias:{'@':app}},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:5181,strictPort:true,fs:{allow:[app]}}});
await server.listen();console.log('Read-only creation preview: http://127.0.0.1:5181/character-create.html');
