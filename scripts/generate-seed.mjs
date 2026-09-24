// Génère supabase/seed.sql (INSERT techniciens + codes d'accès) et
// CREDENTIALS.local.md (codes en clair, à usage local uniquement — gitignored).
import { randomInt } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const technicians = [
  ['Aaron', 'Fitoussi'],
  ['Eitan', 'Perez'],
  ['Elior', 'Djebali'],
  ['Elone', 'Levy'],
  ['Abd-rahim', 'Boudjadi'],
  ['Karl', 'Boccara'],
  ['Mohamed', 'Benmansour'],
  ['Aaron', 'Dylan'],
  ['Ben', 'Perez'],
  ['Maxime', 'Nicolas'],
  ['Adam', 'Ghazloun'],
]

function code() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

function slugUsername(first, last, used) {
  const base = `${first}.${last}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z.-]/g, '')
  let username = base
  let i = 2
  while (used.has(username)) {
    username = `${base}${i}`
    i += 1
  }
  used.add(username)
  return username
}

const used = new Set()
const rows = []
const credentials = []

const adminUsername = 'admin'
const adminCode = code()
rows.push({ username: adminUsername, code: adminCode, role: 'admin', label: 'Administrateur' })
credentials.push(['Admin', adminUsername, adminCode])
used.add(adminUsername)

const technicianInserts = []
for (const [first, last] of technicians) {
  const username = slugUsername(first, last, used)
  const c = code()
  technicianInserts.push({ first, last, username, code: c })
  credentials.push([`${first} ${last}`, username, c])
}

const escape = (s) => s.replace(/'/g, "''")

let sql = `-- Seed Intervia — généré par scripts/generate-seed.mjs\n\n`
sql += `insert into public.access_codes (username, code, role, label)\nvalues ('${adminUsername}', '${adminCode}', 'admin', 'Administrateur');\n\n`

sql += `with new_technicians as (\n  insert into public.technicians (first_name, last_name) values\n`
sql += technicianInserts
  .map((t) => `    ('${escape(t.first)}', '${escape(t.last)}')`)
  .join(',\n')
sql += `\n  returning id, first_name, last_name\n)\n`
sql += `insert into public.access_codes (username, code, role, technicien_id, label)\nselect v.username, v.code, 'technicien', nt.id, nt.first_name || ' ' || nt.last_name\nfrom new_technicians nt\njoin (values\n`
sql += technicianInserts
  .map((t) => `  ('${escape(t.first)}', '${escape(t.last)}', '${t.username}', '${t.code}')`)
  .join(',\n')
sql += `\n) as v(first_name, last_name, username, code)\n  on v.first_name = nt.first_name and v.last_name = nt.last_name;\n`

writeFileSync(path.join(root, 'supabase', 'seed.sql'), sql)

let md = `# Identifiants générés (local uniquement, ne pas committer)\n\n`
md += `| Compte | Nom d'utilisateur | Code |\n|---|---|---|\n`
for (const [name, username, c] of credentials) {
  md += `| ${name} | ${username} | ${c} |\n`
}
md += `\nÀ changer après la première connexion si besoin (table \`access_codes\`).\n`

writeFileSync(path.join(root, 'CREDENTIALS.local.md'), md)

console.log('supabase/seed.sql et CREDENTIALS.local.md générés.')
