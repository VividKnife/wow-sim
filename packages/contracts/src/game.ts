export const PROTOCOL_VERSION = 1 as const;

export type JsonRecord = Record<string, unknown>;
export type ClientAccount = Readonly<{id:string;primaryCharacterId:string;partyId:string;revision:number}>;
export type ClientRosterMember = Readonly<{id:string;characterId:string;name:string;classId:number;raceId:number;level:number;kind:string;talentSummary:string;professions:JsonRecord;bagUsed:number;bagCapacity:number;location:string}>;
export type ClientActivity = Readonly<{id:string;actorId:string;type:string;status:string;location?:string;startedAt?:number;settledUntil?:number;nextEventAt?:number;contentVersion?:string;error?:string}>;
export type ClientInstanceMember = Readonly<{characterId:string;accountId:string;controller:string}>;
export type ClientInstance = Readonly<{id:string;leaderId:string;contentId:string;status:string;capacity:number;roster:readonly ClientInstanceMember[];sequence:number}>;
export type ClientSnapshot = Readonly<{
  player: JsonRecord;
  view: JsonRecord;
}>;

export type GameResponse = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  contentVersion: string;
  revision: number;
  scope: 'full' | 'combat';
  snapshot: ClientSnapshot | null;
  replayed?: boolean;
  combatMode?: 'recorded' | 'realtime' | 'local' | null;
  localSimulation?: Readonly<{ownerId:string;sessionId:string|null}> | null;
  playback?: Readonly<{id:string;encounterId:string;startsAt:number;endsAt:number;startClock:number;endClock:number}> | null;
  account?: ClientAccount | null;
  roster?: readonly ClientRosterMember[];
  activities?: readonly ClientActivity[];
  instanceId?: string | null;
  instance?: ClientInstance | null;
}>;

export function isGameResponse(value: unknown): value is GameResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  if (response.protocolVersion !== PROTOCOL_VERSION || typeof response.contentVersion !== 'string' || !response.contentVersion) return false;
  if (response.scope !== 'full' && response.scope !== 'combat') return false;
  if (!Number.isSafeInteger(response.revision) || (response.revision as number) < 0 || !Object.hasOwn(response, 'snapshot')) return false;
  if (response.snapshot === null) return true;
  if (!response.snapshot || typeof response.snapshot !== 'object' || Array.isArray(response.snapshot)) return false;
  const snapshot = response.snapshot as Record<string, unknown>;
  return !!snapshot.player && typeof snapshot.player === 'object' && !Array.isArray(snapshot.player)
    && !!snapshot.view && typeof snapshot.view === 'object' && !Array.isArray(snapshot.view);
}

export function assertGameResponse(value: unknown): asserts value is GameResponse {
  if (!isGameResponse(value)) throw new TypeError('Invalid game response');
}
