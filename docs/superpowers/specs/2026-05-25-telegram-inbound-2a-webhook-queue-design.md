# Design — Telegram entrant, étape 2a : webhook + file + accusé (worker)

> Date : 2026-05-25
> Statut : validé (design), prêt pour plan d'implémentation
> Périmètre : étape **2a** de la Phase 2 (Telegram → App). Voir « Découpage ».

## Contexte

Phase 1 (envoi App → Telegram) livrée : node `send-telegram` + couche `src/lib/telegramApi.ts`,
bot **@Ibsstudio_bot** testé en réel. Voir [[project_telegram_phased]].

L'utilisateur veut désormais le **sens entrant** : écrire un prompt au bot pour générer un
workflow par IA (Prompt-to-Flow), l'exécuter, et recevoir le résultat. Décision actée :
l'exécution réutilise le moteur **client** existant via une **instance de l'app qui fait le
worker** (pas de réécriture headless). Ce chantier entrant est lui-même découpé.

### Découpage de la Phase 2

- **2a (cette spec)** — Plomberie : réception webhook → file Firestore → worker qui répond
  juste « reçu : \<texte\> ». Pas d'IA, pas d'exécution. Livrable et testable seul.
- **2b** — Génération : le worker passe le prompt à Prompt-to-Flow, sauvegarde le workflow,
  répond « workflow généré ».
- **2c** — Exécution + retour : le worker exécute le workflow, capture la sortie finale,
  renvoie accusé + fichier. (C'est là qu'apparaît la collision canvas — voir Risques.)

## Objectif (2a)

Prouver la boucle complète **Telegram → Function → Firestore → app-worker → réponse Telegram**
avec un simple accusé de réception, en intégrant dès maintenant la sécurité (secret webhook,
allowlist, idempotence, claim concurrent).

## Architecture

```
Telegram ──POST /telegramWebhook──▶ Function (onRequest, europe-west1)
  message texte                      1. vérifie header secret Telegram
                                     2. filtre allowlist chat_id
                                     3. create telegramInbox/{update_id}  (idempotent)
                                     4. répond 200 OK
                                                  │ onSnapshot(status == 'pending')
                                                  ▼
                                     App-worker (hook global, tout onglet connecté)
                                       - claim transactionnel pending → processing (+workerId)
                                       - répond « reçu : <texte> » via telegramApi.ts (Phase 1)
                                       - status → done  (ou error + message)
```

### Composants

1. **`functions/src/telegramWebhook.ts`** (`onRequest`, région `europe-west1`, exporté depuis
   `functions/src/index.ts`). Reçoit l'Update Telegram. Pur backend, écrit via `firebase-admin`.
2. **Setup `setWebhook`** — étape one-shot documentée (script ou commande) :
   `POST https://api.telegram.org/bot<TOKEN>/setWebhook` avec `url` = URL de la Function et
   `secret_token` = le secret. À refaire si l'URL change.
