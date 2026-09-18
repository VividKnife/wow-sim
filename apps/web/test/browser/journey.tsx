// Isolated manual preview: all commands stay in memory, never touch player saves.
import React from 'react';
import {createRoot} from 'react-dom/client';
import Game from '../../app/game';
import {createGame,act,advance,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import '../../app/globals.css';
import '../../app/journey.css';

let state:any=createGame('星落',42,0);
state.id='journey-preview';state.location='sentinel';state.level=20;state.money=124800;state.xp=8420;
state.hp=view(state).stats.maxHp;state.mana=view(state).stats.maxMana;
let revision=0;
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=String(input);
 if(url.startsWith('/api/game/content'))return Response.json(clientContent());
 if(!url.startsWith('/api/game'))return originalFetch(input,init);
 try{
  if(init?.method==='POST'){state=act(state,JSON.parse(String(init.body)),state.wallAt);state=advance(state,state.wallAt+1000).state;revision++;}
  return Response.json({protocolVersion:1,scope:'full',revision,contentVersion:clientContent().contentVersion,snapshot:projectClientSnapshot(state,view(state)),roster:[],activities:[],instance:null});
 }catch(error){return Response.json({error:String(error)},{status:400});}
};
createRoot(document.getElementById('root')!).render(<Game/>);
