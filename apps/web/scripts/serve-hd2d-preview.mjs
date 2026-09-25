import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
const app=fileURLToPath(new URL('../',import.meta.url));
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react()],resolve:{alias:{'@':app}},optimizeDeps:{entries:['hd2d.html']},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:5178,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}});
await server.listen();console.log('HD-2D preview: http://127.0.0.1:5178/hd2d.html');
