import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {handleModelRequest} from '../lib/wowhead-model-assets.js';
const app=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||5194);
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),{name:'world-scene-assets',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://127.0.0.1:5194');
 if(!url.pathname.startsWith('/api/model-viewer/'))return next();
 try{const response=await handleModelRequest(new Request(url));res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));}
 catch{res.statusCode=502;res.end('Preview asset unavailable');}
 });}}],resolve:{alias:{'@':app}},optimizeDeps:{entries:['world-scene.html','scene-backgrounds.html']},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}});
await server.listen();console.log(`World scene demo: http://127.0.0.1:${port}/world-scene.html\nBackground review: http://127.0.0.1:${port}/scene-backgrounds.html`);
