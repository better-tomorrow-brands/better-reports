CREATE TABLE "amazon_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" integer NOT NULL,
	"amazon_order_id" text NOT NULL,
	"order_item_id" text NOT NULL,
	"purchase_date" timestamp with time zone NOT NULL,
	"last_update_date" timestamp with time zone,
	"order_status" text,
	"fulfillment_channel" text,
	"asin" text,
	"seller_sku" text,
	"title" text,
	"quantity_ordered" integer DEFAULT 0,
	"quantity_shipped" integer DEFAULT 0,
	"item_price" numeric(12, 2) DEFAULT '0',
	"item_currency" text DEFAULT 'GBP',
	"is_prime" boolean DEFAULT false,
	"is_business_order" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "amazon_orders" ADD CONSTRAINT "amazon_orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_orders_org_order_item_idx" ON "amazon_orders" USING btree ("org_id","amazon_order_id","order_item_id");
