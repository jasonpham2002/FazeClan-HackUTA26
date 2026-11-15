import type { Pool } from "pg";
import { createPool, transaction } from "./db.ts";

export const demoEventId = "f0000000-0000-4000-8000-000000000001";
export const demoVersionId = "f0000000-0000-4000-8000-000000000002";
export const demoRewardId = "f0000000-0000-4000-8000-000000000005";

const demoUsers = [
  { id: "demo-fan", email: "fan@example.test", name: "Demo Fan", role: "fan" },
  { id: "demo-invited", email: "invited@example.test", name: "Demo Invitee", role: "fan" },
  { id: "demo-waitlisted", email: "waitlisted@example.test", name: "Demo Waitlisted Fan", role: "fan" },
  { id: "demo-staff", email: "staff@example.test", name: "Demo Reviewer", role: "staff" },
];

const demoQuestions = {
  intro: "Thanks for applying to Community Night!",
  tone: "friendly and casual",
  maxDurationSeconds: 180,
  questions: [
    { id: "q_1", prompt: "What FaZe content do you enjoy?", purpose: "Learn their interests", order: 1, required: true, maxFollowUps: 1 },
    { id: "q_2", prompt: "What made you apply for Community Night?", purpose: "Understand their motivation", order: 2, required: true, maxFollowUps: 1 },
    { id: "q_3", prompt: "Which activity would you like to try at the event?", purpose: "Learn event preferences", order: 3, required: true, maxFollowUps: 1 },
    { id: "q_4", prompt: "Is there anything else you would like staff to know?", purpose: "Offer an open response", order: 4, required: false, maxFollowUps: 0 },
  ],
};

export async function seed(db: Pool): Promise<void> {
  await transaction(db, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':seed', 0))");
    for (const user of demoUsers) {
      await client.query(`INSERT INTO "user" (id, email, name, role, "emailVerified")
        VALUES ($1, $2, $3, $4, true) ON CONFLICT (id) DO NOTHING`, [user.id, user.email, user.name, user.role]);
    }

    await client.query(`INSERT INTO events (id, title, description, location, starts_at, capacity, deadline, status, draft, is_demo)
      VALUES ($1, 'Community Night', 'Synthetic event for the local interview demo.', 'UT Arlington',
        now() + interval '7 days', 5, now() + interval '6 days', 'published', $2, true)
      ON CONFLICT (id) DO NOTHING`, [demoEventId, JSON.stringify(demoQuestions)]);

    const event = await client.query<{ is_demo: boolean }>("SELECT is_demo FROM events WHERE id = $1 FOR UPDATE", [demoEventId]);
    if (!event.rows[0]?.is_demo) throw new Error("The reserved demo event ID belongs to non-demo data");

    const version = await client.query("SELECT id FROM interview_versions WHERE id = $1", [demoVersionId]);
    if (!version.rows.length) {
      for (const question of demoQuestions.questions) {
        await client.query(`INSERT INTO questions (id, version_id, prompt, purpose, position, required, max_follow_ups)
          VALUES ($1, $2, $3, $4, $5, $6, $7)`, [question.id, demoVersionId, question.prompt, question.purpose,
          question.order, question.required, question.maxFollowUps]);
      }
      await client.query(`INSERT INTO interview_versions (id, event_id, version, intro, tone, max_duration_seconds)
        VALUES ($1, $2, 1, $3, $4, $5)`, [demoVersionId, demoEventId, demoQuestions.intro, demoQuestions.tone,
        demoQuestions.maxDurationSeconds]);
    }

    const examples = [
      { userId: "demo-invited", applicationId: "f0000000-0000-4000-8000-000000000003", decision: "invited" },
      { userId: "demo-waitlisted", applicationId: "f0000000-0000-4000-8000-000000000004", decision: "waitlisted" },
    ];
    for (const { userId, applicationId, decision } of examples) {
      const application = await client.query(`INSERT INTO applications (id, user_id, event_id, interview_version_id, status)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, event_id) DO NOTHING RETURNING id`,
      [applicationId, userId, demoEventId, demoVersionId, decision]);
      if (!application.rows.length) continue;
      await client.query(`INSERT INTO consents (application_id, user_id, consent_version) VALUES ($1, $2, 'ai-interview-v1')`,
        [applicationId, userId]);
      await client.query(`INSERT INTO decisions (application_id, decision, reviewer_id, reason)
        VALUES ($1, $2, 'demo-staff', 'Synthetic demo history')`, [applicationId, decision]);
      await client.query(`INSERT INTO activity_events (user_id, event_id, type, source, metadata, is_demo)
        VALUES ($1, $2, 'application_submitted', 'fixture', $3, true), ($1, $2, $4, 'fixture', $3, true)`,
      [userId, demoEventId, JSON.stringify({ applicationId }), decision]);
    }

    const { rows: [rewardsTable] } = await client.query<{ ready: boolean }>(
      "SELECT to_regclass('rewards') IS NOT NULL AS ready",
    );
    if (rewardsTable.ready) {
      const { rows: [descCol] } = await client.query<{ has_desc: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'rewards' AND column_name = 'description'
        ) AS has_desc
      `);
      if (descCol.has_desc) {
        await client.query(`
          INSERT INTO rewards (id, title, description, kind, terms, point_cost, stock, active, is_demo)
          VALUES ($1, 'Sample FaZe merch', 'Proposed merchandise benefit for the demo.', 'merchandise', 'Proposed demo benefit', 50, 10, true, true)
          ON CONFLICT (id) DO NOTHING
        `, [demoRewardId]);
      } else {
        await client.query(`
          INSERT INTO rewards (id, title, kind, terms, point_cost, stock, active, is_demo)
          VALUES ($1, 'Sample FaZe merch', 'merchandise', 'Proposed demo benefit', 50, 10, true, true)
          ON CONFLICT (id) DO NOTHING
        `, [demoRewardId]);
      }
    }
  });
}

export async function cleanupDemo(db: Pool): Promise<void> {
  await transaction(db, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':seed', 0))");
    // Keep synthetic reviewers that surviving application decisions still reference.
    for (const { id, email } of demoUsers) {
      await client.query(`DELETE FROM "user" WHERE id = $1 AND email = $2
        AND NOT EXISTS (SELECT 1 FROM decisions WHERE reviewer_id = $1)`, [id, email]);
    }
    await client.query(`DELETE FROM events WHERE id = $1 AND is_demo
      AND NOT EXISTS (SELECT 1 FROM applications WHERE event_id = $1)
      AND NOT EXISTS (SELECT 1 FROM activity_events WHERE event_id = $1)`, [demoEventId]);
    const { rows: [rewardsTable] } = await client.query<{ ready: boolean }>(
      "SELECT to_regclass('rewards') IS NOT NULL AS ready",
    );
    if (rewardsTable.ready) {
      await client.query(`DELETE FROM rewards WHERE id = $1 AND is_demo
        AND NOT EXISTS (SELECT 1 FROM reward_redemptions WHERE reward_id = $1)`, [demoRewardId]);
    }
  });
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--cleanup")) {
    throw new Error("Usage: seed.ts [--cleanup]");
  }
  const schema = process.env.DB_SCHEMA ?? "faze";
  const db = createPool(process.env.DATABASE_URL ?? "", schema);
  try {
    if (args[0] === "--cleanup") {
      await cleanupDemo(db);
      console.log(`Removed synthetic demo data from ${schema}`);
    } else {
      await seed(db);
      console.log(`Synthetic demo data is available in ${schema}`);
    }
  } finally {
    await db.end();
  }
}
