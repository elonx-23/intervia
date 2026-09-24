import { randomUUID, randomInt } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
// DB_PATH permet de pointer vers un disque persistant (ex. un volume
// Railway monté sur /data) en production — sans elle, la base vivrait sur
// le système de fichiers éphémère du conteneur et serait perdue à chaque
// redéploiement. Par défaut (dev local), inchangé : à côté de ce fichier.
export const db = new DatabaseSync(process.env.DB_PATH || path.join(dir, 'pse-gestion.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS technicians (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  -- Ancien système de connexion (nom d'utilisateur + code à 6 chiffres),
  -- retiré : plus aucune route ne le lit ni ne s'en sert pour authentifier
  -- qui que ce soit. La table reste ici (jamais lue) uniquement pour ne pas
  -- effacer l'historique des comptes déjà migrés vers le nouveau système
  -- (email + mot de passe) — ce n'est plus une voie d'accès à l'application.
  CREATE TABLE IF NOT EXISTS access_codes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    technicien_id TEXT REFERENCES technicians(id),
    active INTEGER NOT NULL DEFAULT 1,
    label TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS interventions (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    client_first_name TEXT NOT NULL DEFAULT '',
    client_last_name TEXT NOT NULL DEFAULT '',
    phone TEXT,
    address TEXT,
    intervention_type TEXT NOT NULL DEFAULT '',
    description TEXT,
    amount REAL,
    status TEXT NOT NULL DEFAULT 'en_attente',
    technicien_id TEXT REFERENCES technicians(id),
    photos TEXT NOT NULL DEFAULT '[]',
    reminder_count INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TEXT NOT NULL,
    assigned_at TEXT,
    accepted_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    validated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    number TEXT NOT NULL UNIQUE,
    intervention_id TEXT REFERENCES interventions(id),
    client_first_name TEXT NOT NULL DEFAULT '',
    client_last_name TEXT NOT NULL DEFAULT '',
    phone TEXT,
    address TEXT,
    email TEXT,
    items TEXT NOT NULL DEFAULT '[]',
    vat_rate REAL NOT NULL DEFAULT 20,
    notes TEXT,
    issue_date TEXT NOT NULL,
    validity_date TEXT,
    status TEXT NOT NULL,
    photos_before TEXT NOT NULL DEFAULT '[]',
    photos_after TEXT NOT NULL DEFAULT '[]',
    public_token TEXT NOT NULL UNIQUE,
    signed_at TEXT,
    signature_data TEXT,
    paid_at TEXT,
    payment_method TEXT,
    source_devis_id TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    recipient_role TEXT NOT NULL,
    recipient_technicien_id TEXT REFERENCES technicians(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    read_at TEXT,
    pushed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    recipient_role TEXT NOT NULL,
    recipient_technicien_id TEXT REFERENCES technicians(id),
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    plan TEXT NOT NULL,
    join_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    max_technicien_seats INTEGER NOT NULL DEFAULT 0,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT,
    team_id TEXT REFERENCES teams(id),
    technicien_id TEXT REFERENCES technicians(id),
    first_name TEXT,
    last_name TEXT,
    email_verified_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_verifications (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- Un technicien peut travailler pour plusieurs entreprises (freelance) —
  -- une ligne par équipe rejointe. users.team_id/technicien_id restent
  -- l'équipe ACTIVE (celle dont les données sont actuellement visibles/
  -- utilisées) ; cette table est la liste complète des adhésions, pour
  -- proposer le changement d'équipe sans perdre l'historique. Chaque
  -- adhésion a sa propre ligne technicians (nom/téléphone/statut actif
  -- propres à cette équipe-là), jamais partagée entre équipes.
  CREATE TABLE IF NOT EXISTS team_memberships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    team_id TEXT NOT NULL REFERENCES teams(id),
    technicien_id TEXT NOT NULL REFERENCES technicians(id),
    created_at TEXT NOT NULL,
    UNIQUE(user_id, team_id)
  );

  -- Préférences de notification par personne (pas par équipe) : un
  -- technicien qui rejoint plusieurs équipes garde le même réglage partout
  -- plutôt que de devoir le refaire à chaque adhésion. Absence de ligne =
  -- activé par défaut (opt-out, pas opt-in) pour ne rien casser pour les
  -- comptes existants au moment où cette table apparaît.
  CREATE TABLE IF NOT EXISTS notification_prefs (
    user_id TEXT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, type)
  );

  -- Rapport d'intervention : document généré par le technicien à partir
  -- d'une fiche (date/heure/description reprises de l'intervention elle-même,
  -- voir server/routes/reports.mjs), avec un texte libre en plus — le PDF
  -- est recomposé côté client à chaque téléchargement (comme les devis/
  -- factures), cette table ne garde que la trace/le texte, pas le PDF lui-même.
  CREATE TABLE IF NOT EXISTS intervention_reports (
    id TEXT PRIMARY KEY,
    intervention_id TEXT NOT NULL REFERENCES interventions(id),
    team_id TEXT NOT NULL REFERENCES teams(id),
    technicien_id TEXT REFERENCES technicians(id),
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT,
    created_at TEXT NOT NULL
  );

  -- Journal de chaque tentative de connexion (code technicien ET
  -- email/mot de passe), réussie ou non — sans ça, une vague de tentatives
  -- bloquées par le rate-limiter reste invisible : personne ne sait qu'une
  -- attaque a eu lieu. identifier = nom d'utilisateur ou email tenté (pas
  -- l'id réel : on veut aussi voir les tentatives sur des comptes qui
  -- n'existent pas).
  CREATE TABLE IF NOT EXISTS login_attempts (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    method TEXT NOT NULL,
    success INTEGER NOT NULL,
    ip TEXT,
    created_at TEXT NOT NULL
  );
