import {tables, type Transaction} from '../../persistence/src/store.ts';
import type {Account, Instance} from './model.ts';

// Transactional removal for explicit deletion and invalid development saves.
export async function removeInvalidSave(tx: Transaction, accountId: string) {
    const affected = (await tx.list<Instance>('instances')).filter(instance =>
        instance.creatorAccountId === accountId || instance.roster.some(row => row.accountId === accountId));
    const otherAccounts = new Set<string>();
    for (const instance of affected) {
        // A shared simulation cannot retain a deleted actor (including its leader).
        // All participants return to their last persisted character state.
        for (const lease of await tx.list('actor_leases', {kind: 'instance', ownerId: instance.id})) {
            if (lease.accountId !== accountId) otherAccounts.add(lease.accountId);
            await tx.delete('actor_leases', lease.id);
        }
        for (const member of instance.roster)
            if (member.accountId !== accountId) otherAccounts.add(member.accountId);
        for (const contract of await tx.list('contracts', {instanceId: instance.id})) {
            contract.status = 'ended';
            await tx.put('contracts', contract);
        }
        await tx.delete('instance_leases', instance.id);
        await tx.delete('combat_plans', instance.id);
        await tx.delete('instances', instance.id);
    }
    for (const id of otherAccounts) {
        const row = await tx.get<Account>('accounts', id);
        if (row) await tx.put('accounts', {...row, revision: row.revision + 1});
    }
    for (const event of await tx.list('outbox', {accountId}))
        for (const delivery of await tx.list('inbox', {eventId: event.id}))
            await tx.delete('inbox', delivery.id);
    for (const table of tables) {
        if (table === 'accounts' || table === 'instances' || table === 'instance_leases') continue;
        for (const row of await tx.list(table, {accountId})) await tx.delete(table, row.id);
    }
    await tx.delete('accounts', accountId);
}
