CREATE TYPE "public"."geo_level" AS ENUM('nation', 'zone', 'state', 'lga', 'ward');--> statement-breakpoint
CREATE TYPE "public"."aggregation_method" AS ENUM('sum', 'population_weighted_mean', 'mean', 'none');--> statement-breakpoint
CREATE TYPE "public"."dataset_status" AS ENUM('draft', 'published', 'superseded', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."indicator_category" AS ENUM('population', 'health_outcomes', 'health_services', 'living_conditions', 'outbreaks');--> statement-breakpoint
CREATE TYPE "public"."indicator_value_type" AS ENUM('count', 'rate', 'percent', 'ratio', 'index');--> statement-breakpoint
CREATE TYPE "public"."care_level" AS ENUM('primary', 'secondary', 'tertiary');--> statement-breakpoint
CREATE TYPE "public"."facility_ownership" AS ENUM('public', 'private', 'faith_based', 'ngo', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."disease" AS ENUM('cholera', 'lassa_fever', 'meningitis', 'measles');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'building', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'cancelled');--> statement-breakpoint
CREATE TABLE "geo_aliases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "geo_aliases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"geo_unit_id" integer NOT NULL,
	"alias" text NOT NULL,
	"normalized" text NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_units" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "geo_units_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"level" "geo_level" NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"parent_id" integer,
	"state_id" integer,
	"boundary" geometry(MultiPolygon,4326),
	"boundary_simplified" geometry(MultiPolygon,4326),
	"centre" geometry(Point,4326),
	"area_sq_km" double precision,
	"boundary_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone_number" text,
	"phone_number_verified" boolean DEFAULT false,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "datasets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_id" integer NOT NULL,
	"series_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"release_date" date,
	"years_covered" text,
	"levels_covered" "geo_level"[],
	"file_key" text,
	"status" "dataset_status" DEFAULT 'draft' NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"change_summary" jsonb,
	"uploaded_by" text,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"status" "import_status" DEFAULT 'running' NOT NULL,
	"dataset_id" integer,
	"stats" jsonb,
	"log" text,
	"error" text,
	"triggered_by" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "indicator_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "indicator_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"indicator_id" integer NOT NULL,
	"geo_unit_id" integer NOT NULL,
	"year" integer NOT NULL,
	"period_label" text,
	"value" double precision NOT NULL,
	"lower" double precision,
	"upper" double precision,
	"sex" text DEFAULT 'all' NOT NULL,
	"age_group" text DEFAULT 'all' NOT NULL,
	"residence" text DEFAULT 'all' NOT NULL,
	"dataset_id" integer NOT NULL,
	"is_estimate" boolean DEFAULT false NOT NULL,
	"quality_flag" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "indicators" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "indicators_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" "indicator_category" NOT NULL,
	"definition" text NOT NULL,
	"unit" text NOT NULL,
	"value_type" "indicator_value_type" NOT NULL,
	"higher_is_better" boolean,
	"decimals" integer DEFAULT 1 NOT NULL,
	"aggregation" "aggregation_method" DEFAULT 'none' NOT NULL,
	"method_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"publisher" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"licence" text NOT NULL,
	"licence_url" text,
	"allows_redistribution" boolean DEFAULT false NOT NULL,
	"citation_template" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "health_facilities" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "health_facilities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"type" text NOT NULL,
	"care_level" "care_level" NOT NULL,
	"ownership" "facility_ownership" DEFAULT 'unknown' NOT NULL,
	"point" geometry(Point,4326) NOT NULL,
	"lga_id" integer,
	"ward_id" integer,
	"state_id" integer,
	"source_version" text,
	"dataset_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "population_cells" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "population_cells_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"point" geometry(Point,4326) NOT NULL,
	"pop_total" double precision NOT NULL,
	"pop_under5" double precision,
	"pop_women_15_49" double precision,
	"year" integer NOT NULL,
	"source_version" text,
	"dataset_id" integer
);
--> statement-breakpoint
CREATE TABLE "outbreak_reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbreak_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"disease" "disease" NOT NULL,
	"state_id" integer NOT NULL,
	"year" integer NOT NULL,
	"week" integer NOT NULL,
	"suspected" integer,
	"confirmed" integer,
	"deaths" integer,
	"dataset_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "custom_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"params" jsonb NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"file_key" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "insight_cards" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "insight_cards_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"caption" text NOT NULL,
	"spec" jsonb NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"author_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_views_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"cover_indicator" text,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"author_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "download_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text,
	"dataset_id" integer,
	"detail" jsonb NOT NULL,
	"format" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price_kobo_monthly" integer DEFAULT 0 NOT NULL,
	"limits" jsonb NOT NULL,
	"paystack_plan_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text,
	"organization_id" text,
	"plan_code" text NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"paystack_customer_code" text,
	"paystack_subscription_code" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usage_counters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_keys_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text,
	"organization_id" text,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_usage_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"api_key_id" integer NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "geo_aliases" ADD CONSTRAINT "geo_aliases_geo_unit_id_geo_units_id_fk" FOREIGN KEY ("geo_unit_id") REFERENCES "public"."geo_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_units" ADD CONSTRAINT "geo_units_parent_id_geo_units_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."geo_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_units" ADD CONSTRAINT "geo_units_state_id_geo_units_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."geo_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_values" ADD CONSTRAINT "indicator_values_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_values" ADD CONSTRAINT "indicator_values_geo_unit_id_geo_units_id_fk" FOREIGN KEY ("geo_unit_id") REFERENCES "public"."geo_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_values" ADD CONSTRAINT "indicator_values_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_facilities" ADD CONSTRAINT "health_facilities_lga_id_geo_units_id_fk" FOREIGN KEY ("lga_id") REFERENCES "public"."geo_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_facilities" ADD CONSTRAINT "health_facilities_ward_id_geo_units_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."geo_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_facilities" ADD CONSTRAINT "health_facilities_state_id_geo_units_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."geo_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_facilities" ADD CONSTRAINT "health_facilities_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "population_cells" ADD CONSTRAINT "population_cells_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbreak_reports" ADD CONSTRAINT "outbreak_reports_state_id_geo_units_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."geo_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbreak_reports" ADD CONSTRAINT "outbreak_reports_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_reports" ADD CONSTRAINT "custom_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_cards" ADD CONSTRAINT "insight_cards_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_log" ADD CONSTRAINT "download_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_log" ADD CONSTRAINT "download_log_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_code_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "geo_aliases_unit_norm_uq" ON "geo_aliases" USING btree ("geo_unit_id","normalized");--> statement-breakpoint
