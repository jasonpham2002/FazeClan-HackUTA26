ALTER TABLE events ADD COLUMN minimum_points integer NOT NULL DEFAULT 0 CHECK (minimum_points >= 0);

CREATE TABLE player_follows (
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    player_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, player_id)
);

CREATE TABLE prediction_markets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('match_winner', 'tournament_placement')),
    reference_id text NOT NULL,
    team_id text,
    title text NOT NULL,
    options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array'),
    locks_at timestamptz NOT NULL,
    award_points integer NOT NULL CHECK (award_points > 0),
    is_demo boolean NOT NULL,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind = 'tournament_placement') = (team_id IS NOT NULL))
);
CREATE UNIQUE INDEX prediction_match_market_idx ON prediction_markets (reference_id) WHERE kind = 'match_winner';
CREATE UNIQUE INDEX prediction_tournament_market_idx ON prediction_markets (reference_id, team_id) WHERE kind = 'tournament_placement';

CREATE TABLE predictions (
    market_id uuid NOT NULL REFERENCES prediction_markets (id),
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    option_id text NOT NULL,
    submitted_at timestamptz NOT NULL,
    PRIMARY KEY (market_id, user_id)
);

CREATE TABLE prediction_settlements (
    market_id uuid PRIMARY KEY REFERENCES prediction_markets (id),
    option_id text,
    source_url text NOT NULL,
    reviewer_id text NOT NULL,
    settled_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE point_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    delta integer NOT NULL CHECK (delta <> 0),
    reason text NOT NULL,
    source_type text NOT NULL CHECK (source_type IN ('prediction', 'attendance', 'redemption', 'adjustment')),
    source_id uuid NOT NULL,
    reviewer_id text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (user_id, source_type, source_id)
);
CREATE INDEX point_transactions_history_idx ON point_transactions (user_id, created_at DESC, id DESC);

CREATE TABLE rewards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('merchandise', 'raffle', 'early_access', 'priority')),
    terms text NOT NULL,
    point_cost integer,
    stock integer,
    active boolean NOT NULL DEFAULT true,
    is_demo boolean NOT NULL DEFAULT true,
    CHECK (
        (kind = 'merchandise' AND point_cost IS NOT NULL AND point_cost > 0 AND stock IS NOT NULL AND stock >= 0)
        OR (kind <> 'merchandise' AND point_cost IS NULL AND stock IS NULL)
    )
);

CREATE TABLE reward_redemptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    reward_id uuid NOT NULL REFERENCES rewards (id),
    point_transaction_id uuid NOT NULL UNIQUE REFERENCES point_transactions (id) ON DELETE CASCADE,
    idempotency_key uuid NOT NULL,
    status text NOT NULL DEFAULT 'claimed' CHECK (status = 'claimed'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (user_id, idempotency_key)
);
CREATE INDEX reward_redemptions_reward_idx ON reward_redemptions (reward_id, created_at DESC, id DESC);
