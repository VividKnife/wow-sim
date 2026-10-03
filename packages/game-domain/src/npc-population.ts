import {readContentPhase} from './content-release.ts';
import type {Transaction} from '../../persistence/src/store.ts';
import {loadNpcResident,persistNpcResident,type NpcCharacter} from './npc-characters.ts';
import {requireThat,type Rules} from './model.ts';
import {newResident} from './rules/npc-world.js';
import {combatRole} from './rules/combat-roles.js';
import {roles} from './rules/party.js';
import {NPC_PROGRESS,redistributeNpc,progressPublicNpc,raidResetWall,simulateNpcRaid,npcRaidEligible,npcRaidFallbackEligible} from './rules/npc-progression.js';

const roleOf=(unit:Rules)=>['tank','healer'].includes(combatRole(unit))?combatRole(unit):'dps';
const key='public';
export const PUBLIC_NPC_LIMIT=768;
/** All pool mutations share the same serializable transaction as reservation.
 * Claimed/reserved actors are never read-modify-written from the cold pool. */
export async function updateNpcPopulation(tx:Transaction,now:number,demand?:{level:number;minimumLevel?:number;raidId?:string}){
 if(demand)requireThat(Number.isInteger(demand.level)&&demand.level>=10&&demand.level<=60&&(demand.minimumLevel===undefined||Number.isInteger(demand.minimumLevel)&&demand.minimumLevel>=10&&demand.minimumLevel<=demand.level),'NPC_LEVEL','公共 NPC 招募需要 10—60 级且满足副本准入等级');
 let meta=await tx.get('npc_population',key)??{id:key,cursor:0,sequence:0,wall:now,activeUntil:now};
 const phase=await readContentPhase(tx);
 const records=await tx.list<NpcCharacter>('npc_characters');
 meta.cursor=Math.max(meta.cursor,...records.map(r=>r.profile.index+1));
 const busy=new Set([...await tx.list('simulation_characters'),...await tx.list('social_members')].map(r=>r.id));
 const friendships=await tx.list('social_links');
 const friendProtected=new Set(friendships.filter(l=>l.kind==='friend'&&l.status==='accepted'&&now-(l.createdWall??0)<NPC_PROGRESS.resetCooldownMs).flatMap(l=>l.people));
 const free=records.filter(r=>!busy.has(r.id));
 const due=now-meta.wall>=60000||!!demand;
 const profiles=due?await Promise.all(free.map(r=>loadNpcResident(tx,r))):[];
 const people=await tx.list('social_people');
 const online=(await tx.list('characters')).filter(c=>c.kind==='hero'&&people.some(p=>p.id===c.id&&now-p.seenAt<45000));
 const elapsed=Math.max(0,Math.min(now,meta.activeUntil)-meta.wall);
 const changed=new Set<string>();
 if(now-meta.wall>=60000||demand){
  for(const p of profiles){
   p.unit.contentPhase=phase;
   const nearest=online.slice().sort((a,b)=>Math.abs(a.rules.level-p.unit.level)-Math.abs(b.rules.level-p.unit.level))[0];
   if(elapsed>0){progressPublicNpc(p,elapsed,now,Math.max(p.unit.level,Math.min(60,(nearest?.rules.level??p.growthLevel??p.unit.level)+3)));changed.add(p.id);}
  }
  if(elapsed>0&&raidResetWall(now)-now<=NPC_PROGRESS.raidFallbackMs){
   for(const raidId of ['molten-core','onyxias-lair']){
    const eligible=demand?.raidId===raidId?[]:profiles.filter(p=>npcRaidFallbackEligible(p,raidId,now));simulateNpcRaid(eligible,raidId,now);for(const p of eligible)changed.add(p.id);
   }
  }
  meta.wall=now;
 }
 // Advance the coverage watermark only while an actual human heartbeat is fresh.
 meta.activeUntil=Math.max(meta.activeUntil,...people.filter(p=>online.some(c=>c.id===p.id)).map(p=>p.seenAt+45000));
 if(demand){
  const minimum=Math.max(10,demand.minimumLevel??demand.level-1),maximum=Math.min(60,demand.level+3);
  const targets=demand.raidId?{tank:8,healer:16,dps:48}:{tank:2,healer:2,dps:6};
  const eligible=(p:Rules)=>p.unit.level>=minimum&&p.unit.level<=maximum&&(!demand.raidId||npcRaidEligible(p,demand.raidId,now));
  for(const [role,target] of Object.entries(targets)){
   let missing=target-profiles.filter(p=>eligible(p)&&roleOf(p.unit)===role).length;
   // Redistribute only idle leveling characters, after the cooldown; never max-level assets.
   const spare=profiles.filter(p=>p.unit.level<60&&!eligible(p)&&!friendProtected.has(p.id)&&roleOf(p.unit)===role&&now-(p.lastRedistributionWall??0)>=NPC_PROGRESS.resetCooldownMs&&(p.protectedUntilWall??0)<=now);
   while(missing>0&&spare.length&&demand.level<60){const p=spare.shift()!;redistributeNpc(p,Math.min(59,Math.max(minimum,demand.level)),now);changed.add(p.id);missing--;}
   while(missing>0&&records.length+profiles.filter(p=>!records.some(r=>r.id===p.id)).length<PUBLIC_NPC_LIMIT){
    let index=meta.cursor++,def=roles[index%roles.length],selected=def.roles[Math.floor(index/roles.length)%def.roles.length];
    while((['tank','healer'].includes(selected)?selected:'dps')!==role){index=meta.cursor++;def=roles[index%roles.length];selected=def.roles[Math.floor(index/roles.length)%def.roles.length];}
    const p:Rules=newResident({id:'realm',raceId:1,level:demand.level,clock:0,wallAt:now,location:'stormwind',contentPhase:phase},index,Math.max(minimum,demand.level));
    p.unit.contentPhase=phase;p.growthLevel=demand.level;p.lastRedistributionWall=now;profiles.push(p);changed.add(p.id);missing--;
   }
   requireThat(missing<=0,'NPC_CAPACITY','公共 NPC 候选池繁忙，请等待队伍结束活动');
  }
 }
 if(changed.size){meta.sequence++;for(const p of profiles)if(changed.has(p.id))await persistNpcResident(tx,p,`npc-pool:${meta.sequence}:${p.id}`);}
 await tx.put('npc_population',meta);
 return profiles;
}
