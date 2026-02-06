-- Rename campaigns to campaigns_fcb (Facebook campaigns)
ALTER TABLE "campaigns" RENAME TO "campaigns_fcb";

-- Create WhatsApp campaigns table
CREATE TABLE "campaigns_wa" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"template_name" text NOT NULL,
	"customer_count" integer DEFAULT 0,
	"success_count" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"status" text DEFAULT 'draft',
	"created_at" timestamp with time zone DEFAULT now(),
	"sent_at" timestamp with time zone
);

-- Create junction table for WhatsApp campaign <-> customers (two-way relationship)
CREATE TABLE "campaigns_wa_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL REFERENCES "campaigns_wa"("id") ON DELETE CASCADE,
	"customer_id" integer NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
	"phone" text,
	"first_name" text,
	"status" text DEFAULT 'pending',
	"error_message" text,
	"sent_at" timestamp with time zone
);

-- Add campaign link to campaign_messages
ALTER TABLE "campaign_messages" ADD COLUMN IF NOT EXISTS "campaign_wa_id" integer REFERENCES "campaigns_wa"("id");
ALTER TABLE "campaign_messages" ADD COLUMN IF NOT EXISTS "customer_id" integer REFERENCES "customers"("id");

-- Indexes for efficient lookups both directions
CREATE INDEX "idx_cwc_campaign" ON "campaigns_wa_customers"("campaign_id");
CREATE INDEX "idx_cwc_customer" ON "campaigns_wa_customers"("customer_id");
