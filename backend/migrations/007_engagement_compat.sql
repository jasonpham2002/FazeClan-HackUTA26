ALTER TABLE rewards
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = current_schema()
      AND rel.relname = 'rewards'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%point_cost%'
  LOOP
    EXECUTE format('ALTER TABLE rewards DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE rewards
  ADD CONSTRAINT rewards_cost_stock_check CHECK (
    (kind = 'merchandise' AND point_cost IS NOT NULL AND point_cost > 0 AND stock IS NOT NULL AND stock >= 0)
    OR (kind <> 'merchandise' AND (point_cost IS NULL OR point_cost > 0) AND (stock IS NULL OR stock >= 0))
  );
