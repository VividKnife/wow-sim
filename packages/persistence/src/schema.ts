import { tables, uniqueFields } from './store.ts';
// JSON snapshots remain flexible, while ownership, due work and uniqueness are SQL-indexed.
// Generated columns cannot diverge from the validated domain row stored in data.
export const schemaSql = tables.map(table => `
CREATE TABLE IF NOT EXISTS ${table} (
 id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 300),
 data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND data->>'id' = id),
 account_id text GENERATED ALWAYS AS (data->>'accountId') STORED,
 character_id text GENERATED ALWAYS AS (data->>'characterId') STORED,
 owner_character_id text GENERATED ALWAYS AS (data->>'ownerCharacterId') STORED,
 actor_id text GENERATED ALWAYS AS (data->>'actorId') STORED,
 instance_id text GENERATED ALWAYS AS (data->>'instanceId') STORED,
 business_key text GENERATED ALWAYS AS (data->>'businessKey') STORED,
 status text GENERATED ALWAYS AS (data->>'status') STORED,
 next_event_at bigint GENERATED ALWAYS AS ((data->>'nextEventAt')::bigint) STORED
 ${table === 'wallets' ? ', CONSTRAINT wallet_balance CHECK (data ? \'balance\' AND jsonb_typeof(data->\'balance\') = \'number\' AND (data->>\'balance\')::numeric BETWEEN 0 AND 9007199254740991 AND trunc((data->>\'balance\')::numeric) = (data->>\'balance\')::numeric)' : ''}
 ${table === 'items' ? ', CONSTRAINT item_count CHECK (NOT (data ? \'count\') OR (jsonb_typeof(data->\'count\') = \'number\' AND (data->>\'count\')::numeric > 0 AND trunc((data->>\'count\')::numeric) = (data->>\'count\')::numeric))' : ''}
);
CREATE INDEX IF NOT EXISTS ${table}_account_idx ON ${table}(account_id);
CREATE INDEX IF NOT EXISTS ${table}_data_idx ON ${table} USING gin(data jsonb_path_ops);
${(uniqueFields[table] || []).map(field => `CREATE UNIQUE INDEX IF NOT EXISTS ${table}_${field}_unique ON ${table} ((data->>'${field}')) WHERE data->>'${field}' IS NOT NULL;`).join('\n')}
`).join('\n') + `
CREATE INDEX IF NOT EXISTS activities_due_idx ON activities(next_event_at,id) WHERE status IN ('running','returning','pending');
CREATE INDEX IF NOT EXISTS instances_due_idx ON instances(next_event_at,id) WHERE status IN ('running','returning');
CREATE INDEX IF NOT EXISTS items_owner_idx ON items(owner_character_id);
CREATE INDEX IF NOT EXISTS reservations_owner_idx ON reservations(owner_character_id);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox(status,id);
`;
