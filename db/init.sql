--
-- PostgreSQL database dump
--

\restrict VHn8xLh4d0ZgHNcXXpW2g8PEzP5mN7eRAR0v1x9lfgrFnVLeXa0IKihL9VGnP6N

-- Dumped from database version 15.17
-- Dumped by pg_dump version 15.17

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
-- Name: ai_markings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_markings (
    id integer NOT NULL,
    sale_no text,
    party_id text,
    party_name text,
    party_code text,
    garden text,
    grade text,
    mark text,
    broker text,
    bags text,
    net_wt text,
    suggested_price text,
    final_price text,
    invoice text,
    origin text,
    catalogue_id text,
    batch_name text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_markings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_markings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_markings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_markings_id_seq OWNED BY public.ai_markings.id;


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
    invoice_no_raw text,
    batch_name text DEFAULT ''::text,
    sold_list_sale_no text
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
    created_at timestamp without time zone DEFAULT now(),
    batch_name text DEFAULT ''::text
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
    imported_at timestamp without time zone DEFAULT now(),
    file_label text DEFAULT ''::text,
    import_group text DEFAULT ''::text,
    batch_name text DEFAULT ''::text,
    sold_list_sale_no text
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
    is_ai_suggestion boolean DEFAULT false,
    catalogue_id uuid,
    batch_name text DEFAULT ''::text
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
    skip_dup_broker_garden_grade boolean DEFAULT true,
    active boolean DEFAULT true,
    grade_bags jsonb DEFAULT '{}'::jsonb,
    grade_nwt jsonb DEFAULT '{}'::jsonb,
    party_type character varying(1) DEFAULT 'B'::character varying,
    grade_garden_mapping jsonb DEFAULT '{}'::jsonb,
    one_lot_per_grade_garden boolean DEFAULT false,
    grade_broker_lots jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT parties_party_type_check CHECK (((party_type)::text = ANY ((ARRAY['A'::character varying, 'B'::character varying, 'C'::character varying])::text[])))
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
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: ai_markings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_markings ALTER COLUMN id SET DEFAULT nextval('public.ai_markings_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: ai_markings ai_markings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_markings
    ADD CONSTRAINT ai_markings_pkey PRIMARY KEY (id);


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
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: catalogue_sale_batch_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX catalogue_sale_batch_unique ON public.catalogue USING btree (sale_no, garden, grade, mark, invoice_no, batch_name);


--
-- Name: idx_catalogue_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalogue_batch ON public.catalogue USING btree (sale_no, batch_name);


--
-- Name: idx_catalogue_garden_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalogue_garden_grade ON public.catalogue USING btree (garden, grade);


--
-- Name: idx_catalogue_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalogue_invoice ON public.catalogue USING btree (invoice_no);


--
-- Name: idx_catalogue_mark_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalogue_mark_grade ON public.catalogue USING btree (mark, grade);


--
-- Name: idx_catalogue_sale_grade_garden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalogue_sale_grade_garden ON public.catalogue USING btree (sale_no, grade, garden);


--
-- Name: idx_catalogue_sale_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalogue_sale_no ON public.catalogue USING btree (sale_no);


--
-- Name: idx_import_log_sale_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_log_sale_no ON public.import_log USING btree (sale_no);


--
-- Name: idx_markings_ai; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_markings_ai ON public.markings USING btree (is_ai_suggestion) WHERE (is_ai_suggestion = true);


--
-- Name: idx_markings_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_markings_batch ON public.markings USING btree (sale_no, batch_name);


--
-- Name: idx_markings_is_ai; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_markings_is_ai ON public.markings USING btree (is_ai_suggestion) WHERE (is_ai_suggestion = true);


--
-- Name: idx_markings_party; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_markings_party ON public.markings USING btree (party_id);


--
-- Name: idx_markings_sale_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_markings_sale_no ON public.markings USING btree (sale_no);


--
-- Name: idx_markings_sale_party_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_markings_sale_party_invoice ON public.markings USING btree (sale_no, party_id, invoice);


--
-- Name: idx_parties_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parties_type ON public.parties USING btree (party_type) WHERE (active = true);


--
-- Name: idx_pgm_party; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pgm_party ON public.party_garden_mapping USING btree (party_id);


--
-- Name: idx_pgm_party_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pgm_party_id ON public.party_garden_mapping USING btree (party_id);


--
-- Name: idx_sold_list_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sold_list_batch ON public.sold_list USING btree (sale_no, batch_name);


--
-- Name: idx_sold_list_join_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sold_list_join_key ON public.sold_list USING btree (sale_no, garden, grade, mark);


--
-- Name: idx_sold_list_mark_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sold_list_mark_grade ON public.sold_list USING btree (mark, grade);


--
-- Name: idx_sold_list_sale_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sold_list_sale_no ON public.sold_list USING btree (sale_no);


--
-- Name: sold_list_sale_batch_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sold_list_sale_batch_unique ON public.sold_list USING btree (sale_no, garden, grade, mark, invoice_no, batch_name);


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

\unrestrict VHn8xLh4d0ZgHNcXXpW2g8PEzP5mN7eRAR0v1x9lfgrFnVLeXa0IKihL9VGnP6N

--
-- Incremental migrations (idempotent — safe to re-run)
--
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS grade_broker_lots jsonb DEFAULT '{}'::jsonb;

