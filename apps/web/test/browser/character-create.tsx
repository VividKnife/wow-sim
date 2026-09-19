// Visual fixture only: it never connects to the save API or mutates player data.
import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../app/globals.css';

const saves=[{id:'visual-fixture',name:'霜语',classId:8,raceId:1,level:20,location:'goldshire',lastSeenAt:Date.now()}];
globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=String(input);
 if(url.endsWith('/api/saves')&&!init?.method)return Response.json({saves});
 return Response.json({error:'独立界面测试不会写入存档'},{status:400});
};
const {default:Saves}=await import('../../app/saves');
createRoot(document.getElementById('root')!).render(<Saves/>);
