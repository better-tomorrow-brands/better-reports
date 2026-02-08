CREATE TABLE "inventory_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"date" date NOT NULL,
	"amazon_qty" integer DEFAULT 0,
	"warehouse_qty" integer DEFAULT 0,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_snapshots_sku_date_idx" ON "inventory_snapshots" USING btree ("sku","date");
--> statement-breakpoint
DROP TABLE "amazon_inventory" CASCADE;
--> statement-breakpoint
DROP TABLE "amazon_products" CASCADE;
