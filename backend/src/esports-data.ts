import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createPool, transaction } from './db.ts';
import { fail } from './errors.ts';

const timestamp = z.iso.datetime({ offset: true });
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const source = z.strictObject({ id, url: z.url().refine(value => new URL(value).protocol === 'https:'), observedAt: timestamp, sourceUpdatedAt: timestamp.nullable(), crawlHint: z.string().max(200) });
const metrics = z.strictObject({
  rating: z.number().min(0).max(10).nullable(), ratingDefinition: z.string().min(1),
  kd: z.number().min(0).nullable(), adr: z.number().min(0).max(1000).nullable(),
  headshotPercent: z.number().min(0).max(100).nullable(), kastPercent: z.number().min(0).max(100).nullable(),
  killsPerRound: z.number().min(0).max(5).nullable(), deathsPerRound: z.number().min(0).max(1).nullable(),
});
export const esportsBundleSchema = z.strictObject({
  schemaVersion: z.literal(1), game: z.literal('CS2'), team: z.literal('FaZe'), isDemo: z.literal(false),
  collectedAt: timestamp, limitations: z.array(z.string()).min(1), sources: z.array(source).min(1),
  players: z.array(z.strictObject({
    id, handle: z.string().min(1), displayName: z.string().min(1),
    rosterStatus: z.enum(['active','benched','coach','former']), rosterSourceId: id,
    profileUrl: z.url().nullable(), role: z.string().nullable(),
  })).min(1),
  snapshots: z.array(z.strictObject({
    playerId: id, sourceId: id, observedAt: timestamp,
    period: z.strictObject({ key: id, label: z.string().min(1), startsAt: timestamp.nullable(), endsAt: timestamp.nullable() }),
    mapsPlayed: z.number().int().positive(), metrics,
  })).min(1),
}).superRefine((bundle, ctx) => {
  const sourceIds = new Set(bundle.sources.map(item => item.id));
  const players = new Map(bundle.players.map(item => [item.id, item]));
  if (sourceIds.size !== bundle.sources.length || players.size !== bundle.players.length) ctx.addIssue({ code: 'custom', message: 'Duplicate source/player IDs' });
  const snapshots = new Set<string>();
  for (const player of bundle.players) if (!sourceIds.has(player.rosterSourceId)) ctx.addIssue({ code:'custom',message:'Unknown roster source' });
  for (const snapshot of bundle.snapshots) {
    const key = `${snapshot.playerId}:${snapshot.period.key}:${snapshot.sourceId}:${snapshot.observedAt}`;
    if (snapshots.has(key)) ctx.addIssue({ code:'custom',message:'Duplicate snapshot' });
    snapshots.add(key);
    if (!players.has(snapshot.playerId) || !sourceIds.has(snapshot.sourceId)) ctx.addIssue({ code:'custom',message:'Unknown player or snapshot source' });
    if (players.get(snapshot.playerId)?.rosterStatus === 'coach') ctx.addIssue({ code:'custom',message:'Player metrics cannot be assigned to coach records' });
    if (snapshot.period.startsAt && snapshot.period.endsAt && Date.parse(snapshot.period.startsAt) > Date.parse(snapshot.period.endsAt)) ctx.addIssue({ code:'custom',message:'Invalid stat period' });
    if (Date.parse(snapshot.observedAt) > Date.parse(bundle.collectedAt)) ctx.addIssue({ code:'custom',message:'Snapshot observed after collection completed' });
  }
});
export type EsportsBundle = z.infer<typeof esportsBundleSchema>;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function snapshotRecords(input: unknown) {
  const bundle = esportsBundleSchema.parse(input);
  return bundle.snapshots.map(snapshot => {
    const evidence = bundle.sources.find(source => source.id === snapshot.sourceId)!;
    const payload = { ...snapshot, source: evidence, game: bundle.game, isDemo: false, limitations: bundle.limitations };
    return { id: createHash('sha256').update(canonical(payload)).digest('hex'), payload };
  });
}
export async function importEsports(db: Pool, input: unknown) {
  const bundle = esportsBundleSchema.parse(input);
  const records = snapshotRecords(bundle);
  await transaction(db, async client => {
    for (const player of bundle.players) {
      const rosterSource = bundle.sources.find(source => source.id === player.rosterSourceId)!;
      await client.query(`INSERT INTO esports_players(id,handle,display_name,roster_status,checked_at,profile)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET handle=EXCLUDED.handle,
        display_name=EXCLUDED.display_name,roster_status=EXCLUDED.roster_status,checked_at=EXCLUDED.checked_at,profile=EXCLUDED.profile
        WHERE esports_players.checked_at <= EXCLUDED.checked_at`,
      [player.id, player.handle, player.displayName, player.rosterStatus, rosterSource.observedAt, JSON.stringify({ ...player, rosterSource })]);
    }
    for (const record of records) await client.query(`INSERT INTO esports_stat_snapshots(id,player_id,period_key,observed_at,payload)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`,
    [record.id,record.payload.playerId,record.payload.period.key,record.payload.observedAt,JSON.stringify(record.payload)]);
  });
  return { players: bundle.players.length, snapshots: records.length };
}

export function registerPlayerRoutes(app: FastifyInstance, db: Pool) {
  const params = z.object({ id });
  app.get('/players', async () => {
    const { rows } = await db.query(`SELECT id,handle,display_name AS "displayName",roster_status AS "rosterStatus",checked_at AS "checkedAt",profile
      FROM esports_players ORDER BY CASE roster_status WHEN 'active' THEN 0 WHEN 'coach' THEN 1 WHEN 'benched' THEN 2 ELSE 3 END,handle`);
    return { players: rows, freshness: 'Manually collected source snapshots; not a live match feed.' };
  });
  app.get('/players/:id', async request => {
    const playerId = params.parse(request.params).id;
    const { rows: [player] } = await db.query('SELECT profile,checked_at AS "checkedAt" FROM esports_players WHERE id=$1',[playerId]);
    if (!player) fail(404,'PLAYER_NOT_FOUND','Player not found.');
    return { ...player.profile, checkedAt: player.checkedAt };
  });
  app.get('/players/:id/stats', async request => {
    const playerId = params.parse(request.params).id;
    const query = z.object({ snapshotId: z.string().regex(/^[a-f0-9]{64}$/).optional() }).parse(request.query);
    const { rows: [snapshot] } = await db.query(`SELECT id,payload FROM esports_stat_snapshots
      WHERE player_id=$1 AND ($2::text IS NULL OR id=$2) ORDER BY observed_at DESC,id LIMIT 1`,[playerId,query.snapshotId ?? null]);
    if (!snapshot) fail(404,'STATS_UNAVAILABLE','No sourced statistics are available for this player.');
    return { snapshotId: snapshot.id, ...snapshot.payload };
  });
}

if (import.meta.main) {
  const [file,...flags] = process.argv.slice(2);
  if (!file || flags.some(flag => flag !== '--write')) throw new Error('Usage: node src/esports-data.ts <bundle.json> [--write]. Default is a read-only dry run.');
  const bundle = esportsBundleSchema.parse(JSON.parse(await readFile(file,'utf8')));
  const records = snapshotRecords(bundle);
  if (!flags.includes('--write')) console.log(JSON.stringify({ dryRun:true,players:bundle.players.length,snapshots:records.length,snapshotIds:records.map(record => record.id) },null,2));
  else {
    const db = createPool(process.env.DATABASE_URL ?? '', process.env.DB_SCHEMA ?? 'faze');
    try { console.log(JSON.stringify(await importEsports(db,bundle))); }
    finally { await db.end(); }
  }
}
