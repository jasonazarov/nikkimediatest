-- Passwort-Login als zusätzlicher Weg neben dem E-Mail-Code.
--
-- Beide Spalten sind NULL-bar: Konten ohne gesetztes Passwort melden sich
-- unverändert per achtstelligem Code an. Erst wenn password_hash gefüllt
-- ist, akzeptiert /login für diese Adresse auch ein Passwort.
--
-- Format von password_hash:  pbkdf2$sha256$<runden>$<salt-hex>$<hash-hex>

ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_set_at INTEGER;
