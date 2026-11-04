#!/usr/bin/env node
// Range des clés secrètes dans les variables Railway sans qu'elles
// apparaissent nulle part (ni à l'écran, ni dans l'historique, ni dans le code).
//
//   node scripts/set-secret.mjs PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET
//
// Chaque valeur est demandée tour à tour (saisie masquée), puis envoyée à
// Railway. L'app les prend en compte à la prochaine mise en ligne.

import { execFileSync } from 'node:child_process'
import readline from 'node:readline'

const names = process.argv.slice(2).filter((n) => /^[A-Z][A-Z0-9_]{2,60}$/.test(n))
if (names.length === 0) {
  console.error('Indique le nom des variables, ex. : node scripts/set-secret.mjs PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET')
  process.exit(1)
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s)
    }
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

for (const name of names) {
  const value = await askHidden(`${name} (colle la valeur, rien ne s’affiche) : `)
  if (!value) {
    console.error(`${name} vide : ignorée.`)
    continue
  }
  execFileSync('railway', ['variable', 'set', name, '--stdin', '--skip-deploys'], { input: value, stdio: ['pipe', 'ignore', 'inherit'] })
  console.log(`${name} : rangée dans Railway.`)
}
