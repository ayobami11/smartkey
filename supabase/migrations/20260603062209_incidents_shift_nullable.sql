-- Make incidents.shift_id nullable.
-- The original migration set this NOT NULL, but incidents can be logged
-- outside of any active shift (e.g. during testing, or when the shift
-- scheduling system has not yet created a shift row). The application
-- layer already passes null when no active shift is found.

ALTER TABLE public.incidents
  ALTER COLUMN shift_id DROP NOT NULL;
