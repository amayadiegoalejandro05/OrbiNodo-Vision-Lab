-- Optimistic concurrency for camera operational updates.
-- The migration runner executes this file inside its transaction.
ALTER TABLE camera_operational_state
  ADD COLUMN lock_version integer NOT NULL DEFAULT 0;

ALTER TABLE camera_operational_state
  ADD CONSTRAINT camera_operational_lock_version_nonnegative
  CHECK (lock_version >= 0);