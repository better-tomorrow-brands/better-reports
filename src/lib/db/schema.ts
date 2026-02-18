import {
  pgTable,
  serial,
  text,
  integer,
  decimal,
  boolean,
  timestamp,
  date,
  real,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Organizations ──────────────────────────────────────
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Users ──────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user ID
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").notNull().default("user"), // super_admin | admin | user
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── User Organizations (Junction) ─────────────────────
export const userOrganizations = pgTable("user_organizations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("user"), // admin | user
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex("user_organizations_user_org_idx").on(table.userId, table.orgId),
]);

// ── Products (Master product database) ────────────────────
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  sku: text("sku").notNull(),
  productName: text("product_name"),
  brand: text("brand"),
  unitBarcode: text("unit_barcode"),
  asin: text("asin"),
  parentAsin: text("parent_asin"),
  shippoSku: text("shippo_sku"),

  piecesPerPack: integer("pieces_per_pack"),
  packWeightKg: decimal("pack_weight_kg", { precision: 10, scale: 3 }),
  packLengthCm: decimal("pack_length_cm", { precision: 10, scale: 2 }),
  packWidthCm: decimal("pack_width_cm", { precision: 10, scale: 2 }),
  packHeightCm: decimal("pack_height_cm", { precision: 10, scale: 2 }),
  unitCbm: decimal("unit_cbm", { precision: 10, scale: 6 }),
  dimensionalWeight: decimal("dimensional_weight", { precision: 10, scale: 3 }),

  unitPriceUsd: decimal("unit_price_usd", { precision: 10, scale: 4 }),
  unitPriceGbp: decimal("unit_price_gbp", { precision: 10, scale: 4 }),
  packCostGbp: decimal("pack_cost_gbp", { precision: 10, scale: 4 }),
  landedCost: decimal("landed_cost", { precision: 10, scale: 4 }),
  unitLcogs: decimal("unit_lcogs", { precision: 10, scale: 4 }),
  dtcRrp: decimal("dtc_rrp", { precision: 10, scale: 2 }),
  ppUnit: decimal("pp_unit", { precision: 10, scale: 4 }),
  dtcRrpExVat: decimal("dtc_rrp_ex_vat", { precision: 10, scale: 2 }),

  // Amazon channel fields
  amazonRrp: decimal("amazon_rrp", { precision: 10, scale: 2 }),
  fbaFee: decimal("fba_fee", { precision: 10, scale: 2 }),
  referralPercent: decimal("referral_percent", { precision: 5, scale: 2 }),

  // DTC channel fields
  dtcFulfillmentFee: decimal("dtc_fulfillment_fee", { precision: 10, scale: 2 }),
  dtcCourier: decimal("dtc_courier", { precision: 10, scale: 2 }),

  cartonBarcode: text("carton_barcode"),
  unitsPerMasterCarton: integer("units_per_master_carton"),
  piecesPerMasterCarton: integer("pieces_per_master_carton"),
  grossWeightKg: decimal("gross_weight_kg", { precision: 10, scale: 3 }),
  cartonWidthCm: decimal("carton_width_cm", { precision: 10, scale: 2 }),
  cartonLengthCm: decimal("carton_length_cm", { precision: 10, scale: 2 }),
  cartonHeightCm: decimal("carton_height_cm", { precision: 10, scale: 2 }),
  cartonCbm: decimal("carton_cbm", { precision: 10, scale: 6 }),

  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex("products_org_sku_idx").on(table.orgId, table.sku),
]);

