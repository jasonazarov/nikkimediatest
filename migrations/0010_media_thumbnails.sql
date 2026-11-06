-- Vorschaubilder für Rohmaterial und fertige Clips.
--
-- Bis hierher war jede Kachel der Projektseite im Adminbereich ein echtes
-- <video>, das auf die ORIGINALDATEI zeigte. Ein Ordner mit dreißig
-- Rohaufnahmen ließ den Browser damit dreißig Videodateien von je mehreren
-- hundert Megabyte anfassen — Kopfdaten lesen, an Sekunde 0,4 springen, ein
-- Bild decodieren, und das alles gleichzeitig. Die Seite ruckelte, und das
-- Video, das Jason dann wirklich ansehen wollte, teilte sich die Leitung mit
-- dreißig Vorschauen, die niemand brauchte. Genau das war die Meldung
-- „das Video steckt und laggt sehr stark".
--
-- Seitdem liegt neben jeder Datei ein JPEG von wenigen Dutzend Kilobyte. Die
-- Kachel ist ein <img>, das Original wird erst angefasst, wenn jemand den
-- Player öffnet.
--
--   thumb_key       Schlüssel des Vorschaubilds in R2. NULL = noch keins.
--   thumb_tried_at  Zeitpunkt eines gescheiterten Versuchs. Nicht jede Datei
--                   lässt sich im Browser decodieren (ProRes, AVI, MKV) —
--                   ohne diese Spalte liefe der Versuch bei jedem Seitenaufruf
--                   erneut und lüde jedes Mal umsonst Videodaten.
ALTER TABLE raw_assets ADD COLUMN thumb_key TEXT;
ALTER TABLE raw_assets ADD COLUMN thumb_tried_at INTEGER;

-- deliverables.thumbnail_key gibt es seit 0000_init.sql, war aber nie belegt.
-- Ab jetzt trägt es dasselbe wie raw_assets.thumb_key.
ALTER TABLE deliverables ADD COLUMN thumb_tried_at INTEGER;
