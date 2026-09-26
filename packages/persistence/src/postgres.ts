import { assertTable, validateRow, DatabaseBusyError, DatabaseOperationError } from './store.ts';
import type { Row, Store, Transaction, ReadView, TableName, Where } from './store.ts';
import { schemaSql } from './schema.ts';
import { setTimeout as delay } from 'node:timers/promises';
type QueryResult = {
    rows: any[];
};
export interface SqlClient {
    query(sql: string, values?: any[]): Promise<QueryResult>;
    release(): void;
}
export interface SqlPool {
    connect(): Promise<SqlClient>;
    end(): Promise<void>;
}
export class PostgresStore implements Store {
    private pool: SqlPool;
    constructor(pool: SqlPool) { this.pool = pool; }
    private async connect(): Promise<SqlClient> {
        try {
            const client = await this.pool.connect();
            return {
                query: async (sql, values) => {
                    try { return await client.query(sql, values); }
                    catch (error) { throw new DatabaseOperationError(error); }
                },
                release: () => client.release(),
            };
        } catch (error) { throw new DatabaseOperationError(error); }
    }
    async initialize() {
        const client = await this.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock($1)', [1464817485]);
            await client.query(schemaSql);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK').catch(() => { });
            throw error;
        }
        finally {
            client.release();
        }
    }
    async read<T>(work: (view: ReadView) => Promise<T>): Promise<T> {
        return this.run(work, true, 1);
    }
    async transaction<T>(work: (tx: Transaction) => Promise<T>, options: {attempts?: number} = {}): Promise<T> {
        const attempts = options.attempts ?? 9;
        if (!Number.isInteger(attempts) || attempts < 1) throw new Error('Invalid transaction attempts');
        return this.run(work, false, attempts);
    }
    async heartbeat(accountId: string, now: number, interval: number, returnAfter: number): Promise<boolean> {
        const client = await this.connect();
        try {
            // One READ COMMITTED statement, no upsert: deletion cannot resurrect presence.
            const result = await client.query(`UPDATE account_presence
                SET data=jsonb_set(data,'{lastSeenAt}',to_jsonb($2::bigint))
                WHERE id=$1 AND (data->>'lastSeenAt')::bigint >= 0
                  AND (data->>'lastSeenAt')::bigint <= $2::bigint-$3::numeric
                  AND (data->>'lastSeenAt')::bigint > $2::bigint-$4::numeric RETURNING id`, [accountId, now, interval, returnAfter]);
            if (result.rows.length) return true;
            const row = (await client.query('SELECT data FROM account_presence WHERE id=$1', [accountId])).rows[0]?.data;
            return Number.isSafeInteger(row?.lastSeenAt) && row.lastSeenAt >= 0 && now - row.lastSeenAt < returnAfter;
        } finally { client.release(); }
    }
    private async run<T>(work: (tx: Transaction) => Promise<T>, readOnly: boolean, attempts: number): Promise<T> {
        for (let attempt = 0;; attempt++) {
            const client = await this.connect();
            let active = true;
            const query = async (sql: string, values: any[] = []) => { if (!active)
                throw new Error('Transaction is closed'); return client.query(sql, values); };
            const tableName = (table: TableName) => { assertTable(table); return table; };
            const write = async (table: TableName, row: Row, upsert: boolean) => {
                if (readOnly) throw new Error('Read-only view');
                validateRow(table, row);
                await query(`INSERT INTO ${tableName(table)}(id,data) VALUES($1,$2::jsonb)${upsert ? ' ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data' : ''}`, [row.id, JSON.stringify(row)]);
            };
            const tx: Transaction = {
                get: async <T = Row>(table: TableName, id: string) => (await query(`SELECT data FROM ${tableName(table)} WHERE id=$1`, [id])).rows[0]?.data as T ?? null,
                list: async <T = Row>(table: TableName, where: Where = {}) => (await query(`SELECT data FROM ${tableName(table)} WHERE data @> $1::jsonb ORDER BY id`, [JSON.stringify(where)])).rows.map(row => row.data as T),
                due: async <T = Row>(table: 'activities' | 'instances', now: number, limit: number, contentVersion: string) => (await query(`SELECT data FROM ${tableName(table)} WHERE status IN ('running','returning') AND next_event_at<=$1 AND data @> $3::jsonb ORDER BY next_event_at,id LIMIT $2`, [now, limit, JSON.stringify({contentVersion})])).rows.map(row => row.data as T),
                insert: (table, row) => write(table, row, false), put: (table, row) => write(table, row, true),
                delete: async (table, id) => { if (readOnly) throw new Error('Read-only view'); await query(`DELETE FROM ${tableName(table)} WHERE id=$1`, [id]); },
            };
            try {
                await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN ISOLATION LEVEL SERIALIZABLE');
                const result = await work(tx);
                await client.query('COMMIT');
                return result;
            }
            catch (error) {
                await client.query('ROLLBACK').catch(() => { });
                const cause = error instanceof DatabaseOperationError ? error.cause : error;
                const code = (cause as {code?: string} | null)?.code;
                // Concurrent create/upsert can surface as a uniqueness violation instead of 40001.
                // Retrying the entire business transaction lets its receipt/lease checks decide.
                if (!['40001', '40P01', '23505'].includes(code || '')) throw error;
                if (attempt >= attempts - 1) {
                    if (code === '23505') throw error;
                    throw new DatabaseBusyError(cause);
                }
            }
            finally {
                active = false;
                client.release();
            }
            // Let competing transactions finish before taking a fresh snapshot.
            // Release the connection first so backoff never exhausts the pool.
            const backoff = Math.min(250, 20 * 2 ** attempt);
            await delay(backoff + Math.floor(Math.random() * backoff));
        }
    }
    async close() { await this.pool.end(); }
}
