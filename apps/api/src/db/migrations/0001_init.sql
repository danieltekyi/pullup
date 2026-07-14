-- PullUp v2 D1 schema — initial migration
-- Run with: wrangler d1 execute pullup-dev --file=src/db/migrations/0001_init.sql

PRAGMA foreign_keys = ON;

-- Branches (physical operational locations)
CREATE TABLE IF NOT EXISTS branches (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  city         TEXT NOT NULL,
  country      TEXT NOT NULL,
  currency     TEXT NOT NULL,
  timezone     TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users (keyed by Cloudflare Access email)
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK(role IN ('super-admin','manager','rider')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  branch_id      TEXT,
  manager_id     TEXT,
  rider_id       TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);

-- Riders (physical delivery workers)
CREATE TABLE IF NOT EXISTS riders (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  phone              TEXT NOT NULL,
  email              TEXT,
  zone               TEXT NOT NULL,
  branch_id          TEXT NOT NULL,
  manager_id         TEXT,
  status             TEXT NOT NULL DEFAULT 'active',
  vehicle_id         TEXT,
  rate_per_delivery  REAL,
  rate_pct_of_fee    REAL,
  documents          TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at         TEXT,
  version            INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_riders_branch ON riders(branch_id);

-- Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
  id                 TEXT PRIMARY KEY,
  branch_id          TEXT NOT NULL,
  make               TEXT NOT NULL,
  model              TEXT NOT NULL,
  registration       TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'available',
  tracker_config     TEXT,
  insurance_expiry   TEXT,
  license_expiry     TEXT,
  odometer_km        REAL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at         TEXT,
  version            INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_vehicles_branch ON vehicles(branch_id);

-- Partners (external order sources)
CREATE TABLE IF NOT EXISTS partners (
  id                 TEXT PRIMARY KEY,
  branch_id          TEXT,
  name               TEXT NOT NULL,
  get_url            TEXT,
  put_url_template   TEXT,
  api_key            TEXT,
  webhook_secret     TEXT,
  active             INTEGER NOT NULL DEFAULT 1,
  last_fetched_at    TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  version            INTEGER NOT NULL DEFAULT 1
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id             TEXT PRIMARY KEY,
  branch_id      TEXT NOT NULL,
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT,
  addresses      TEXT,
  total_orders   INTEGER NOT NULL DEFAULT 0,
  total_spent    REAL NOT NULL DEFAULT 0,
  last_order_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_branch ON customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone  ON customers(phone);

-- Orders (the core entity)
CREATE TABLE IF NOT EXISTS orders (
  id                          TEXT PRIMARY KEY,
  branch_id                   TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'pending',
  priority                    TEXT NOT NULL DEFAULT 'normal',
  customer_id                 TEXT,
  customer_name               TEXT NOT NULL,
  customer_phone              TEXT,
  destination                 TEXT NOT NULL,
  destination_zone            TEXT,
  origin_zone                 TEXT,
  weight                      REAL,
  parcel_count                INTEGER,
  description                 TEXT,
  cost                        REAL,
  pricing_mode                TEXT,
  payment_method              TEXT NOT NULL DEFAULT 'prepaid',
  cod_collected               REAL,
  assigned_to                 TEXT,
  assigned_at                 TEXT,
  bike_id                     TEXT,
  sla_by                      TEXT,
  picked_up_at                TEXT,
  delivered_at                TEXT,
  confirmed_at                TEXT,
  rejected_at                 TEXT,
  failed_at                   TEXT,
  failure_reason              TEXT,
  failure_note                TEXT,
  proof                       TEXT,
  partner_id                  TEXT,
  partner_order_id            TEXT,
  delivery_fee_from_partner   REAL,
  revenue_status              TEXT NOT NULL DEFAULT 'none',
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by                  TEXT,
  deleted_at                  TEXT,
  version                     INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_orders_branch_created  ON orders(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_rider_created   ON orders(assigned_to, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_partner_ref     ON orders(partner_id, partner_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status          ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer        ON orders(customer_id);

-- Order events (audit trail)
CREATE TABLE IF NOT EXISTS order_events (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL,
  type           TEXT NOT NULL,
  actor          TEXT NOT NULL,
  at             TEXT NOT NULL DEFAULT (datetime('now')),
  before_state   TEXT,
  after_state    TEXT,
  note           TEXT,
  metadata       TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_events_order_at ON order_events(order_id, at DESC);

-- Expenditures
CREATE TABLE IF NOT EXISTS expenditures (
  id           TEXT PRIMARY KEY,
  branch_id    TEXT NOT NULL,
  category     TEXT NOT NULL,
  description  TEXT NOT NULL,
  amount       REAL NOT NULL,
  date         TEXT NOT NULL,
  vehicle_id   TEXT,
  rider_id     TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT,
  version      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_exp_branch_date ON expenditures(branch_id, date DESC);

-- Permissions per role
CREATE TABLE IF NOT EXISTS permissions (
  role          TEXT PRIMARY KEY,
  permissions   TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- System params (physics constants, general settings)
CREATE TABLE IF NOT EXISTS params (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL,
  key          TEXT NOT NULL,
  value        TEXT NOT NULL,
  label        TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_params_category ON params(category);

-- Zones (delivery rings)
CREATE TABLE IF NOT EXISTS zones (
  id           TEXT PRIMARY KEY,
  branch_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  ord          INTEGER NOT NULL,
  polygon      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_zones_branch ON zones(branch_id);

-- Zone-to-zone rate matrix (bidirectional key: sorted ids)
CREATE TABLE IF NOT EXISTS zone_rates (
  pair_key     TEXT PRIMARY KEY,
  branch_id    TEXT NOT NULL,
  rate         REAL NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Web Push subscriptions
CREATE TABLE IF NOT EXISTS push_subs (
  user_id      TEXT NOT NULL,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, endpoint)
);
