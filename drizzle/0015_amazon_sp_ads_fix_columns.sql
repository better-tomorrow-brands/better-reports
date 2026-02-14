-- Drop and recreate amazon_sp_ads with correct columns (table is empty)
DROP INDEX IF EXISTS "amazon_sp_ads_org_date_campaign_idx";
--> statement-breakpoint
DROP TABLE IF EXISTS "amazon_sp_ads";
--> statement-breakpoint
CREATE TABLE "amazon_sp_ads" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" integer NOT NULL,
	"date" date NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_name" text,
	"campaign_status" text,
	"campaign_budget_amount" real,
	"campaign_budget_type" text,
	"campaign_budget_currency_code" text,
	"campaign_rule_based_budget_amount" real,
	"campaign_bidding_strategy" text,
	"campaign_applicable_budget_rule_id" text,
	"campaign_applicable_budget_rule_name" text,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"cost" real DEFAULT 0,
	"spend" real,
	"cost_per_click" real,
	"click_through_rate" real,
	"top_of_search_impression_share" real,
	"sales_1d" real,
	"sales_7d" real,
	"sales_14d" real,
	"sales_30d" real,
	"attributed_sales_same_sku_1d" real,
	"attributed_sales_same_sku_7d" real,
	"attributed_sales_same_sku_14d" real,
	"attributed_sales_same_sku_30d" real,
	"purchases_1d" integer,
	"purchases_7d" integer,
	"purchases_14d" integer,
	"purchases_30d" integer,
	"purchases_same_sku_1d" integer,
	"purchases_same_sku_7d" integer,
	"purchases_same_sku_14d" integer,
	"purchases_same_sku_30d" integer,
	"units_sold_clicks_1d" integer,
	"units_sold_clicks_7d" integer,
	"units_sold_clicks_14d" integer,
	"units_sold_clicks_30d" integer,
	"units_sold_same_sku_1d" integer,
	"units_sold_same_sku_7d" integer,
	"units_sold_same_sku_14d" integer,
	"units_sold_same_sku_30d" integer,
	"acos_clicks_14d" real,
	"roas_clicks_14d" real,
	"add_to_list" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "amazon_sp_ads" ADD CONSTRAINT "amazon_sp_ads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_sp_ads_org_date_campaign_idx" ON "amazon_sp_ads" USING btree ("org_id","date","campaign_id");
