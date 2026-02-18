ALTER TABLE "facebook_ads" ADD COLUMN "campaign_id" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "facebook_ads" ADD COLUMN "adset_id" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "facebook_ads" ADD COLUMN "ad_id" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "inventory_snapshots" ADD COLUMN "shipbob_qty" integer DEFAULT 0;