import type { Pool } from 'pg';
import { createPool, transaction } from './db.ts';
export const pitchRewardId = 'f0000000-0000-4000-8000-000000000010';
export async function seedEngagement(db:Pool,round='pitch-1') {
  if(!/^[a-z0-9-]{1,40}$/.test(round)) throw new Error('Round must be 1-40 lowercase letters, digits or hyphens.');
  return transaction(db,async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':pitch-demo',0))");
    for(const user of [
      {id:'pitch-demo-staff',email:'pitch-staff@example.test',name:'Pitch Demo Reviewer',role:'staff'},
      {id:'pitch-demo-fan',email:'pitch-fan@example.test',name:'Pitch Demo Fan',role:'fan'},
    ]) {
      await client.query(`INSERT INTO "user"(id,email,name,role,"emailVerified") VALUES($1,$2,$3,$4,true) ON CONFLICT DO NOTHING`,[user.id,user.email,user.name,user.role]);
      const {rows:[saved]}=await client.query('SELECT id,role FROM "user" WHERE email=$1',[user.email]);
      if(!saved || saved.id!==user.id || saved.role!==user.role) throw new Error('Reserved pitch account conflicts with an existing account.');
    }
    await client.query(`INSERT INTO rewards(id,title,description,kind,terms,point_cost,stock,active,is_demo)
      VALUES($1,'Demo FaZe merch voucher','A sample reward for the pitch. Earn 100 points from a correct demo prediction.',
      'merch','Simulation only: no merchandise is shipped and no FaZe benefit is promised.',100,50,true,true)
      ON CONFLICT(id) DO NOTHING`,[pitchRewardId]);
    const {rows:[reward]}=await client.query('SELECT is_demo FROM rewards WHERE id=$1',[pitchRewardId]);
    if(!reward?.is_demo) throw new Error('Reserved pitch reward ID belongs to non-demo data.');
    const reference='demo-pitch-'+round;
    await client.query(`INSERT INTO prediction_markets(kind,reference_id,title,options,locks_at,award_points,is_demo,created_by)
      VALUES('match_winner',$1,'[Demo] FaZe vs Practice Squad - prediction rehearsal',
      '[{"id":"faze","label":"FaZe"},{"id":"practice","label":"Practice Squad"}]',now()+interval '24 hours',100,true,'pitch-demo-staff')
      ON CONFLICT DO NOTHING`,[reference]);
    const {rows:[market]}=await client.query(`SELECT id,locks_at AS "locksAt",is_demo FROM prediction_markets WHERE kind='match_winner' AND reference_id=$1`,[reference]);
    if(!market?.is_demo) throw new Error('Reserved pitch market reference belongs to non-demo data.');
    return {round,marketId:market.id,locksAt:market.locksAt,rewardId:pitchRewardId,awardPoints:100,rewardCost:100};
  });
}
if(import.meta.main){
 const db=createPool(process.env.DATABASE_URL??'',process.env.DB_SCHEMA??'faze');
 try{console.log(JSON.stringify(await seedEngagement(db,process.argv[2]??'pitch-1')))}finally{await db.end()}
}
