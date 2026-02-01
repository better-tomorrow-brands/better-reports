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

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sync_logs_source ON sync_logs(source);
CREATE INDEX IF NOT EXISTS idx_sync_logs_synced_at ON sync_logs(synced_at);
CREATE INDEX IF NOT EXISTS idx_shopify_sessions_date ON shopify_sessions(date);
CREATE INDEX IF NOT EXISTS idx_facebook_ads_date ON facebook_ads(date);
CREATE INDEX IF NOT EXISTS idx_amazon_sales_date ON amazon_sales(date);
