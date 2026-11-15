# Sourced FaZe CS2 data — first import bundle

`faze-cs2-2026-11-15.json` contains real published statistics manually transcribed from the linked sources. It is not synthetic fixture data, a SerpAPI response, or a live telemetry feed. Collection time and source references are embedded in the file.

## What is included

The [HLTV team page](https://www.hltv.org/team/6667/faze) listed frozen, Twistzz, Neityu, jcobbb and JBOEN as starters, broky as benched, and enkay J as coach when checked. Player roles are left unknown where not independently confirmed. Historical players were not labeled active based on the earlier proposed roster.

The stat snapshots use the **all-time CS2 / all teams** overview filter, not only the current FaZe stint. Do not compare these to the team page's different sample window.

| Player / stable ID | Maps | HLTV Rating 3.0 | ADR | KAST | Source |
|---|---:|---:|---:|---:|---|
| frozen / `hltv-9960` | 593 | 1.16 | 80.1 | 74.8% | [Overview](https://www.hltv.org/stats/players/9960/frozen?csVersion=CS2) |
| Twistzz / `hltv-10394` | 584 | 1.16 | 78.4 | 74.8% | [Overview](https://www.hltv.org/stats/players/10394/twistzz?csVersion=CS2) |
| Neityu / `hltv-21972` | 804 | 1.07 | 74.6 | 73.5% | [Overview](https://www.hltv.org/stats/players/21972/neityu?csVersion=CS2) |
| jcobbb / `hltv-22383` | 426 | 1.08 | 76.1 | 72.3% | [Overview](https://www.hltv.org/stats/players/22383/jcobbb?csVersion=CS2) |
| JBOEN / `hltv-22866` | 379 | 1.11 | 72.9 | 70.9% | [Overview](https://www.hltv.org/stats/players/22866/jboen?csVersion=CS2) |

Kills/deaths per round are also included. **K/D and headshot percentage remain null** in this bundle because those values were not verified in the captured overview snapshots. Do not approximate K/D from rounded KPR/DPR. Advanced-page values should be imported separately with their own sample size/source/refresh metadata after verification.

Some source pages were returned from the browsing tool's cache, with crawl hints ranging from today to last month. `observedAt` is our collection time, not the source's last update time. `sourceUpdatedAt` is null where unknown. Preserve the crawl hint and limitations in the UI and AI context. Never label the collection timestamp as a guaranteed live-stat timestamp.

## Validate without database access

From `backend/`:

```powershell
npm.cmd run import:esports -- data/faze-cs2-2026-11-15.json
```

Use `npm` on macOS/Linux. Default behavior is a dry run: validate the entire file, resolve references and calculate deterministic snapshot IDs, with no database connection or writes.

## Import into the configured database

Configure the intended backend `.env` securely and confirm its database/schema target first. The checked-out project currently does not contain the team's Tiger credentials. No shared/deployed database was changed during collection.

```powershell
npm.cmd run migrate
npm.cmd run import:esports -- data/faze-cs2-2026-11-15.json --write
```

Migration **010_esports_data.sql** adds independent `esports_players` and `esports_stat_snapshots` tables; tell Jason this migration number is now used. Existing applied migrations remain unchanged. Imports validate before writing and commit transactionally. Identical imports do not duplicate snapshots. An older roster observation cannot overwrite a newer player profile. Stat snapshots retain their source evidence and deterministic content IDs.

An import only updates listed player records; it does not infer that an omitted player has left. Explicitly include status changes such as `former`/`benched` in the next manually verified roster bundle. This avoids inferring transfers from incomplete source results.

## Khoi: public API contract

After migration/import and API restart:

- `GET /players` → `{players:[{id,handle,displayName,rosterStatus,checkedAt,profile}],freshness}`. Active records are listed first, then coach, bench and former records.
- `GET /players/:id` → player identity, roster status, verified source record and checked timestamp.
- `GET /players/:id/stats` → latest snapshot with `snapshotId`, `playerId`, `period`, `mapsPlayed`, `metrics`, `source`, `observedAt`, `isDemo:false`, and `limitations`.
- `GET /players/:id/stats?snapshotId=<64-character hash>` → a specific immutable imported snapshot belonging to that player.

Each metric is a nullable number except `ratingDefinition`, which labels the provider's method. Percentage values are on a 0–100 scale. Render null as unavailable, not zero. Coach/bench records without stat snapshots return `404 STATS_UNAVAILABLE`, not fake player statistics. The ID is an opaque string, not a UUID.

The live frontend adapter now maps these records into the player pages. Missing period dates and metrics remain null; source links, collection time and freshness limitations are displayed. Player photos remain unavailable unless separately supplied. No upcoming match times, brackets, highlights, follows or points were fabricated or added in this first data bundle.

## Minh: evidence for AI

Use the returned immutable snapshot ID and its source metadata as AI context. Explain the supplied all-time figures, with the sample-size and freshness limitations. One aggregate snapshot does not establish a time trend. Do not generate missing numerical values, infer a recent tournament result, or describe all-time cross-team statistics as current-team form.

## Verification

Backend TypeScript and the import dry run pass. Real PostgreSQL tests verify repeat imports, malformed/unknown-source rejection, stable snapshots, source-linked read endpoints, player ownership of snapshot IDs, missing coach stats, preserved newer roster records, and retained historical snapshots. Existing backend interview/application tests also pass. These tests use disposable TLS PostgreSQL schemas, not the team's shared Tiger service.

Migration 011 adds `engagement_players`, a view over the imported roster IDs used by the follows API. Apply it with `npm run migrate` before testing follows. See [deployment steps](../DEPLOYMENT.md) to import into the deployed backend's existing schema without switching its user database.

## Sourced match calendar (migration 012)

`faze-calendar-2026-11-15.json` adds FaZe vs Wildcard on 24 November 2026 at 07:00 UTC, and the 1-2 result against Falcons on 3 November 2026. Each record includes its HLTV match link and a Liquipedia timing reference. The IEM Beijing page supplies FaZe's 13-16th placement; the Singapore Stage 1 page supplies the upcoming Swiss stage. Calendar observations were collected separately from the earlier all-time player stats. They are snapshots, not a live feed.

The future match's published lineup is associated with the five active players. Historical associations are restricted to frozen, whose match history was verified. Benched players and coaches are not automatically assigned fixtures. Tournament team lists are the verified subset needed by these records, not a full event field. No individual attendance, recent player metrics, prediction settlement, or other bracket positions are inferred.

```sh
npm run migrate
npm run import:esports -- data/faze-cs2-2026-11-15.json --write
npm run import:calendar -- data/faze-calendar-2026-11-15.json
npm run import:calendar -- data/faze-calendar-2026-11-15.json --write
```

The first calendar command is a dry run. Imports validate references and outcomes, write transactionally, and prevent older observations from overwriting newer records. `/esports/matches` returns `{matches}`; `/players/:id/matches` returns `{matches,tournaments}` in the frontend contract. Unknown players return 404; known players without associations return empty lists. Match IDs and option IDs are shared with the prediction reference views. Staff can create a sourced `match_winner` market with reference ID `hltv-match-2400500`; the market must lock no later than its scheduled start. External results never automatically award points.

The roster bundle also corrects frozen's display name to David Čerňanský using his linked HLTV player profile. Reimport it to update the name; existing immutable stat snapshots remain unchanged.

Minh's highlights integration must expose `GET /players/:id/highlights` with `{playerId,fetchedAt,items}`. Installing a YouTube API key alone does not register this route. The frontend also expects `GET /players/:id/insights?snapshotId=...` for analysis. These provider integrations remain owned by Minh.
