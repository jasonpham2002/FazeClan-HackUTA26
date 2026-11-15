import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createPool } from '../src/db.ts';
import { migrate, dropTestSchema } from '../src/migrate.ts';

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
