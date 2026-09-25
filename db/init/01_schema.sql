--
-- PostgreSQL database dump
--

\restrict 4Jaw5W3SF5CUauZF5IlIqIIi3g1uXeuMYhzdlHEpKebr5A5Xdbj21SxkEJgj6Vx

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: constructors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.constructors (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    primary_color character varying(7) NOT NULL,
    logo_url character varying(255),
    active_seasons integer[] DEFAULT '{}'::integer[]
);


--
-- Name: driver_seasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.driver_seasons (
    id integer NOT NULL,
    driver_id integer NOT NULL,
    constructor_id integer NOT NULL,
    year integer NOT NULL,
    number integer
);


--
-- Name: driver_seasons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.driver_seasons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: driver_seasons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.driver_seasons_id_seq OWNED BY public.driver_seasons.id;


--
-- Name: drivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drivers (
    id integer NOT NULL,
    constructor_id integer,
    first_name character varying(50) NOT NULL,
    last_name character varying(50) NOT NULL,
    permanent_number integer,
    country_code character varying(3),
    profile_image_url character varying(255),
    active_seasons character varying(50),
    active boolean DEFAULT true NOT NULL,
    is_practice_only boolean DEFAULT false NOT NULL
);


--
-- Name: drivers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.drivers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: drivers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.drivers_id_seq OWNED BY public.drivers.id;


--
-- Name: practices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practices (
    id integer NOT NULL,
    race_id integer,
    driver_id integer,
    p1 character varying(20),
    p2 character varying(20),
    p3 character varying(20)
);


--
-- Name: practices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.practices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: practices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.practices_id_seq OWNED BY public.practices.id;


--
-- Name: qualifying; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qualifying (
    id integer NOT NULL,
    race_id integer,
    driver_id integer,
    "position" integer NOT NULL,
    q1 character varying(20),
    q2 character varying(20),
    q3 character varying(20)
);


--
-- Name: qualifying_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.qualifying_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qualifying_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.qualifying_id_seq OWNED BY public.qualifying.id;