CREATE INDEX "geo_aliases_norm_idx" ON "geo_aliases" USING btree ("normalized");--> statement-breakpoint
CREATE INDEX "geo_aliases_norm_trgm_idx" ON "geo_aliases" USING gin ("normalized" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "geo_units_code_uq" ON "geo_units" USING btree ("code");--> statement-breakpoint
CREATE INDEX "geo_units_level_idx" ON "geo_units" USING btree ("level");--> statement-breakpoint
CREATE INDEX "geo_units_parent_idx" ON "geo_units" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "geo_units_state_idx" ON "geo_units" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "geo_units_name_trgm_idx" ON "geo_units" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "geo_units_boundary_gist" ON "geo_units" USING gist ("boundary");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "members_org_idx" ON "members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "datasets_series_idx" ON "datasets" USING btree ("series_key","version");--> statement-breakpoint
CREATE INDEX "datasets_status_idx" ON "datasets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "datasets_source_idx" ON "datasets" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "import_runs_kind_idx" ON "import_runs" USING btree ("kind","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "indicator_values_nat_uq" ON "indicator_values" USING btree ("indicator_id","geo_unit_id","year","sex","age_group","residence","dataset_id");--> statement-breakpoint
CREATE INDEX "indicator_values_lookup_idx" ON "indicator_values" USING btree ("indicator_id","year","geo_unit_id");--> statement-breakpoint
CREATE INDEX "indicator_values_place_idx" ON "indicator_values" USING btree ("geo_unit_id","indicator_id");--> statement-breakpoint
CREATE INDEX "indicator_values_dataset_idx" ON "indicator_values" USING btree ("dataset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "indicators_code_uq" ON "indicators" USING btree ("code");--> statement-breakpoint
CREATE INDEX "indicators_category_idx" ON "indicators" USING btree ("category");--> statement-breakpoint
CREATE INDEX "health_facilities_lga_idx" ON "health_facilities" USING btree ("lga_id");--> statement-breakpoint
CREATE INDEX "health_facilities_state_idx" ON "health_facilities" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "health_facilities_point_gist" ON "health_facilities" USING gist ("point");--> statement-breakpoint
CREATE INDEX "health_facilities_filters_idx" ON "health_facilities" USING btree ("care_level","ownership");--> statement-breakpoint
CREATE INDEX "population_cells_point_gist" ON "population_cells" USING gist ("point");--> statement-breakpoint
CREATE UNIQUE INDEX "outbreak_reports_uq" ON "outbreak_reports" USING btree ("disease","state_id","year","week","dataset_id");--> statement-breakpoint
CREATE INDEX "outbreak_reports_series_idx" ON "outbreak_reports" USING btree ("disease","year","week");--> statement-breakpoint
CREATE INDEX "custom_reports_user_idx" ON "custom_reports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_cards_slug_uq" ON "insight_cards" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "insight_cards_status_idx" ON "insight_cards" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "saved_views_user_idx" ON "saved_views" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stories_slug_uq" ON "stories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "stories_status_idx" ON "stories" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "download_log_user_idx" ON "download_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_uq" ON "usage_counters" USING btree ("user_id","kind","day");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_uq" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_usage_uq" ON "api_usage" USING btree ("api_key_id","day");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action","created_at");