export const tables = ['accounts', 'account_presence', 'characters', 'companions', 'parties', 'wallets', 'items', 'reservations', 'activities', 'actor_leases', 'instances', 'instance_leases', 'combat_plans', 'contracts', 'settlements', 'ledger', 'receipts', 'outbox', 'inbox', 'reward_claims'] as const;
export type TableName = typeof tables[number];
// Domain tables validate their own payloads; the store only requires identity.
export type Row = {
    id: string;
    [key: string]: any;
};
export type Where = Record<string, string | number | boolean | null>;
export interface ReadView {
    get<T = Row>(table: TableName, id: string): Promise<T | null>;
    list<T = Row>(table: TableName, where?: Where): Promise<T[]>;
    due<T = Row>(table: 'activities' | 'instances', now: number, limit: number): Promise<T[]>;
}
export interface Transaction extends ReadView {
    insert(table: TableName, row: Row): Promise<void>;
    put(table: TableName, row: Row): Promise<void>;
    delete(table: TableName, id: string): Promise<void>;
}
export interface Store {
    read<T>(work: (view: ReadView) => Promise<T>): Promise<T>;
    transaction<T>(work: (tx: Transaction) => Promise<T>, options?: {attempts?: number}): Promise<T>;
    // Atomic, monotonic telemetry update; false means a reconnect needs domain work.
    heartbeat(accountId: string, now: number, interval: number, returnAfter: number): Promise<boolean>;
    close(): Promise<void>;
}
export function assertTable(table: string): asserts table is TableName {
    if (!tables.includes(table as TableName))
        throw new Error('Unknown persistence table');
}
export function validateRow(table: TableName, row: Row) {
    assertTable(table);
    if (!row || typeof row.id !== 'string' || !row.id || row.id.length > 300)
        throw new Error('Invalid row id');
    if (table === 'wallets' && (!Number.isSafeInteger(row.balance) || Number(row.balance) < 0))
        throw new Error('Wallet balance must be a nonnegative safe integer');
    if (table === 'items' && ('count' in row) && (!Number.isSafeInteger(row.count) || Number(row.count) < 1))
        throw new Error('Item count must be positive');
    if (table === 'instance_leases' && ('epoch' in row) && (!Number.isSafeInteger(row.epoch) || Number(row.epoch) < 1))
        throw new Error('Instance epoch must be positive');
}
export const uniqueFields: Partial<Record<TableName, string[]>> = { wallets: ['characterId'], actor_leases: ['actorId'], instance_leases: ['instanceId'], settlements: ['businessKey'], reward_claims: ['businessKey'], contracts: ['businessKey'] };
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export class DatabaseOperationError extends Error {
    readonly code: string = 'DATABASE_FAILURE';
    readonly status = 503;
    constructor(cause: unknown) { super('游戏服务暂时不可用，请稍后重试。', {cause}); this.name = 'DatabaseOperationError'; }
}
export class DatabaseBusyError extends DatabaseOperationError {
    readonly code = 'DATABASE_BUSY';
    constructor(cause: unknown) { super(cause); this.message = '游戏状态正在更新，请稍后重试。'; this.name = 'DatabaseBusyError'; }
}
