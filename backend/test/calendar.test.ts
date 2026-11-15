import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createPool } from '../src/db.ts';
import { migrate, dropTestSchema } from '../src/migrate.ts';
import { importEsports } from '../src/esports-data.ts';
import { calendarSchema, importCalendar } from '../src/esports-calendar.ts';
import { buildApp } from '../src/server.ts';
import { loadConfig } from '../src/config.ts';
const bundle = JSON.parse(await readFile(new URL('../data/faze-calendar-2026-11-15.json',import.meta.url),'utf8'));
const roster = JSON.parse(await readFile(new URL('../data/faze-cs2-2026-11-15.json',import.meta.url),'utf8'));
test('calendar rejects inconsistent participants, outcomes and unreferenced tournaments', () => {
  calendarSchema.parse(bundle);
  for (const mutate of [
    (b:any) => b.matches[0].tournamentId='unknown',
    (b:any) => b.matches[1].result.winner='unknown',
    (b:any) => b.matches[1].result.score='2-1',
    (b:any) => b.matches[0].result={winner:'FaZe',score:'2-0'},
    (b:any) => b.matches[0].timezone='unknown',
  ]) { const invalid=structuredClone(bundle);mutate(invalid);assert.throws(()=>calendarSchema.parse(invalid)); }
});
test('sourced calendar imports transactionally and serves UI and prediction contracts',async context => {
  const schema=`faze_test_${randomUUID().replaceAll('-','')}`;
  const db=createPool(process.env.DATABASE_URL??'',schema);
  const app=buildApp({...loadConfig(),schema},db);
  context.after(async()=>{await app.close();try{await dropTestSchema(db,schema)}finally{await db.end()}});
  await migrate(db,schema);
  await assert.rejects(importCalendar(db,bundle),/unknown players/);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM esports_tournaments')).rows[0].count,0);
  await importEsports(db,roster);
  await importCalendar(db,bundle);await importCalendar(db,bundle);
  const list=await app.inject('/esports/matches');assert.equal(list.statusCode,200);
  assert.equal(list.json().matches.length,2);
  const frozen=(await app.inject('/players/hltv-9960/matches')).json();
  assert.equal(frozen.matches.length,2);assert.equal(frozen.tournaments.length,2);
  const upcoming=frozen.matches.find((item:any)=>item.status==='upcoming');
  assert.deepEqual(upcoming.participants,['FaZe','Wildcard']);
  assert.equal(upcoming.startsAt,'2026-11-24T07:00:00Z');
  assert.equal(upcoming.tournament.name,'PGL Major Singapore 2026 Stage 1');
  assert.equal(upcoming.isDemo,false);
  const bench=(await app.inject('/players/hltv-18053/matches')).json();
  assert.deepEqual(bench,{matches:[],tournaments:[]});
  assert.equal((await app.inject('/players/unknown/matches')).statusCode,404);
  assert.equal((await app.inject('/players/hltv-9960')).json().displayName,'David \u010cer\u0148ansk\u00fd');
  const reference=(await db.query('SELECT * FROM engagement_matches WHERE id=$1',[upcoming.id])).rows[0];
  assert.deepEqual(reference.participants,[{id:'hltv-6667',label:'FaZe'},{id:'wildcard',label:'Wildcard'}]);
  assert.equal(reference.is_demo,false);
  const stale=structuredClone(bundle);stale.collectedAt='2026-11-14T00:00:00Z';stale.matches[0].startsAt='2026-11-25T00:00:00Z';
  await importCalendar(db,stale);
  assert.equal((await app.inject('/players/hltv-9960/matches')).json().matches.find((m:any)=>m.id===upcoming.id).startsAt,upcoming.startsAt);
});