// ── Amazon Sales & Traffic (Daily by-ASIN) ───────────────
export const amazonSalesTraffic = pgTable("amazon_sales_traffic", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  date: date("date").notNull(),
  parentAsin: text("parent_asin"),
  childAsin: text("child_asin").notNull(),
  // Sales metrics
  unitsOrdered: integer("units_ordered").default(0),
  unitsOrderedB2b: integer("units_ordered_b2b").default(0),
  orderedProductSales: decimal("ordered_product_sales", { precision: 12, scale: 2 }).default("0"),
  orderedProductSalesB2b: decimal("ordered_product_sales_b2b", { precision: 12, scale: 2 }).default("0"),
  totalOrderItems: integer("total_order_items").default(0),
  totalOrderItemsB2b: integer("total_order_items_b2b").default(0),
  // Traffic metrics
  browserSessions: integer("browser_sessions").default(0),
  mobileSessions: integer("mobile_sessions").default(0),
  sessions: integer("sessions").default(0),
  browserSessionPercentage: real("browser_session_percentage").default(0),
  mobileSessionPercentage: real("mobile_session_percentage").default(0),
  sessionPercentage: real("session_percentage").default(0),
  browserPageViews: integer("browser_page_views").default(0),
  mobilePageViews: integer("mobile_page_views").default(0),
  pageViews: integer("page_views").default(0),
  browserPageViewsPercentage: real("browser_page_views_percentage").default(0),
  mobilePageViewsPercentage: real("mobile_page_views_percentage").default(0),
  pageViewsPercentage: real("page_views_percentage").default(0),
  buyBoxPercentage: real("buy_box_percentage").default(0),
  unitSessionPercentage: real("unit_session_percentage").default(0),
  unitSessionPercentageB2b: real("unit_session_percentage_b2b").default(0),
}, (table) => [
  uniqueIndex("amazon_sales_traffic_org_date_asin_idx")
    .on(table.orgId, table.date, table.childAsin),
]);

// ── Amazon Financial Events ──────────────────────────────
export const amazonFinancialEvents = pgTable("amazon_financial_events", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  transactionId: text("transaction_id").notNull(),
  transactionType: text("transaction_type"),
  postedDate: timestamp("posted_date", { withTimezone: true }),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
  totalCurrency: text("total_currency"),
  relatedIdentifiers: text("related_identifiers"), // JSON
  items: text("items"), // JSON
  breakdowns: text("breakdowns"), // JSON
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex("amazon_financial_events_org_transaction_idx")
    .on(table.orgId, table.transactionId),
]);

// ── Inventory Snapshots (Daily per-SKU) ──────────────────
export const inventorySnapshots = pgTable("inventory_snapshots", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  sku: text("sku").notNull(),
  date: date("date").notNull(),
  amazonQty: integer("amazon_qty").default(0),
  warehouseQty: integer("warehouse_qty").default(0),
  shopifyQty: integer("shopify_qty").default(0),
  shipbobQty: integer("shipbob_qty").default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex("inventory_snapshots_org_sku_date_idx").on(table.orgId, table.sku, table.date),
]);

// ── App Settings ───────────────────────────────────────
export const settings = pgTable("settings", {
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.orgId, table.key] }),
]);

