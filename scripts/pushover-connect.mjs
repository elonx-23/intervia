#!/usr/bin/env node
// Relie Intervia au compte Pushover de l'admin, comme un appareil de plus
// (API « Open Client » de Pushover), pour qu'Intervia puisse lire les
// notifications d'appel reçues et les transformer en fiches.
//
// À lancer soi-même dans un terminal, depuis le dossier du projet :
//   node scripts/pushover-connect.mjs
//
// L'e-mail et le mot de passe ne servent qu'une fois, ici, pour obtenir une
// clé d'accès ; ils ne sont ni affichés ni enregistrés. La clé d'accès et
// l'identifiant de l'appareil sont envoyés directement dans les variables
// Railway (PUSHOVER_CLIENT_SECRET, PUSHOVER_DEVICE_ID) sans être affichés.

import { execFileSync } from 'node:child_process'
import readline from 'node:readline'

const API = 'https://api.pushover.net/1'
const DEVICE_NAME = 'intervia'

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) {
      // Masque la saisie (mot de passe) : rien ne s'affiche pendant la frappe.
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s)
      }
    }
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

async function post(path, fields) {
  const res = await fetch(`${API}${path}`, { method: 'POST', body: new URLSearchParams(fields) })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

function setRailwayVariable(name, value) {
  execFileSync('railway', ['variable', 'set', name, '--stdin', '--skip-deploys'], { input: value, stdio: ['pipe', 'ignore', 'inherit'] })
}

const email = await ask('E-mail Pushover : ')
const password = await ask('Mot de passe Pushover (rien ne s’affiche pendant la frappe) : ', { hidden: true })

let login = await post('/users/login.json', { email, password })
if (login.status === 412) {
  const twofa = await ask('Code de double authentification : ')
  login = await post('/users/login.json', { email, password, twofa })
}
if (login.body.status !== 1 || !login.body.secret) {
  console.error(`Connexion refusée : ${(login.body.errors ?? ['identifiants invalides']).join(', ')}`)
  process.exit(1)
}

const device = await post('/devices.json', { secret: login.body.secret, name: DEVICE_NAME, os: 'O' })
if (device.body.status !== 1 || !device.body.id) {
  console.error(`Impossible d'ajouter l'appareil « ${DEVICE_NAME} » : ${(device.body.errors ?? ['erreur inconnue']).join(', ')}`)
  console.error('Si un appareil « intervia » existe déjà sur ton compte Pushover, supprime-le sur pushover.net puis relance ce script.')
  process.exit(1)
}

setRailwayVariable('PUSHOVER_CLIENT_SECRET', login.body.secret)
setRailwayVariable('PUSHOVER_DEVICE_ID', device.body.id)
console.log(`C'est fait : l'appareil « ${DEVICE_NAME} » est ajouté à ton compte Pushover et la clé est rangée dans Railway.`)
console.log("Les prochaines notifications que tu recevras arriveront aussi sur cet appareil.")
