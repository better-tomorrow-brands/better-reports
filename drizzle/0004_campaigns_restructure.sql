-- Drop FK constraint and old columns from campaign_messages
ALTER TABLE "campaign_messages" DROP CONSTRAINT IF EXISTS "campaign_messages_campaign_id_campaigns_id_fk";
ALTER TABLE "campaign_messages" DROP COLUMN IF EXISTS "campaign_id";
ALTER TABLE "campaign_messages" ADD COLUMN IF NOT EXISTS "template_name" text;

-- Drop old campaigns table
DROP TABLE IF EXISTS "campaigns";

-- Create new campaigns table with ad campaign structure
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign" text,
	"ad_group" text,
	"ad" text,
	"product_name" text,
	"product_url" text,
	"sku_suffix" text,
	"skus" text,
	"discount_code" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"product_template" text,
	"status" text DEFAULT 'active',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);

-- Drop ad_campaigns table (now redundant)
DROP TABLE IF EXISTS "ad_campaigns";
