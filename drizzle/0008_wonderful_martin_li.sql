CREATE TABLE "amazon_financial_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"transaction_type" text,
	"posted_date" timestamp with time zone,
	"total_amount" numeric(12, 2),
	"total_currency" text,
	"related_identifiers" text,
	"items" text,
	"breakdowns" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "amazon_financial_events_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "amazon_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_date" date NOT NULL,
	"seller_sku" text NOT NULL,
	"fn_sku" text,
	"asin" text,
	"product_name" text,
	"condition" text,
	"fulfillable_quantity" integer DEFAULT 0,
	"inbound_working_quantity" integer DEFAULT 0,
	"inbound_shipped_quantity" integer DEFAULT 0,
	"inbound_receiving_quantity" integer DEFAULT 0,
	"reserved_fc_transfers" integer DEFAULT 0,
	"reserved_fc_processing" integer DEFAULT 0,
	"reserved_customer_orders" integer DEFAULT 0,
	"unfulfillable_customer_damaged" integer DEFAULT 0,
	"unfulfillable_warehouse_damaged" integer DEFAULT 0,
	"unfulfillable_distributor_damaged" integer DEFAULT 0,
	"unfulfillable_carrier_damaged" integer DEFAULT 0,
	"unfulfillable_defective" integer DEFAULT 0,
	"unfulfillable_expired" integer DEFAULT 0,
	"total_quantity" integer DEFAULT 0,
	"last_updated_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "amazon_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"asin" text,
	"product_name" text,
	"brand" text,
	"fba_fee_per_unit" numeric(10, 4),
	"referral_fee_percent" numeric(5, 2),
	"cog_per_unit" numeric(10, 4),
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "amazon_products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "amazon_sales_traffic" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"parent_asin" text,
	"child_asin" text NOT NULL,
	"units_ordered" integer DEFAULT 0,
	"units_ordered_b2b" integer DEFAULT 0,
	"ordered_product_sales" numeric(12, 2) DEFAULT '0',
	"ordered_product_sales_b2b" numeric(12, 2) DEFAULT '0',
	"total_order_items" integer DEFAULT 0,
	"total_order_items_b2b" integer DEFAULT 0,
	"browser_sessions" integer DEFAULT 0,
	"mobile_sessions" integer DEFAULT 0,
	"sessions" integer DEFAULT 0,
	"browser_session_percentage" real DEFAULT 0,
	"mobile_session_percentage" real DEFAULT 0,
	"session_percentage" real DEFAULT 0,
	"browser_page_views" integer DEFAULT 0,
	"mobile_page_views" integer DEFAULT 0,
	"page_views" integer DEFAULT 0,
	"browser_page_views_percentage" real DEFAULT 0,
	"mobile_page_views_percentage" real DEFAULT 0,
	"page_views_percentage" real DEFAULT 0,
	"buy_box_percentage" real DEFAULT 0,
	"unit_session_percentage" real DEFAULT 0,
	"unit_session_percentage_b2b" real DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_inventory_sku_date_idx" ON "amazon_inventory" USING btree ("seller_sku","snapshot_date");
--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_sales_traffic_date_asin_idx" ON "amazon_sales_traffic" USING btree ("date","child_asin");
