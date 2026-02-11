-- Multi-tenancy migration
-- Adds organizations + user_organizations, backfills all existing data to org id=1

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Create organizations table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Seed the initial organization (existing data owner)
-- NOTE: slug is intentionally lowercase/url-safe; name is display name
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "organizations" ("id", "name", "slug") VALUES (1, 'DooGood', 'doogood');
--> statement-breakpoint
-- Reset the sequence so next auto-increment starts at 2
SELECT setval('organizations_id_seq', 1, true);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Create user_organizations junction table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "user_organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"org_id" integer NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: Seed user_organizations — all existing users join org 1
--         super_admin and admin → 'admin' role within the org
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "user_organizations" ("user_id", "org_id", "role")
SELECT
  id,
  1,
  CASE WHEN role IN ('admin', 'super_admin') THEN 'admin' ELSE 'user' END
FROM "users";
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5: Drop old single-column unique constraints (replaced by org-scoped ones)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "amazon_financial_events" DROP CONSTRAINT IF EXISTS "amazon_financial_events_transaction_id_unique";
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_email_unique";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_shopify_id_unique";
--> statement-breakpoint
ALTER TABLE "posthog_analytics" DROP CONSTRAINT IF EXISTS "posthog_analytics_date_unique";
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_sku_unique";
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 6: Drop old unique indexes (replaced by org-scoped ones)
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "amazon_sales_traffic_date_asin_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "facebook_ads_date_campaign_adset_ad_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "inventory_snapshots_sku_date_idx";
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 7: Add org_id as NULLABLE to all data tables
--         (must be nullable initially — existing rows have no value yet)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "amazon_financial_events" ADD COLUMN "org_id" integer;
--> statement-breakpoint
ALTER TABLE "amazon_sales_traffic" ADD COLUMN "org_id" integer;
--> statement-breakpoint
ALTER TABLE "campaigns_fcb" ADD COLUMN "org_id" integer;
--> statement-breakpoint
ALTER TABLE "campaigns_wa" ADD COLUMN "org_id" integer;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "org_id" integer;
--> statement-breakpoint
ALTER TABLE "facebook_ads" ADD COLUMN "org_id" integer;
--> statement-breakpoint
ALTER TABLE "inventory_snapshots" ADD COLUMN "org_id" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "org_id" integer;
--> statement-breakpoint
ALTER TABLE "posthog_analytics" ADD COLUMN "org_id" integer;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "org_id" integer;
--> statement-breakpoint
ALTER TABLE "sync_logs" ADD COLUMN "org_id" integer;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "org_id" integer;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 8: Backfill all existing rows to org 1
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "amazon_financial_events" SET "org_id" = 1;
--> statement-breakpoint
UPDATE "amazon_sales_traffic" SET "org_id" = 1;
--> statement-breakpoint
UPDATE "campaigns_fcb" SET "org_id" = 1;
--> statement-breakpoint
UPDATE "campaigns_wa" SET "org_id" = 1;
--> statement-breakpoint
UPDATE "customers" SET "org_id" = 1;
--> statement-breakpoint
UPDATE "facebook_ads" SET "org_id" = 1;
--> statement-breakpoint
UPDATE "inventory_snapshots" SET "org_id" = 1;
--> statement-breakpoint
UPDATE "orders" SET "org_id" = 1;
--> statement-breakpoint
UPDATE "posthog_analytics" SET "org_id" = 1;
--> statement-breakpoint
UPDATE "products" SET "org_id" = 1;
--> statement-breakpoint
UPDATE "sync_logs" SET "org_id" = 1;
--> statement-breakpoint
UPDATE "settings" SET "org_id" = 1;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 9: Enforce NOT NULL now that all rows are backfilled
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "amazon_financial_events" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "amazon_sales_traffic" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns_fcb" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns_wa" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "facebook_ads" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_snapshots" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "posthog_analytics" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sync_logs" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 10: Fix settings primary key
--          Old PK: single column "key" (constraint named settings_pkey by Postgres default)
--          New PK: composite (org_id, key)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_org_id_key_pk" PRIMARY KEY("org_id","key");
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 11: Add foreign key constraints
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "amazon_financial_events" ADD CONSTRAINT "amazon_financial_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "amazon_sales_traffic" ADD CONSTRAINT "amazon_sales_traffic_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaigns_fcb" ADD CONSTRAINT "campaigns_fcb_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaigns_wa" ADD CONSTRAINT "campaigns_wa_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "facebook_ads" ADD CONSTRAINT "facebook_ads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "posthog_analytics" ADD CONSTRAINT "posthog_analytics_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 12: Create new org-scoped unique indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "user_organizations_user_org_idx" ON "user_organizations" USING btree ("user_id","org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_financial_events_org_transaction_idx" ON "amazon_financial_events" USING btree ("org_id","transaction_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_sales_traffic_org_date_asin_idx" ON "amazon_sales_traffic" USING btree ("org_id","date","child_asin");
--> statement-breakpoint
CREATE UNIQUE INDEX "customers_org_email_idx" ON "customers" USING btree ("org_id","email");
--> statement-breakpoint
CREATE UNIQUE INDEX "facebook_ads_org_date_campaign_adset_ad_idx" ON "facebook_ads" USING btree ("org_id","date","campaign","adset","ad");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_snapshots_org_sku_date_idx" ON "inventory_snapshots" USING btree ("org_id","sku","date");
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_org_shopify_id_idx" ON "orders" USING btree ("org_id","shopify_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "posthog_analytics_org_date_idx" ON "posthog_analytics" USING btree ("org_id","date");
--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_sku_idx" ON "products" USING btree ("org_id","sku");
