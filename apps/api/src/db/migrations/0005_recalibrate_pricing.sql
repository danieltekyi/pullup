-- Recalibrate the delivery API's pricing to what the business actually charges.
--
-- THIS IS A LIVE PRICING FAULT, not a tidy-up.
--
-- Probed production: a 9.2 km, 3 kg delivery quoted GHS 14.36 through the
-- customer app. The same delivery on the website's calculator quotes about
-- GHS 45. The API price is the binding one — publicOrders.ts recomputes it
-- server-side and ignores whatever the client says — so every order booked
-- through the app has been charged roughly a third of the advertised rate.
--
-- The cause is two pricing models that were never reconciled. The website's
-- was recalibrated to the GHS 40–55 band the business sells at, and the retainer
-- overage rate of GHS 45 was set to agree with it. The API kept the seed
-- defaults from 0002_seed.sql, which nobody ever tuned:
--
--     salary_per_delivery   5.00   a rider's entire pay for a delivery
--     overhead_per_delivery 2.00
--     profit_margin        20.00 %
--     fuel_price           14.00
--     base_efficiency      35.00
--     maintenance_rate_per_km 0.08
--
-- GHS 5 a delivery was never realistic, and under the owner-operator model it
-- is impossible: the rider now buys their own fuel out of it.
--
-- The two formulas differ in shape as well as constants. The website adds a
-- margin (raw × 1.45); the API divides to a target margin (raw ÷ (1 − m)).
-- These are reconciled here rather than by rewriting either:
--
--     raw  = 0.7375 d + fixed           (identical in both once the per-km
--                                        rates below are matched)
--     site:  charge = 1.45 × raw
--     api:   charge = raw ÷ (1 − m/100)
--     so     1 ÷ (1 − m/100) = 1.45  →  m = 31.03 %
--
-- Splitting the GHS 24 fixed cost 18/6 between rider pay and overhead reflects
-- the owner-operator model: the rider carries fuel and servicing, so the
-- majority of the fixed component is theirs.
--
-- Verify after applying:
--   /api/public/orders/estimate?lat1=5.56&lng1=-0.20&lat2=5.62&lng2=-0.17&weight=3
--   should return roughly GHS 45, not GHS 14.36.

UPDATE params SET value = '15.5'  WHERE category = 'physics' AND key = 'fuel_price';
UPDATE params SET value = '40.0'  WHERE category = 'physics' AND key = 'base_efficiency';
UPDATE params SET value = '0.35'  WHERE category = 'physics' AND key = 'maintenance_rate_per_km';
UPDATE params SET value = '18.0'  WHERE category = 'physics' AND key = 'salary_per_delivery';
UPDATE params SET value = '6.0'   WHERE category = 'physics' AND key = 'overhead_per_delivery';
UPDATE params SET value = '31.03' WHERE category = 'physics' AND key = 'profit_margin';

-- Inserted as well as updated: loadPhysicsParams falls back to PHYSICS_DEFAULTS
-- for any key missing from the table, so a row that was never seeded would
-- silently keep the old default and undo half of this.
INSERT OR IGNORE INTO params (id, category, key, value, label) VALUES
  ('phy_fuel_price',       'physics', 'fuel_price',              '15.5',  'Fuel price per litre'),
  ('phy_base_efficiency',  'physics', 'base_efficiency',         '40.0',  'Km per litre, unladen'),
  ('phy_maintenance',      'physics', 'maintenance_rate_per_km', '0.35',  'Wear and tear per km'),
  ('phy_salary',           'physics', 'salary_per_delivery',     '18.0',  'Rider pay per delivery'),
  ('phy_overhead',         'physics', 'overhead_per_delivery',   '6.0',   'Overhead per delivery'),
  ('phy_margin',           'physics', 'profit_margin',           '31.03', 'Profit margin %');