// ── Facebook Campaigns (Ad Attribution) ───────────────
export const campaignsFcb = pgTable("campaigns_fcb", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
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
  metaCampaignId: text("meta_campaign_id"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ── WhatsApp Campaigns ────────────────────────────────
export const campaignsWa = pgTable("campaigns_wa", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
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
  orgId: integer("org_id").notNull().references(() => organizations.id),
  source: text("source").notNull(),
  status: text("status").notNull().default("pending"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Customers ─────────────────────────────────────────
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  shopifyCustomerId: text("shopify_customer_id"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  emailMarketingConsent: boolean("email_marketing_consent").default(false),
  phone: text("phone"),
  totalSpent: decimal("total_spent", { precision: 10, scale: 2 }).default("0"),
  ordersCount: integer("orders_count").default(0),
  tags: text("tags"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
  // lapse (days since last order) computed on read from lastOrderAt
  // lifecycle (New/Reorder/At Risk/Lost) computed from lapse using settings thresholds
}, (table) => [
  uniqueIndex("customers_org_email_idx").on(table.orgId, table.email),
]);

// ── Orders (Shopify) ───────────────────────────────────
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  shopifyId: text("shopify_id").notNull(),
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
  currency: text("currency").default("USD"),
  hasConversionData: boolean("has_conversion_data").default(false),
  isRepeatCustomer: boolean("is_repeat_customer").default(false),
  customerId: integer("customer_id").references(() => customers.id),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex("orders_org_shopify_id_idx").on(table.orgId, table.shopifyId),
]);

// ── PostHog Analytics (Daily) ─────────────────────────
export const posthogAnalytics = pgTable("posthog_analytics", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  date: date("date").notNull(),
  uniqueVisitors: integer("unique_visitors").notNull().default(0),
  totalSessions: integer("total_sessions").notNull().default(0),
  pageviews: integer("pageviews").notNull().default(0),
  bounceRate: real("bounce_rate").notNull().default(0),
  avgSessionDuration: real("avg_session_duration").notNull().default(0),
  mobileSessions: integer("mobile_sessions").notNull().default(0),
  desktopSessions: integer("desktop_sessions").notNull().default(0),
  topCountry: text("top_country"),
  directSessions: integer("direct_sessions").notNull().default(0),
  organicSessions: integer("organic_sessions").notNull().default(0),
  paidSessions: integer("paid_sessions").notNull().default(0),
  socialSessions: integer("social_sessions").notNull().default(0),
  productViews: integer("product_views").notNull().default(0),
  addToCart: integer("add_to_cart").notNull().default(0),
  checkoutStarted: integer("checkout_started").notNull().default(0),
  purchases: integer("purchases").notNull().default(0),
  conversionRate: real("conversion_rate").notNull().default(0),
}, (table) => [
  uniqueIndex("posthog_analytics_org_date_idx").on(table.orgId, table.date),
]);

// ── Facebook Ads (Daily Ad-Level) ────────────────────
export const facebookAds = pgTable("facebook_ads", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  date: date("date").notNull(),
  campaignId: text("campaign_id").default(""),
  campaign: text("campaign").notNull().default(""),
  adsetId: text("adset_id").default(""),
  adset: text("adset").notNull().default(""),
  adId: text("ad_id").default(""),
  ad: text("ad").notNull().default(""),
  utmCampaign: text("utm_campaign").default(""),
  spend: real("spend").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  reach: integer("reach").notNull().default(0),
  frequency: real("frequency").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  cpc: real("cpc").notNull().default(0),
  cpm: real("cpm").notNull().default(0),
  ctr: real("ctr").notNull().default(0),
  purchases: integer("purchases").notNull().default(0),
  costPerPurchase: real("cost_per_purchase").notNull().default(0),
  purchaseValue: real("purchase_value").notNull().default(0),
  roas: real("roas").notNull().default(0),
}, (table) => [
  uniqueIndex("facebook_ads_org_date_campaign_adset_ad_idx")
    .on(table.orgId, table.date, table.campaign, table.adset, table.ad),
]);

