// Isolated local fixture: server-side computation, real HTTP recording fetch,
// and the production React playback component. No database or saved accounts.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {createGame,act,stats,view} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {abilities} from '../../../packages/game-domain/src/rules/catalog.js';
import {simulateCombatRecording,playbackManifest} from '../../../packages/game-domain/src/combat-playback.ts';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
const app=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.env.PREVIEW_PORT||5176);
let fixture;
function reset(){
 let state=createGame('回放测试法师',283,0);state.level=20;
 state.learned=abilities.filter(a=>a.requiredLevel<=20).map(a=>a.spellId);state.hp=stats(state).maxHp;state.mana=stats(state).maxMana;
 for(const id of ['warrior','priest','rogue','mage'])state=act(state,{type:'recruit',id},0);
 startCombat(state,[636,636,1729],true);
 const result=simulateCombatRecording(state,{id:crypto.randomUUID(),contentVersion:'fixture'});
 fixture={recording:result.recording,finalState:result.finalState,startedAt:Date.now(),snapshot:projectClientSnapshot(state,view(state)),requests:0};
}
function settle(){
 if(!fixture.recording||Date.now()-fixture.startedAt<fixture.recording.endsAt)return;
 const state=fixture.finalState;
 fixture.snapshot=projectClientSnapshot(state,view(state));
 if(state.combat){const result=simulateCombatRecording(state,{id:crypto.randomUUID(),contentVersion:'fixture'});fixture.recording=result.recording;fixture.finalState=result.finalState;}
 else fixture.recording=null;
}
const api={name:'playback-fixture',configureServer(server){server.middlewares.use((req,res,next)=>{
 if(!req.url?.startsWith('/api/'))return next();
 res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
 if(req.url.startsWith('/api/fixture')){
  if(!fixture||req.method==='POST')reset();
  settle();res.end(JSON.stringify({snapshot:fixture.snapshot,playback:fixture.recording?playbackManifest(fixture.recording):null,requests:fixture.requests}));return;
 }
 if(req.url.startsWith('/api/game/replay')&&fixture){fixture.requests++;res.end(JSON.stringify({...fixture.recording,serverNow:Date.now()-fixture.startedAt}));return;}
 res.statusCode=404;res.end('{}');
});}};
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),api],resolve:{alias:{'@':app}},css:{postcss:{plugins:[tailwind()]}},server:{hmr:false,host:'127.0.0.1',port,strictPort:true,fs:{allow:[app]}}});
await server.listen();console.log(`Playback fixture: http://127.0.0.1:${port}/combat-playback.html`);
