-- Bisher ging die Job-Mail (Zusage oder Ausschreibung) im selben Moment
-- raus, in dem der Kunde ein Projekt anlegt — der Ordner ist da noch leer.
-- Freelancer bekamen so Post zu Jobs, an denen es nichts zu tun gab.
--
-- `job_notified_at` hält fest, ob die Mail für ein Projekt schon verschickt
-- wurde. NULL heißt: noch nicht — sie folgt erst, wenn tatsächlich fertig
-- hochgeladenes Rohmaterial im Projekt liegt (siehe `notifyFootageUploaded`
-- in domain.ts, aufgerufen beim Abschluss eines Uploads).

ALTER TABLE `projects` ADD COLUMN `job_notified_at` INTEGER;