--
-- Name: race_strategies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.race_strategies (
    id integer NOT NULL,
    race_id integer NOT NULL,
    driver_id integer NOT NULL,
    stint_number integer NOT NULL,
    tire_compound character varying(20) DEFAULT 'UNKNOWN'::character varying NOT NULL,
    start_lap integer NOT NULL,
    end_lap integer NOT NULL,
    pit_duration character varying(20),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: race_strategies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.race_strategies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: race_strategies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.race_strategies_id_seq OWNED BY public.race_strategies.id;


--
-- Name: races; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.races (
    id integer NOT NULL,
    round integer NOT NULL,
    name character varying(100) NOT NULL,
    circuit_name character varying(100),
    country_code character varying(3),
    date date NOT NULL,
    map_image_url character varying(255),
    circuit_image_url character varying(255),
    has_sprint boolean DEFAULT false,
    circuit_length character varying(20),
    total_laps integer,
    race_distance character varying(20),
    lap_record character varying(100),
    status character varying(20) DEFAULT NULL::character varying,
    fp1_time timestamp with time zone,
    fp2_time timestamp with time zone,
    fp3_time timestamp with time zone,
    sprint_quali_time timestamp with time zone,
    sprint_time timestamp with time zone,
    qualy_time timestamp with time zone,
    race_time timestamp with time zone
);


--
-- Name: races_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.races_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: races_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.races_id_seq OWNED BY public.races.id;


--
-- Name: results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.results (
    id integer NOT NULL,
    race_id integer,
    driver_id integer,
    "position" integer NOT NULL,
    points numeric(5,1) DEFAULT 0,
    fastest_lap boolean DEFAULT false,
    dnf boolean DEFAULT false,
    dsq boolean DEFAULT false,
    dns boolean DEFAULT false,
    dnq boolean DEFAULT false
);


--
-- Name: results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.results_id_seq OWNED BY public.results.id;


--
-- Name: sprint_qualifying; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sprint_qualifying (
    id integer NOT NULL,
    race_id integer,
    driver_id integer,
    "position" integer NOT NULL,
    sq1 character varying(20),
    sq2 character varying(20),
    sq3 character varying(20)
);


--
-- Name: sprint_qualifying_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sprint_qualifying_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sprint_qualifying_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sprint_qualifying_id_seq OWNED BY public.sprint_qualifying.id;


--
-- Name: sprint_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sprint_results (
    id integer NOT NULL,
    race_id integer,
    driver_id integer,
    "position" integer NOT NULL,
    points numeric(5,1) DEFAULT 0,
    dnf boolean DEFAULT false,
    dns boolean DEFAULT false,
    dsq boolean DEFAULT false,
    time_gap character varying(50)
);


--
-- Name: sprint_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sprint_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sprint_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sprint_results_id_seq OWNED BY public.sprint_results.id;


--
-- Name: teams_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.teams_id_seq OWNED BY public.constructors.id;


--
-- Name: constructors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.constructors ALTER COLUMN id SET DEFAULT nextval('public.teams_id_seq'::regclass);


--
-- Name: driver_seasons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver_seasons ALTER COLUMN id SET DEFAULT nextval('public.driver_seasons_id_seq'::regclass);


--
-- Name: drivers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers ALTER COLUMN id SET DEFAULT nextval('public.drivers_id_seq'::regclass);


--
-- Name: practices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practices ALTER COLUMN id SET DEFAULT nextval('public.practices_id_seq'::regclass);


--
-- Name: qualifying id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qualifying ALTER COLUMN id SET DEFAULT nextval('public.qualifying_id_seq'::regclass);


--
-- Name: race_strategies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.race_strategies ALTER COLUMN id SET DEFAULT nextval('public.race_strategies_id_seq'::regclass);


--
-- Name: races id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.races ALTER COLUMN id SET DEFAULT nextval('public.races_id_seq'::regclass);


--
-- Name: results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.results ALTER COLUMN id SET DEFAULT nextval('public.results_id_seq'::regclass);


--
-- Name: sprint_qualifying id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_qualifying ALTER COLUMN id SET DEFAULT nextval('public.sprint_qualifying_id_seq'::regclass);


--
-- Name: sprint_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_results ALTER COLUMN id SET DEFAULT nextval('public.sprint_results_id_seq'::regclass);


--
-- Name: driver_seasons driver_seasons_driver_id_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver_seasons
    ADD CONSTRAINT driver_seasons_driver_id_year_key UNIQUE (driver_id, year);


--
-- Name: driver_seasons driver_seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver_seasons
    ADD CONSTRAINT driver_seasons_pkey PRIMARY KEY (id);


--
-- Name: drivers drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);


--
-- Name: practices practices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practices
    ADD CONSTRAINT practices_pkey PRIMARY KEY (id);


--
-- Name: practices practices_race_id_driver_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practices
    ADD CONSTRAINT practices_race_id_driver_id_key UNIQUE (race_id, driver_id);


--
-- Name: qualifying qualifying_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qualifying
    ADD CONSTRAINT qualifying_pkey PRIMARY KEY (id);


--
-- Name: qualifying qualifying_race_id_driver_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qualifying
    ADD CONSTRAINT qualifying_race_id_driver_id_key UNIQUE (race_id, driver_id);


--
-- Name: race_strategies race_strategies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.race_strategies
    ADD CONSTRAINT race_strategies_pkey PRIMARY KEY (id);


--
-- Name: race_strategies race_strategies_race_id_driver_id_stint_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.race_strategies
    ADD CONSTRAINT race_strategies_race_id_driver_id_stint_number_key UNIQUE (race_id, driver_id, stint_number);


--
-- Name: races races_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.races
    ADD CONSTRAINT races_pkey PRIMARY KEY (id);


--
-- Name: results results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.results
    ADD CONSTRAINT results_pkey PRIMARY KEY (id);


--
-- Name: results results_race_id_driver_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.results
    ADD CONSTRAINT results_race_id_driver_id_key UNIQUE (race_id, driver_id);


--
-- Name: sprint_qualifying sprint_qualifying_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_qualifying
    ADD CONSTRAINT sprint_qualifying_pkey PRIMARY KEY (id);


