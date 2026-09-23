// Test-only preview server, bound to localhost. Not included in production routes.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {handleModelRequest} from '../lib/wowhead-model-assets.js';
const app=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PREVIEW_PORT||5174);
const modelAssets={name:'model-assets',configureServer(server){server.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/api/model-viewer/'))return next();try{const response=await handleModelRequest(new Request('http://127.0.0.1:'+port+req.url,{method:req.method}));res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.statusCode=502;res.end('Model service unavailable');}});}};
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),modelAssets],json:{stringify:true,namedExports:false},resolve:{alias:{'@':app}},css:{postcss:{plugins:[tailwind()]}},server:{hmr:false,forwardConsole:false,watch:null,host:'127.0.0.1',port,strictPort:true,fs:{allow:[app]}}});
await server.listen();console.log(`Isolated UI fixtures: http://127.0.0.1:${port}/character.html and /dungeon.html`);
