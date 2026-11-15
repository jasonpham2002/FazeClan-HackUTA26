import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { createPool, transaction, validateSchema } from "./db.ts";

const migrationDirectory = new URL("../migrations/", import.meta.url);

export async function migrate(db: Pool, schema: string): Promise<void> {
  validateSchema(schema);
  const names = (await readdir(migrationDirectory)).filter((name) => /^\d{3}_[a-z_]+\.sql$/.test(name)).sort();
  const migrations = await Promise.all(names.map(async (name) => {
    const sql = await readFile(new URL(name, migrationDirectory), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
  if (!migrations.length) throw new Error("No database migrations found");

  await transaction(db, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`migration:${schema}`]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}`);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    const { rows } = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM schema_migrations",
    );
    const applied = new Map(rows.map(({ name, checksum }) => [name, checksum]));
    for (const migration of migrations) {
      const checksum = applied.get(migration.name);
      if (checksum && checksum !== migration.checksum) {
        throw new Error(`Applied migration ${migration.name} has changed`);
      }
      if (!checksum) {
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [
          migration.name, migration.checksum,
        ]);
      }
    }
  });
}

export async function dropTestSchema(db: Pool, schema: string): Promise<void> {
  validateSchema(schema);
  if (!schema.startsWith("faze_test_")) throw new Error("Only disposable test schemas can be dropped");
  await transaction(db, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`migration:${schema}`]);
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  });
}

if (import.meta.main) {
  const schema = process.env.DB_SCHEMA ?? "faze";
  const db = createPool(process.env.DATABASE_URL ?? "", schema);
  try {
    await migrate(db, schema);
    console.log(`Migrations are current in schema ${schema}`);
  } finally {
    await db.end();
  }
}
