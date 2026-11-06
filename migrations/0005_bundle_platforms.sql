-- Pro Plattform festhalten, was aus einem Video geworden ist.
--
-- Anlass: der erste echte Clip ("maxtornow-video.mp4") ging auf Instagram
-- raus und scheiterte auf TikTok. Bei uns stand trotzdem "scheduled" — eine
-- einzige Spalte kann "auf einer Plattform draußen, auf der anderen
-- gescheitert" schlicht nicht ausdrücken, und der Fehler stand nur drüben
-- im Dashboard des Anbieters.
--
-- Inhalt: JSON, Schlüssel ist der Plattformname des Anbieters.
--   {"INSTAGRAM":{"state":"posted","url":"https://…","attempts":1},
--    "TIKTOK":{"state":"failed","error":"…","attempts":1}}
--
-- NULL heißt: noch nichts versucht. `attempts` begrenzt die automatischen
-- Wiederholungen, damit ein dauerhaft abgelehnter Clip nicht täglich erneut
-- gegen dieselbe Wand läuft.

ALTER TABLE `deliverables` ADD COLUMN `bundle_platforms` TEXT;
