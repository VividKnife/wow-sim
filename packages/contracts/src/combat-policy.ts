/** Worker-independent actions. Identity is opaque; simulation times are finite,
 * safe-integer milliseconds. Protocol counters are monotonic within a lease. */
export type CombatIntent =
 | {kind:'cast'|'petCast';spellId:number;targetId:string}
 | {kind:'cancel';spellId:number;startedAt?:number}
 | {kind:'move';mode:'toward'|'away'|'rear';range:number;targetId:string}
 | {kind:'move';mode:'toward';range:number;destination:{position:number;positionY:number}}
 | {kind:'attack';targetId:string}
 | {kind:'stopAttack'}
 | {kind:'potion';itemId:number}
 | {kind:'racial';raceId:number};
export interface CombatPolicyRequest {
 encounterId:string;
 actorId:string;
 controller:string;
 generation:number;
 sequence:number;
 observation:number;
 expiresAt:number;
 regular:boolean;
 urgent:boolean;
}
export interface CombatPolicyInput extends CombatPolicyRequest {
 intent:CombatIntent|null;
}
export interface ReceivedCombatPolicyInput extends CombatPolicyInput {
 /** Authority receive time, never a backdated client timestamp. */
 receivedAt:number;
}
export interface CombatInputReceipt {
 actorId:string;
 at:number;
 sequence?:number;
 accepted:boolean;
 reason?:string;
 queued?:boolean;
 idle?:boolean;
}
