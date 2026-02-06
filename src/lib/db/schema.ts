import {
  pgTable,
  serial,
  text,
  integer,
  decimal,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Users ──────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user ID
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").notNull().default("user"), // super_admin | admin | user
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── App Settings ───────────────────────────────────────
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ── Facebook Campaigns (Ad Attribution) ───────────────
export const campaignsFcb = pgTable("campaigns_fcb", {
  id: serial("id").primaryKey(),
  campaign: text("campaign"),
  adGroup: text("ad_group"),
  ad: text("ad"),
  productName: text("product_name"),
  productUrl: text("product_url"),
  skuSuffix: text("sku_suffix"),
  skus: text("skus"),
  discountCode: text("discount_code"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmTerm: text("utm_term"),
  productTemplate: text("product_template"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ── WhatsApp Campaigns ────────────────────────────────
export const campaignsWa = pgTable("campaigns_wa", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  templateName: text("template_name").notNull(),
  customerCount: integer("customer_count").default(0),
  successCount: integer("success_count").default(0),
  errorCount: integer("error_count").default(0),
  status: text("status").default("draft"), // draft | sending | completed
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

// ── WhatsApp Campaign Customers (Junction) ────────────
export const campaignsWaCustomers = pgTable("campaigns_wa_customers", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsWa.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  phone: text("phone"),
  firstName: text("first_name"),
  status: text("status").default("pending"), // pending | sent | failed
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

// ── WhatsApp Messages (Audit Log) ─────────────────────
export const campaignMessages = pgTable("campaign_messages", {
  id: serial("id").primaryKey(),
  campaignWaId: integer("campaign_wa_id").references(() => campaignsWa.id),
  customerId: integer("customer_id").references(() => customers.id),
  templateName: text("template_name"),
  phone: text("phone").notNull(),
  firstName: text("first_name"),
  status: text("status").notNull(), // success | error
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow(),
});

// ── Sync Logs ──────────────────────────────────────────
export const syncLogs = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  status: text("status").notNull().default("pending"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Customers ─────────────────────────────────────────
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  shopifyCustomerId: text("shopify_customer_id"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").unique(),
  emailMarketingConsent: boolean("email_marketing_consent").default(false),
  phone: text("phone"),
  totalSpent: decimal("total_spent", { precision: 10, scale: 2 }).default("0"),
  ordersCount: integer("orders_count").default(0),
  tags: text("tags"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
  // lapse (days since last order) computed on read from lastOrderAt
  // lifecycle (New/Reorder/At Risk/Lost) computed from lapse using settings thresholds
});

// ── Orders (Shopify) ───────────────────────────────────
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  shopifyId: text("shopify_id").notNull().unique(),
  orderNumber: text("order_number"),
  email: text("email"),
  customerName: text("customer_name"),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  fulfillmentStatus: text("fulfillment_status"),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }),
  shipping: decimal("shipping", { precision: 10, scale: 2 }),
  tax: decimal("tax", { precision: 10, scale: 2 }),
  total: decimal("total", { precision: 10, scale: 2 }),
  discountCodes: text("discount_codes"),
  skus: text("skus"),
  quantity: integer("quantity"),
  utmSource: text("utm_source"),
  utmCampaign: text("utm_campaign"),
  utmMedium: text("utm_medium"),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),
  trackingNumber: text("tracking_number"),
  tags: text("tags"),
  hasConversionData: boolean("has_conversion_data").default(false),
  isRepeatCustomer: boolean("is_repeat_customer").default(false),
  customerId: integer("customer_id").references(() => customers.id),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow(),
});

// ── Relations ─────────────────────────────────────────

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
  campaignMessages: many(campaignMessages),
  campaignsWaCustomers: many(campaignsWaCustomers), // Access campaigns via junction
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
}));

export const campaignsWaRelations = relations(campaignsWa, ({ many }) => ({
  campaignsWaCustomers: many(campaignsWaCustomers), // Access customers via junction
}));

export const campaignsWaCustomersRelations = relations(campaignsWaCustomers, ({ one }) => ({
  campaign: one(campaignsWa, {
    fields: [campaignsWaCustomers.campaignId],
    references: [campaignsWa.id],
  }),
  customer: one(customers, {
    fields: [campaignsWaCustomers.customerId],
    references: [customers.id],
  }),
}));

export const campaignMessagesRelations = relations(campaignMessages, ({ one }) => ({
  campaignWa: one(campaignsWa, {
    fields: [campaignMessages.campaignWaId],
    references: [campaignsWa.id],
  }),
  customer: one(customers, {
    fields: [campaignMessages.customerId],
    references: [customers.id],
  }),
}));