3. **App-worker** — hook `useTelegramWorker` monté globalement quand l'utilisateur est connecté
   (choix « n'importe quel onglet »). Écoute la file, *claim*, répond, met à jour le statut.
   Réutilise `sendTelegramMessage` de `src/lib/telegramApi.ts`.

### Modèle de données Firestore

**Collection `telegramInbox`** (doc id = `update_id` Telegram → idempotence) :
```ts
{
  updateId: number
  chatId: number
  fromUsername: string | null
  text: string
  status: 'pending' | 'processing' | 'done' | 'error'
  receivedAt: Timestamp        // serverTimestamp() côté Function
  workerId?: string            // id aléatoire de l'onglet qui a claim
  claimedAt?: Timestamp
  processedAt?: Timestamp
  errorMessage?: string
}
```

**Doc `telegramConfig/main`** (lu par la Function via admin ; **inaccessible au client**) :
```ts
{
  allowedChatIds: number[]     // ex. [8229250033]
  webhookSecret: string        // partagé avec setWebhook
}
```
> Hors de la collection `/config` à dessein : une règle générique existante
> `match /config/{docId} { allow read, write: if request.auth != null }` rendrait le
> `webhookSecret` lisible par tout utilisateur connecté (en Firestore, une règle spécifique
> ne peut pas restreindre ce qu'une règle générique autorise). On utilise donc une collection
> dédiée `telegramConfig` verrouillée par `allow read, write: if false` (seul le SDK admin de
> la Function y accède, en contournant les règles). Configuration initiale : manuelle via la
> console Firebase ; édition in-app de l'allowlist repoussée hors 2a.

## Sécurité

- **Secret webhook** : la Function rejette (401) tout appel dont le header
  `X-Telegram-Bot-Api-Secret-Token` ≠ secret attendu. Empêche l'injection de faux updates par
  quiconque trouve l'URL. **Retenu** : le secret vit dans le doc Firestore `telegramConfig/main`
  (`webhookSecret`), collection verrouillée par `allow read, write: if false` (lecture refusée à
  tout client) et lue par la Function via le SDK admin (qui contourne les règles). *Durcissement
  optionnel ultérieur* : porter le secret via `defineSecret('TELEGRAM_WEBHOOK_SECRET')` (Secret
  Manager).
- **Allowlist au webhook** : un `chat_id` hors `allowedChatIds` est ignoré **avant** toute
  écriture Firestore (réponse 200 silencieuse) → pas de spam de file, pas de quota gaspillé.
- **Idempotence** : doc indexé par `update_id` via `.create()` (un réémission Telegram
  n'ajoute pas de doublon ; l'erreur `already-exists` est avalée).
- **Claim concurrent** : le worker passe `pending → processing` dans une `runTransaction`
  (relit le doc, n'agit que s'il est encore `pending`). Avec plusieurs onglets, un seul gagne.
- **Bot token côté worker** : nécessaire pour répondre. Rangé dans un réglage « Telegram » des
  Settings de l'app (token bot), distinct des configs par-node de la Phase 1. Jamais loggé.

## Gestion des erreurs

- Header secret absent/faux → `401`, rien écrit.
- Update sans `message.text` (photo, sticker, edited_message…) → ignoré proprement (200), pas
  d'écriture (2a ne traite que le texte).
- `chat_id` non autorisé → 200 silencieux, pas d'écriture.
- Échec d'envoi de l'accusé côté worker → `status: 'error'` + `errorMessage`, doc conservé pour
  diagnostic (pas de boucle de retry en 2a).
- Worker hors ligne → les messages restent `pending` dans Firestore et seront traités à la
  prochaine ouverture d'un onglet (c'est l'avantage de la file sur le polling).

## Tests

- **Function `telegramWebhook`** (firebase-functions-test ou handler isolé, admin mické) :
  secret manquant → 401 ; secret OK + chat autorisé → doc `pending` créé avec les bons champs ;
  chat non autorisé → aucune écriture, 200 ; update sans texte → aucune écriture ; même
  `update_id` deux fois → un seul doc.
- **Worker** (Firestore émulé/mické + `telegramApi` mické) : un doc `pending` est claim
  (`processing` avec `workerId`) ; l'accusé « reçu : … » part au bon `chatId` ; statut final
  `done` ; échec d'envoi → `error` + message ; deux workers simultanés → un seul claim réussit.
- **Manuel** : envoyer un message réel à @Ibsstudio_bot avec un onglet de l'app ouvert →
  recevoir « reçu : … ».

## Risques / dette connue (pour les étapes suivantes)

- **Collision canvas (2c)** : le choix « n'importe quel onglet consomme la file » est sans
  risque en 2a (aucune exécution). En 2c, une exécution déclenchée par Telegram pourrait
  perturber une édition en cours et `globalFabricCanvas`. À rediscuter au design de 2c
  (possible bascule vers une route worker dédiée + canvas caché).
- **Réémission Telegram & accusés** : couvert par l'idempotence sur `update_id`.

## Hors périmètre (2a)

Génération IA (2b), exécution de workflow et retour de fichier (2c), gestion de collision
canvas, retries/backoff, support des messages non-texte.
