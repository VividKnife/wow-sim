import { tables, assertTable, validateRow, uniqueFields, copy } from './store.ts';
import type { Row, Store, Transaction, ReadView, TableName, Where } from './store.ts';
// Test implementation: a detached working set commits only after the callback succeeds.
// Production uses PostgreSQL. Keeping this serialized makes transaction tests deterministic.
export class MemoryStore implements Store {
    private rows: Map<TableName, Map<string, Row>>;
    private tail: Promise<void> = Promise.resolve();
    private closed = false;
    constructor(initial: Partial<Record<TableName, Row[]>> = {}) {
        this.rows = new Map(tables.map(table => [table, new Map((initial[table] || []).map(row => [row.id, copy(row)]))]));
    }
    async read<T>(work: (view: ReadView) => Promise<T>): Promise<T> {
        if (this.closed) throw new Error('Store is closed');
        // Writers replace the map atomically; readers retain a stable committed map.
        const rows = this.rows;
        let active = true;
        const getRows = (table: TableName) => { if (!active) throw new Error('Transaction is closed'); assertTable(table); return rows.get(table)!; };
        const view: ReadView = {
            get: async <T = Row>(table: TableName, id: string) => copy(getRows(table).get(id) ?? null) as T | null,
            list: async <T = Row>(table: TableName, where: Where = {}) => copy([...getRows(table).values()].filter(row => Object.entries(where).every(([key, value]) => row[key] === value)).sort((a,b) => a.id.localeCompare(b.id))) as T[],
            due: async <T = Row>(table: 'activities' | 'instances', now: number, limit: number, contentVersion: string) => copy([...getRows(table).values()].filter(row => row.contentVersion === contentVersion && ['running','returning'].includes(row.status) && row.nextEventAt <= now).sort((a,b) => a.nextEventAt-b.nextEventAt || a.id.localeCompare(b.id)).slice(0,limit)) as T[],
        };
        try { return await work(view); } finally { active = false; }
    }
    async heartbeat(accountId: string, now: number, interval: number, returnAfter: number): Promise<boolean> {
        return this.transaction(async tx => {
            const row = await tx.get('account_presence', accountId);
            if (!Number.isSafeInteger(row?.lastSeenAt) || row!.lastSeenAt < 0 || now-row!.lastSeenAt >= returnAfter) return false;
            if (now-row!.lastSeenAt >= interval) await tx.put('account_presence', {...row!, lastSeenAt:now});
            return true;
        });
    }
    async transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
        if (this.closed)
            throw new Error('Store is closed');
        const previous = this.tail;
        let release!: () => void;
        this.tail = new Promise(resolve => { release = resolve; });
        await previous;
        const working = new Map([...this.rows].map(([table, rows]) => [table, new Map([...rows].map(([id, row]) => [id, copy(row)]))]));
        let active = true;
        const tableRows = (table: TableName) => { if (!active)
            throw new Error('Transaction is closed'); assertTable(table); return working.get(table)!; };
        const write = async (table: TableName, row: Row, insert: boolean) => {
            const rows = tableRows(table);
            validateRow(table, row);
            if (insert && rows.has(row.id))
                throw new Error(`Unique id violation: ${table}`);
            for (const field of uniqueFields[table] || [])
                if (row[field] != null && [...rows.values()].some(other => other.id !== row.id && other[field] === row[field]))
                    throw new Error(`Unique ${field} violation: ${table}`);
            rows.set(row.id, copy(row));
        };
        const tx: Transaction = {
            get: async <T = Row>(table: TableName, id: string) => { const row = tableRows(table).get(id); return row ? copy(row) as T : null; },
            list: async <T = Row>(table: TableName, where: Where = {}) => [...tableRows(table).values()].filter(row => Object.entries(where).every(([key, value]) => row[key] === value)).map(row => copy(row) as T),
            due: async <T = Row>(table: 'activities' | 'instances', now: number, limit: number, contentVersion: string) => [...tableRows(table).values()].filter(row => row.contentVersion === contentVersion && ['running', 'returning'].includes(row.status) && row.nextEventAt <= now).sort((a, b) => a.nextEventAt - b.nextEventAt || a.id.localeCompare(b.id)).slice(0, limit).map(row => copy(row) as T),
            insert: (table, row) => write(table, row, true), put: (table, row) => write(table, row, false),
            delete: async (table, id) => { tableRows(table).delete(id); },
        };
        try {
            const result = await work(tx);
            this.rows = working;
            return result === undefined ? result : copy(result);
        }
        finally {
            active = false;
            release();
        }
    }
    async close() { this.closed = true; await this.tail; }
}
