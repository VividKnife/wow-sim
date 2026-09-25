import {cookies} from 'next/headers';
import pg from 'pg';
import {AccountStore} from './account-store';

export const SESSION_COOKIE = 'wow_session';
let initialized: Promise<AccountStore> | undefined;
export function accountStore(): Promise<AccountStore> {
  if (!initialized) {
    initialized = (async () => {
      if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
      const pool = new pg.Pool({connectionString: process.env.DATABASE_URL, max: 5});
      const store = new AccountStore(pool);
      try { await store.initialize(); return store; }
      catch (error) { await pool.end(); throw error; }
    })().catch(error => { initialized = undefined; throw error; });
  }
  return initialized;
}
export async function getAccountUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (await accountStore()).session(token);
}
