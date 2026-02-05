import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

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

// ── Campaigns ──────────────────────────────────────────
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  templateName: text("template_name").notNull(),
  totalCount: integer("total_count").notNull(),
  successCount: integer("success_count").default(0),
  failCount: integer("fail_count").default(0),
  sentBy: text("sent_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const campaignMessages = pgTable("campaign_messages", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => campaigns.id),
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
