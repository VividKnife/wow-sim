export type Rules = Record<string, any>;
export interface Account {
    id: string;
    primaryCharacterId: string;
    partyId: string;
    revision: number;
    createdAt: number;
}
export interface Character {
    id: string;
    accountId: string;
    kind: 'hero' | 'companion';
    rules: Rules;
    professionReadyAt: Record<string, number>;
    resourceReadyAt: Record<string, number>;
}
export interface Party {
    id: string;
    accountId: string;
    characterIds: string[];
}
export interface Item {
    id: string;
    accountId: string;
    ownerCharacterId: string;
    container: string;
    slot?: string;
    position: number;
    data: Rules;
    source: string;
    reservationId?: string;
}
export interface Wallet {
    id: string;
    characterId: string;
    accountId: string;
    balance: number;
}
export interface Activity {
    id: string;
    accountId: string;
    actorId: string;
    type: 'personal' | 'gather' | 'craft';
    status: 'running' | 'returning' | 'completed' | 'cancelled' | 'failed';
    location: string;
    startedAt: number;
    settledUntil: number;
    nextEventAt: number;
    contentVersion: string;
    rngState: number;
    engineActivity: Rules;
    command?: Rules;
    payerId?: string;
    recipientId?: string;
    reservationId?: string;
    participantIds?: string[];
    error?: string;
}
export interface Instance {
    id: string;
    creatorAccountId: string;
    leaderId: string;
    contentId: string;
    contentVersion: string;
    capacity: 5 | 10 | 20 | 40;
    status: 'forming' | 'running' | 'completed';
    roster: {
        characterId: string;
        accountId: string;
        controller: 'player' | 'companion' | 'mercenary';
    }[];
    simulation: Rules | null;
    rngState: number;
    sequence: number;
    epoch: number;
    nextEventAt: number;
    createdAt: number;
}
export interface ActorLease {
    id: string;
    actorId: string;
    accountId: string;
    kind: 'activity' | 'instance';
    ownerId: string;
}
export interface InstanceLease {
    id: string;
    instanceId: string;
    workerId: string;
    epoch: number;
    expiresAt: number;
}
export class DomainError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 409) { super(message); this.name = 'DomainError'; this.code = code; this.status = status; }
}
export function requireThat(condition: unknown, code: string, message: string, status = 409): asserts condition { if (!condition)
    throw new DomainError(code, message, status); }
