-- Rider compliance for the owner-operator model.
--
-- PullUp no longer buys bikes. Riders work their own machines, which moves a
-- pile of risk from the company's balance sheet onto its dispatch decisions:
-- when PullUp owned the fleet it controlled the insurance and the servicing.
-- Now it has to verify them, and it has to refuse work to a rider who cannot
-- show cover. Ghana requires third-party motor insurance and a roadworthy
-- certificate to operate a vehicle commercially, and dispatching a rider
-- without either exposes the business directly.
--
-- The vehicles table already carried insurance_expiry and license_expiry, but
-- they described company assets and nothing ever blocked on them. This models
-- the rider's own documents instead, with a verification step, because a
-- self-reported expiry date is not evidence.

CREATE TABLE IF NOT EXISTS rider_documents (
  id                 TEXT PRIMARY KEY,
  rider_id           TEXT NOT NULL,
  -- One of the DOCUMENT_TYPES in @pullup/shared. Not a CHECK constraint: the
  -- list will grow, and a migration to add a document type would be absurd.
  type               TEXT NOT NULL,
  -- Licence number, policy number, certificate number. Free text because the
  -- formats differ by issuer and none of them are ours to validate.
  reference          TEXT,
  issued_on          TEXT,
  -- Null means the document does not expire (a Ghana Card, for instance).
  expires_on         TEXT,
  -- R2 object key for the photographed document. Never a public URL: these are
  -- identity documents and must be fetched through an authorised endpoint.
  file_key           TEXT,
  file_type          TEXT,
  -- pending | verified | rejected | expired
  -- 'expired' is computed by the sweep rather than trusted from the client.
  status             TEXT NOT NULL DEFAULT 'pending',
  verified_by        TEXT,
  verified_at        TEXT,
  -- Shown to the rider so a rejection is actionable rather than mysterious.
  rejection_reason   TEXT,
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at         TEXT,
  version            INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_rider_docs_rider ON rider_documents(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_docs_status ON rider_documents(status);
-- Drives the expiry sweep: find what lapses soonest without scanning the table.
CREATE INDEX IF NOT EXISTS idx_rider_docs_expiry ON rider_documents(expires_on)
  WHERE deleted_at IS NULL AND expires_on IS NOT NULL;

-- A rider may hold several versions of the same document over time — last
-- year's insurance and this year's. Only one may be live at a time, or
-- "is this rider covered" has no single answer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rider_docs_one_active
  ON rider_documents(rider_id, type)
  WHERE deleted_at IS NULL;

-- Rider-side fields for the owner-operator model.
ALTER TABLE riders ADD COLUMN owns_bike INTEGER NOT NULL DEFAULT 1;
-- blocked | pending | compliant — denormalised from rider_documents so the
-- dispatch check is one read rather than a join on every assignment.
-- Recomputed on every document change and by the sweep; never edited by hand.
ALTER TABLE riders ADD COLUMN compliance_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE riders ADD COLUMN compliance_checked_at TEXT;
-- The earliest expiry across the rider's required documents. Lets the console
-- sort by "who lapses next" without recomputing per row.
ALTER TABLE riders ADD COLUMN compliance_expires_on TEXT;

CREATE INDEX IF NOT EXISTS idx_riders_compliance ON riders(compliance_status);

-- Bike details, now the rider's property rather than a fleet asset.
ALTER TABLE riders ADD COLUMN bike_registration TEXT;
ALTER TABLE riders ADD COLUMN bike_make TEXT;
ALTER TABLE riders ADD COLUMN bike_model TEXT;
