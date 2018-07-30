--
-- PostgreSQL database dump
--

-- Dumped from database version 10.4
-- Dumped by pg_dump version 10.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: plpgsql; Type: EXTENSION; Schema: -; Owner: 
--

CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;


--
-- Name: EXTENSION plpgsql; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION plpgsql IS 'PL/pgSQL procedural language';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: 
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: notify_trigger(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
BEGIN
  PERFORM pg_notify('watchers', TG_TABLE_NAME || ',id,' || NEW.id );
  RETURN new;
END;
$$;


ALTER FUNCTION public.notify_trigger() OWNER TO postgres;

SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    currency text NOT NULL,
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    price numeric(16,8) NOT NULL,
    price_currency text NOT NULL,
    type text NOT NULL,
    user_id uuid NOT NULL,
    value numeric(16,8) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: trade_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.trade_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    currency text NOT NULL,
    value numeric(16,8) NOT NULL,
    price numeric(16,8) NOT NULL,
    price_currency text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    buyers_id uuid NOT NULL,
    sellers_id uuid NOT NULL,
    buy_order_id uuid NOT NULL,
    sell_order_id uuid NOT NULL,
    buy_commission numeric(16,8) NOT NULL,
    sell_commission numeric(16,8) NOT NULL,
    price_less_commission numeric(16,8) NOT NULL,
    trade_value_less_commission numeric(16,8) NOT NULL,
    value_less_commission numeric(16,8) NOT NULL,
    trade_value numeric(16,8) DEFAULT 0 NOT NULL
);


ALTER TABLE public.trade_history OWNER TO postgres;

--
-- Name: trades; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.trades (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    currency text NOT NULL,
    price numeric(16,8) NOT NULL,
    price_currency text NOT NULL,
    type text NOT NULL,
    user_id uuid NOT NULL,
    value numeric(16,8) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    order_id uuid NOT NULL,
    active boolean DEFAULT true
);


ALTER TABLE public.trades OWNER TO postgres;

--
-- Name: user_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    order_id uuid,
    currency text,
    value numeric(16,8),
    price_currency text,
    price numeric(16,8)
);


ALTER TABLE public.user_transactions OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    username text NOT NULL,
    "tradingFees" double precision DEFAULT 0 NOT NULL,
    balances jsonb
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: trade_history tradeHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trade_history
    ADD CONSTRAINT "tradeHistory_pkey" PRIMARY KEY (id);


--
-- Name: trades trades_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_pkey PRIMARY KEY (id);


--
-- Name: user_transactions user_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_transactions
    ADD CONSTRAINT user_transactions_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: ix_trade_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_trade_type ON public.trades USING btree (type);


--
-- Name: ix_tradepairs_orders; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_tradepairs_orders ON public.orders USING btree (currency, price_currency);


--
-- Name: ix_tradepairs_tradehistory; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_tradepairs_tradehistory ON public.trade_history USING btree (currency, price_currency);


--
-- Name: orders orders_notify_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER orders_notify_trigger AFTER INSERT ON public.orders FOR EACH ROW EXECUTE PROCEDURE public.notify_trigger();


--
-- Name: trades trades_notify_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trades_notify_trigger AFTER INSERT ON public.trades FOR EACH ROW EXECUTE PROCEDURE public.notify_trigger();


--
-- Name: user_transactions user_transactions_notify_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER user_transactions_notify_trigger AFTER INSERT ON public.user_transactions FOR EACH ROW EXECUTE PROCEDURE public.notify_trigger();


--
-- PostgreSQL database dump complete
--

