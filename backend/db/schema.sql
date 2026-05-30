-- Tea Auction Tool - PostgreSQL Schema
-- Run: psql -U teauser -d teadb -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ───────────────────────────────────────────────
-- CATALOGUE (uploaded every Thursday)
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogue (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_no       VARCHAR(20),
  week_date     DATE,
  garden        VARCHAR(120),
  grade         VARCHAR(50),
  mark          VARCHAR(100),
  invoice_no    VARCHAR(50),
  bags          INTEGER,
  net_wt        NUMERIC(10,2),
  broker        VARCHAR(100),
  upset_price   NUMERIC(10,2),
  last_sale_price NUMERIC(10,2),
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(sale_no, garden, grade, mark, invoice_no)
);

-- ───────────────────────────────────────────────
-- SOLD LIST (current week auction results)
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sold_list (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_no       VARCHAR(20),
  week_date     DATE,
  garden        VARCHAR(120),
  grade         VARCHAR(50),
  mark          VARCHAR(100),
  invoice_no    VARCHAR(50),
  bags          INTEGER,
  net_wt        NUMERIC(10,2),
  broker        VARCHAR(100),
  deal_price    NUMERIC(10,2),
  buyer_code    VARCHAR(50),
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(sale_no, garden, grade, mark, invoice_no)
);

-- ───────────────────────────────────────────────
-- MERGED VIEW: catalogue + last sold price
-- ───────────────────────────────────────────────
CREATE OR REPLACE VIEW catalogue_with_prices AS
SELECT
  c.id,
  c.sale_no,
  c.week_date,
  c.garden,
  c.grade,
  c.mark,
  c.invoice_no,
  c.bags,
  c.net_wt,
  c.broker,
  c.upset_price,
  c.last_sale_price,
  -- Suggest price: midpoint of min and max last_sale_price for this grade+mark
  (
    SELECT MIN(c2.last_sale_price)
    FROM catalogue c2
    WHERE c2.grade = c.grade AND c2.mark = c.mark AND c2.last_sale_price IS NOT NULL
  ) AS min_last_price,
  (
    SELECT MAX(c2.last_sale_price)
    FROM catalogue c2
    WHERE c2.grade = c.grade AND c2.mark = c.mark AND c2.last_sale_price IS NOT NULL
  ) AS max_last_price,
  s.deal_price AS current_sold_price,
  s.buyer_code
FROM catalogue c
LEFT JOIN sold_list s
  ON s.garden = c.garden AND s.grade = c.grade AND s.mark = c.mark AND s.sale_no = c.sale_no;

-- ───────────────────────────────────────────────
-- PARTIES
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parties (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  party_name  VARCHAR(150) NOT NULL,
  party_code  VARCHAR(50) UNIQUE NOT NULL,
  contact     VARCHAR(100),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ───────────────────────────────────────────────
-- PARTY-GARDEN MAPPING
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS party_garden_mapping (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  party_id    UUID REFERENCES parties(id) ON DELETE CASCADE,
  garden      VARCHAR(120) NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(party_id, garden)
);

-- ───────────────────────────────────────────────
-- MARKINGS
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS markings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marking_date    DATE DEFAULT CURRENT_DATE,
  sale_no         VARCHAR(20),
  party_id        UUID REFERENCES parties(id),
  party_name      VARCHAR(150),
  party_code      VARCHAR(50),
  garden          VARCHAR(120),
  grade           VARCHAR(50),
  mark            VARCHAR(100),
  price_min       NUMERIC(10,2),
  price_max       NUMERIC(10,2),
  max_mark_space  INTEGER,
  broker          VARCHAR(100),
  bags            INTEGER,
  net_wt          NUMERIC(10,2),
  suggested_price NUMERIC(10,2),
  final_price     NUMERIC(10,2),
  status          VARCHAR(30) DEFAULT 'pending',  -- pending, confirmed, skipped
  label_printed   BOOLEAN DEFAULT FALSE,
  ai_suggested    BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ───────────────────────────────────────────────
-- IMPORT LOG
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_type     VARCHAR(20),  -- 'catalogue' or 'sold_list'
  filename      VARCHAR(255),
  rows_imported INTEGER,
  rows_skipped  INTEGER,
  sale_no       VARCHAR(20),
  week_date     DATE,
  imported_at   TIMESTAMP DEFAULT NOW()
);

-- ───────────────────────────────────────────────
-- INDEXES
-- ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_catalogue_garden_grade ON catalogue(garden, grade);
CREATE INDEX IF NOT EXISTS idx_catalogue_sale_no ON catalogue(sale_no);
CREATE INDEX IF NOT EXISTS idx_sold_list_sale_no ON sold_list(sale_no);
CREATE INDEX IF NOT EXISTS idx_markings_sale_no ON markings(sale_no);
CREATE INDEX IF NOT EXISTS idx_markings_party ON markings(party_id);
CREATE INDEX IF NOT EXISTS idx_pgm_party ON party_garden_mapping(party_id);
