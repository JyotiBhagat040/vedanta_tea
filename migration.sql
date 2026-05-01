-- ============================================================
-- Vedanta Tea Auction - Complete Database Migration
-- Safe to run multiple times (uses IF NOT EXISTS)
-- Run:  cat migration.sql | docker exec -i tea-db psql -U teauser -d teadb
-- ============================================================

-- ── Import Log ───────────────────────────────────────────────
ALTER TABLE import_log
  ADD COLUMN IF NOT EXISTS file_label TEXT DEFAULT '';

-- ── Markings ─────────────────────────────────────────────────
ALTER TABLE markings
  ADD COLUMN IF NOT EXISTS is_ai_suggestion BOOLEAN DEFAULT FALSE;

-- ── Parties ──────────────────────────────────────────────────
-- party_type: A / B / C classification (VARCHAR(1) with CHECK wins over TEXT)
ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS party_type VARCHAR(1) DEFAULT 'B'
  CHECK (party_type IN ('A', 'B', 'C'));

-- grade_garden_mapping: { "BOP": ["GARDEN1", "GARDEN2"] }
ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS grade_garden_mapping JSONB DEFAULT '{}';

-- one_lot_per_grade_garden: mark only first lot per grade+garden combo
ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS one_lot_per_grade_garden BOOLEAN DEFAULT FALSE;

-- Set defaults for any existing NULL values
UPDATE parties SET party_type            = 'B'   WHERE party_type IS NULL;
UPDATE parties SET grade_garden_mapping  = '{}'  WHERE grade_garden_mapping IS NULL;
UPDATE parties SET one_lot_per_grade_garden = FALSE WHERE one_lot_per_grade_garden IS NULL;

-- ── Indexes (performance) ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_import_log_sale_no   ON import_log(sale_no);
CREATE INDEX IF NOT EXISTS idx_catalogue_sale_no    ON catalogue(sale_no);
CREATE INDEX IF NOT EXISTS idx_catalogue_mark_grade ON catalogue(mark, grade);
CREATE INDEX IF NOT EXISTS idx_sold_list_sale_no    ON sold_list(sale_no);
CREATE INDEX IF NOT EXISTS idx_sold_list_mark_grade ON sold_list(mark, grade);
CREATE INDEX IF NOT EXISTS idx_markings_sale_no     ON markings(sale_no);
CREATE INDEX IF NOT EXISTS idx_markings_is_ai       ON markings(is_ai_suggestion)
  WHERE is_ai_suggestion = TRUE;
CREATE INDEX IF NOT EXISTS idx_pgm_party_id         ON party_garden_mapping(party_id);

-- ── Verification ──────────────────────────────────────────────
SELECT party_type, COUNT(*) AS count FROM parties GROUP BY party_type ORDER BY party_type;
SELECT 'Migration complete' AS status;

ALTER TABLE markings ADD COLUMN IF NOT EXISTS catalogue_id UUID REFERENCES catalogue(id);

-- ============================================================
-- NEW: Batch Name support + FK fix (added April 2026)
-- ============================================================

-- batch_name on all data tables — keeps separate files apart even with same sale_no
ALTER TABLE catalogue  ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT '';
ALTER TABLE sold_list  ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT '';
ALTER TABLE markings   ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT '';

-- batch_name + import_group on import_log for tracking which files were uploaded together
ALTER TABLE import_log ADD COLUMN IF NOT EXISTS import_group TEXT DEFAULT '';
ALTER TABLE import_log ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT '';

-- FIX: Drop the FK that blocks catalogue deletion when markings exist
-- ("violates foreign key constraint markings_catalogue_id_fkey")
ALTER TABLE markings DROP CONSTRAINT IF EXISTS markings_catalogue_id_fkey;

-- Indexes for fast batch filtering
CREATE INDEX IF NOT EXISTS idx_catalogue_batch  ON catalogue(sale_no, batch_name);
CREATE INDEX IF NOT EXISTS idx_sold_list_batch  ON sold_list(sale_no, batch_name);
CREATE INDEX IF NOT EXISTS idx_markings_batch   ON markings(sale_no, batch_name);

SELECT 'Batch migration complete' AS status;

-- ============================================================
-- MIGRATION: Fix unique constraints to include batch_name
-- This is the ROOT CAUSE of batches overwriting each other.
-- Run: cat migration_fix_unique.sql | docker exec -i tea-db psql -U teauser -d teadb
-- ============================================================

-- 1. Drop the OLD unique constraints that don't include batch_name
--    (These cause ON CONFLICT to match across batches, overwriting data)

-- For catalogue: find and drop the existing unique constraint/index
DO $$
BEGIN
  -- Drop unique index if it exists (common pattern)
  DROP INDEX IF EXISTS catalogue_sale_no_garden_grade_mark_invoice_no_key;
  DROP INDEX IF EXISTS catalogue_unique;
  -- Drop constraint if it exists
  ALTER TABLE catalogue DROP CONSTRAINT IF EXISTS catalogue_sale_no_garden_grade_mark_invoice_no_key;
  ALTER TABLE catalogue DROP CONSTRAINT IF EXISTS catalogue_unique;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- For sold_list: same treatment
DO $$
BEGIN
  DROP INDEX IF EXISTS sold_list_sale_no_garden_grade_mark_invoice_no_key;
  DROP INDEX IF EXISTS sold_list_unique;
  ALTER TABLE sold_list DROP CONSTRAINT IF EXISTS sold_list_sale_no_garden_grade_mark_invoice_no_key;
  ALTER TABLE sold_list DROP CONSTRAINT IF EXISTS sold_list_unique;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Ensure batch_name column exists with default
ALTER TABLE catalogue ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT '';
ALTER TABLE sold_list ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT '';
ALTER TABLE markings  ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT '';
ALTER TABLE import_log ADD COLUMN IF NOT EXISTS import_group TEXT DEFAULT '';
ALTER TABLE import_log ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT '';

-- Set any NULLs to empty string (needed for unique constraint)
UPDATE catalogue SET batch_name = '' WHERE batch_name IS NULL;
UPDATE sold_list SET batch_name = '' WHERE batch_name IS NULL;
UPDATE markings  SET batch_name = '' WHERE batch_name IS NULL;

-- 3. Create NEW unique constraints that INCLUDE batch_name
--    Now Sale 15 / "CTC Lot" and Sale 15 / "Orthodox Lot" are separate
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_sale_batch_unique
  ON catalogue(sale_no, garden, grade, mark, invoice_no, batch_name);

CREATE UNIQUE INDEX IF NOT EXISTS sold_list_sale_batch_unique
  ON sold_list(sale_no, garden, grade, mark, invoice_no, batch_name);

-- 4. Drop FK that blocks catalogue deletion
ALTER TABLE markings DROP CONSTRAINT IF EXISTS markings_catalogue_id_fkey;

-- 5. Performance indexes
CREATE INDEX IF NOT EXISTS idx_catalogue_batch  ON catalogue(sale_no, batch_name);
CREATE INDEX IF NOT EXISTS idx_sold_list_batch  ON sold_list(sale_no, batch_name);
CREATE INDEX IF NOT EXISTS idx_markings_batch   ON markings(sale_no, batch_name);

SELECT 'Unique constraint fix complete — batches are now independent' AS status;

