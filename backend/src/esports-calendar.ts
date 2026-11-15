import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createPool, transaction } from './db.ts';
import { fail } from './errors.ts';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const timestamp = z.iso.datetime({ offset: true });
const url = z.url().refine(value => new URL(value).protocol === 'https:');
const participant = z.strictObject({ id, label: z.string().min(1) });
const playerIds = z.array(id).min(1).refine(ids => new Set(ids).size === ids.length);
export const calendarSchema = z.strictObject({
  schemaVersion: z.literal(1), isDemo: z.literal(false), collectedAt: timestamp,
  limitations: z.array(z.string()).min(1),
  tournaments: z.array(z.strictObject({
    id, name: z.string().min(1), stage: z.string().nullable(), standing: z.string().nullable(),
    sourceUrl: url, teams: z.array(participant).min(1), playerIds,
  })).min(1),
  matches: z.array(z.strictObject({
    id, title: z.string().min(1), tournamentId: id, stage: z.string().nullable(),
    participants: z.array(participant).length(2).refine(teams => teams[0].id !== teams[1].id && teams[0].label !== teams[1].label),
    startsAt: timestamp, timezone: z.string().refine(value => { try { new Intl.DateTimeFormat('en',{timeZone:value}); return true; } catch { return false; } }),
    status: z.enum(['upcoming','finished','canceled']),
    result: z.strictObject({ winner: z.string().min(1), score: z.string().regex(/^[0-9]+-[0-9]+$/) }).nullable(),
    sourceUrl: url, timeSourceUrl: url, playerIds,
  })).min(1),
}).superRefine((bundle,ctx) => {
  const tournaments = new Map(bundle.tournaments.map(item => [item.id,item]));
  if (tournaments.size !== bundle.tournaments.length || new Set(bundle.matches.map(item => item.id)).size !== bundle.matches.length) ctx.addIssue({code:'custom',message:'Duplicate IDs'});
  for (const tournament of bundle.tournaments) if (new Set(tournament.teams.map(team => team.id)).size !== tournament.teams.length) ctx.addIssue({code:'custom',message:'Duplicate teams'});
  for (const match of bundle.matches) {
    const tournament = tournaments.get(match.tournamentId);
    if (!tournament || match.playerIds.some(id => !tournament.playerIds.includes(id))) ctx.addIssue({code:'custom',message:'Unknown tournament or participant association'});
    if ((match.status === 'finished') !== (match.result !== null)) ctx.addIssue({code:'custom',message:'Only finished matches have results'});
    if (match.result && !match.participants.some(team => team.label === match.result!.winner)) ctx.addIssue({code:'custom',message:'Winner is not a participant'});
    if (match.result) {
      const [first,second] = match.result.score.split('-').map(Number);
      if (first === second || match.result.winner !== match.participants[first > second ? 0 : 1].label) ctx.addIssue({code:'custom',message:'Score and winner disagree'});
    }
    if (match.status === 'finished' && Date.parse(match.startsAt) > Date.parse(bundle.collectedAt)) ctx.addIssue({code:'custom',message:'Finished match starts after observation'});
  }
});
export async function importCalendar(db: Pool, input: unknown) {
  const bundle = calendarSchema.parse(input);
  await transaction(db,async client => {
    const ids = [...new Set([...bundle.tournaments,...bundle.matches].flatMap(item => item.playerIds))];
    const players = await client.query('SELECT id FROM esports_players WHERE id=ANY($1::text[])',[ids]);
    if (players.rows.length !== ids.length) throw new Error('Import the roster first; calendar references unknown players.');
    for (const item of bundle.tournaments) await client.query(`INSERT INTO esports_tournaments(id,checked_at,payload) VALUES($1,$2,$3)
      ON CONFLICT(id) DO UPDATE SET checked_at=EXCLUDED.checked_at,payload=EXCLUDED.payload
      WHERE esports_tournaments.checked_at <= EXCLUDED.checked_at`,[item.id,bundle.collectedAt,JSON.stringify(item)]);
    for (const item of bundle.matches) await client.query(`INSERT INTO esports_matches(id,tournament_id,starts_at,checked_at,payload) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(id) DO UPDATE SET tournament_id=EXCLUDED.tournament_id,starts_at=EXCLUDED.starts_at,checked_at=EXCLUDED.checked_at,payload=EXCLUDED.payload
      WHERE esports_matches.checked_at <= EXCLUDED.checked_at`,[item.id,item.tournamentId,item.startsAt,bundle.collectedAt,JSON.stringify({...item,limitations:bundle.limitations})]);
  });
  return { matches:bundle.matches.length,tournaments:bundle.tournaments.length };
}
type Calendar = z.infer<typeof calendarSchema>;
type MatchRow = {payload:Calendar['matches'][number];checkedAt:Date;tournamentName:string};
function matchRecord(row: MatchRow) {
  const {tournamentId,participants,...match} = row.payload;
  return {...match,tournament:{id:tournamentId,name:row.tournamentName},participants:participants.map((team:{label:string})=>team.label),refreshedAt:row.checkedAt,isDemo:false};
}
const matchSql = `SELECT m.payload,m.checked_at AS "checkedAt",t.payload->>'name' AS "tournamentName"
  FROM esports_matches m JOIN esports_tournaments t ON t.id=m.tournament_id`;
export function registerCalendarRoutes(app:FastifyInstance,db:Pool) {
  app.get('/esports/matches',async () => {
    const {rows} = await db.query<MatchRow>(matchSql+' ORDER BY m.starts_at,m.id');
    return {matches:rows.map(matchRecord)};
  });
  app.get('/players/:id/matches',async request => {
    const playerId = z.object({id}).parse(request.params).id;
    if (!(await db.query('SELECT id FROM esports_players WHERE id=$1',[playerId])).rowCount) fail(404,'PLAYER_NOT_FOUND','Player not found.');
    const {rows} = await db.query<MatchRow>(matchSql+` WHERE m.payload->'playerIds' ? $1 ORDER BY m.starts_at,m.id`,[playerId]);
    const {rows:tournaments} = await db.query(`SELECT payload,checked_at AS "checkedAt" FROM esports_tournaments WHERE payload->'playerIds' ? $1 ORDER BY checked_at DESC,id`,[playerId]);
    return {matches:rows.map(matchRecord),tournaments:tournaments.map(({payload,checkedAt}) => ({id:payload.id,name:payload.name,stage:payload.stage,standing:payload.standing,sourceUrl:payload.sourceUrl,refreshedAt:checkedAt,isDemo:false}))};
  });
}
if(import.meta.main) {
  const [file,...flags] = process.argv.slice(2);
  if(!file || flags.some(flag => flag !== '--write')) throw new Error('Usage: npm run import:calendar -- <bundle.json> [--write]');
  const bundle = calendarSchema.parse(JSON.parse(await readFile(file,'utf8')));
  if(!flags.includes('--write')) console.log(JSON.stringify({dryRun:true,matches:bundle.matches.length,tournaments:bundle.tournaments.length}));
  else {const db=createPool(process.env.DATABASE_URL??'',process.env.DB_SCHEMA??'faze');try{console.log(JSON.stringify(await importCalendar(db,bundle)))}finally{await db.end()}}
}
