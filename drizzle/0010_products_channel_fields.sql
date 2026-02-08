-- Rename RRP → DTC RRP
ALTER TABLE "products" RENAME COLUMN "rrp" TO "dtc_rrp";
ALTER TABLE "products" RENAME COLUMN "rrp_ex_vat" TO "dtc_rrp_ex_vat";

-- Add Amazon channel fields
ALTER TABLE "products" ADD COLUMN "amazon_rrp" numeric(10, 2);
ALTER TABLE "products" ADD COLUMN "fba_fee" numeric(10, 2);
ALTER TABLE "products" ADD COLUMN "referral_percent" numeric(5, 2);

-- Add DTC channel fields
ALTER TABLE "products" ADD COLUMN "dtc_fulfillment_fee" numeric(10, 2);
ALTER TABLE "products" ADD COLUMN "dtc_courier" numeric(10, 2);
