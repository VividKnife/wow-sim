// Isolated design fixture; no database, game accounts or production routes.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const app = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const port = Number(process.env.PREVIEW_PORT || 5188);
const server = await createServer({configFile:false, root:app + 'test/browser', publicDir:false,
  optimizeDeps:{entries:['raid-planning.html']},
  plugins:[react()], resolve:{alias:{'@':app}}, css:{postcss:{plugins:[]}},
  server:{host:'127.0.0.1', port, strictPort:true, hmr:false, fs:{allow:[repo]}}});
await server.listen();
console.log(`Raid planning sandbox: http://127.0.0.1:${port}/raid-planning.html`);
