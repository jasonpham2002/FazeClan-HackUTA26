DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT con.oid, con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = current_schema()
      AND rel.relname = 'rewards'
      AND con.contype = 'c'
  LOOP
    IF pg_get_constraintdef(constraint_row.oid) LIKE '%kind%' OR pg_get_constraintdef(constraint_row.oid) LIKE '%point_cost%' THEN
      EXECUTE format('ALTER TABLE rewards DROP CONSTRAINT %I', constraint_row.conname);
    END IF;
  END LOOP;

  FOR constraint_row IN
    SELECT con.oid, con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = current_schema()
      AND rel.relname = 'reward_redemptions'
      AND con.contype = 'c'
  LOOP
    IF pg_get_constraintdef(constraint_row.oid) LIKE '%status%' THEN
      EXECUTE format('ALTER TABLE reward_redemptions DROP CONSTRAINT %I', constraint_row.conname);
    END IF;
  END LOOP;
END $$;

UPDATE rewards
SET kind = 'merch'
WHERE kind = 'merchandise';

ALTER TABLE rewards
  ADD CONSTRAINT rewards_kind_check CHECK (kind IN ('merch', 'raffle', 'early_access', 'priority')),
  ADD CONSTRAINT rewards_cost_stock_check CHECK (
    (kind = 'merch' AND point_cost IS NOT NULL AND point_cost > 0 AND (stock IS NULL OR stock >= 0))
    OR (kind <> 'merch' AND (point_cost IS NULL OR point_cost > 0) AND (stock IS NULL OR stock >= 0))
  );

UPDATE reward_redemptions
SET status = 'requested'
WHERE status = 'claimed';

ALTER TABLE reward_redemptions
  ALTER COLUMN status SET DEFAULT 'requested',
  ADD CONSTRAINT reward_redemptions_status_check CHECK (status IN ('requested', 'fulfilled', 'canceled'));
