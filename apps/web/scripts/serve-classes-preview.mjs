// Local verification surface; file watching is disabled so simultaneous work on
// other features cannot reload the page in the middle of an interaction.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
const app=fileURLToPath(new URL('../',import.meta.url));
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react()],resolve:{alias:{'@':app}},css:{postcss:{plugins:[tailwind()]}},server:{watch:null,hmr:false,host:'127.0.0.1',port:5179,strictPort:true,fs:{allow:[app]}}});
await server.listen();console.log('Nine-class preview: http://127.0.0.1:5179/classes.html');
