CREATE TABLE call_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    provider_call_id text UNIQUE,
    room_name text UNIQUE,
    mode text NOT NULL DEFAULT 'fixture',
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'dialing', 'connected', 'completed', 'missed', 'failed', 'canceled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    attempted_at timestamptz,
    connected_at timestamptz,
    ended_at timestamptz,
    failure_code text
);
CREATE UNIQUE INDEX call_attempts_one_active_idx ON call_attempts (application_id)
    WHERE status IN ('queued', 'dialing', 'connected');
CREATE INDEX call_attempts_application_history_idx ON call_attempts (application_id, created_at DESC);

CREATE TABLE jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    call_attempt_id uuid UNIQUE NOT NULL REFERENCES call_attempts (id) ON DELETE CASCADE,
    kind text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'leased', 'done', 'failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_expires_at timestamptz,
    lease_token uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_available_idx ON jobs (available_at) WHERE status = 'pending';
CREATE INDEX jobs_leases_idx ON jobs (lease_expires_at) WHERE status = 'leased';

CREATE TABLE processed_provider_events (
    event_id text PRIMARY KEY,
    call_attempt_id uuid NOT NULL REFERENCES call_attempts (id) ON DELETE CASCADE,
    body_hash text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (event_id, call_attempt_id)
);
CREATE INDEX processed_provider_events_attempt_idx ON processed_provider_events (call_attempt_id);

CREATE TABLE transcript_segments (
    id text PRIMARY KEY,
    call_attempt_id uuid NOT NULL REFERENCES call_attempts (id) ON DELETE CASCADE,
    sequence integer NOT NULL CHECK (sequence >= 0),
    speaker text NOT NULL,
    text text NOT NULL,
    occurred_at timestamptz NOT NULL,
    FOREIGN KEY (id, call_attempt_id) REFERENCES processed_provider_events (event_id, call_attempt_id) ON DELETE CASCADE,
    UNIQUE (call_attempt_id, sequence)
);

CREATE TABLE interview_results (
    call_attempt_id uuid PRIMARY KEY REFERENCES call_attempts (id) ON DELETE CASCADE,
    processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'ready', 'failed')),
    schema_version integer,
    summary text,
    interests jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(interests) = 'array'),
    unanswered_question_ids jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(unanswered_question_ids) = 'array'),
    review_notes jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(review_notes) = 'array'),
    failure_code text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE answers (
    call_attempt_id uuid NOT NULL REFERENCES interview_results (call_attempt_id) ON DELETE CASCADE,
    question_id text NOT NULL,
    summary text,
    transcript_segment_ids jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(transcript_segment_ids) = 'array'),
    completeness text NOT NULL CHECK (completeness IN ('answered', 'partial', 'skipped', 'not_asked')),
    PRIMARY KEY (call_attempt_id, question_id)
);
