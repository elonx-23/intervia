import { db, now, uuid } from './db.mjs'

// Rattachement d'un compte technicien à une équipe par son code — utilisé
// par « Rejoindre mon équipe » (routes/teams.mjs) et automatiquement à la
// confirmation de l'email quand le technicien s'est inscrit avec le lien
// d'invitation de son patron (routes/signup.mjs).

export class JoinError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// Sièges technicien déjà pris — sur la table `technicians`, pas `users` : un
// technicien créé via l'ancien système (code technicien) n'a aucune ligne
// `users`, donc compter depuis `users` sous-évaluerait l'équipe.
export function usedTechnicienSeats(teamId) {
  return db.prepare('SELECT COUNT(*) AS c FROM technicians WHERE team_id = ? AND active = 1').get(teamId).c
}

export const normalizeJoinCode = (code) =>
  String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20)

/**
 * Rattache `user` (ligne users) à l'équipe du code. Ouvert à un compte tout
 * juste vérifié comme à un technicien déjà membre d'autres équipes (freelance) ;
 * jamais à un compte admin. Re-rejoindre une équipe déjà rejointe bascule
 * simplement dessus.
 * @returns {{ user: object, team: object }}
 */
export function joinTeamByCode(user, rawCode) {
  const code = normalizeJoinCode(rawCode)
  if (!code) throw new JoinError(400, "Code d'équipe requis.")
  if (user.role === 'admin')
    throw new JoinError(400, 'Un compte administrateur ne peut pas aussi rejoindre une équipe en tant que technicien.')

  const team = db.prepare('SELECT * FROM teams WHERE join_code = ?').get(code)
  if (!team) throw new JoinError(404, "Code d'équipe introuvable : vérifie-le auprès de ton patron.")
  if (team.status !== 'active') throw new JoinError(403, "Cette équipe n'est pas active pour le moment.")

  const membership = db.prepare('SELECT * FROM team_memberships WHERE user_id = ? AND team_id = ?').get(user.id, team.id)
  let technicienId
  if (membership) {
    technicienId = membership.technicien_id
  } else {
    if (usedTechnicienSeats(team.id) >= team.max_technicien_seats) {
      throw new JoinError(
        400,
        'Cette équipe a atteint son nombre maximum de techniciens : demande à ton patron de libérer une place ou de changer de formule.',
      )
    }
    technicienId = uuid()
    db.prepare('INSERT INTO technicians (id, first_name, last_name, email, team_id, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)').run(
      technicienId,
      user.first_name ?? '',
      user.last_name ?? '',
      user.email,
      team.id,
      now(),
    )
    db.prepare('INSERT INTO team_memberships (id, user_id, team_id, technicien_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
      uuid(),
      user.id,
      team.id,
      technicienId,
      now(),
    )
  }

  // L'équipe rejointe devient l'équipe active ; le code en attente est consommé.
  db.prepare("UPDATE users SET role = 'technicien', team_id = ?, technicien_id = ?, pending_join_code = NULL WHERE id = ?").run(
    team.id,
    technicienId,
    user.id,
  )
  return { user: db.prepare('SELECT * FROM users WHERE id = ?').get(user.id), team }
}
