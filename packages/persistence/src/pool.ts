import pg from 'pg';

// A release can use a fresh namespace without deleting or migrating old saves.
// Do not include public as a fallback: missing tables must never read old data.
export async function databasePool(config:pg.PoolConfig, schema?:string):Promise<pg.Pool>{
 if(schema!==undefined&&!/^[a-z][a-z0-9_]{0,62}$/.test(schema))throw new Error('Invalid GAME_DATABASE_SCHEMA');
 const pool=new pg.Pool({...config,...(schema?{options:`-c search_path=${schema}`}:{})});
 if(schema){
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock($1)',[1464817485]);
   await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end();throw error;}
  client.release();
 }
 return pool;
}
