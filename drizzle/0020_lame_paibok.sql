ALTER TABLE "facebook_ads" ADD COLUMN "link_clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "facebook_ads" ADD COLUMN "shop_clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "facebook_ads" ADD COLUMN "landing_page_views" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "facebook_ads" ADD COLUMN "cost_per_landing_page_view" real DEFAULT 0 NOT NULL;