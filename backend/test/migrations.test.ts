import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createPool, transaction } from '../src/db.ts';
import { migrate, dropTestSchema } from '../src/migrate.ts';
import { demoRewardId, seed } from '../src/seed.ts';

test('migrations accept historical LF/CRLF checksums but reject changed SQL', async context => {
  const schema = `faze_test_${randomUUID().replaceAll('-', '')}`;
  const db = createPool(process.env.DATABASE_URL ?? '', schema);
  context.after(async () => { try { await dropTestSchema(db, schema); } finally { await db.end(); } });
  await migrate(db, schema);
  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
  for (const [index, row] of rows.entries()) {
    const sql = (await readFile(new URL(`../migrations/${row.name}`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
    const historical = index % 2 ? sql.replace(/\n/g, '\r\n') : sql;
    await db.query('UPDATE schema_migrations SET checksum=$2 WHERE name=$1', [row.name, createHash('sha256').update(historical).digest('hex')]);
  }
  await migrate(db, schema);
  for (const row of rows) {
    const sql = (await readFile(new URL(`../migrations/${row.name}`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
    const { rows: [stored] } = await db.query('SELECT checksum FROM schema_migrations WHERE name=$1', [row.name]);
    assert.equal(stored.checksum, createHash('sha256').update(sql).digest('hex'));
  }
  await db.query('UPDATE schema_migrations SET checksum=$1 WHERE name=$2', ['0'.repeat(64), rows[0].name]);
  await assert.rejects(migrate(db, schema), /has changed/);
});

test('008_engagement_ui_compat migrates legacy merchandise rewards and claimed redemptions', async context => {
  const schema = `faze_test_${randomUUID().replaceAll('-', '')}`;
  const db = createPool(process.env.DATABASE_URL ?? '', schema);
  context.after(async () => { try { await dropTestSchema(db, schema); } finally { await db.end(); } });

  const migrationDir = new URL('../migrations/', import.meta.url);
  const priorNames = (await readdir(migrationDir))
    .filter(name => /^\d{3}_[a-z_]+\.sql$/.test(name) && name < '008_')
    .sort();
  await transaction(db, async client => {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}`);
    await client.query(`CREATE TABLE schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const name of priorNames) {
      const sql = (await readFile(new URL(name, migrationDir), 'utf8')).replace(/\r\n/g, '\n');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
        name,
        createHash('sha256').update(sql).digest('hex'),
      ]);
    }
    await client.query(`
      INSERT INTO "user" (id, name, email, role, "emailVerified")
      VALUES ('legacy-fan', 'Legacy Fan', 'legacy@example.test', 'fan', true)
    `);
    const { rows: [reward] } = await client.query<{ id: string }>(`
      INSERT INTO rewards (title, description, kind, terms, point_cost, stock, active, is_demo)
      VALUES ('Legacy Merch', 'Old kind', 'merchandise', 'Terms', 50, 5, true, true)
      RETURNING id
    `);
    const redemptionId = randomUUID();
    const { rows: [tx] } = await client.query<{ id: string }>(`
      INSERT INTO point_transactions (user_id, delta, reason, source_type, source_id)
      VALUES ('legacy-fan', -50, 'Legacy claim', 'redemption', $1)
      RETURNING id
    `, [redemptionId]);
    await client.query(`
      INSERT INTO reward_redemptions (id, user_id, reward_id, point_transaction_id, idempotency_key, status)
      VALUES ($1, 'legacy-fan', $2, $3, $4, 'claimed')
    `, [redemptionId, reward.id, tx.id, randomUUID()]);
  });

  await seed(db);
  const { rows: [preMigrateSeeded] } = await db.query<{ kind: string }>('SELECT kind FROM rewards WHERE id = $1', [demoRewardId]);
  assert.equal(preMigrateSeeded.kind, 'merchandise');

  await migrate(db, schema);
  await seed(db);

  const { rows: [migratedSeeded] } = await db.query<{ kind: string }>('SELECT kind FROM rewards WHERE id = $1', [demoRewardId]);
  assert.equal(migratedSeeded.kind, 'merch');
  const { rows: [migratedReward] } = await db.query<{ kind: string }>('SELECT kind FROM rewards WHERE title = $1', ['Legacy Merch']);
  assert.equal(migratedReward.kind, 'merch');
  const { rows: [migratedRedemption] } = await db.query<{ status: string }>('SELECT status FROM reward_redemptions');
  assert.equal(migratedRedemption.status, 'requested');

  const { rows: [unlimited] } = await db.query<{ id: string; stock: number | null }>(`
    INSERT INTO rewards (title, description, kind, terms, point_cost, stock, active, is_demo)
    VALUES ('Open Stock Merch', '', 'merch', '', 25, NULL, true, true)
    RETURNING id, stock
  `);
  assert.equal(unlimited.stock, null);

  await assert.rejects(db.query(`
    INSERT INTO rewards (title, description, kind, terms, point_cost, stock, active, is_demo)
    VALUES ('Old Merch', '', 'merchandise', '', 25, 1, true, true)
  `), { code: '23514' });
  await assert.rejects(db.query(`
    INSERT INTO rewards (title, description, kind, terms, point_cost, stock, active, is_demo)
    VALUES ('Costless Merch', '', 'merch', '', NULL, NULL, true, true)
  `), { code: '23514' });
  await assert.rejects(db.query(`
    INSERT INTO rewards (title, description, kind, terms, point_cost, stock, active, is_demo)
    VALUES ('Zero Cost Merch', '', 'merch', '', 0, NULL, true, true)
  `), { code: '23514' });
  await assert.rejects(db.query(`
    INSERT INTO rewards (title, description, kind, terms, point_cost, stock, active, is_demo)
    VALUES ('Negative Stock Merch', '', 'merch', '', 25, -1, true, true)
  `), { code: '23514' });

  const newRedemptionId = randomUUID();
  const { rows: [newTx] } = await db.query<{ id: string }>(`
    INSERT INTO point_transactions (user_id, delta, reason, source_type, source_id)
    VALUES ('legacy-fan', -25, 'New claim', 'redemption', $1)
    RETURNING id
  `, [newRedemptionId]);
  const { rows: [defaulted] } = await db.query<{ status: string }>(`
    INSERT INTO reward_redemptions (id, user_id, reward_id, point_transaction_id, idempotency_key)
    VALUES ($1, 'legacy-fan', $2, $3, $4)
    RETURNING status
  `, [newRedemptionId, unlimited.id, newTx.id, randomUUID()]);
  assert.equal(defaulted.status, 'requested');

  await db.query(`UPDATE reward_redemptions SET status = 'fulfilled' WHERE id = $1`, [newRedemptionId]);
  await db.query(`UPDATE reward_redemptions SET status = 'canceled' WHERE id = $1`, [newRedemptionId]);

  const rejectedRedemptionId = randomUUID();
  const { rows: [rejectedTx] } = await db.query<{ id: string }>(`
    INSERT INTO point_transactions (user_id, delta, reason, source_type, source_id)
    VALUES ('legacy-fan', -25, 'Rejected claim', 'redemption', $1)
    RETURNING id
  `, [rejectedRedemptionId]);
  await assert.rejects(db.query(`
    INSERT INTO reward_redemptions (id, user_id, reward_id, point_transaction_id, idempotency_key, status)
    VALUES ($1, 'legacy-fan', $2, $3, $4, 'claimed')
  `, [rejectedRedemptionId, unlimited.id, rejectedTx.id, randomUUID()]), { code: '23514' });
});
