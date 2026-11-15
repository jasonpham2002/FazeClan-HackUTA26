CREATE TABLE esports_tournaments (
    id text PRIMARY KEY,
    checked_at timestamptz NOT NULL,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object')
);
CREATE TABLE esports_matches (
    id text PRIMARY KEY,
    tournament_id text NOT NULL REFERENCES esports_tournaments(id),
    starts_at timestamptz NOT NULL,
    checked_at timestamptz NOT NULL,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object')
);
CREATE INDEX esports_matches_start_idx ON esports_matches(starts_at,id);
CREATE VIEW engagement_matches AS
    SELECT id, payload->>'title' AS title, starts_at,
           payload->'participants' AS participants, false AS is_demo
    FROM esports_matches;
CREATE VIEW engagement_tournaments AS
    SELECT id, payload->>'name' AS title, payload->'teams' AS teams, false AS is_demo
    FROM esports_tournaments;
