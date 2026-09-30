import type {Accounts} from '../src/session-auth.ts';
const identities=new Map<string,string>();
export const appOrigin='https://game.test';
export async function issueSession({sub}:{sub:string}){const token=crypto.randomUUID();identities.set(token,sub);return token;}
export const accounts:Accounts={
 async session(token){const id=identities.get(token||'');return id?{id,username:id}:null;},
 async logout(token){identities.delete(token||'');},
 async login(){throw new Error('Unused in service fixtures');},
 async register(){throw new Error('Unused in service fixtures');},
};
