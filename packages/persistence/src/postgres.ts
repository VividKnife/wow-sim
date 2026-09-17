import { assertTable, validateRow } from './store.ts';
import type { Row, Store, Transaction, TableName, Where } from './store.ts';
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
    async initialize() {
        const client = await this.pool.connect();
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
    async transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
        for (let attempt = 0;; attempt++) {
            const client = await this.pool.connect();
            let active = true;
            const query = async (sql: string, values: any[] = []) => { if (!active)
                throw new Error('Transaction is closed'); return client.query(sql, values); };
            const tableName = (table: TableName) => { assertTable(table); return table; };
            const write = async (table: TableName, row: Row, upsert: boolean) => {
                validateRow(table, row);
                await query(`INSERT INTO ${tableName(table)}(id,data) VALUES($1,$2::jsonb)${upsert ? ' ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data' : ''}`, [row.id, JSON.stringify(row)]);
            };
            const tx: Transaction = {
                get: async <T = Row>(table: TableName, id: string) => (await query(`SELECT data FROM ${tableName(table)} WHERE id=$1`, [id])).rows[0]?.data as T ?? null,
                list: async <T = Row>(table: TableName, where: Where = {}) => (await query(`SELECT data FROM ${tableName(table)} WHERE data @> $1::jsonb ORDER BY id`, [JSON.stringify(where)])).rows.map(row => row.data as T),
                due: async <T = Row>(table: 'activities' | 'instances', now: number, limit: number) => (await query(`SELECT data FROM ${tableName(table)} WHERE status IN ('running','returning') AND next_event_at<=$1 ORDER BY next_event_at,id LIMIT $2`, [now, limit])).rows.map(row => row.data as T),
                insert: (table, row) => write(table, row, false), put: (table, row) => write(table, row, true),
                delete: async (table, id) => { await query(`DELETE FROM ${tableName(table)} WHERE id=$1`, [id]); },
            };
            try {
                await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
                const result = await work(tx);
                await client.query('COMMIT');
                return result;
            }
            catch (error) {
                await client.query('ROLLBACK').catch(() => { });
                const code = (error as {
                    code?: string;
                }).code;
                // Concurrent create/upsert can surface as a uniqueness violation instead of 40001.
                // Retrying the entire business transaction lets its receipt/lease checks decide.
                if (attempt >= 8 || !['40001', '40P01', '23505'].includes(code || ''))
                    throw error;
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
