--
-- PostgreSQL database dump
--

\restrict Je8Wq8yhMjOLIjaBCDUchedAzZ4lc92TbEUdbkC4OdG4kpCIcgDe02uhvccktKX

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: catalogue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogue (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    sale_no character varying(20),
    week_date date,
    garden character varying(120),
    grade character varying(50),
    mark character varying(100),
    invoice_no character varying(50),
    bags integer,
    net_wt numeric(10,2),
    broker character varying(100),
    upset_price numeric(10,2),
    last_sale_price numeric(10,2),
    created_at timestamp without time zone DEFAULT now(),
    invoice_no_raw text
);


--
-- Name: sold_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sold_list (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    sale_no character varying(20),
    week_date date,
    garden character varying(120),
    grade character varying(50),
    mark character varying(100),
    invoice_no character varying(50),
    bags integer,
    net_wt numeric(10,2),
    broker character varying(100),
    deal_price numeric(10,2),
    buyer_code character varying(50),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: catalogue_with_prices; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.catalogue_with_prices AS
 SELECT c.id,
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
    ( SELECT min(c2.last_sale_price) AS min
           FROM public.catalogue c2
          WHERE (((c2.grade)::text = (c.grade)::text) AND ((c2.mark)::text = (c.mark)::text) AND (c2.last_sale_price IS NOT NULL))) AS min_last_price,
    ( SELECT max(c2.last_sale_price) AS max
           FROM public.catalogue c2
          WHERE (((c2.grade)::text = (c.grade)::text) AND ((c2.mark)::text = (c.mark)::text) AND (c2.last_sale_price IS NOT NULL))) AS max_last_price,
    s.deal_price AS current_sold_price,
    s.buyer_code
   FROM (public.catalogue c
     LEFT JOIN public.sold_list s ON ((((s.garden)::text = (c.garden)::text) AND ((s.grade)::text = (c.grade)::text) AND ((s.mark)::text = (c.mark)::text) AND ((s.sale_no)::text = (c.sale_no)::text))));


--
-- Name: import_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_log (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    file_type character varying(20),
    filename character varying(255),
    rows_imported integer,
    rows_skipped integer,
    sale_no character varying(20),
    week_date date,
    imported_at timestamp without time zone DEFAULT now()
);


--
-- Name: markings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.markings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    marking_date date DEFAULT CURRENT_DATE,
    sale_no character varying(20),
    party_id uuid,
    party_name character varying(150),
    party_code character varying(50),
    garden character varying(120),
    grade character varying(50),
    mark character varying(100),
    price_min numeric(10,2),
    price_max numeric(10,2),
    max_mark_space integer,
    broker character varying(100),
    bags integer,
    net_wt numeric(10,2),
    suggested_price numeric(10,2),
    final_price numeric(10,2),
    status character varying(30) DEFAULT 'pending'::character varying,
    label_printed boolean DEFAULT false,
    ai_suggested boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    invoice text,
    origin text,
    is_ai_suggestion boolean DEFAULT false
);


--
-- Name: parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parties (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    party_name character varying(150) NOT NULL,
    party_code character varying(50) NOT NULL,
    contact character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    grade_samples jsonb DEFAULT '{}'::jsonb,
    grade_ranges jsonb DEFAULT '{}'::jsonb,
    broker_list text[] DEFAULT '{}'::text[],
    bags_from integer DEFAULT 0,
    bags_to integer DEFAULT 0,
    nwt_from numeric(10,2) DEFAULT 0,
    nwt_to numeric(10,2) DEFAULT 0,
    skip_blank_lsp boolean DEFAULT true,
    skip_dup_broker_garden_grade boolean DEFAULT false,
    active boolean DEFAULT true,
    grade_bags jsonb DEFAULT '{}'::jsonb,
    grade_nwt jsonb DEFAULT '{}'::jsonb
);


--
-- Name: party_garden_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.party_garden_mapping (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    party_id uuid,
    garden character varying(120) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: catalogue catalogue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogue
    ADD CONSTRAINT catalogue_pkey PRIMARY KEY (id);


--
-- Name: catalogue catalogue_sale_no_garden_grade_mark_invoice_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogue
    ADD CONSTRAINT catalogue_sale_no_garden_grade_mark_invoice_no_key UNIQUE (sale_no, garden, grade, mark, invoice_no);


--
-- Name: import_log import_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_log
    ADD CONSTRAINT import_log_pkey PRIMARY KEY (id);


--
-- Name: markings markings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markings
    ADD CONSTRAINT markings_pkey PRIMARY KEY (id);


--
-- Name: parties parties_party_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_party_code_key UNIQUE (party_code);


--
-- Name: parties parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (id);


--
-- Name: party_garden_mapping party_garden_mapping_party_id_garden_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_garden_mapping
    ADD CONSTRAINT party_garden_mapping_party_id_garden_key UNIQUE (party_id, garden);


--
-- Name: party_garden_mapping party_garden_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_garden_mapping
    ADD CONSTRAINT party_garden_mapping_pkey PRIMARY KEY (id);


--
-- Name: sold_list sold_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold_list
    ADD CONSTRAINT sold_list_pkey PRIMARY KEY (id);


--
-- Name: sold_list sold_list_sale_no_garden_grade_mark_invoice_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold_list
    ADD CONSTRAINT sold_list_sale_no_garden_grade_mark_invoice_no_key UNIQUE (sale_no, garden, grade, mark, invoice_no);


--
-- Name: idx_catalogue_garden_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalogue_garden_grade ON public.catalogue USING btree (garden, grade);


--
-- Name: idx_catalogue_sale_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalogue_sale_no ON public.catalogue USING btree (sale_no);


--
-- Name: idx_markings_ai; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_markings_ai ON public.markings USING btree (is_ai_suggestion) WHERE (is_ai_suggestion = true);


--
-- Name: idx_markings_party; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_markings_party ON public.markings USING btree (party_id);


--
-- Name: idx_markings_sale_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_markings_sale_no ON public.markings USING btree (sale_no);


--
-- Name: idx_pgm_party; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pgm_party ON public.party_garden_mapping USING btree (party_id);


--
-- Name: idx_sold_list_sale_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sold_list_sale_no ON public.sold_list USING btree (sale_no);


--
-- Name: markings markings_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markings
    ADD CONSTRAINT markings_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.parties(id);


--
-- Name: party_garden_mapping party_garden_mapping_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_garden_mapping
    ADD CONSTRAINT party_garden_mapping_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.parties(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Je8Wq8yhMjOLIjaBCDUchedAzZ4lc92TbEUdbkC4OdG4kpCIcgDe02uhvccktKX

