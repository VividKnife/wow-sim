import type {Rules} from './model.ts';
export type Role='tank'|'healer'|'dps';
export type Person={id:string;name:string;level:number;classId:number;npc:boolean;role:Role|null};
export type DungeonEntry={id:string;dungeonId:string;rosterKey:string;requested:string[];parked?:{clock:number;dungeon:Rules}};
export type Group={id:string;leaderId:string;members:Person[];status:'forming'|'queued'|'proposal'|'matched';proposalId?:string;recruitmentId?:string;dungeonId:string|null;queuedAt:number;updatedAt:number;entry?:DungeonEntry;instanceId?:string};
export const limits={tank:1,healer:1,dps:3};
export const supportedRoles=(classId:number):Role[]=>[...([1,2,11].includes(classId)?['tank' as const]:[]),...([2,5,7,11].includes(classId)?['healer' as const]:[]),'dps'];
export const fits=(members:Person[])=>members.length<=5&&Object.entries(limits).every(([role,max])=>members.filter(m=>m.role===role).length<=max);
export const entryRosterKey=(group:Group)=>JSON.stringify([group.leaderId,group.dungeonId,
  [...group.members].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(m=>[m.id,m.npc,m.role])]);
export const currentEntry=(group:Group)=>!!group.entry&&
  group.status==='matched'&&group.entry.dungeonId===group.dungeonId&&group.entry.rosterKey===entryRosterKey(group);
