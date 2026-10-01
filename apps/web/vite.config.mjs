import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {rewriteAssetLiterals} from '../../packages/contracts/src/asset-paths.mjs';
import gameVersion from '../../game-version.json' with {type:'json'};
const root=fileURLToPath(new URL('./',import.meta.url));
const git=(...args)=>{try{return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{if(process.env.WEB_ASSET_MODE==='r2')throw new Error('R2 builds require a Git checkout');return 'local';}};
export default defineConfig(({command,mode})=>{
 const env={...loadEnv(mode,root,''),...process.env};
 const assetMode=command==='build'?(env.WEB_ASSET_MODE||'bundled'):'bundled';
 if(!['r2','bundled'].includes(assetMode))throw new Error('WEB_ASSET_MODE must be r2 or bundled');
 const commit=git('rev-parse','HEAD'),publicAssetVersion=git('rev-parse','HEAD:apps/web/public');
 // A build is immutable even if the same commit is built again on another host.
 const buildId=env.WEB_BUILD_ID||`${commit}-${randomUUID()}`;
 if(!/^[a-zA-Z0-9-]+$/.test(buildId))throw new Error('Invalid WEB_BUILD_ID');
 const origin=env.R2_ASSET_ORIGIN||'https://wow-sim.dota.run';
 if(new URL(origin).origin!==origin||!origin.startsWith('https://'))throw new Error('R2_ASSET_ORIGIN must be an HTTPS origin');
 const publicAssetBase=assetMode==='r2'?`${origin}/public/${publicAssetVersion}`:'';
 const base=assetMode==='r2'?`${origin}/web/${buildId}/`:'/';
 const metadata={commit,gameVersion,publicAssetVersion,assetMode,buildId,publicAssetBase,assetBase:base};
 const assets=()=>({name:'versioned-assets',enforce:'pre',transform(code,id){
  if(id.includes('node_modules')||! /\.(?:[cm]?[jt]sx?|json|css)(?:\?|$)/.test(id))return;
  return {code:rewriteAssetLiterals(code,publicAssetBase),map:null};
 },generateBundle(_options,bundle){
  const modules=Object.values(bundle).flatMap(chunk=>chunk.type==='chunk'?Object.keys(chunk.modules):[]);
  for(const id of modules)if(/game-domain\/src\/rules\/(?:engine|combat|combat-policy|runtime-content)\.js$/.test(id))throw new Error(`Server simulation leaked into browser bundle: ${id}`);
  for(const id of modules)if(/game-data\/(?:runtime\/catalog|data\/(?:world-reference|classes-reference|classic-reference|dungeon-journal))\.json$/.test(id))throw new Error(`Full catalog leaked into browser bundle: ${id}`);
 }});
 return {
  base,publicDir:command==='serve'?'public':false,
  plugins:[assets(),react(),{name:'deployment-files',transformIndexHtml(html){return rewriteAssetLiterals(html,publicAssetBase);},
   async closeBundle(){if(command!=='build')return;
    await mkdir(root+'dist/model-viewer',{recursive:true});
    const viewer=await readFile(root+'public/model-viewer/index.html','utf8');
    await writeFile(root+'dist/model-viewer/index.html',viewer.replace('./bridge.js',`${publicAssetBase}/model-viewer/bridge.js`));
    await writeFile(root+'dist/__deployment.json',JSON.stringify(metadata)+'\n');
   }}],
  define:{__PUBLIC_ASSET_BASE__:JSON.stringify(publicAssetBase),__GAME_VERSION__:JSON.stringify({...gameVersion,commit})},
  resolve:{alias:{'@':root}},
  worker:{format:'es',plugins:()=>[assets()]},
  css:{postcss:{plugins:[tailwind(),{postcssPlugin:'public-asset-urls',OnceExit(sheet){sheet.walkDecls(declaration=>{declaration.value=rewriteAssetLiterals(declaration.value,publicAssetBase);});}}]}},
  build:{manifest:true,sourcemap:false,target:'es2022',chunkSizeWarningLimit:1200},
  server:{host:'127.0.0.1',port:5173,fs:{allow:[fileURLToPath(new URL('../../',import.meta.url))]},proxy:{'/api':{target:env.GAME_SERVER_URL||'http://127.0.0.1:8788',ws:true}}},
 };
});
