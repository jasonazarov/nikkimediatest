import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  check,
  foreignKey,
} from 'drizzle-orm/sqlite-core'

/* --------------------------------------------------------------------------
   Zeitstempel liegen als Unix-Sekunden (INTEGER) in der Datenbank. Das hält
   Sortierung und Vergleiche in SQLite trivial und spart Zeitzonen-Themen.
   -------------------------------------------------------------------------- */
const now = () => Math.floor(Date.now() / 1000)

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    role: text('role', { enum: ['admin', 'customer', 'clipper', 'creator', 'agency'] }).notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    /**
     * Optional. Wer kein Passwort gesetzt hat, loggt sich weiterhin
     * ausschließlich per E-Mail-Code ein. Format siehe `hashPassword`.
     */
    passwordHash: text('password_hash'),
    passwordSetAt: integer('password_set_at'),
    /**
     * Wann diese Adresse zum ersten Mal per Code (oder Passwort) bestätigt
     * wurde. NULL heißt: ein Selbsteintrag, dessen Inhaber sich noch nie mit
     * einem Code gemeldet hat. Siehe `completeLogin` in routes/auth.ts.
     */
    verifiedAt: integer('verified_at'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    lastLoginAt: integer('last_login_at'),
    /**
     * 1 = Demo-Konto (seit 0022): Passwort-Login unter /login/demo, keine
     * Mails an die Adresse, für echte Agenturen unsichtbar. Siehe lib/demo.ts.
     */
    demo: integer('demo').notNull().default(0),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
)

export const loginCodes = sqliteTable(
  'login_codes',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    usedAt: integer('used_at'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('login_codes_email_idx').on(t.email, t.createdAt)],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex('sessions_token_unique').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
)

export const leads = sqliteTable(
  'leads',
  {
    id: text('id').primaryKey(),
    fullName: text('full_name').notNull(),
    company: text('company'),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    /** JSON-Array, z. B. ["instagram","tiktok"] */
    platforms: text('platforms').notNull(),
    industry: text('industry').notNull(),
    footageAmount: text('footage_amount').notNull(),
    budgetRange: text('budget_range').notNull(),
    status: text('status').notNull().default('neu'),
    notes: text('notes'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    customerId: text('customer_id').references(() => customers.id),
  },
  (t) => [index('leads_status_idx').on(t.status, t.createdAt)],
)

export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    company: text('company'),
    storageBytes: integer('storage_bytes').notNull().default(0),
    storageWarnedAt: integer('storage_warned_at'),
    /**
     * Gesetzt, sobald der Administrator diesen Zugang ausdrücklich zum Kunden
     * erklärt. NULL heißt: eingetragener Lead mit eigenem Arbeitsbereich, aber
     * (noch) kein Kunde — er taucht deshalb nicht unter /admin/kunden auf.
     * Nicht jeder Lead wird ein Kunde; diese Entscheidung trifft allein Jason.
     */
    convertedAt: integer('converted_at'),
    /** Aufschlag einer Agentur auf unsere Preise in Prozent (Migration 0023, nur Anzeige). */
    marginPct: integer('margin_pct').notNull().default(0),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('customers_user_idx').on(t.userId)],
)

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status').notNull().default('aktiv'),
    /**
     * ALTLAST seit Migration 0018 — wird nicht mehr gelesen oder geschrieben.
     * Früher hatte ein Projekt genau einen Bearbeiter; heute stehen beliebig
     * viele in `projectWorkers`.
     */
    claimedBy: text('claimed_by').references(() => clippers.id, { onDelete: 'set null' }),
    claimedAt: integer('claimed_at'),
    /**
     * Gesetzt, sobald die Mail „wartet auf Zuordnung“ an den Admin verschickt
     * wurde (die Bearbeiter haben ihre eigene Sperre: `projectWorkers.notifiedAt`). NULL heißt: der Ordner ist noch leer — die Mail folgt
     * erst, wenn der Kunde wirklich Rohmaterial hochlädt (siehe
     * `notifyFootageUploaded` in domain.ts). Ohne diese Sperre bekämen
     * Clipper Post zu Jobs, deren Ordner nichts enthält.
     */
    jobNotifiedAt: integer('job_notified_at'),
    /**
     * Warum für dieses Projekt kein Veröffentlichungs-Steckplatz entstand.
     * NULL heißt: kein Fehler bekannt — entweder steht alles (siehe
     * `publishProfiles`) oder es wurde noch nichts versucht.
     */
    publishError: text('publish_error'),
    publishTriedAt: integer('publish_tried_at'),
    /**
     * 1 = der Kunde (oder der Administrator) erlaubt, dass die fertigen Clips
     * zusätzlich über die Accounts beigetretener Creator laufen (siehe
     * `campaignCreators`, `clipApprovals`). Standard ist aus: ohne
     * ausdrückliche Zustimmung landet kein Kunden-Clip auf fremden Kanälen.
     */
    creatorDistribution: integer('creator_distribution').notNull().default(0),
    /**
     * Eigenes Thumbnail der Kampagne in R2 (JPEG, hochgeladen von Admin,
     * Kunde oder Creator). NULL heißt: automatisch — ein Bild aus dem
     * Rohmaterial oder das Symbol des Cloud-Anbieters (`campaignThumbs`).
     */
    thumbKey: text('thumb_key'),
    /**
     * Das Briefing einer Agentur-Kampagne (seit Migration 0020): Jede Kampagne
     * einer Agentur entsteht über „Kampagne starten“ — Views, Budget, Auftrag
     * hängen an ihr. NULL bei Kampagnen von Kunden, Creatorn und dem Admin.
     */
    briefingViews: integer('briefing_views'),
    briefingBudgetCents: integer('briefing_budget_cents'),
    /** Siehe AGENCY_PACKAGES — seit Migration 0022 nur noch beim ersten Briefing. */
    briefingPackage: text('briefing_package'),
    /** Bereich (INDUSTRIES) und Plattformen (JSON-Array) aus „Neue Kampagne“, seit 0022. */
    briefingNiche: text('briefing_niche'),
    /** Laufzeit in Tagen (30/60/90), aus „Neue Kampagne“ im Kunden-Dashboard (Migration 0024). */
    briefingDurationDays: integer('briefing_duration_days'),
    briefingPlatforms: text('briefing_platforms'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    index('projects_customer_idx').on(t.customerId),
    index('projects_claimed_idx').on(t.claimedBy),
  ],
)

