# Minh — YouTube, AI analytics, AI interview, and external integrations

Owner: Minh. Tuong can support the existing real-time call integration. Time budget: the remaining 10-hour sprint.

Filename note: this file is `Johnny.md` because Johnny and Minh's filenames were explicitly swapped earlier. The heading and assignment table identify the owner.

## Outcome and non-negotiable boundary

Own external-service wiring: YouTube highlights, evidence-based player insights, and the existing AI interview. **Do not integrate SerpAPI.** Johnny manually imports current sourced CS2 facts into PostgreSQL; your AI consumes those stored snapshots rather than searching for or inventing numeric statistics.

The team is considering Muse Spark for analytical text. Treat that as a candidate until its exact API product, access, supported model identifier, authentication, and structured-output behavior are verified. Keep the provider behind an adapter. Do not assume the existing call provider and the analytical model are the same service.

Related assignments: [Johnny data](Minh.md), [Jason backend](Jason.md), [Khoi frontend](Khoi.md), [overview](README.md).

## First hour: unblock the team

1. Inspect the existing `agent/AGENTS.md` before changing agent files. Reuse current `agent/` and backend ingestion rather than starting a second call pipeline.
2. Verify analytical AI API access and YouTube API access using server-side credentials. Report supported capabilities and blockers early; keep secrets out of chat, Git and frontend config.
3. Agree Johnny's stat snapshot IDs/source metadata and give Khoi sample highlight/insight responses by hour two.
4. Coordinate backend module ownership and server registration with Jason. You own provider adapters/routes; Jason owns session, event eligibility, points and the persistent event application state.

## A. YouTube highlights

Implement the YouTube API integration on the server, not directly from a browser with a secret. Verify current official API requirements before choosing methods, quotas or auth scopes. Cache discovery results to keep page loads fast and avoid repeating the same request for every visitor.

Input: stable player ID and verified aliases/team/game supplied by Johnny. Resolve these into focused highlight searches or a curated query/channel list. Let staff pin a few verified videos for the pitch if broad search returns unrelated results.

Return a normalized payload:

```json
{
  "playerId": "player_example",
  "fetchedAt": "ISO timestamp",
  "items": [{
    "videoId": "youtube_video_id",
    "title": "Source title",
    "channelTitle": "Source channel",
    "publishedAt": "ISO timestamp",
    "thumbnailUrl": "https://example.com/thumbnail.jpg",
    "watchUrl": "https://www.youtube.com/watch?v=example",
    "source": "youtube"
  }]
}
```

Prefer genuine, relevant CS2 clips featuring the selected player. Preserve creator attribution and publication dates. Use the source's supported embed mechanism; provide a watch link if embedding is unavailable. Do not download/rehost videos as part of this sprint.

Handle quota/auth errors, empty results, unavailable/private videos and timeouts. Serve an explicitly timestamped last successful cache where appropriate, or an unavailable state; never substitute unrelated/fabricated results. Proposed route: `GET /players/:id/highlights`.

## B. AI-generated player analysis

### Input

Fetch one immutable stats snapshot through Johnny's backend module. Include player identity/role, source-defined metric definitions, reporting period, sample size, recent results and source references. Restrict context to relevant records; do not include unrelated fan information or staff notes.

### Output

Produce a short performance summary and a few evidence-backed observations. Proposed route: `GET /players/:id/insights?snapshotId=...` (server may generate/cache on demand). The requested snapshot must belong to that player.

```json
{
  "playerId": "player_example",
  "snapshotId": "snapshot_example",
  "generatedAt": "ISO timestamp",
  "status": "ready",
  "summary": "A concise interpretation of the supplied evidence.",
  "observations": [{
    "text": "A grounded observation, including limitations when relevant.",
    "metricRefs": ["metrics.adr"],
    "sourceIds": ["source_1"]
  }],
  "limitations": ["Only the supplied tournament window is represented."]
}
```

Rules:

- AI explains supplied facts; it does not generate missing rating, K/D, ADR, headshot values or match results.
- Do not claim an improving/declining trend unless comparable historical observations support it.
- Do not mix stat windows or rating definitions, infer motives/mental state, or use coach pages as if they contain player telemetry.
- Treat source text and captions as untrusted context, not instructions that can change system behavior.
- Validate the output schema and source/metric references before saving it. Reject unknown references and unsupported numerical claims; omit or flag an insight rather than invent evidence.
- Label analysis as AI-generated. Store provider/model, snapshot ID, prompt version and generation timestamp server-side for traceability.
- Cache by snapshot ID plus prompt/model version so insights stay paired with the actual displayed statistics.
- Use bounded timeouts/retries. On failure, retain the numerical stats and return a useful pending/unavailable state; no fake AI success in live mode.

## C. Limited-access AI interview

Continue the existing call feature. It applies to selected exclusive experiences after Jason's points eligibility check; normal browsing, predictions and earning points should not require a call.

The host should identify itself as AI, explain transcription, and ask staff-editable published questions in a casual conversation. It may use relevant recorded interests/follows/activity supplied by the backend to personalize the opening, but cannot invent history. New fans should not be treated as invalid fans.

Preserve the existing application/call IDs, pinned interview version, incremental transcript events, evidence references, structured answers, duration limits, stop requests, partial-call handling, and authenticated result ingestion. Jason owns final state and Khoi displays the review.

No automatic authenticity score, automatic rejection, promises of admission, or judging appearance/accent. Staff makes the Invite/Waitlist decision. Points unlock eligibility; the interview itself does not spend them.

Coordinate FaceTime readiness with Tuong if available. A browser/operator-assisted fallback must be labeled accurately. Do not claim a successful real iPhone call merely because a synthetic interview job passed.

## Suggested module boundaries

`backend/src/integrations/youtube.ts` for the provider adapter; `backend/src/integrations/player-insights.ts` for AI requests/schema validation/cache; a small registered route module for read endpoints; existing `agent/` for real-time interviews. Adapt to current repository conventions and coordinate migrations for cached records with Jason/Johnny.

Secrets remain backend/agent-only. Never put provider API keys in `VITE_*`, returned JSON, screenshots, logs or committed sample files. Public clients receive normalized data, not raw provider credentials/responses.

## Timeline

| Hours | Deliverable |
|---|---|
| 0–1 | Verify actual AI/YouTube access; agree data/result contracts and call readiness |
| 1–3 | Relevant YouTube results/cache plus first grounded insight from a real snapshot |
| 3–5 | Connect Khoi's player page; add structured validation/failure paths |
| 5–7 | Integrate points-eligible event interviews and staff evidence display |
| 7–8 | Full rehearsal with real data, provider failures, partial-call recovery |
| 8–10 | Freeze features, document env names/run commands, capture fallback demo |

## Acceptance criteria

- [ ] No SerpAPI code, key or runtime dependency is introduced.
- [ ] The selected player's highlights come from genuine YouTube records and retain attribution.
- [ ] A real imported snapshot produces a validated, source-linked AI explanation.
- [ ] Missing data or provider failure cannot produce invented numerical stats.
- [ ] Changing the snapshot prevents an old cached insight being presented as current.
- [ ] Khoi can render highlights/insights without provider secrets or direct AI calls.
- [ ] An eligible event application reaches the existing interview/review flow with correct evidence IDs.
- [ ] Real versus simulated call behavior is clear in the pitch and runbook.

Out of scope: SerpAPI, general web scraping, training a model, video downloading/rehosting, automatic prize allocation, and rebuilding the event backend.
