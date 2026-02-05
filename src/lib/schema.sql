-- Sync logs table to track cron job executions
CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  synced_at TIMESTAMPTZ NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shopify sessions data
CREATE TABLE IF NOT EXISTS shopify_sessions (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  sessions INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  page_views INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date)
);

-- Facebook ads data
CREATE TABLE IF NOT EXISTS facebook_ads (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  campaign_id VARCHAR(100),
  campaign_name VARCHAR(255),
  spend DECIMAL(10, 2) NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Amazon data
CREATE TABLE IF NOT EXISTS amazon_sales (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  order_count INTEGER NOT NULL DEFAULT 0,
  units_sold INTEGER NOT NULL DEFAULT 0,
  revenue DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date)
);

-- Users (synced from Clerk on first login)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- App settings (encrypted key-value store)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign send log (audit trail)
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  template_name TEXT NOT NULL,
  total_count INTEGER NOT NULL,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  sent_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual message results
CREATE TABLE IF NOT EXISTS campaign_messages (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id),
  phone TEXT NOT NULL,
  first_name TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sync_logs_source ON sync_logs(source);
CREATE INDEX IF NOT EXISTS idx_sync_logs_synced_at ON sync_logs(synced_at);
CREATE INDEX IF NOT EXISTS idx_shopify_sessions_date ON shopify_sessions(date);
CREATE INDEX IF NOT EXISTS idx_facebook_ads_date ON facebook_ads(date);
CREATE INDEX IF NOT EXISTS idx_amazon_sales_date ON amazon_sales(date);