export const clippers = sqliteTable(
  'clippers',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    status: text('status', { enum: ['eingeladen', 'aktiv'] }).notNull().default('eingeladen'),
    invitedAt: integer('invited_at'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('clippers_user_idx').on(t.userId)],
)

/**
 * Wer an einer Kampagne arbeitet — beliebig viele Clipper und Creator je
 * Kampagne (ein Creator über seine Zeile in `clippers`). Zugeordnet wird
 * ausschließlich vom Administrator.
 */
export const projectWorkers = sqliteTable(
  'project_workers',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    clipperId: text('clipper_id')
      .notNull()
      .references(() => clippers.id, { onDelete: 'cascade' }),
    assignedAt: integer('assigned_at').notNull().$defaultFn(now),
    /** Wann die Job-Mail an ihn rausging — NULL: noch nicht (kein Material). */
    notifiedAt: integer('notified_at'),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.clipperId] }),
    index('project_workers_clipper_idx').on(t.clipperId),
  ],
)

/**
 * Preisstaffelung je Clipper oder Creator: „Ab <minViews> Views →
 * <amountCents> Cent“. Legt allein der Administrator fest; der Clipper bzw.
 * Creator sieht sie ganz oben in seiner Übersicht.
 */
export const payTiers = sqliteTable(
  'pay_tiers',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    minViews: integer('min_views').notNull(),
    amountCents: integer('amount_cents').notNull(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('pay_tiers_user_idx').on(t.userId, t.minViews)],
)

/**
 * Creator — Influencer und UGC-Creator — mit ihren Angaben aus /creator.
 *
 * Ein Creator ist zugleich Auftraggeber und Bearbeiter: Für seine EIGENEN
 * Kampagnen hat er eine Zeile in `customers` (Arbeitsbereich mit Projekten,
 * Ordnern, Uploads), und um Kampagnen ANNEHMEN zu können, eine Zeile in
 * `clippers`. Hier steht nur, was ihn als Creator beschreibt. Die Werte sind
 * die Schlüssel aus den CREATOR_*-Listen in domain.ts.
 */
export const creators = sqliteTable(
  'creators',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** suchen | haben | beides */
    goal: text('goal').notNull(),
    /** Nische aus INDUSTRIES (domain.ts) — leer bei Creatorn von vor Oktober 2026. */
    niche: text('niche'),
    /** JSON-Array, z. B. ["instagram","tiktok"] */
    platforms: text('platforms').notNull(),
    /** ja | vielleicht | nein */
    openToAds: text('open_to_ads').notNull(),
    followers: text('followers').notNull(),
    viewsTotal: text('views_total').notNull(),
    views30d: text('views_30d').notNull(),
    /** JSON-Objekt { plattform: handle } — ohne führendes @ */
    handles: text('handles').notNull(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex('creators_user_unique').on(t.userId)],
)

