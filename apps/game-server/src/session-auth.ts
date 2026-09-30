import type {IncomingMessage} from 'node:http';
import type {AccountStore} from './account-store.ts';
import {SESSION_SECONDS} from './account-store.ts';
export type Accounts = Pick<AccountStore,'session'|'login'|'register'|'logout'>;
export const SESSION_COOKIE='wow_session';
export function sessionToken(request:IncomingMessage){
 return request.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1);
}
export function sessionCookie(token:string,secure:boolean){
 return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token?SESSION_SECONDS:0}${secure?'; Secure':''}`;
}
export async function accountFrom(request:IncomingMessage,accounts:Accounts){
 const user=await accounts.session(sessionToken(request));
 if(!user)throw Object.assign(new Error('请先登录。'),{status:401});
 return user.id;
}
export function sameOrigin(request:IncomingMessage,origin:string){return request.headers.origin===origin;}
