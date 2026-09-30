import {randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {AccountStore, derive, digest, usernameOf, passwordOf, type Sql} from './account-store.ts';
const fail = (message:string,status=400) => Object.assign(new Error(message),{status});
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
export class AdminStore {
 private sql:Sql;
 private accounts:AccountStore;
 private now:()=>number;
 constructor(sql:Sql, accounts:AccountStore, now=Date.now) {this.sql=sql;this.accounts=accounts;this.now=now;}
 async initialize() {
  await this.sql.query(`BEGIN;
   SELECT pg_advisory_xact_lock(1464817487);
   CREATE TABLE IF NOT EXISTS gm_admin (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), id text NOT NULL UNIQUE, username text NOT NULL, password_hash text NOT NULL, created_at bigint NOT NULL);
   CREATE TABLE IF NOT EXISTS gm_sessions (token_hash text PRIMARY KEY, admin_id text NOT NULL REFERENCES gm_admin(id), expires_at bigint NOT NULL);
   CREATE TABLE IF NOT EXISTS gm_audit (id text PRIMARY KEY, admin_id text NOT NULL, action text NOT NULL, target text NOT NULL, reason text NOT NULL, created_at bigint NOT NULL);
   CREATE INDEX IF NOT EXISTS gm_audit_time ON gm_audit(created_at DESC,id);
   COMMIT;`);
 }
 async playerExists(id:string){return !!(await this.sql.query('SELECT id FROM web_users WHERE id=$1',[id])).rows.length;}
 async setupRequired(){return !(await this.sql.query('SELECT id FROM gm_admin')).rows.length;}
 async authenticate(action:'register'|'login', input:Record<string,unknown>, client:string){
  const username=usernameOf(input.username),password=passwordOf(input.password);
  await this.accounts.rateLimit(`gm:client:${digest(client)}`,30,900000);
  await this.accounts.rateLimit(`gm:user:${username}`,10,900000);
  let admin;
  if(action==='register'){
   if(!await this.setupRequired())throw fail('管理员已经创建，注册已关闭。',409);
   const salt=randomBytes(16).toString('hex'),hash=`${salt}:${(await derive(password,salt)).toString('hex')}`;
   try {
    const result=await this.sql.query(`WITH created AS (
     INSERT INTO gm_admin(id,username,password_hash,created_at) VALUES($1,$2,$3,$4) RETURNING id,username
    ), audit AS (INSERT INTO gm_audit SELECT $5,id,'register',id,'首次管理员注册',$4 FROM created)
    SELECT * FROM created`,[randomUUID(),username,hash,this.now(),randomUUID()]);
    admin=result.rows[0];
   } catch(error){if((error as {code?:string}).code==='23505')throw fail('管理员已经创建，注册已关闭。',409);throw error;}
  } else {
   const row=(await this.sql.query('SELECT * FROM gm_admin WHERE username=$1',[username])).rows[0];
   const [salt,hash]=(row?.password_hash??`${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
   const actual=await derive(password,salt);
   if(!timingSafeEqual(actual,Buffer.from(hash,'hex'))||!row)throw fail('用户名或密码不正确。',401);
   admin={id:row.id,username:row.username};
  }
  const token=randomBytes(32).toString('base64url');
  await this.sql.query('DELETE FROM gm_sessions WHERE expires_at<=$1',[this.now()]);
  await this.sql.query('INSERT INTO gm_sessions VALUES($1,$2,$3)',[digest(token),admin.id,this.now()+ADMIN_SESSION_SECONDS*1000]);
  return {admin,token};
 }
 async session(token:string|undefined){
  if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  return (await this.sql.query(`SELECT a.id,a.username FROM gm_sessions s JOIN gm_admin a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>$2`,[digest(token),this.now()])).rows[0]??null;
 }
 async logout(token:string|undefined){if(token)await this.sql.query('DELETE FROM gm_sessions WHERE token_hash=$1',[digest(token)]);}
 async overview(){
  return (await this.sql.query(`SELECT
   (SELECT count(*)::int FROM web_users) AS players,
   (SELECT count(*)::int FROM web_user_blocks) AS blocked,
   (SELECT count(*)::int FROM accounts) AS saves,
   (SELECT count(*)::int FROM characters) AS characters,
   (SELECT count(*)::int FROM account_presence WHERE (data->>'lastSeenAt')::bigint>$1) AS online,
   (SELECT count(*)::int FROM activities WHERE status IN ('running','returning','pending')) AS active,
   (SELECT count(*)::int FROM instances WHERE status IN ('running','returning')) AS instances`,[this.now()-60000])).rows[0];
 }
 async list(section:string,search:string,page:number){
  const offset=page*25, query=`%${search}%`;
  const definitions:Record<string,{from:string;fields:string;where:string;order:string}>= {
   players:{from:'web_users u LEFT JOIN web_user_blocks b ON b.user_id=u.id',fields:`u.id,u.username,u.created_at,b.reason AS blocked_reason,(SELECT count(*)::int FROM accounts a WHERE a.data->>'userId'=u.id) AS saves`,where:'u.username ILIKE $1 OR u.id ILIKE $1',order:'u.created_at DESC,u.id'},
   saves:{from:`accounts a LEFT JOIN characters c ON c.id=a.data->>'primaryCharacterId' LEFT JOIN web_users u ON u.id=a.data->>'userId'`,fields:`a.id,u.username,c.data->'rules'->>'name' AS name,c.data->'rules'->>'level' AS level,c.data->'rules'->>'classId' AS class_id,a.data->>'createdAt' AS created_at`,where:`a.id ILIKE $1 OR u.username ILIKE $1 OR c.data->'rules'->>'name' ILIKE $1`,order:`(a.data->>'createdAt')::bigint DESC,a.id`},
   activities:{from:'activities',fields:`id,account_id,data->>'type' AS type,status,next_event_at`,where:'id ILIKE $1 OR account_id ILIKE $1 OR status ILIKE $1',order:'next_event_at DESC NULLS LAST,id'},
   audit:{from:`(SELECT id,admin_id,action,target,reason,created_at FROM gm_audit UNION ALL SELECT id,data->>'adminId' AS admin_id,data->>'action' AS action,data->>'target' AS target,data->>'reason' AS reason,(data->>'createdAt')::bigint AS created_at FROM gm_operations) audit`,fields:'id,admin_id,action,target,reason,created_at',where:'target ILIKE $1 OR action ILIKE $1 OR reason ILIKE $1',order:'created_at DESC,id'},
  };
  const d=definitions[section];if(!d)throw fail('页面不存在',404);
  const rows=(await this.sql.query(`SELECT ${d.fields} FROM ${d.from} WHERE (${d.where}) ORDER BY ${d.order} LIMIT 26 OFFSET $2`,[query,offset])).rows;
  return {rows:rows.slice(0,25),hasMore:rows.length>25,page};
 }
 async save(id:string){
  const account=(await this.sql.query('SELECT data FROM accounts WHERE id=$1',[id])).rows[0]?.data;
  if(!account)throw fail('存档不存在',404);
  const characters=(await this.sql.query(`SELECT c.data,w.data->'balance' AS balance FROM characters c LEFT JOIN wallets w ON w.character_id=c.id WHERE c.account_id=$1`,[id])).rows;
  return {account,characters};
 }
 async moderate(adminId:string,input:Record<string,unknown>){
  const {action,target,reason}=input;
  if(!['ban','unban','revoke'].includes(String(action))||typeof target!=='string'||target.length>200||typeof reason!=='string'||!reason.trim()||reason.trim().length>500)throw fail('请填写有效的玩家、操作及原因（1–500 字）。');
  // The action and audit commit in a single statement; no partial moderation updates.
  const mutation=action==='ban'?`INSERT INTO web_user_blocks SELECT id,$3 FROM player ON CONFLICT(user_id) DO UPDATE SET reason=EXCLUDED.reason RETURNING user_id`:
   action==='unban'?`DELETE FROM web_user_blocks WHERE user_id IN (SELECT id FROM player) RETURNING user_id`:
   `DELETE FROM web_sessions WHERE user_id IN (SELECT id FROM player) RETURNING user_id`;
  const result=await this.sql.query(`WITH player AS (SELECT id FROM web_users WHERE id=$1 FOR UPDATE), changed AS (${mutation}),
   revoked AS (DELETE FROM web_sessions WHERE user_id IN (SELECT id FROM player) AND $2='ban'),
   audit AS (INSERT INTO gm_audit SELECT $4,$5,$2,id,$3,$6 FROM player RETURNING id)
   SELECT id FROM audit`,[target,action,reason.trim(),randomUUID(),adminId,this.now()]);
  if(!result.rows.length)throw fail('玩家不存在',404);
  return {ok:true};
 }
}
