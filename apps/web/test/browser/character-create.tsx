// Visual fixture only: it never connects to the save API or mutates player data.
import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../app/globals.css';

const saves=[{id:'visual-fixture',name:'霜语',classId:8,raceId:1,gender:'female',level:20,location:'goldshire',lastSeenAt:Date.now()},{id:'tauren-fixture',name:'石蹄',classId:1,raceId:6,gender:'male',level:1,location:'northshire',lastSeenAt:Date.now()}];
const originalFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=String(input);
 if(url.endsWith('/api/saves')&&!init?.method)return Response.json({saves});
 if(url.startsWith('/api/character-preview?')&&!init?.method)return originalFetch(input,init);
 if(url.startsWith('/api/game')&&!init?.method)return originalFetch(input,init);
 return Response.json({error:'独立界面测试不会写入存档'},{status:400});
};
const {default:Saves}=await import('../../app/saves');
createRoot(document.getElementById('root')!).render(<Saves/>);
