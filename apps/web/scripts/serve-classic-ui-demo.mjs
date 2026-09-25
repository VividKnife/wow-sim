import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {handleModelRequest} from '../lib/wowhead-model-assets.js';
const app=fileURLToPath(new URL('../',import.meta.url));
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),{name:'classic-ui-assets',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://127.0.0.1:5198');
 if(!url.pathname.startsWith('/api/model-viewer/'))return next();
 try{const response=await handleModelRequest(new Request(url));res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));}
 catch{res.statusCode=502;res.end('Preview asset unavailable');}
 });}}],resolve:{alias:{'@':app}},optimizeDeps:{entries:['classic-ui.html']},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:5198,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}});
await server.listen();console.log('Classic UI demo: http://127.0.0.1:5198/classic-ui.html');
