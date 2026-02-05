CREATE TABLE "amazon_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"units_sold" integer DEFAULT 0 NOT NULL,
	"revenue" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "amazon_sales_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "campaign_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer,
	"phone" text NOT NULL,
	"first_name" text,
	"status" text NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_name" text NOT NULL,
	"total_count" integer NOT NULL,
	"success_count" integer DEFAULT 0,
	"fail_count" integer DEFAULT 0,
	"sent_by" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "facebook_ads" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"campaign_id" text,
	"campaign_name" text,
	"spend" numeric(10, 2) DEFAULT '0' NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shopify_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	"page_views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "shopify_sessions_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "campaign_messages" ADD CONSTRAINT "campaign_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;