/**
 * Was ein Clipper beim Selbsteintrag über /clipper angegeben hat.
 *
 * Eine eigene Tabelle statt Spalten an `clippers`: wer vom Administrator
 * eingeladen wird, füllt dieses Formular nie aus. Geht der Zugang, geht die
 * Bewerbung mit — sie beschreibt diesen Menschen und sonst nichts.
 */
export const clipperApplications = sqliteTable(
  'clipper_applications',
  {
    id: text('id').primaryKey(),
    clipperId: text('clipper_id')
      .notNull()
      .references(() => clippers.id, { onDelete: 'cascade' }),
    /** JSON-Array, z. B. ["instagram","tiktok"] */
    platforms: text('platforms').notNull(),
    /** Siehe CLIPPER_WORK_STATUS in domain.ts */
    workStatus: text('work_status').notNull(),
    /** Siehe CLIPPER_EXPERIENCE in domain.ts */
    experience: text('experience').notNull(),
    /** Siehe CLIPPER_AVAILABILITY in domain.ts */
    availability: text('availability').notNull(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('clipper_applications_clipper_idx').on(t.clipperId, t.createdAt)],
)

/**
 * Links zu Cloud-Ordnern (Google Drive, Dropbox, iCloud …) an einem Projekt.
 *
 * Nicht jeder hat sein Rohmaterial auf dem Gerät, an dem er gerade sitzt.
 * Ein Link ist deshalb genauso Material wie eine hochgeladene Datei: mit ihm
 * wird ein Projekt zum Job (siehe `projectHasMaterial` in domain.ts).
 */
export const projectLinks = sqliteTable(
  'project_links',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Immer https — siehe `normalizeCloudLink` in domain.ts. */
    url: text('url').notNull(),
    addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('project_links_project_idx').on(t.projectId, t.createdAt)],
)

export const folders = sqliteTable(
  'folders',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    deletedAt: integer('deleted_at'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    index('folders_customer_idx').on(t.customerId, t.parentId, t.deletedAt),
    index('folders_project_idx').on(t.projectId, t.parentId, t.deletedAt),
  ],
)

