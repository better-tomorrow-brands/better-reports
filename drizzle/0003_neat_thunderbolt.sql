CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"shopify_customer_id" text,
	"first_name" text,
	"last_name" text,
	"email" text,
	"email_marketing_consent" boolean DEFAULT false,
	"phone" text,
	"total_spent" numeric(10, 2) DEFAULT '0',
	"orders_count" integer DEFAULT 0,
	"tags" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"last_order_at" timestamp with time zone,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_repeat_customer" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;