`)

// Migrations légères : ALTER TABLE tenté à chaque démarrage, l'erreur
// "colonne déjà présente" est juste avalée — pas de système de migrations
// versionné pour une base SQLite locale à un seul schéma.
function ensureColumn(table, column, ddl) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
  } catch {
    // déjà migrée
  }
}

ensureColumn('documents', 'relance_count', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('documents', 'last_relance_at', 'TEXT')
ensureColumn('documents', 'due_date', 'TEXT')
ensureColumn('documents', 'discount_type', "TEXT NOT NULL DEFAULT 'amount'")
ensureColumn('documents', 'discount_value', 'REAL NOT NULL DEFAULT 0')
ensureColumn('documents', 'postal_code', 'TEXT')
ensureColumn('documents', 'city', 'TEXT')
ensureColumn('documents', 'stripe_payment_id', 'TEXT')
ensureColumn('documents', 'stripe_checkout_session_id', 'TEXT')
ensureColumn('documents', 'stripe_payment_link_id', 'TEXT')
ensureColumn('documents', 'deleted_at', 'TEXT')
ensureColumn('interventions', 'postal_code', 'TEXT')
ensureColumn('interventions', 'city', 'TEXT')
ensureColumn('documents', 'deletion_requested_at', 'TEXT')
ensureColumn('documents', 'deletion_requested_by', 'TEXT')
ensureColumn('technicians', 'email', 'TEXT')
ensureColumn('technicians', 'team_id', 'TEXT REFERENCES teams(id)')
ensureColumn('interventions', 'team_id', 'TEXT REFERENCES teams(id)')
ensureColumn('documents', 'team_id', 'TEXT REFERENCES teams(id)')
ensureColumn('notifications', 'team_id', 'TEXT REFERENCES teams(id)')
ensureColumn('push_subscriptions', 'team_id', 'TEXT REFERENCES teams(id)')
ensureColumn('teams', 'contact_email', 'TEXT')
ensureColumn('teams', 'contact_phone', 'TEXT')
ensureColumn('teams', 'siret', 'TEXT')

// Index sur team_id (et les combinaisons réellement utilisées par les
// routes) : depuis le cloisonnement multi-équipe, quasi toutes les requêtes
// de liste/stats filtrent par team_id — sans index ça reste un scan complet
// de table à chaque appel, de plus en plus coûteux à mesure que la base
// grossit (plusieurs équipes cumulées). `CREATE INDEX IF NOT EXISTS` est
// sans risque à ré-exécuter à chaque démarrage, comme `ensureColumn`.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_technicians_team ON technicians (team_id);
  CREATE INDEX IF NOT EXISTS idx_interventions_team ON interventions (team_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_interventions_technicien ON interventions (technicien_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_documents_team_kind ON documents (team_id, kind, deleted_at, created_at);
  CREATE INDEX IF NOT EXISTS idx_documents_intervention ON documents (intervention_id);
  CREATE INDEX IF NOT EXISTS idx_documents_source_devis ON documents (source_devis_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (team_id, recipient_role, recipient_technicien_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_push_subscriptions_recipient ON push_subscriptions (team_id, recipient_role, recipient_technicien_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
  CREATE INDEX IF NOT EXISTS idx_users_team ON users (team_id);
  CREATE INDEX IF NOT EXISTS idx_login_attempts_recent ON login_attempts (created_at);
  CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts (identifier, created_at);
  CREATE INDEX IF NOT EXISTS idx_team_memberships_user ON team_memberships (user_id);
  CREATE INDEX IF NOT EXISTS idx_team_memberships_team ON team_memberships (team_id);
`)

// Un compte technicien déjà rattaché à une équipe (via l'ancien /join, avant
// le support multi-équipe) n'a encore aucune ligne `team_memberships` — sans
// ce rattrapage, son équipe actuelle disparaîtrait du sélecteur. Idempotent
// (INSERT OR IGNORE + contrainte UNIQUE), sûr à ré-exécuter à chaque démarrage.
export function backfillTeamMemberships() {
  db.prepare(
    `INSERT OR IGNORE INTO team_memberships (id, user_id, team_id, technicien_id, created_at)
     SELECT lower(hex(randomblob(16))), id, team_id, technicien_id, ?
     FROM users
     WHERE role = 'technicien' AND team_id IS NOT NULL AND technicien_id IS NOT NULL`,
  ).run(now())
}