export const rawAssets = sqliteTable(
  'raw_assets',
  {
    id: text('id').primaryKey(),
    folderId: text('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    filename: text('filename').notNull(),
    bytes: integer('bytes').notNull().default(0),
    mime: text('mime'),
    /**
     * Vorschaubild in R2 — ein JPEG von wenigen Dutzend Kilobyte.
     *
     * Ohne dieses Bild müsste eine Kachel im Adminbereich die Originaldatei
     * anfassen, um irgendetwas zu zeigen. Bei Rohmaterial sind das schnell
     * mehrere hundert Megabyte JE KACHEL; ein Ordner voller Aufnahmen legte
     * damit die Seite lahm. NULL heißt: noch keins.
     */
    thumbKey: text('thumb_key'),
    /**
     * Wann zuletzt vergeblich versucht wurde, ein Vorschaubild zu erzeugen.
     * Nicht jede Datei lässt sich im Browser decodieren (ProRes, AVI, MKV);
     * ohne diese Spalte liefe der Versuch bei jedem Seitenaufruf erneut.
     */
    thumbTriedAt: integer('thumb_tried_at'),
    /** pending | uploading | complete | aborted */
    uploadStatus: text('upload_status').notNull().default('pending'),
    /** JSON: { uploadId, partSize, parts: [{ partNumber, etag, size }] } */
    uploadParts: text('upload_parts'),
    deletedAt: integer('deleted_at'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    index('raw_assets_folder_idx').on(t.folderId, t.deletedAt),
    index('raw_assets_status_idx').on(t.uploadStatus),
  ],
)

export const deliverables = sqliteTable(
  'deliverables',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    clipperId: text('clipper_id').references(() => clippers.id),
    r2Key: text('r2_key').notNull(),
    filename: text('filename').notNull(),
    caption: text('caption'),
    /** Vorschaubild in R2 — dieselbe Aufgabe wie `rawAssets.thumbKey`. */
    thumbnailKey: text('thumbnail_key'),
    /** Siehe `rawAssets.thumbTriedAt`. */
    thumbTriedAt: integer('thumb_tried_at'),
    seenByCustomer: integer('seen_by_customer').notNull().default(0),
    bytes: integer('bytes').notNull().default(0),
    uploadStatus: text('upload_status').notNull().default('pending'),
    uploadParts: text('upload_parts'),
    /** Die Post-ID beim Anbieter. Eindeutig — siehe Kommentar unten. */
    publishPostId: text('publish_post_id'),
    /**
     * ALLE Post-IDs dieses Videos, als JSON-Array.
     *
     * Je Plattform geht ein eigener Aufruf raus (Begründung in
     * `publishDeliverable`), also entstehen bis zu vier Posts für dasselbe
     * Video. `publish_post_id` trägt weiter die erste — daran hängt der
     * eindeutige Index und damit die Sperre gegen Doppelposts. Wer nachfassen
     * oder ein Webhook-Ereignis zuordnen will, braucht aber die ganze Liste:
     * ein Ereignis zum TikTok-Post trüge sonst eine ID, die wir nicht kennen,
     * und würde verworfen.
     */
    publishPostIds: text('publish_post_ids'),
    /** Siehe PUBLISH_STATUS. NULL heißt: noch nicht angefasst. */
    publishStatus: text('publish_status'),
    /** Klartext-Meldung, falls die Veröffentlichung scheiterte. */
    publishError: text('publish_error'),
    /**
     * Was aus dem Video JE ACCOUNT geworden ist, als JSON.
     *
     * Ein Post geht an alle Accounts eines Projekts gleichzeitig, und die
     * können unterschiedlich ausgehen — genau das ist beim ersten echten
     * Clip passiert (Instagram draußen, TikTok abgelehnt). `publish_status`
     * trägt daraus nur die Zusammenfassung; hier steht, welcher Account wie
     * ausging und warum.
     *
     * Schlüssel ist die ACCOUNT-ID, nicht der Plattformname. Fünf TikTok-
     * Accounts in einem Post ließen sich unter einem Schlüssel "TIKTOK"
     * nicht auseinanderhalten. Aufbau siehe `TargetOutcome` in publisher.ts.
     */
    publishTargets: text('publish_targets'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    index('deliverables_project_idx').on(t.projectId, t.createdAt),
    index('deliverables_clipper_idx').on(t.clipperId),
    /**
     * Zweite Sperre gegen Doppelposts. Ruft der Browser /uploads/complete
     * zweimal auf, kann dieselbe Post-ID kein zweites Mal geschrieben werden.
     * Die erste Sperre ist der `x-request-id`-Kopf beim Anbieter.
     */
    uniqueIndex('deliverables_publish_post_unique').on(t.publishPostId),
  ],
)

/* --------------------------------------------------------------------------
   Veröffentlichung fertiger Clips

   Drei Tabellen, eine Aufgabe: von einem Projekt zu der Liste von Accounts
   kommen, an die ein fertiges Video geht. Seit den Creator-Kampagnen hängen
   Accounts an einem Projekt ODER an einem Creator; welche davon ein Clip
   automatisch bekommt, entscheidet `autoTargetAccounts` in publisher.ts.

   Der Anbieter erlaubt pro Profil nur EINEN Account je Plattform. Für zehn
   Instagram-Accounts eines Kunden entstehen deshalb zehn Profile. Das ist
   Verkabelung, kein Datenmodell: veröffentlicht wird über Account-IDs, und
   zwar alle in EINEM Aufruf. Genau daran ist der Vorgänger gescheitert.
   -------------------------------------------------------------------------- */

/**
 * Ein OAuth-Steckplatz beim Anbieter.
 *
 * `slot` ist die laufende Nummer je Besitzer und Plattform. Sie macht den
 * Namen drüben lesbar und verhindert, dass zwei gleichzeitige Verbindungs-
 * versuche denselben Steckplatz belegen.
 *
 * Besitzer ist ein Projekt ODER ein Creator — genau eins von beiden ist
 * gesetzt (CHECK in Migration 0014). Ein Creator verbindet seine Accounts
 * einmal für sich, nicht je Kampagne: sie gelten für alle seine eigenen
 * Kampagnen und für jede Kunden-Kampagne, die er verbreitet. Je Kampagne neu
 * zu verbinden hieße doppelte Kosten, weil je verbundenem Account
 * abgerechnet wird.
 */
export const publishProfiles = sqliteTable(
  'publish_profiles',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    creatorId: text('creator_id').references(() => creators.id, { onDelete: 'cascade' }),
    providerProfileId: text('provider_profile_id').notNull(),
    /** instagram, tiktok, youtube, … — kleingeschrieben wie beim Anbieter. */
    platform: text('platform').notNull(),
    slot: integer('slot').notNull().default(1),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    /**
     * Gesetzt, wenn der Administrator den letzten Link für diesen Steckplatz
     * erzeugt hat — sein Account zählt dann nie gegen die Obergrenze (siehe
     * `beyondAccountLimit`, Migration 0016).
     */
    adminLinkAt: integer('admin_link_at'),
  },
  (t) => [
    uniqueIndex('publish_profiles_provider_unique').on(t.providerProfileId),
    // NULL zählt in SQLite nicht als gleich — die beiden Indizes stören
    // einander also nicht, obwohl je Zeile eine der beiden Spalten leer ist.
    uniqueIndex('publish_profiles_slot_unique').on(t.projectId, t.platform, t.slot),
    uniqueIndex('publish_profiles_creator_slot_unique').on(t.creatorId, t.platform, t.slot),
    index('publish_profiles_project_idx').on(t.projectId),
    index('publish_profiles_creator_idx').on(t.creatorId),
    check('publish_profiles_owner_check', sql`(${t.projectId} IS NULL) <> (${t.creatorId} IS NULL)`),
  ],
)

/**
 * Spiegel der verbundenen Accounts — die Zielliste für den Versand.
 *
 * Die Wahrheit steht immer beim Anbieter; diese Tabelle spart den API-Aufruf
 * beim Rendern und liefert die Account-IDs für den Post. Besitzer wie beim
 * Steckplatz: ein Projekt ODER ein Creator.
 */
export const publishAccounts = sqliteTable(
  'publish_accounts',
  {
    providerAccountId: text('provider_account_id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    creatorId: text('creator_id').references(() => creators.id, { onDelete: 'cascade' }),
    providerProfileId: text('provider_profile_id').notNull(),
    platform: text('platform').notNull(),
    username: text('username'),
    displayName: text('display_name'),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
  },
  (t) => [
    index('publish_accounts_project_idx').on(t.projectId),
    index('publish_accounts_creator_idx').on(t.creatorId),
    index('publish_accounts_profile_idx').on(t.providerProfileId),
    check('publish_accounts_owner_check', sql`(${t.projectId} IS NULL) <> (${t.creatorId} IS NULL)`),
  ],
)

/**
 * Die Account-Gruppe eines Projekts beim Anbieter.
 *
 * Sie fasst alle Accounts eines Kunden profilübergreifend zusammen und macht
 * dessen Dashboard lesbar. Für den Versand ist sie nicht nötig — deshalb
 * darf ihr Anlegen scheitern, ohne dass etwas anderes stehen bleibt.
 */
export const publishGroups = sqliteTable('publish_groups', {
  projectId: text('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  providerGroupId: text('provider_group_id').notNull(),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
})

/* --------------------------------------------------------------------------
   Verbreitung über Creator

   Ein Kunde kann eine Kampagne für Creator freigeben
   (`projects.creator_distribution`). Beigetretene Creator sehen dann die
   fertigen Clips und stellen sie mit „Freigeben & posten“ auf ihre eigenen
   Kanäle. Das ist etwas anderes als die automatischen Ziele eines Projekts:
   dorthin geht jeder Clip ohne Rückfrage, hierhin nur nach Zustimmung des
   Creators — Clip für Clip.
   -------------------------------------------------------------------------- */

/** Welche Creator eine freigegebene Kampagne verbreiten — beliebig viele. */
export const campaignCreators = sqliteTable(
  'campaign_creators',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    creatorId: text('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    joinedAt: integer('joined_at').notNull().$defaultFn(now),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.creatorId] }),
    index('campaign_creators_creator_idx').on(t.creatorId),
  ],
)

/**
 * Die Freigabe eines Clips durch einen Creator — und was daraus wurde.
 *
 * Die `publish_*`-Spalten sind ein EIGENER Veröffentlichungsstand je Clip und
 * Creator, aufgebaut wie die gleichnamigen Spalten am Deliverable (siehe
 * `TargetOutcome` in publisher.ts). Bewusst nicht dort mit hinein: der Stand
 * am Deliverable trägt die Sperren gegen Doppelposts auf den Projekt-
 * Accounts. Liefe die Verbreitung durch dieselben Spalten, sähe ein Video,
 * das ein Creator gepostet hat, für das Projekt bereits als „draußen“ aus —
 * und umgekehrt.
 */
export const clipApprovals = sqliteTable(
  'clip_approvals',
  {
    deliverableId: text('deliverable_id')
      .notNull()
      .references(() => deliverables.id, { onDelete: 'cascade' }),
    creatorId: text('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    /** Bisher nur 'approved' — eine Zeile entsteht erst mit der Freigabe. */
    status: text('status').notNull(),
    /** Siehe PUBLISH_STATUS. NULL heißt: noch nicht angefasst. */
    publishStatus: text('publish_status'),
    publishError: text('publish_error'),
    /** JSON je Account-ID — wie `deliverables.publish_targets`. */
    publishTargets: text('publish_targets'),
    /** JSON-Array aller Post-IDs — wie `deliverables.publish_post_ids`. */
    publishPostIds: text('publish_post_ids'),
    /** JSON { plattform: url } für Plattformen ohne API (Twitch, Snapchat). */
    manualPosts: text('manual_posts'),
    decidedAt: integer('decided_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
  },
  (t) => [
    primaryKey({ columns: [t.deliverableId, t.creatorId] }),
    index('clip_approvals_creator_idx').on(t.creatorId),
    index('clip_approvals_publish_idx').on(t.publishStatus),
  ],
)

/**
 * Bereits verarbeitete Webhook-Ereignisse.
 *
 * Der Anbieter liefert mindestens einmal zu — bei langsamer Antwort auch
 * zweimal. Ohne diese Sperre würde dasselbe Ereignis doppelt verarbeitet.
 */
export const publishEvents = sqliteTable(
  'publish_events',
  {
    eventId: text('event_id').primaryKey(),
    receivedAt: integer('received_at').notNull().$defaultFn(now),
  },
  (t) => [index('publish_events_received_idx').on(t.receivedAt)],
)

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    payload: text('payload'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
)

/**
 * Rate-Limit-Zähler (z. B. 5 Leads pro IP und Stunde, Login-Sperren).
 * Nicht Teil der ursprünglichen Tabellenliste, aber nötig, weil Workers
 * keinen persistenten Prozessspeicher haben.
 */
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    id: text('id').primaryKey(),
    /** z. B. "lead:1.2.3.4" oder "login:mail@example.com" */
    bucket: text('bucket').notNull(),
    count: integer('count').notNull().default(0),
    windowStart: integer('window_start').notNull(),
    blockedUntil: integer('blocked_until'),
  },
  (t) => [uniqueIndex('rate_limits_bucket_unique').on(t.bucket)],
)

export type User = typeof users.$inferSelect
export type Lead = typeof leads.$inferSelect
export type Customer = typeof customers.$inferSelect
export type Project = typeof projects.$inferSelect
export type Clipper = typeof clippers.$inferSelect
export type ClipperApplication = typeof clipperApplications.$inferSelect
export type Creator = typeof creators.$inferSelect
export type ProjectLink = typeof projectLinks.$inferSelect
export type Folder = typeof folders.$inferSelect
export type RawAsset = typeof rawAssets.$inferSelect
export type Deliverable = typeof deliverables.$inferSelect
export type PublishProfile = typeof publishProfiles.$inferSelect
export type PublishAccount = typeof publishAccounts.$inferSelect
export type CampaignCreator = typeof campaignCreators.$inferSelect
export type ClipApproval = typeof clipApprovals.$inferSelect
export type Role = User['role']

/* --------------------------------------------------------------------------
   Echte Zahlen aus Zernio (Migration 0015)

   Zwei Tabellen, zwei Aufgaben: `postMetrics` hält, was die Plattformen
   zählen, `metricsSync` hält, wann welcher Post wieder gefragt wird.
   Abgleich und Lesen stehen in lib/metrics.ts.
   -------------------------------------------------------------------------- */

/**
 * Views, Likes, Kommentare, Shares — je Zernio-Post UND Account.
 *
 * Ein Post geht an alle Accounts einer Plattform zugleich, und jeder zählt
 * für sich; deshalb ist der Schlüssel das Paar. `creatorId` NULL heißt:
 * automatisches Ziel des Projekts, gesetzt heißt: Verbreitung über diesen
 * Creator. `projectId` steht doppelt (auch am Deliverable), damit die
 * Projektlisten über EINE Tabelle summieren statt über einen Join.
 *
 * Verschwindet die Freigabe eines Creators, gehen ihre Zahlen mit
 * (zusammengesetzter Fremdschlüssel — greift nur bei gesetztem `creatorId`).
 */
export const postMetrics = sqliteTable(
  'post_metrics',
  {
    postId: text('post_id').notNull(),
    /** Account-ID beim Anbieter — wie `publishAccounts.providerAccountId`. */
    accountId: text('account_id').notNull(),
    deliverableId: text('deliverable_id')
      .notNull()
      .references(() => deliverables.id, { onDelete: 'cascade' }),
    creatorId: text('creator_id').references(() => creators.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    /** Ohne führendes @ — wie in `publishAccounts`. */
    username: text('username'),
    /** Link zum Beitrag, so wie die Plattform ihn meldet. */
    url: text('url'),
    views: integer('views').notNull().default(0),
    likes: integer('likes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    shares: integer('shares').notNull().default(0),
    saves: integer('saves').notNull().default(0),
    impressions: integer('impressions').notNull().default(0),
    reach: integer('reach').notNull().default(0),
    /** Stand der Zahlen — der Zeitpunkt, den Zernio dafür nennt, sonst unser Abruf. */
    syncedAt: integer('synced_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.accountId] }),
    index('post_metrics_deliverable_idx').on(t.deliverableId),
    index('post_metrics_project_idx').on(t.projectId),
    index('post_metrics_creator_idx').on(t.creatorId),
    foreignKey({
      columns: [t.deliverableId, t.creatorId],
      foreignColumns: [clipApprovals.deliverableId, clipApprovals.creatorId],
    }).onDelete('cascade'),
  ],
)

/**
 * Der Zeitplan je Zernio-Post: wann zuletzt und wann wieder abgefragt wird.
 *
 * Junge Clips ändern sich stündlich, alte kaum noch. Jeden Post in jedem
 * Viertelstundenlauf zu fragen, wäre bei hunderten Clips schnell am
 * Rate-Limit der Gegenseite. `publishedAt` ist die Uhr für den Abstand
 * (siehe `intervalFor` in lib/metrics.ts).
 */
export const metricsSync = sqliteTable(
  'metrics_sync',
  {
    postId: text('post_id').primaryKey(),
    deliverableId: text('deliverable_id')
      .notNull()
      .references(() => deliverables.id, { onDelete: 'cascade' }),
    creatorId: text('creator_id').references(() => creators.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** NULL, solange weder unser Stand noch Zernio sie genannt hat. */
    platform: text('platform'),
    publishedAt: integer('published_at').notNull(),
    /**
     * Was der letzte Abruf ergab: ok | pending (Zernio synchronisiert noch
     * oder noch nie gefragt) | failed (auf allen Plattformen gescheitert) |
     * unknown (Zernio kennt den Post nicht).
     */
    status: text('status', { enum: ['ok', 'pending', 'failed', 'unknown'] }).notNull().default('pending'),
    nextAt: integer('next_at').notNull(),
    /** 202-Antworten in Folge — so lange wird stündlich nachgefragt (`PENDING_FAST_TRIES`). */
    tries: integer('tries').notNull().default(0),
    /**
     * Fehler in Folge (5xx, Netz, unlesbare Antwort) — bestimmt den Abstand
     * danach. Ein eigener Zähler: zählten 202er mit, wartete der erste 5xx
     * nach einem halben Tag „Zernio synchronisiert noch“ gleich einen Tag.
     */
    errors: integer('errors').notNull().default(0),
    lastAt: integer('last_at'),
    /**
     * Bis wann ein laufender Abgleich diesen Post für sich hält. Cron und
     * Admin-Knopf lassen belegte Posts beide liegen — NULL heißt frei.
     */
    leasedUntil: integer('leased_until'),
  },
  (t) => [
    index('metrics_sync_due_idx').on(t.nextAt),
    index('metrics_sync_project_idx').on(t.projectId),
    index('metrics_sync_deliverable_idx').on(t.deliverableId),
    index('metrics_sync_creator_idx').on(t.creatorId),
    foreignKey({
      columns: [t.deliverableId, t.creatorId],
      foreignColumns: [clipApprovals.deliverableId, clipApprovals.creatorId],
    }).onDelete('cascade'),
  ],
)

/**
 * Einzelne Zustände ohne eigene Tabelle, als Schlüssel und Wert.
 *
 * Erster Eintrag: `metrics_paused_until` — antwortet Zernio mit 402, ruht
 * der Abgleich bis dahin, statt alle fünfzehn Minuten gegen dieselbe Wand
 * zu laufen.
 */
export const appState = sqliteTable('app_state', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
})

export type PostMetric = typeof postMetrics.$inferSelect
export type MetricsSync = typeof metricsSync.$inferSelect

/* --------------------------------------------------------------------------
   Agenturen, Marken und Brand-Owner (Migration 0019)

   Eintrag über /brands, Bereich unter /collaboration. Kalt ist, wer sich
   ohne Cooperation-Code einträgt — er sieht nichts, bis der Administrator
   ihn freigibt. Warm ist, wer einen Code einlöst: nach dem Briefing hat er
   sofort Zugang zu Kampagnen, Creatorn und Clippern. Die Logik steht in
   lib/agency.ts.
   -------------------------------------------------------------------------- */

/** Einmal-Codes für warme Leads — sechs Zeichen, vergeben im Admin-Bereich. */
export const cooperationCodes = sqliteTable(
  'cooperation_codes',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    /** Für wen der Code gedacht ist — nur für den Administrator. */
    note: text('note'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    /** Gesetzt = verbraucht. Bleibt stehen, auch wenn der Lead gelöscht wird. */
    usedAt: integer('used_at'),
    usedBy: text('used_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('cooperation_codes_code_unique').on(t.code)],
)

/** Was eine Agentur auf /brands angegeben hat — und wie weit ihr Zugang reicht. */
export const agencyLeads = sqliteTable(
  'agency_leads',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Arbeitsbereich der eigenen Kampagnen — wie bei Kunden und Creatorn. */
    customerId: text('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    company: text('company'),
    /** brand_owner | agentur | sonstiges — siehe AGENCY_KINDS */
    kind: text('kind').notNull(),
    kindOther: text('kind_other'),
    /** einer | mehrere (bis Okt. 2026: ja | nein) — Kunden, die sich für Clipping interessieren (seit 0020; älter: NULL) */
    hasClients: text('has_clients'),
    /** JSON-Array, z. B. ["tiktok","instagram"] */
    platforms: text('platforms').notNull(),
    /** Siehe AGENCY_SOURCES */
    source: text('source').notNull(),
    niche: text('niche').notNull(),
    /** JSON-Objekt { tiktok, instagram, youtube, facebook, website } — nur ausgefüllte */
    socials: text('socials').notNull(),
    /** viel | keins */
    footage: text('footage').notNull(),
    footageLink: text('footage_link'),
    /** 1 = warmer Lead (Cooperation-Code oder vom Administrator gesetzt) */
    warm: integer('warm').notNull().default(0),
    codeId: text('code_id').references(() => cooperationCodes.id, { onDelete: 'set null' }),
    /** NULL = gesperrt. Zugang hat, wer freigegeben ist UND das Briefing ausgefüllt hat. */
    accessAt: integer('access_at'),
    viewsTarget: integer('views_target'),
    budgetCents: integer('budget_cents'),
    /** Siehe AGENCY_PACKAGES */
    package: text('package'),
    briefedAt: integer('briefed_at'),
    /** Die Kampagne, die mit „Kampagne starten“ entstand. */
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    /** 1 = Demo-Konto: zeigt nur erfundene Daten (lib/demo.ts), schreibgeschützt, Passwort-Login. */
    demo: integer('demo').notNull().default(0),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex('agency_leads_user_unique').on(t.userId), index('agency_leads_created_idx').on(t.createdAt)],
)

/** Eine Agentur bucht einen Creator — ins Team kommt er erst mit der Bestätigung des Administrators. */
export const creatorBookings = sqliteTable(
  'creator_bookings',
  {
    id: text('id').primaryKey(),
    agencyUserId: text('agency_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creatorId: text('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    message: text('message'),
    /** angefragt | bestaetigt | abgelehnt */
    status: text('status').notNull().default('angefragt'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    decidedAt: integer('decided_at'),
  },
  (t) => [
    index('creator_bookings_agency_idx').on(t.agencyUserId, t.createdAt),
    index('creator_bookings_status_idx').on(t.status, t.createdAt),
  ],
)

export type CooperationCode = typeof cooperationCodes.$inferSelect
export type AgencyLead = typeof agencyLeads.$inferSelect
export type CreatorBooking = typeof creatorBookings.$inferSelect

/* ---------------------------------------------- Gold-Marktplatz (0023) */

/** Fachartikel — gepflegt unter /admin/fachartikel, öffentlich unter /fachartikel (lib/articles.ts). */
export const articles = sqliteTable(
  'articles',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    excerpt: text('excerpt').notNull(),
    body: text('body').notNull().default(''),
    sourceUrl: text('source_url'),
    author: text('author').notNull().default('Jason Azarov'),
    published: integer('published').notNull().default(1),
    publishedAt: integer('published_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('articles_published_idx').on(t.published, t.publishedAt)],
)

/** „Mehr Reichweite“ aus den Dashboards (lib/upsell.ts) — eine Anfrage, kein Auftrag. */
export const upsellRequests = sqliteTable(
  'upsell_requests',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    percent: integer('percent').notNull(),
    baseViews: integer('base_views').notNull(),
    extraViews: integer('extra_views').notNull(),
    priceCents: integer('price_cents').notNull(),
    clientPriceCents: integer('client_price_cents'),
    status: text('status').notNull().default('offen'),
    createdAt: integer('created_at').notNull(),
    doneAt: integer('done_at'),
  },
  (t) => [
    index('upsell_requests_status_idx').on(t.status, t.createdAt),
    index('upsell_requests_project_idx').on(t.projectId),
  ],
)
