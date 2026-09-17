import test from 'node:test';
import assert from 'node:assert/strict';
import {PostgresStore} from '../src/postgres.ts';
import type {SqlPool} from '../src/postgres.ts';
import type {Transaction} from '../src/store.ts';

for (const code of ['40001', '40P01', '23505']) {
    test(`retries ${code} after releasing the connection and allowing a competitor to finish`, async () => {
        let competitorActive = true, connections = 0, releases = 0, rollbacks = 0;
        let firstHandle: Transaction | undefined;
        const pool: SqlPool = {
            async connect() {
                connections++;
                return {
                    async query(sql) {
                        if (sql === 'COMMIT' && competitorActive) throw Object.assign(new Error('conflict'), {code});
                        if (sql === 'ROLLBACK') rollbacks++;
                        return {rows: []};
                    },
                    release() {
                        releases++;
                        if (releases === 1) setTimeout(() => { competitorActive = false; }, 5);
                    },
                };
            },
            async end() {},
        };
        const store = new PostgresStore(pool);
        let calls = 0;
        const result = await store.transaction(async tx => {
            calls++;
            firstHandle ??= tx;
            if (calls > 1) await assert.rejects(firstHandle.list('accounts'), /closed/);
            return calls;
        });
        assert.equal(result, 2);
        assert.equal(connections, 2);
        assert.equal(releases, 2);
        assert.equal(rollbacks, 1);
    });
}

test('non-retryable failures roll back and propagate without replaying business work', async () => {
    const failure = Object.assign(new Error('invalid data'), {code: '23514'});
    let calls = 0, released = false;
    const statements: string[] = [];
    const store = new PostgresStore({
        async connect() { return {
            async query(sql) { statements.push(sql); return {rows: []}; },
            release() { released = true; },
        }; },
        async end() {},
    });
    await assert.rejects(store.transaction(async () => { calls++; throw failure; }), error => error === failure);
    assert.equal(calls, 1);
    assert.equal(released, true);
    assert.deepEqual(statements, ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'ROLLBACK']);
});