// Journalise une tentative de connexion (les deux systèmes de login) —
// jamais bloquant : une erreur d'écriture ne doit jamais empêcher quelqu'un
// de se connecter, seulement manquer une ligne de journal.
export function logLoginAttempt(identifier, method, success, ip) {
  try {
    db.prepare('INSERT INTO login_attempts (id, identifier, method, success, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      uuid(),
      String(identifier ?? '').slice(0, 200),
      method,
      success ? 1 : 0,
      ip ?? null,
      now(),
    )
  } catch {
    // ne bloque jamais une connexion pour un souci de journalisation
  }
}

// Petite table clé/valeur pour les réglages globaux (infos entreprise,
// région, clé Stripe…) — un JSON par clé, pas besoin d'un vrai schéma pour
// une poignée de préférences globales à un seul jeu de valeurs.
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

// Les réglages "entreprise"/"région" sont propres à chaque équipe (nom,
// adresse, SIRET… diffèrent d'une équipe à l'autre) — teamId préfixe alors
// la clé. Les réglages Stripe (clé secrète, secret webhook) restent
// globaux : un seul compte Stripe pour toute la plateforme (facture les
// abonnements des équipes ET les paiements clients pour l'instant, pas de
// Stripe Connect par équipe) — teamId omis dans ce cas.
export function getSetting(key, teamId) {
  const fullKey = teamId ? `${teamId}:${key}` : key
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(fullKey)
  return row ? JSON.parse(row.value) : null
}

export function setSetting(key, value, teamId) {
  const fullKey = teamId ? `${teamId}:${key}` : key
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    fullKey,
    JSON.stringify(value),
  )
}

export function uuid() {
  return randomUUID()
}

export function now() {
  return new Date().toISOString()
}

// Code d'équipe à partager oralement/par écrit — alphabet réduit (pas de
// 0/O/1/I) pour éviter les confusions à la lecture.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function randomJoinCode() {
  let code = ''
  for (let i = 0; i < 7; i += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)]
  }
  return code
}

// Regroupe toutes les données mono-tenant existantes (fiches, devis,
// factures, techniciens créés à la main) sous une équipe technique fixe,
// pour que rien ne soit orphelin une fois le nouveau système
// comptes/équipes en place. Id fixe (pas un uuid) pour pouvoir la retrouver
// facilement depuis la logique de "réclamation" à l'inscription. Ne
// s'exécute qu'une fois : si la ligne existe déjà, ne fait rien.
export const LEGACY_TEAM_ID = 'team_legacy'

// L'équipe historique n'a jamais souscrit à une formule payante précise —
// c'est une donnée grandfathered, pas un plan facturé au nombre de sièges.
// Un plafond arbitraire (l'ancien défaut '2' bloquerait la ré-inscription
// des techniciens réels de PSE Dépannage, qui sont bien plus nombreux) n'a
// donc pas de sens ici : elle reste sans limite, comme le plan Ultra.
const LEGACY_TEAM_SEATS = 999999

export function migrateLegacyTeam() {
  const existing = db.prepare('SELECT id, join_code FROM teams WHERE id = ?').get(LEGACY_TEAM_ID)
  if (existing) {
    // Corrige une fois les bases déjà migrées avec l'ancien plafond de 2
    // (idempotent, sans effet une fois déjà corrigé).
    db.prepare('UPDATE teams SET max_technicien_seats = ? WHERE id = ? AND max_technicien_seats < ?').run(
      LEGACY_TEAM_SEATS,
      LEGACY_TEAM_ID,
      LEGACY_TEAM_SEATS,
    )
    return null
  }

  const joinCode = randomJoinCode()
  db.prepare(
    `INSERT INTO teams (id, name, plan, join_code, status, max_technicien_seats, created_at)
     VALUES (?, ?, 'entreprise', ?, 'active', ?, ?)`,
  ).run(LEGACY_TEAM_ID, 'PSE Dépannage', joinCode, LEGACY_TEAM_SEATS, now())

  return { joinCode }
}

// Rattache à l'équipe historique toute ligne pré-existante qui n'a pas
// encore de team_id (colonnes ajoutées après coup via ensureColumn, donc
// NULL sur les données déjà en base) — à exécuter après migrateLegacyTeam().
// Ne touche jamais une ligne qui a déjà un team_id (idempotent, sans risque
// à ré-exécuter à chaque démarrage).
export function backfillLegacyTeamIds() {
  for (const table of ['technicians', 'interventions', 'documents', 'notifications', 'push_subscriptions']) {
    db.prepare(`UPDATE ${table} SET team_id = ? WHERE team_id IS NULL`).run(LEGACY_TEAM_ID)
  }
  // Réglages existants ('company', 'region') : reclés en 'team_legacy:company'
  // etc. pour rejoindre le nouveau format préfixé par équipe.
  for (const key of ['company', 'region']) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    if (row) {
      db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(`${LEGACY_TEAM_ID}:${key}`, row.value)
      db.prepare('DELETE FROM settings WHERE key = ?').run(key)
    }
  }
}
