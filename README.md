# Intervia

Application de gestion d'interventions de dépannage — React + Vite + TypeScript + Tailwind + shadcn/ui, avec un backend local (Node + SQLite, aucun compte cloud nécessaire).

## Démarrage (2 serveurs à lancer)

```bash
# Terminal 1 — API
cd server
npm install
npm start

# Terminal 2 — App
npm install
npm run dev -- --host   # --host pour accéder depuis le réseau local (téléphone, etc.)
```

Au premier démarrage du serveur, la base `server/pse-gestion.db` est créée automatiquement avec un compte admin + les 11 techniciens — les identifiants générés s'affichent dans le terminal et sont sauvegardés dans `CREDENTIALS.local.md` (local, jamais commité).

L'app tourne sur `http://localhost:5173` (ou l'IP réseau affichée par Vite), l'API sur `http://localhost:3001` (le frontend y accède via un proxy Vite, jamais directement).

## Architecture

- **Aucun compte externe requis.** Tout tourne sur ta machine : base SQLite locale (`server/pse-gestion.db`), photos stockées dans `server/uploads/`.
- Auth par code d'accès (nom d'utilisateur + code), session dans `localStorage`, vérifiée toutes les 5s.
- Notifications in-app immédiates ; notifications **push** (VAPID) et rappels automatiques tournent directement dans le serveur Node via `node-cron` (pas besoin d'edge functions).
- Signature du devis directement sur l'appareil du client (bouton "Faire signer sur cet appareil" dans la fiche devis) en plus du lien public partageable.

## Envoi d'email (devis/factures)

Envoi via Gmail SMTP. Pour l'activer :

1. Active la validation en 2 étapes sur le compte Gmail à utiliser pour l'envoi
2. Génère un "mot de passe d'application" : https://myaccount.google.com/apppasswords
3. Dans `server/`, copie `.env.example` vers `.env` et renseigne `SMTP_USER` (l'adresse Gmail) et `SMTP_APP_PASSWORD` (le mot de passe généré, pas le mot de passe du compte)
4. Redémarre le serveur (`npm start` dans `server/`)

Sans ça, le bouton "Envoyer par email" affichera une erreur claire plutôt que d'échouer silencieusement.

## Design

Style "Liquid Glass" (inspiré d'iOS 26/27) : surfaces translucides avec flou d'arrière-plan (`backdrop-filter`), bord assombri + reflet clair en haut pour donner une impression de verre bombé, boutons/badges en pilule avec un léger effet glacé, barre de navigation du bas flottante, fond décoratif en dégradé doux derrière toute l'app (`.app-backdrop` dans `App.tsx`). Tokens de thème (couleurs, rayon des coins, glass) centralisés dans `src/index.css`.

**Transitions de page** : un fondu doux (opacity) à chaque changement de page via la View Transitions API native du navigateur (`document.startViewTransition`, câblé dans `App.tsx`/`useRouteViewTransition`) — pas une animation CSS bricolée en JS. Un glissement gauche/droite façon push/pop a été essayé puis retiré (inconfortable à l'usage). Se dégrade en changement instantané sur les navigateurs qui ne supportent pas l'API.

**Composants "verre" natifs iOS** :
- Header : transparent en haut de page, prend le flou/la matière verre progressivement au scroll (comme une large title bar iOS), fixe et flotte au-dessus du contenu qui défile dessous.
- Dialogs/Sheets : vraies feuilles modales façon iOS — glissent depuis le bas, coins arrondis en haut uniquement, poignée de glisser-déposer décorative, fond assombri + flouté.
- `SegmentedControl` (`src/components/ui/segmented-control.tsx`) : une seule piste en verre avec un curseur qui glisse (façon `UISegmentedControl`), utilisé pour le bascule Devis/Factures.
- Boutons : pression avec un easing "spring" (léger rebond), reflet restreint au sommet plutôt qu'un voile complet, variante `outline` en vrai verre translucide flouté (`backdrop-blur-xl`).

## Mode démo (optionnel)

`VITE_SKIP_AUTH=true` dans `.env` saute l'écran de connexion avec un compte admin/technicien factice, pour visualiser l'interface sans backend. Actuellement désactivé (`false`) puisque le vrai système de connexion fonctionne.

## Dossier `supabase/` (legacy, non utilisé)

Le projet a d'abord été conçu pour Supabase (schéma SQL complet dans `supabase/migrations/`, edge functions dans `supabase/functions/`) avant de basculer sur ce backend local pour éviter la friction de création de compte cloud. Ce dossier reste comme référence du modèle de données mais n'est plus utilisé par l'application — le vrai schéma vit maintenant dans `server/db.mjs`.

## Roadmap

1. Fondations ✅
2. Interventions ✅ — CRUD, statuts, assignation, filtres (incl. "À acquitter"), copier WhatsApp
3. Devis ✅ — wizard 3 étapes, PDF, présets par type d'intervention
4. Signature publique + devis → facture ✅
5. Factures ✅ — statuts, paiement, PDF, page publique, photos après travaux
6. Notifications ✅ — in-app + push (VAPID, tourne dans le serveur local), rappels automatiques, message quotidien 19h (Europe/Paris), notification urgente admin→techniciens
7. Statistiques ✅ — admin (globales) et technicien (perso + relevé PDF + factures à acquitter)
8. Techniciens (admin) ✅ — liste, création, suspension, suppression, régénération de code

**Vérifié en conditions réelles** : login, création/liste d'intervention testés de bout en bout via un vrai navigateur contre le vrai serveur local — fonctionne. Photos/signature/email non testés en profondeur, à surveiller à l'usage.
