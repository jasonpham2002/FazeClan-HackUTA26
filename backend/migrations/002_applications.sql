CREATE TABLE events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text NOT NULL,
    location text NOT NULL,
    starts_at timestamptz NOT NULL,
    capacity integer NOT NULL CHECK (capacity >= 0),
    deadline timestamptz NOT NULL CHECK (deadline <= starts_at),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    draft jsonb CHECK (jsonb_typeof(draft) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    is_demo boolean NOT NULL DEFAULT false
);

CREATE TABLE interview_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    version integer NOT NULL CHECK (version > 0),
    intro text NOT NULL,
    tone text NOT NULL,
    max_duration_seconds integer NOT NULL CHECK (max_duration_seconds BETWEEN 60 AND 300),
    published_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, event_id),
    UNIQUE (event_id, version)
);

CREATE TABLE questions (
    id text NOT NULL,
    version_id uuid NOT NULL REFERENCES interview_versions (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    prompt text NOT NULL,
    purpose text NOT NULL,
    position integer NOT NULL CHECK (position BETWEEN 1 AND 6),
    required boolean NOT NULL,
    max_follow_ups integer NOT NULL CHECK (max_follow_ups BETWEEN 0 AND 2),
    PRIMARY KEY (version_id, id),
    UNIQUE (version_id, position)
);

-- A publish transaction inserts its questions before sealing the version row.
CREATE FUNCTION protect_published_questions() RETURNS trigger LANGUAGE plpgsql
SET search_path FROM CURRENT AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT EXISTS (SELECT 1 FROM interview_versions WHERE id = NEW.version_id) THEN
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF NOT EXISTS (SELECT 1 FROM interview_versions WHERE id = OLD.version_id) THEN
            RETURN OLD;
        END IF;
    END IF;
    RAISE EXCEPTION 'Published questions are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER protect_published_questions BEFORE INSERT OR UPDATE OR DELETE ON questions
    FOR EACH ROW EXECUTE FUNCTION protect_published_questions();

CREATE FUNCTION protect_published_version() RETURNS trigger LANGUAGE plpgsql
SET search_path FROM CURRENT AS $$
BEGIN
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM events WHERE id = OLD.event_id) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Published interview versions are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER protect_published_version BEFORE UPDATE OR DELETE ON interview_versions
    FOR EACH ROW EXECUTE FUNCTION protect_published_version();

CREATE TABLE applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    interview_version_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'interview_pending', 'review_pending', 'invited', 'waitlisted', 'accepted')),
    submitted_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz,
    CHECK ((status = 'accepted') = (accepted_at IS NOT NULL)),
    FOREIGN KEY (interview_version_id, event_id) REFERENCES interview_versions (id, event_id),
    UNIQUE (id, user_id),
    UNIQUE (user_id, event_id)
);
CREATE INDEX applications_event_status_idx ON applications (event_id, status);

CREATE TABLE consents (
    application_id uuid PRIMARY KEY,
    user_id text NOT NULL,
    consent_version text NOT NULL,
    accepted_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (application_id, user_id) REFERENCES applications (id, user_id) ON DELETE CASCADE
);

CREATE TABLE decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    decision text NOT NULL CHECK (decision IN ('invited', 'waitlisted')),
    reviewer_id text REFERENCES "user" (id) ON DELETE SET NULL,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decisions_application_history_idx ON decisions (application_id, created_at DESC);

CREATE TABLE activity_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    event_id uuid REFERENCES events (id) ON DELETE CASCADE,
    type text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    source text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
    is_demo boolean NOT NULL DEFAULT false
);
CREATE INDEX activity_user_history_idx ON activity_events (user_id, occurred_at DESC);
