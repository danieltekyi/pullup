-- Grace window for riders who predate the compliance model.
--
-- When 0003 landed there were four active riders and zero documents on file.
-- Their compliance_status defaulted to 'pending', which passes dispatch — but
-- a fresh evaluation would have returned 'blocked', because every required
-- document was missing. Two consequences, both bad:
--
--   1. The first rider to upload anything triggers a recompute, still has three
--      documents outstanding, and is blocked for having tried to comply.
--   2. Any sweep touching the table grounds the entire fleet at once.
--
-- A grace window fixes both: missing documents warn rather than block until the
-- deadline. Expired cover and rejected documents block immediately regardless,
-- because a grace period on lapsed insurance would defeat the point of checking
-- at all.
ALTER TABLE riders ADD COLUMN compliance_grace_until TEXT;

-- Existing riders get 30 days from today. New riders get nothing: they are
-- onboarded under the current rules and supply documents before their first
-- round.
UPDATE riders
   SET compliance_grace_until = datetime('now', '+30 days')
 WHERE deleted_at IS NULL
   AND compliance_grace_until IS NULL;
