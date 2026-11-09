-- Extern gepostete Videos (Vorgabe des Auftraggebers, November 2026): Clipper posten oft
-- selbst, direkt in der App der Plattform. Solche Videos kennt die Plattform nicht, ihre Views
-- fehlten deshalb im Dashboard, obwohl der Account an der Kampagne hängt.
-- Zernio liest die Posts jedes verbundenen Accounts selbst von der Plattform
-- (GET /v1/analytics?accountId=…&source=external). lib/metrics.ts holt sie stündlich ab und
-- schreibt sie hierher, je Post und Account. Gezählt werden sie für die Kampagne, an der der
-- Account hängt (publish_accounts.project_id). Über die Plattform veröffentlichte Posts stehen
-- weiter nur in post_metrics und werden hier nicht doppelt geführt.
CREATE TABLE external_posts (
  -- ID des externen Posts bei Zernio (posts[]._id)
  post_id TEXT NOT NULL,
  -- Account-ID beim Anbieter, wie publish_accounts.provider_account_id
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  -- ohne führendes @
  username TEXT,
  url TEXT,
  thumb_url TEXT,
  published_at INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, account_id)
);
CREATE INDEX external_posts_project_idx ON external_posts (project_id);
CREATE INDEX external_posts_account_idx ON external_posts (account_id);
