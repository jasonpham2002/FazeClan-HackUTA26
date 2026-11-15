# Johnny — CS2 data, manual imports, and player APIs

Owner: Johnny (working with Codex). Time budget: the remaining 10-hour sprint.

Filename note: this file is `Minh.md` because Johnny and Minh's filenames were explicitly swapped earlier. The heading and assignment table identify the owner.

## Product and scope

FaZe ID is expanding the existing player/fan/staff platform at http://104.238.146.107/. Fans choose a current CS2 player, see sourced performance statistics first, then upcoming matches/tournament progress and activity, then videos. Predictions and verified engagement earn points for proposed rewards and limited-access experiences. The existing AI interview remains part of limited-access event applications.

**No SerpAPI.** Team members manually collect current facts from identified sources, import them into PostgreSQL, and refresh them deliberately. This is current-at-import data, not a real-time match feed. Numerical statistics come from evidence; Minh's AI explains them without inventing values.

Use the shared `web/`, `backend/`, and existing PostgreSQL schema. Preserve authentication, events, interview versioning, and staff review. The standalone `frontend/` is reference material, not the implementation target.

## Team boundaries

| Owner | Owns |
|---|---|
| Johnny | Roster/player/stat/match/tournament schemas, manual import validation, player-data read endpoints |
| Jason | Prediction markets, settlement, points ledger, rewards, QR claims, event eligibility; central backend registration/deployment |
| Khoi | All fan and staff UI; shared frontend types and adapters |
| Minh | YouTube integration, AI insight API, existing AI interview; Tuong can support calls |

Related assignments: [Jason](Jason.md), [Khoi](Khoi.md), [Minh integrations](Johnny.md), [overview](README.md).

## First hour: establish the data contract

1. Inspect current main and backend migrations before editing. Add a new migration; never rewrite an applied SQL file.
2. Agree player IDs, match IDs, tournament IDs, timestamps, stats payload, and endpoint envelopes with the others.
3. Agree migration numbers with Jason to avoid collisions. Work in a separate backend route module; give Jason its registration snippet instead of both editing server registration concurrently.
4. Verify the current CS2 roster from sources and record the verification time. The previously supplied names are candidates to check, not a guaranteed active roster. Separate active, benched/former, and coach records.
5. Select one player with complete, defensible stats as the main demo profile; cover the rest of the verified roster with honest available data.

## Data to deliver

### Player and roster records

Store stable internal ID, handle, display name, role, roster status, team, source URL, and `checkedAt`. Add image URLs only from an approved/attributed source; missing images get a deliberate placeholder.

Roster membership changes should not delete historical stats, predictions, or follows. A coach gets coach-specific context, not fabricated ADR/KD metrics. Do not hard-code everyone from an old list as currently active.

### Statistics snapshots

Store immutable snapshots containing:

- `snapshotId`, `playerId`, provider/source identifier and URL.
- Reporting period (`periodStart`, `periodEnd`, readable label) and sample size (`mapsPlayed` when known).
- Available rating, K/D, ADR, headshot percentage, and recent match results.
- Units, metric definition/rating version, `retrievedAt`, and `isDemo`.
- Missing metrics as null, not zero. Never mix different reporting periods into one apparently comparable card.

Treat rating as source-defined; do not silently combine rating versions. A trend needs at least two comparable snapshots. Preserve the prior valid snapshot if a new import fails.

Proposed shared response (agree in hour one; not an existing endpoint):

```json
{
  "playerId": "player_example",
  "snapshotId": "snapshot_example",
  "period": { "label": "Last completed tournament", "start": "ISO timestamp", "end": "ISO timestamp" },
  "mapsPlayed": 8,
  "metrics": {
    "rating": { "value": null, "definition": "source-defined rating/version" },
    "kd": { "value": null },
    "adr": { "value": null },
    "headshotPercent": { "value": null, "unit": "percent" }
  },
  "sources": [{ "id": "source_1", "url": "https://source.example/player", "retrievedAt": "ISO timestamp" }],
  "isDemo": false
}
```

The null values above illustrate missing-data behavior; they are not statistics to seed as real.

### Matches and tournament progress

Store event/tournament, participants, scheduled UTC start, stage/round, status, source, and refresh time. Separate esports matches from the platform's community events. Store externally reported results separately from Jason's staff-confirmed prediction settlement.

Give Jason stable IDs and schedule updates. The server must preserve a prediction's original lock deadline: moving a live match's schedule must not silently reopen picks. Jason owns the final lock/settlement policy.

## Manual import implementation

Create a documented server-side JSON import command with validation and a dry-run mode. Never paste database credentials into import files. Suggested modules: `backend/src/players.ts`, `backend/src/import-esports.ts`, and a new migration agreed with Jason.

Requirements:

1. Validate fields, source URLs, timestamps, IDs, metric ranges/units, duplicate entries, and references before writing.
2. Print a safe dry-run summary: rows to insert/update and validation errors, not credentials.
3. Commit each validated import transactionally. Reject an invalid bundle without partial writes.
4. Upsert stable entities idempotently; retain versioned stat snapshots and import provenance.
5. Distinguish sourced real data from synthetic demo data explicitly.
6. Provide one small valid import bundle and one deliberately invalid example for checks.
7. Do not run imports against the deployed/shared database until the validated bundle and target service/schema are confirmed within the authorized implementation session.

## Proposed endpoints

| Endpoint | Purpose |
|---|---|
| GET /players | Current roster with role/status and checked timestamp |
| GET /players/:id | Player identity, role, roster provenance |
| GET /players/:id/stats | Latest valid snapshot for the selected period |
| GET /players/:id/matches | Upcoming/recent matches and stage labels |
| GET /esports/tournaments/:id | Tournament progress and source references |

Keep existing `/events` for community events. Publish exact JSON fixtures to Khoi and Minh by hour two. Minh owns the highlights and AI-insight endpoints and consumes your player/snapshot IDs.

## Timeline and handoffs

| Hours | Deliverable |
|---|---|
| 0–1 | Verified source approach, data model, IDs, sample response contract |
| 1–3 | Migration, dry-run importer, first real player snapshot and read endpoints |
| 3–5 | Current roster import, match/tournament data, error/empty states |
| 5–7 | Connect Khoi's player page and Minh's snapshot-based AI output |
| 7–8 | Integrate match IDs with predictions; rehearse refresh and source inspection |
| 8–10 | Freeze scope, run checks, prepare deployment/import runbook and pitch |

## Acceptance criteria

- [ ] Current roster status has a source and checked timestamp; coach/benched records are labeled correctly.
- [ ] One player page has actual sourced metrics with a consistent period and sample size where known.
- [ ] Missing data remains unavailable rather than invented.
- [ ] Re-running the same import is safe; invalid imports leave no partial writes.
- [ ] All displayed matches and tournament positions have source provenance.
- [ ] Minh can retrieve a specific immutable snapshot for AI analysis.
- [ ] Khoi can render the agreed responses without fetching sources directly from the browser.
- [ ] Existing fan/staff/event flows still work after the migration.

Out of scope: SerpAPI, automated scraping infrastructure, tick-by-tick telemetry, a complete multi-game platform, and fabricated performance ratings.