--
-- Name: sprint_qualifying sprint_qualifying_race_id_driver_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_qualifying
    ADD CONSTRAINT sprint_qualifying_race_id_driver_id_key UNIQUE (race_id, driver_id);


--
-- Name: sprint_results sprint_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_results
    ADD CONSTRAINT sprint_results_pkey PRIMARY KEY (id);


--
-- Name: sprint_results sprint_results_race_id_driver_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_results
    ADD CONSTRAINT sprint_results_race_id_driver_id_key UNIQUE (race_id, driver_id);


--
-- Name: constructors teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.constructors
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: ds_constructor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ds_constructor_id_idx ON public.driver_seasons USING btree (constructor_id);


--
-- Name: ds_driver_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ds_driver_id_idx ON public.driver_seasons USING btree (driver_id);


--
-- Name: ds_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ds_year_idx ON public.driver_seasons USING btree (year);


--
-- Name: idx_drivers_constructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_constructor ON public.drivers USING btree (constructor_id);


--
-- Name: idx_drivers_lastname; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_lastname ON public.drivers USING btree (last_name);


--
-- Name: rs_compound_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rs_compound_idx ON public.race_strategies USING btree (tire_compound);


--
-- Name: rs_driver_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rs_driver_id_idx ON public.race_strategies USING btree (driver_id);


--
-- Name: rs_race_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rs_race_id_idx ON public.race_strategies USING btree (race_id);


--
-- Name: driver_seasons driver_seasons_constructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver_seasons
    ADD CONSTRAINT driver_seasons_constructor_id_fkey FOREIGN KEY (constructor_id) REFERENCES public.constructors(id);


--
-- Name: driver_seasons driver_seasons_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver_seasons
    ADD CONSTRAINT driver_seasons_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;


--
-- Name: drivers drivers_constructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_constructor_id_fkey FOREIGN KEY (constructor_id) REFERENCES public.constructors(id) ON DELETE SET NULL;


--
-- Name: practices practices_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practices
    ADD CONSTRAINT practices_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;


--
-- Name: practices practices_race_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practices
    ADD CONSTRAINT practices_race_id_fkey FOREIGN KEY (race_id) REFERENCES public.races(id) ON DELETE CASCADE;


--
-- Name: qualifying qualifying_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qualifying
    ADD CONSTRAINT qualifying_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;


--
-- Name: qualifying qualifying_race_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qualifying
    ADD CONSTRAINT qualifying_race_id_fkey FOREIGN KEY (race_id) REFERENCES public.races(id) ON DELETE CASCADE;


--
-- Name: race_strategies race_strategies_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.race_strategies
    ADD CONSTRAINT race_strategies_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;


--
-- Name: race_strategies race_strategies_race_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.race_strategies
    ADD CONSTRAINT race_strategies_race_id_fkey FOREIGN KEY (race_id) REFERENCES public.races(id) ON DELETE CASCADE;


--
-- Name: results results_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.results
    ADD CONSTRAINT results_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;


--
-- Name: results results_race_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.results
    ADD CONSTRAINT results_race_id_fkey FOREIGN KEY (race_id) REFERENCES public.races(id) ON DELETE CASCADE;


--
-- Name: sprint_qualifying sprint_qualifying_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_qualifying
    ADD CONSTRAINT sprint_qualifying_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;


--
-- Name: sprint_qualifying sprint_qualifying_race_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_qualifying
    ADD CONSTRAINT sprint_qualifying_race_id_fkey FOREIGN KEY (race_id) REFERENCES public.races(id) ON DELETE CASCADE;


--
-- Name: sprint_results sprint_results_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_results
    ADD CONSTRAINT sprint_results_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;


--
-- Name: sprint_results sprint_results_race_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_results
    ADD CONSTRAINT sprint_results_race_id_fkey FOREIGN KEY (race_id) REFERENCES public.races(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 4Jaw5W3SF5CUauZF5IlIqIIi3g1uXeuMYhzdlHEpKebr5A5Xdbj21SxkEJgj6Vx

