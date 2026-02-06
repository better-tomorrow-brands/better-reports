CREATE TABLE "facebook_ads" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"campaign" text DEFAULT '' NOT NULL,
	"adset" text DEFAULT '' NOT NULL,
	"ad" text DEFAULT '' NOT NULL,
	"utm_campaign" text DEFAULT '',
	"spend" real DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"frequency" real DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"cpc" real DEFAULT 0 NOT NULL,
	"cpm" real DEFAULT 0 NOT NULL,
	"ctr" real DEFAULT 0 NOT NULL,
	"purchases" integer DEFAULT 0 NOT NULL,
	"cost_per_purchase" real DEFAULT 0 NOT NULL,
	"purchase_value" real DEFAULT 0 NOT NULL,
	"roas" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "facebook_ads_date_campaign_adset_ad_idx" ON "facebook_ads" USING btree ("date","campaign","adset","ad");
