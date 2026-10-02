import type {Rules} from './model.ts';
export type GuestNpc={profile:Rules};
export type NpcArrival={clock:number;wallAt:number;nextTick:number;guests:GuestNpc[];simulationEvents:Rules};
/** Runtime copies exist only while exclusively claimed by an activity. */
export function residentNpcProfiles(state:Rules):{profile:Rules}[]{
 return [...[state,...state.party].filter(a=>!a.npcPlayer).flatMap(a=>(a.npcWorld?.residents??[]).map((profile:Rules)=>({profile}))),...(state.npcGuests??[])];
}
