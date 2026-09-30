import {createHash, randomBytes, randomUUID, scrypt, timingSafeEqual} from 'node:crypto';

type Sql = {query(text: string, values?: any[]): Promise<{rows: any[]}>};
export type AccountUser = {id: string; username: string};
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
const fail = (message: string, status: number) => Object.assign(new Error(message), {status});
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function usernameOf(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{3,32}$/.test(value)) {
    throw fail('用户名需要 3–32 个字母、数字、下划线或短横线。', 400);
  }
  return value.toLowerCase();
}
function passwordOf(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw fail('密码需要 12–128 个字符。', 400);
  }
  return value;
}
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64,
    {N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024},
    (error, key) => error ? reject(error) : resolve(key)));
}

export class AccountStore {
  private sql: Sql;
  private now: () => number;
  constructor(sql: Sql, now = Date.now) { this.sql = sql; this.now = now; }

  async initialize() {
    // One query keeps the transaction and advisory lock on one pool connection.
    await this.sql.query(`BEGIN;
      SELECT pg_advisory_xact_lock(1464817486);
      CREATE TABLE IF NOT EXISTS web_users (
        id text PRIMARY KEY, username text NOT NULL UNIQUE,
        password_hash text NOT NULL, created_at bigint NOT NULL
      );
      CREATE TABLE IF NOT EXISTS web_sessions (
        token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
        expires_at bigint NOT NULL
      );
      CREATE INDEX IF NOT EXISTS web_sessions_expiry ON web_sessions(expires_at);
      CREATE TABLE IF NOT EXISTS web_auth_limits (
        key text PRIMARY KEY, count integer NOT NULL, expires_at bigint NOT NULL
      );
      COMMIT;`);
  }

  async rateLimit(key: string, maximum: number, windowMs: number) {
    const now = this.now();
    const {rows} = await this.sql.query(`INSERT INTO web_auth_limits(key,count,expires_at) VALUES($1,1,$2)
      ON CONFLICT(key) DO UPDATE SET
        count=CASE WHEN web_auth_limits.expires_at <= $3 THEN 1 ELSE web_auth_limits.count+1 END,
        expires_at=CASE WHEN web_auth_limits.expires_at <= $3 THEN $2 ELSE web_auth_limits.expires_at END
      RETURNING count`, [key, now + windowMs, now]);
    if (rows[0].count > maximum) throw fail('尝试次数过多，请稍后再试。', 429);
  }

  private async attempt(username: string, register: boolean, client: string) {
    await this.rateLimit(`client:${digest(client)}`, 60, 15 * 60000);
    await this.rateLimit(`auth:${username}`, 10, 15 * 60000);
    if (register) await this.rateLimit(`register:${digest(client)}`, 10, 15 * 60000);
    await this.sql.query('DELETE FROM web_auth_limits WHERE expires_at <= $1', [this.now()]);
    await this.sql.query('DELETE FROM web_sessions WHERE expires_at <= $1', [this.now()]);
  }

  private async issue(user: AccountUser) {
    const token = randomBytes(32).toString('base64url');
    await this.sql.query('INSERT INTO web_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',
      [digest(token), user.id, this.now() + SESSION_SECONDS * 1000]);
    return {user, token};
  }

  async register(rawUsername: unknown, rawPassword: unknown, client = 'local') {
    const username = usernameOf(rawUsername), password = passwordOf(rawPassword);
    await this.attempt(username, true, client);
    const salt = randomBytes(16).toString('hex');
    const passwordHash = `${salt}:${(await derive(password, salt)).toString('hex')}`;
    const user = {id: randomUUID(), username};
    try {
      await this.sql.query('INSERT INTO web_users(id,username,password_hash,created_at) VALUES($1,$2,$3,$4)',
        [user.id, username, passwordHash, this.now()]);
    } catch (error) {
      if ((error as {code?: string}).code === '23505') throw fail('该用户名已被使用。', 409);
      throw error;
    }
    return this.issue(user);
  }

  async login(rawUsername: unknown, rawPassword: unknown, client = 'local') {
    const username = usernameOf(rawUsername), password = passwordOf(rawPassword);
    await this.attempt(username, false, client);
    const {rows} = await this.sql.query('SELECT id,username,password_hash FROM web_users WHERE username=$1', [username]);
    const row = rows[0];
    // Unknown users take the same costly password derivation path.
    const [salt, hash] = (row?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
    const actual = await derive(password, salt);
    if (!timingSafeEqual(actual, Buffer.from(hash, 'hex')) || !row) throw fail('用户名或密码不正确。', 401);
    return this.issue({id: row.id, username: row.username});
  }

  async session(token: string | undefined): Promise<AccountUser | null> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const {rows} = await this.sql.query(`SELECT u.id,u.username FROM web_sessions s
      JOIN web_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2`, [digest(token), this.now()]);
    return rows[0] ?? null;
  }

  async logout(token: string | undefined) {
    if (token) await this.sql.query('DELETE FROM web_sessions WHERE token_hash=$1', [digest(token)]);
  }
}
