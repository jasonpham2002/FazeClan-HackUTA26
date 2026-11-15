import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";

export function validateSchema(schema: string): string {
  if (!/^(?:faze|faze_test_[a-z0-9_]{1,53})$/.test(schema)) {
    throw new Error("DB_SCHEMA must be faze or a disposable faze_test_* schema");
  }
  return schema;
}

export function createPool(databaseUrl: string, schema: string): Pool {
  validateSchema(schema);
  const url = URL.parse(databaseUrl);
  if (!url || !["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname ||
      !url.username || !url.password || url.pathname.length < 2) {
    throw new Error("DATABASE_URL must contain the Tiger Cloud PostgreSQL connection details");
  }

  // Pass connection settings separately so URI parameters cannot override TLS or search_path.
  const ca = process.env.DATABASE_CA_FILE;
  const pool = new Pool({
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: { rejectUnauthorized: true, ca: ca ? readFileSync(ca, "utf8") : undefined },
    options: `-c search_path=${schema}`,
    max: 5,
    connectionTimeoutMillis: 5000,
  });
  pool.on("error", () => console.error("An idle PostgreSQL connection closed"));
  return pool;
}

export async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
