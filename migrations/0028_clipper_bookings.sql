-- Agenturen buchen Clipper (Vorgabe des Auftraggebers, November 2026), genau wie Creator:
-- eine Buchung ist nur eine ANFRAGE. Ins Team kommt der Clipper erst mit der Bestätigung
-- im Admin (decideBooking → addToTeam). Gebucht wird nur für eine EIGENE Kampagne.
CREATE TABLE clipper_bookings (
  id TEXT PRIMARY KEY,
  agency_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clipper_id TEXT NOT NULL REFERENCES clippers(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  message TEXT,
  -- angefragt | bestaetigt | abgelehnt
  status TEXT NOT NULL DEFAULT 'angefragt',
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX clipper_bookings_agency_idx ON clipper_bookings (agency_user_id, created_at);
CREATE INDEX clipper_bookings_status_idx ON clipper_bookings (status, created_at);
