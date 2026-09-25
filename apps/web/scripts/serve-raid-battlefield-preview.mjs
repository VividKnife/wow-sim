// In-memory production battle renderer; no account or save writes.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
const app=fileURLToPath(new URL('../',import.meta.url)),repo=fileURLToPath(new URL('../../../',import.meta.url));
const server=await createServer({configFile:false,cacheDir:app+'node_modules/.vite-raid-battlefield',root:app+'test/browser',publicDir:app+'public',plugins:[react()],resolve:{alias:{'@':app}},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:Number(process.env.PREVIEW_PORT||5207),strictPort:true,hmr:false,fs:{allow:[repo]}}});
await server.listen();console.log('Raid battlefield preview: http://127.0.0.1:5207/battle-3d.html');
