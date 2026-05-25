# Design — Node « Envoyer vers Telegram » (Phase 1)

> Date : 2026-05-25
> Statut : validé (design), prêt pour plan d'implémentation
> Périmètre : Phase 1 d'un chantier Telegram plus large (voir « Hors périmètre »)

## Contexte

L'utilisateur veut, à terme, une communication bidirectionnelle avec Telegram pilotant
l'ensemble des workflows (réception de commandes côté serveur + exécution + réponse).
Ce chantier complet est un projet d'infrastructure (webhook, queue, moteur headless) —
décomposé en sous-projets. **Cette spec ne couvre que la Phase 1** : un node d'envoi
sortant, livrable immédiatement et utile seul (notifier / livrer un export sur Telegram).

Le module Workflows possède déjà un node `send-gmail`
(`src/features/workflows/registry/communicationNodes.tsx`) qui sert de modèle direct :
runtime `client`, interpolation `{{Colonne}}`, port `attachment`, mode itératif.
Telegram est plus simple côté authentification (pas d'OAuth) et suit la même structure.

## Objectif (Phase 1)

Un node de workflow `send-telegram`, catégorie `communication`, runtime `client`, qui
**pousse** vers un chat/canal Telegram :

- un **message texte** avec interpolation `{{Colonne}}` (comme Gmail) ;
- et/ou un **fichier** branché sur le port `attachment` (PDF/Excel/SVG issu d'un node
  d'export en amont), envoyé en pièce jointe.

Aucun backend : `api.telegram.org` renvoie `Access-Control-Allow-Origin: *`, donc le
`fetch` direct depuis le navigateur fonctionne (même modèle d'appel direct que Gmail/Drive).

## Architecture

### Fichiers

1. **`src/lib/telegramApi.ts`** (nouveau) — couche d'accès à l'API Bot Telegram, analogue
   à `src/lib/gmailAuth.ts` mais sans OAuth :
   - `sendTelegramMessage(token, { chatId, text, parseMode? })`
     → `POST https://api.telegram.org/bot<TOKEN>/sendMessage`
     corps JSON `{ chat_id, text, parse_mode? }`.
   - `sendTelegramDocument(token, { chatId, file, caption?, parseMode? })`
     → `POST https://api.telegram.org/bot<TOKEN>/sendDocument`
     corps `FormData` `{ chat_id, document: <File/Blob>, caption?, parse_mode? }`
     (Telegram accepte le multipart natif — **pas de base64**, contrairement à Gmail).
   - Helper de parsing d'erreur : l'API renvoie `{ ok: false, error_code, description }`
     → lever une `Error` lisible (`Telegram API <error_code> : <description>`).

2. **`src/features/workflows/registry/telegramNodes.tsx`** (nouveau) — la `NodeSpec`
   `send-telegram` et son composant d'UI de config. S'auto-enregistre en bas du fichier
   via `nodeRegistry.register(sendTelegramNode)`, comme `communicationNodes.tsx`.

3. **`src/features/workflows/registry/builtin.ts`** — ajouter une ligne d'import à
   effet de bord : `import './telegramNodes'`.

### Signature du node (NodeSpec)

```ts
NodeSpec<
  SendTelegramConfig,
  { data?: unknown; attachment?: File | Blob },
  { result: SendTelegramOutput }
>
```

- `type: 'send-telegram'`
- `category: 'communication'`
- `label: 'Envoyer via Telegram'`
- `icon`: `Send` (lucide-react)
- `inputs`: `[{ name: 'data', type: 'any' }, { name: 'attachment', type: 'file' }]`
- `outputs`: `[{ name: 'result', type: 'any' }]`
- `runtime: 'client'`

### Config

```ts
interface SendTelegramConfig {
  botToken: string        // secret — voir « Sécurité »
  chatId: string          // destinataire, interpolable {{...}}
  text: string            // message, interpolable {{Colonne}}
  parseMode: 'none' | 'HTML' | 'MarkdownV2'
  iterate: boolean        // 1 message par ligne (calqué sur Gmail)
}

interface SendTelegramOutput {
  sent: boolean
  count: number
  messageIds: number[]    // result.message_id renvoyés par Telegram
}
```

### UI de config

- **Bot token** — champ texte (`123456789:ABCdef...`), avec aide : créer le bot via
  **@BotFather**, copier le token. Avertissement explicite : « ce token est enregistré
  avec le workflow » (voir Sécurité).
- **Chat ID** — champ texte interpolable, avec aide : parler au bot puis lire
  `getUpdates`, ou utiliser `@userinfobot` / `@RawDataBot`. Accepte aussi `@nomducanal`
  pour un canal public.
- **Message** — textarea interpolable `{{Colonne}}`. L'autocomplétion de colonnes du
  node Gmail est un bonus possible mais **hors périmètre Phase 1** (la simple
  interpolation `{{}}` suffit ; réutilise `interpolate` du runtime).
- **parse_mode** — select : Aucun / HTML / MarkdownV2.
- **Mode « 1 message par ligne »** — case à cocher (`iterate`). Si l'entrée `data` est un
  tableau de lignes, envoie un message par ligne (interpolation par row via `rawConfig`,
  comme Gmail) ; sinon un message unique.

### Exécution (`run`)

1. Valider `botToken` et `chatId` non vides (sinon `Error` explicite).
2. Récupérer `rawConfig` et `extractRows(inputs.data)` (helpers du runtime, déjà utilisés
   par Gmail) pour le mode itératif.
3. Si `attachment` est un `Blob`/`File` connecté → `sendTelegramDocument` (le `text`
   interpolé sert de `caption`, tronqué si nécessaire — limite Telegram ~1024 car. pour
   une légende). Sinon → `sendTelegramMessage`.
4. Mode `iterate` : boucle sur les rows, interpolation par row, respect de `ctx.signal`
   (abort) et `ctx.log(...)` à chaque envoi, exactement comme `send-gmail`.
5. Retourner `{ result: { sent: true, count, messageIds } }`.

### Flux de données

```
[node export amont] --(file)--> attachment ┐
[node data amont]   --(rows)--> data       ├─> send-telegram --(result)--> [aval]
                                            ┘        │
                                                     └─> fetch api.telegram.org (direct)
```

## Sécurité

**Décision retenue : le bot token vit dans la config du node** (donc sauvegardé dans
Firestore `users/{uid}/workflows/{id}` avec le workflow).

- Avantage : pratique, le token suit le workflow d'un appareil à l'autre, UI sans étape
  de connexion séparée.
- **Risque assumé** : le token est un **secret permanent** (qui le détient contrôle le
  bot). Stocké en clair dans Firestore, il **fuite si le workflow est exporté ou partagé**.
  L'UI doit l'indiquer clairement à l'utilisateur.
- Mitigation Phase 1 : avertissement visible dans l'UI du node ; ne jamais logger le
  token (ni dans `ctx.log`, ni en console). Une mitigation plus forte (token hors
  workflow, chiffrement, secret backend) est renvoyée à une phase ultérieure si besoin.

## Gestion des erreurs

- Token/chat manquant → `Error` avant tout appel réseau.
- HTTP non-2xx ou `{ ok: false }` → `Error` avec `error_code` + `description` Telegram
  (ex. `403 : bot was blocked by the user`, `400 : chat not found`).
- Mode itératif : une ligne en échec est loggée (`ctx.log('warn', ...)`) et la boucle
  continue ; `count`/`messageIds` reflètent les envois réussis.
- Abort (`ctx.signal.aborted`) : interrompre la boucle proprement, loguer le nombre
  d'envois déjà effectués.

## Tests

- **Unitaires `telegramApi.ts`** (fetch mocké) : construction correcte de l'URL et du
  corps pour `sendMessage` (JSON) et `sendDocument` (FormData) ; parsing d'une réponse
  `{ ok: false, ... }` en `Error` lisible ; succès → `message_id`.
- **Node `run`** (fetch mocké) : message texte simple ; envoi avec pièce jointe
  (caption) ; mode itératif sur 2 rows ; erreur token manquant ; abort en cours de boucle.
- **Manuel** : un vrai bot @BotFather + un chat_id réel — message texte + un PDF exporté.

## Hors périmètre (phases ultérieures, specs séparées)

- Réception de messages Telegram (webhook / polling) → déclenchement de workflows.
- Exécution des workflows côté serveur (moteur headless / navigateur headless).
- Auth/sécurité avancée du bot, multi-tenant, stockage chiffré du token.
- Autocomplétion de colonnes dans le message (réutilisation du composant Gmail).
- `sendPhoto`, `sendMediaGroup`, claviers inline, boutons.
```
