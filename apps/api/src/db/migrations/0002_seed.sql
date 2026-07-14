-- Seed data — default branch, default permissions.
-- Run once per environment: wrangler d1 execute pullup-dev --file=src/db/migrations/0002_seed.sql

INSERT OR IGNORE INTO branches (id, name, city, country, currency, timezone) VALUES
  ('default', 'Head Office', 'Accra', 'Ghana', 'GHS', 'Africa/Accra');

INSERT OR IGNORE INTO permissions (role, permissions) VALUES
  ('super-admin', '{"menus":{"dashboard":true,"orders":true,"riders":true,"fleet":true,"partners":true,"finance":true,"customers":true,"users":true,"branches":true,"params":true,"zones":true,"physics":true,"settings":true,"audit":true},"actions":{"orders":{"create":true,"read":true,"update":true,"delete":true},"riders":{"create":true,"read":true,"update":true,"delete":true},"fleet":{"create":true,"read":true,"update":true,"delete":true},"partners":{"create":true,"read":true,"update":true,"delete":true},"finance":{"create":true,"read":true,"update":true,"delete":true},"customers":{"create":true,"read":true,"update":true,"delete":true},"users":{"create":true,"read":true,"update":true,"delete":true},"branches":{"create":true,"read":true,"update":true,"delete":true},"params":{"create":true,"read":true,"update":true,"delete":true},"zones":{"create":true,"read":true,"update":true,"delete":true}}}'),
  ('manager',     '{"menus":{"dashboard":true,"orders":true,"riders":true,"fleet":true,"partners":true,"finance":true,"customers":true,"zones":true,"physics":true,"settings":true},"actions":{"orders":{"create":true,"read":true,"update":true,"delete":true},"riders":{"create":true,"read":true,"update":true,"delete":true},"fleet":{"create":true,"read":true,"update":true,"delete":true},"partners":{"create":true,"read":true,"update":true,"delete":false},"finance":{"create":true,"read":true,"update":true,"delete":true},"customers":{"create":true,"read":true,"update":true,"delete":true},"users":{"create":false,"read":false,"update":false,"delete":false},"branches":{"create":false,"read":true,"update":false,"delete":false},"params":{"create":false,"read":true,"update":false,"delete":false},"zones":{"create":true,"read":true,"update":true,"delete":false}}}'),
  ('rider',       '{"menus":{"orders":true,"settings":true},"actions":{"orders":{"create":false,"read":true,"update":true,"delete":false}}}');

INSERT OR IGNORE INTO params (id, category, key, value, label) VALUES
  ('phy_fuel_price',       'physics', 'fuel_price',              '14.0',  'Fuel price per litre'),
  ('phy_base_efficiency',  'physics', 'base_efficiency',         '35.0',  'Base efficiency km/L'),
  ('phy_max_payload',      'physics', 'max_payload',             '50.0',  'Max payload kg'),
  ('phy_alpha',            'physics', 'alpha',                   '0.3',   'Fuel-load coefficient'),
  ('phy_maint_rate',       'physics', 'maintenance_rate_per_km', '0.08',  'Maintenance rate/km'),
  ('phy_beta',             'physics', 'beta',                    '0.2',   'Wear-load coefficient'),
  ('phy_terrain',          'physics', 'terrain_factor',          '1.0',   'Terrain factor'),
  ('phy_salary',           'physics', 'salary_per_delivery',     '5.0',   'Salary per delivery'),
  ('phy_overhead',         'physics', 'overhead_per_delivery',   '2.0',   'Overhead per delivery'),
  ('phy_margin',           'physics', 'profit_margin',           '20.0',  'Profit margin %'),
  ('gen_currency',         'general', 'currency',                'GHS',   'Default currency');
