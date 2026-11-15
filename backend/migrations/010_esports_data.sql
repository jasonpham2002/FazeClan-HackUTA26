CREATE TABLE esports_players (
    id text PRIMARY KEY,
    handle text NOT NULL,
    display_name text NOT NULL,
    roster_status text NOT NULL CHECK (roster_status IN ('active','benched','coach','former')),
    checked_at timestamptz NOT NULL,
    profile jsonb NOT NULL CHECK (jsonb_typeof(profile)='object')
);
CREATE TABLE esports_stat_snapshots (
    id text PRIMARY KEY,
    player_id text NOT NULL REFERENCES esports_players(id),
    period_key text NOT NULL,
    observed_at timestamptz NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object')
);
CREATE INDEX esports_stats_latest_idx ON esports_stat_snapshots(player_id, observed_at DESC, id);