// ── Amazon SP Ads (Daily Campaign-Level) ────────────────
export const amazonSpAds = pgTable("amazon_sp_ads", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  date: date("date").notNull(),
  // Dimensions
  campaignId: text("campaign_id").notNull(),
  campaignName: text("campaign_name"),
  campaignStatus: text("campaign_status"),
  campaignBudgetAmount: real("campaign_budget_amount"),
  campaignBudgetType: text("campaign_budget_type"),
  campaignBudgetCurrencyCode: text("campaign_budget_currency_code"),
  campaignRuleBasedBudgetAmount: real("campaign_rule_based_budget_amount"),
  campaignBiddingStrategy: text("campaign_bidding_strategy"),
  campaignApplicableBudgetRuleId: text("campaign_applicable_budget_rule_id"),
  campaignApplicableBudgetRuleName: text("campaign_applicable_budget_rule_name"),
  // Core metrics
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  cost: real("cost").default(0),
  spend: real("spend"),
  costPerClick: real("cost_per_click"),
  clickThroughRate: real("click_through_rate"),
  topOfSearchImpressionShare: real("top_of_search_impression_share"),
  // Sales (all attribution windows + same-SKU)
  sales1d: real("sales_1d"),
  sales7d: real("sales_7d"),
  sales14d: real("sales_14d"),
  sales30d: real("sales_30d"),
  attributedSalesSameSku1d: real("attributed_sales_same_sku_1d"),
  attributedSalesSameSku7d: real("attributed_sales_same_sku_7d"),
  attributedSalesSameSku14d: real("attributed_sales_same_sku_14d"),
  attributedSalesSameSku30d: real("attributed_sales_same_sku_30d"),
  // Purchases (all attribution windows + same-SKU)
  purchases1d: integer("purchases_1d"),
  purchases7d: integer("purchases_7d"),
  purchases14d: integer("purchases_14d"),
  purchases30d: integer("purchases_30d"),
  purchasesSameSku1d: integer("purchases_same_sku_1d"),
  purchasesSameSku7d: integer("purchases_same_sku_7d"),
  purchasesSameSku14d: integer("purchases_same_sku_14d"),
  purchasesSameSku30d: integer("purchases_same_sku_30d"),
  // Units sold (clicks + same-SKU)
  unitsSoldClicks1d: integer("units_sold_clicks_1d"),
  unitsSoldClicks7d: integer("units_sold_clicks_7d"),
  unitsSoldClicks14d: integer("units_sold_clicks_14d"),
  unitsSoldClicks30d: integer("units_sold_clicks_30d"),
  unitsSoldSameSku1d: integer("units_sold_same_sku_1d"),
  unitsSoldSameSku7d: integer("units_sold_same_sku_7d"),
  unitsSoldSameSku14d: integer("units_sold_same_sku_14d"),
  unitsSoldSameSku30d: integer("units_sold_same_sku_30d"),
  // Efficiency
  acosClicks14d: real("acos_clicks_14d"),
  roasClicks14d: real("roas_clicks_14d"),
  // Other
  addToList: integer("add_to_list"),
  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex("amazon_sp_ads_org_date_campaign_idx")
    .on(table.orgId, table.date, table.campaignId),
]);

// ── Amazon Ads Pending Reports (Cron Bridge) ────────────
export const amazonAdsPendingReports = pgTable("amazon_ads_pending_reports", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  reportId: text("report_id").notNull(),
  reportDate: date("report_date").notNull(),
  status: text("status").notNull().default("pending"), // pending | completed | failed
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Amazon Orders (SP-API, real-time) ────────────────────
export const amazonOrders = pgTable("amazon_orders", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  amazonOrderId: text("amazon_order_id").notNull(),
  orderItemId: text("order_item_id").notNull(),
  purchaseDate: timestamp("purchase_date", { withTimezone: true }).notNull(),
  lastUpdateDate: timestamp("last_update_date", { withTimezone: true }),
  orderStatus: text("order_status"),
  fulfillmentChannel: text("fulfillment_channel"),
  asin: text("asin"),
  sellerSku: text("seller_sku"),
  title: text("title"),
  quantityOrdered: integer("quantity_ordered").default(0),
  quantityShipped: integer("quantity_shipped").default(0),
  itemPrice: decimal("item_price", { precision: 12, scale: 2 }).default("0"),
  itemCurrency: text("item_currency").default("GBP"),
  isPrime: boolean("is_prime").default(false),
  isBusinessOrder: boolean("is_business_order").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex("amazon_orders_org_order_item_idx")
    .on(table.orgId, table.amazonOrderId, table.orderItemId),
]);

// ── Relations ─────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  userOrganizations: many(userOrganizations),
}));

export const usersRelations = relations(users, ({ many }) => ({
  userOrganizations: many(userOrganizations),
}));

export const userOrganizationsRelations = relations(userOrganizations, ({ one }) => ({
  user: one(users, {
    fields: [userOrganizations.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [userOrganizations.orgId],
    references: [organizations.id],
  }),
}));

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
