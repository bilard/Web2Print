# Telegram entrant — étape 2a (webhook + file + accusé) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recevoir les messages Telegram via un webhook, les empiler dans Firestore, et faire répondre « reçu : \<texte\> » par une instance ouverte de l'app (worker), avec sécurité (secret + allowlist), idempotence et claim concurrent.

**Architecture:** Function `telegramWebhook` (`onRequest`) valide le secret + l'allowlist (lus dans `telegramConfig/main` via admin), puis `create()` un doc `telegramInbox/{update_id}`. Un hook client global écoute les `pending`, *claim* par transaction Firestore, répond via `telegramApi.ts` (Phase 1), et marque `done`/`error`. La logique décisionnelle (webhook et worker) est extraite en fonctions pures testées en TDD ; les enveloppes I/O (handler HTTP, hook `onSnapshot`) sont vérifiées par build + test manuel.

**Tech Stack:** Firebase Functions v2 (`onRequest`, Node 22, `europe-west1`), firebase-admin Firestore, React 18 + Firestore client (`onSnapshot`, `runTransaction`), Zustand (persist), Vitest.

**Spec de référence:** `docs/superpowers/specs/2026-05-25-telegram-inbound-2a-webhook-queue-design.md`

---

## File Structure

- **Create** `functions/src/telegram/evaluateUpdate.ts` — logique pure : décide `enqueue`/`ignore` à partir d'un Update Telegram + allowlist. Aucune dépendance Firebase. Cœur testable du webhook.
- **Create** `functions/src/telegram/evaluateUpdate.test.ts` — tests de la logique pure.
- **Create** `functions/vitest.config.ts` + modif `functions/package.json` — runner de test côté Functions (n'existe pas encore).
- **Create** `functions/src/telegramWebhook.ts` — Function `onRequest` : secret, lecture config admin, `evaluateUpdate`, écriture idempotente. Enveloppe I/O.
- **Modify** `functions/src/index.ts` — exporter `telegramWebhook`.
- **Create** `src/stores/telegram.store.ts` — store Zustand (persist localStorage) du bot token côté worker.
- **Create** `src/stores/telegram.store.test.ts` — test du store.
- **Create** `src/features/telegram/inboxWorker.ts` — logique pure du worker (claim → ack → done/error via deps injectées).
- **Create** `src/features/telegram/inboxWorker.test.ts` — tests de la logique pure.
- **Create** `src/features/telegram/useTelegramInboxWorker.ts` — hook `onSnapshot` + transaction, branche les vraies deps sur `inboxWorker`. Enveloppe I/O.
- **Create** `src/features/telegram/TelegramSettings.tsx` — petit composant de saisie du bot token (lié au store).
- **Modify** `src/features/auth/AuthProvider.tsx` — monter `useTelegramInboxWorker()`.
- **Modify** `firestore.rules` — règles `telegramInbox` (auth) et `telegramConfig` (`if false`).

---

## Task 1 : Logique pure du webhook + runner de test Functions

**Files:**
- Create: `functions/vitest.config.ts`
- Modify: `functions/package.json`
- Create: `functions/src/telegram/evaluateUpdate.ts`
- Test: `functions/src/telegram/evaluateUpdate.test.ts`

- [ ] **Step 1 : Ajouter Vitest au package Functions**

`functions/` n'a aucun runner de test. Installe Vitest comme devDependency :

Run: `cd functions && npm install -D vitest && cd ..`
Expected: `vitest` ajouté dans `functions/package.json` → `devDependencies`.

Puis ajoute le script de test dans `functions/package.json` (section `"scripts"`), à côté de `build` :

```json
"test": "vitest run"
```

- [ ] **Step 2 : Créer la config Vitest Functions**

Créer `functions/vitest.config.ts` :

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3 : Écrire le test de la logique pure (échoue)**

Créer `functions/src/telegram/evaluateUpdate.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { evaluateUpdate } from './evaluateUpdate'

const ALLOWED = [8229250033]

describe('evaluateUpdate', () => {
  it('enqueue un message texte d’un chat autorisé', () => {
    const r = evaluateUpdate(
      { update_id: 100, message: { text: 'bonjour', chat: { id: 8229250033 }, from: { username: 'ibs' } } },
      ALLOWED,
    )
    expect(r).toEqual({
      action: 'enqueue',
      record: { updateId: 100, chatId: 8229250033, fromUsername: 'ibs', text: 'bonjour' },
    })
  })

  it('fromUsername = null si absent', () => {
    const r = evaluateUpdate(
      { update_id: 101, message: { text: 'x', chat: { id: 8229250033 } } },
      ALLOWED,
    )
    expect(r.action).toBe('enqueue')
    if (r.action === 'enqueue') expect(r.record.fromUsername).toBeNull()
  })

  it('ignore (no-text) si pas de texte', () => {
    const r = evaluateUpdate({ update_id: 102, message: { chat: { id: 8229250033 } } }, ALLOWED)
    expect(r).toEqual({ action: 'ignore', reason: 'no-text' })
  })

  it('ignore (no-chat-id) si pas de chat id', () => {
    const r = evaluateUpdate({ update_id: 103, message: { text: 'hi' } }, ALLOWED)
    expect(r).toEqual({ action: 'ignore', reason: 'no-chat-id' })
  })

  it('ignore (not-allowed) si chat hors allowlist', () => {
    const r = evaluateUpdate(
      { update_id: 104, message: { text: 'hi', chat: { id: 999 } } },
      ALLOWED,
    )
    expect(r).toEqual({ action: 'ignore', reason: 'not-allowed' })
  })
})
```

- [ ] **Step 4 : Lancer le test (échec attendu)**

Run: `cd functions && npx vitest run src/telegram/evaluateUpdate.test.ts; cd ..`
Expected: FAIL — `Failed to resolve import "./evaluateUpdate"`.

- [ ] **Step 5 : Implémenter la logique pure**

Créer `functions/src/telegram/evaluateUpdate.ts` :

```ts
// functions/src/telegram/evaluateUpdate.ts
// Logique pure : décide si un Update Telegram doit être empilé. Aucune dépendance Firebase.

export interface TelegramUpdate {
  update_id: number
  message?: {
    text?: string
    chat?: { id?: number }
    from?: { username?: string }
  }
}

export interface InboxRecord {
  updateId: number
  chatId: number
  fromUsername: string | null
  text: string
}

export type EvaluateResult =
  | { action: 'enqueue'; record: InboxRecord }
  | { action: 'ignore'; reason: 'no-text' | 'no-chat-id' | 'not-allowed' }

export function evaluateUpdate(
  update: TelegramUpdate,
  allowedChatIds: number[],
): EvaluateResult {
  const msg = update.message
  const text = msg?.text
  if (typeof text !== 'string' || text.length === 0) {
    return { action: 'ignore', reason: 'no-text' }
  }
  const chatId = msg?.chat?.id
  if (typeof chatId !== 'number') {
    return { action: 'ignore', reason: 'no-chat-id' }
  }
  if (!allowedChatIds.includes(chatId)) {
    return { action: 'ignore', reason: 'not-allowed' }
  }
  return {
    action: 'enqueue',
    record: {
      updateId: update.update_id,
      chatId,
      fromUsername: msg?.from?.username ?? null,
      text,
    },
  }
}
```

- [ ] **Step 6 : Lancer le test (succès attendu)**

Run: `cd functions && npx vitest run src/telegram/evaluateUpdate.test.ts; cd ..`
Expected: PASS (5 tests).

- [ ] **Step 7 : Commit**

```bash
git add functions/package.json functions/package-lock.json functions/vitest.config.ts functions/src/telegram/evaluateUpdate.ts functions/src/telegram/evaluateUpdate.test.ts
git commit -m "feat(telegram/2a): logique pure evaluateUpdate + runner de test Functions

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : Function `telegramWebhook` (enveloppe HTTP)

**Files:**
- Create: `functions/src/telegramWebhook.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1 : Implémenter la Function**

Créer `functions/src/telegramWebhook.ts` :

```ts
// functions/src/telegramWebhook.ts
import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { evaluateUpdate, type TelegramUpdate } from './telegram/evaluateUpdate'

if (!getApps().length) initializeApp()
const db = getFirestore()

interface TelegramConfig {
  webhookSecret?: string
  allowedChatIds?: number[]
}

export const telegramWebhook = onRequest(
  { region: 'europe-west1', maxInstances: 10, timeoutSeconds: 20 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed')
      return
    }

    // Config (secret + allowlist) lue via admin (contourne les règles Firestore).
    const cfgSnap = await db.doc('telegramConfig/main').get()
    const cfg = (cfgSnap.data() ?? {}) as TelegramConfig
    const secret = cfg.webhookSecret
    const allowed = cfg.allowedChatIds ?? []

    if (!secret || req.header('X-Telegram-Bot-Api-Secret-Token') !== secret) {
      res.status(401).send('Unauthorized')
      return
    }

    const result = evaluateUpdate(req.body as TelegramUpdate, allowed)
    if (result.action === 'ignore') {
      // 200 silencieux : Telegram ne doit pas réessayer ce update.
      res.status(200).send(`ignored:${result.reason}`)
      return
    }

    // create() = idempotent : une réémission du même update_id lève already-exists.
    const ref = db.collection('telegramInbox').doc(String(result.record.updateId))
    try {
      await ref.create({
        ...result.record,
        status: 'pending',
        receivedAt: FieldValue.serverTimestamp(),
      })
    } catch {
      // already-exists → déjà empilé, rien à faire.
    }
    res.status(200).send('ok')
  },
)
```

- [ ] **Step 2 : Exporter depuis l'index**

Dans `functions/src/index.ts`, ajouter après la ligne d'export de `imageProxy` :

```ts
// --- Image proxy (contourne CORS pour les photos catalogue scraped) ---
export { imageProxy } from './imageProxy'

// --- Telegram entrant (2a) : webhook → file Firestore ---
export { telegramWebhook } from './telegramWebhook'
```

- [ ] **Step 3 : Vérifier la compilation des Functions**

Run: `cd functions && npm run build; cd ..`
Expected: compilation TypeScript sans erreur (génère `functions/lib/...`).

- [ ] **Step 4 : Commit**

```bash
git add functions/src/telegramWebhook.ts functions/src/index.ts
git commit -m "feat(telegram/2a): Function telegramWebhook (secret + allowlist + enqueue idempotent)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

> Note : la Function est testée de bout en bout à la Task 7 (déploiement + message réel). Sa
> logique décisionnelle est déjà couverte par les tests de `evaluateUpdate` (Task 1).

---

## Task 3 : Store du bot token (worker)

**Files:**
- Create: `src/stores/telegram.store.ts`
- Test: `src/stores/telegram.store.test.ts`

- [ ] **Step 1 : Écrire le test (échoue)**

Créer `src/stores/telegram.store.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useTelegramStore } from './telegram.store'

describe('telegram.store', () => {
  beforeEach(() => {
    useTelegramStore.setState({ botToken: '' })
  })

  it('botToken vide par défaut', () => {
    expect(useTelegramStore.getState().botToken).toBe('')
  })

  it('setBotToken met à jour le token', () => {
    useTelegramStore.getState().setBotToken('123:ABC')
    expect(useTelegramStore.getState().botToken).toBe('123:ABC')
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npx vitest run src/stores/telegram.store.test.ts`
Expected: FAIL — `Failed to resolve import "./telegram.store"`.

- [ ] **Step 3 : Implémenter le store**

Créer `src/stores/telegram.store.ts` :

```ts
// src/stores/telegram.store.ts
// Bot token Telegram utilisé par le worker pour répondre. Persisté en localStorage.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TelegramState {
  botToken: string
  setBotToken: (token: string) => void
}

export const useTelegramStore = create<TelegramState>()(
  persist(
    (set) => ({
      botToken: '',
      setBotToken: (token) => set({ botToken: token }),
    }),
    { name: 'designstudio_telegram' },
  ),
)
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npx vitest run src/stores/telegram.store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/stores/telegram.store.ts src/stores/telegram.store.test.ts
git commit -m "feat(telegram/2a): store du bot token worker (Zustand persist)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 : Logique pure du worker

**Files:**
- Create: `src/features/telegram/inboxWorker.ts`
- Test: `src/features/telegram/inboxWorker.test.ts`

- [ ] **Step 1 : Écrire le test (échoue)**

Créer `src/features/telegram/inboxWorker.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest'
import { processInboxMessage, buildAckText, type InboxWorkerDeps, type InboxDoc } from './inboxWorker'

const doc: InboxDoc = { updateId: 1, chatId: 42, text: 'bonjour', status: 'pending' }

function mkDeps(over: Partial<InboxWorkerDeps> = {}): InboxWorkerDeps {
  return {
    claim: vi.fn().mockResolvedValue(true),
    sendAck: vi.fn().mockResolvedValue(undefined),
    markDone: vi.fn().mockResolvedValue(undefined),
    markError: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}

describe('inboxWorker', () => {
  it('buildAckText préfixe « reçu : »', () => {
    expect(buildAckText('salut')).toBe('reçu : salut')
  })

  it('claim gagné → ack puis done', async () => {
    const deps = mkDeps()
    await processInboxMessage(deps, doc)
    expect(deps.claim).toHaveBeenCalledWith(1)
    expect(deps.sendAck).toHaveBeenCalledWith(42, 'reçu : bonjour')
    expect(deps.markDone).toHaveBeenCalledWith(1)
    expect(deps.markError).not.toHaveBeenCalled()
  })

  it('claim perdu → aucun envoi', async () => {
    const deps = mkDeps({ claim: vi.fn().mockResolvedValue(false) })
    await processInboxMessage(deps, doc)
    expect(deps.sendAck).not.toHaveBeenCalled()
    expect(deps.markDone).not.toHaveBeenCalled()
  })

  it('échec d’envoi → markError avec le message', async () => {
    const deps = mkDeps({ sendAck: vi.fn().mockRejectedValue(new Error('chat not found')) })
    await processInboxMessage(deps, doc)
    expect(deps.markError).toHaveBeenCalledWith(1, 'chat not found')
    expect(deps.markDone).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npx vitest run src/features/telegram/inboxWorker.test.ts`
Expected: FAIL — `Failed to resolve import "./inboxWorker"`.

- [ ] **Step 3 : Implémenter la logique pure**

Créer `src/features/telegram/inboxWorker.ts` :

```ts
// src/features/telegram/inboxWorker.ts
// Logique pure du worker : claim → accusé → done/error. Les I/O (Firestore, Telegram) sont
// injectées via `deps`, ce qui rend la logique testable sans émulateur.

export interface InboxDoc {
  updateId: number
  chatId: number
  text: string
  status: string
}

export interface InboxWorkerDeps {
  /** Passe le doc de pending → processing dans une transaction. true si ce worker a gagné. */
  claim: (updateId: number) => Promise<boolean>
  sendAck: (chatId: number, text: string) => Promise<void>
  markDone: (updateId: number) => Promise<void>
  markError: (updateId: number, message: string) => Promise<void>
}

export function buildAckText(text: string): string {
  return `reçu : ${text}`
}

export async function processInboxMessage(deps: InboxWorkerDeps, doc: InboxDoc): Promise<void> {
  const won = await deps.claim(doc.updateId)
  if (!won) return // un autre onglet a déjà pris ce message
  try {
    await deps.sendAck(doc.chatId, buildAckText(doc.text))
    await deps.markDone(doc.updateId)
  } catch (err) {
    await deps.markError(doc.updateId, err instanceof Error ? err.message : String(err))
  }
}
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npx vitest run src/features/telegram/inboxWorker.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/features/telegram/inboxWorker.ts src/features/telegram/inboxWorker.test.ts
git commit -m "feat(telegram/2a): logique pure du worker (claim → accusé → done/error)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 : Hook worker + composant Settings + montage

**Files:**
- Create: `src/features/telegram/useTelegramInboxWorker.ts`
- Create: `src/features/telegram/TelegramSettings.tsx`
- Modify: `src/features/auth/AuthProvider.tsx`

- [ ] **Step 1 : Implémenter le hook worker**

Créer `src/features/telegram/useTelegramInboxWorker.ts` :

```ts
// src/features/telegram/useTelegramInboxWorker.ts
// Écoute les messages Telegram entrants (status pending) et les traite via inboxWorker.
// Monté globalement : actif dès qu'un utilisateur est connecté (choix « n'importe quel onglet »).
import { useEffect } from 'react'
import {
  collection, query, where, onSnapshot, runTransaction, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useTelegramStore } from '@/stores/telegram.store'
import { sendTelegramMessage } from '@/lib/telegramApi'
import { processInboxMessage, type InboxDoc, type InboxWorkerDeps } from './inboxWorker'

// Identifie cet onglet pour le claim (diagnostic).
const WORKER_ID = Math.random().toString(36).slice(2)

export function useTelegramInboxWorker(): void {
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!user?.uid) return
    const q = query(collection(db, 'telegramInbox'), where('status', '==', 'pending'))

    const unsub = onSnapshot(
      q,
      (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type !== 'added') return
          const data = change.doc.data() as InboxDoc
          const botToken = useTelegramStore.getState().botToken
          if (!botToken) return // pas de token configuré → on ne peut pas répondre

          const deps: InboxWorkerDeps = {
            claim: (updateId) => {
              const ref = doc(db, 'telegramInbox', String(updateId))
              return runTransaction(db, async (tx) => {
                const cur = await tx.get(ref)
                if (!cur.exists() || cur.data()?.status !== 'pending') return false
                tx.update(ref, {
                  status: 'processing',
                  workerId: WORKER_ID,
                  claimedAt: serverTimestamp(),
                })
                return true
              })
            },
            sendAck: async (chatId, text) => {
              await sendTelegramMessage(botToken, { chatId: String(chatId), text })
            },
            markDone: async (updateId) => {
              await updateDoc(doc(db, 'telegramInbox', String(updateId)), {
                status: 'done',
                processedAt: serverTimestamp(),
              })
            },
            markError: async (updateId, message) => {
              await updateDoc(doc(db, 'telegramInbox', String(updateId)), {
                status: 'error',
                errorMessage: message,
                processedAt: serverTimestamp(),
              })
            },
          }

          void processInboxMessage(deps, data)
        })
      },
      (err) => console.warn('telegramInbox listener error:', err.message),
    )

    return unsub
  }, [user?.uid])
}
```

- [ ] **Step 2 : Créer le composant de saisie du bot token**

Créer `src/features/telegram/TelegramSettings.tsx` :

```tsx
// src/features/telegram/TelegramSettings.tsx
import { useTelegramStore } from '@/stores/telegram.store'

export function TelegramSettings() {
  const botToken = useTelegramStore((s) => s.botToken)
  const setBotToken = useTelegramStore((s) => s.setBotToken)

  return (
    <div className="space-y-2">
      <label className="text-xs text-neutral-400 block">Bot token Telegram (worker)</label>
      <input
        type="password"
        autoComplete="off"
        value={botToken}
        onChange={(e) => setBotToken(e.target.value)}
        placeholder="123456789:ABCdef..."
        className="w-full bg-[#0f0f0f] border border-neutral-700 rounded-md px-2 py-1.5 text-[12px] text-white placeholder:text-neutral-600 focus:border-cyan-500 outline-none"
      />
      <p className="text-[10px] text-neutral-600 leading-snug">
        Utilisé par le worker pour répondre aux messages reçus. Stocké localement (ce navigateur).
      </p>
    </div>
  )
}
```

- [ ] **Step 3 : Monter le hook + le composant**

Dans `src/features/auth/AuthProvider.tsx`, importer et appeler le hook à côté des autres hooks globaux (`useAuthInit()`, `useAiSettingsSync()`, `useApiKeysSync()`) :

```ts
import { useTelegramInboxWorker } from '@/features/telegram/useTelegramInboxWorker'
```
puis dans le corps du composant, après les autres appels de hooks :
```ts
  useTelegramInboxWorker()
```

Insère le composant `TelegramSettings` dans le panneau des réglages de l'app. Localise le panneau de Settings (cherche `SettingsPanel`), importe `TelegramSettings` et place `<TelegramSettings />` dans une section « Telegram » du panneau, en suivant la mise en page des autres sections.

- [ ] **Step 4 : Vérifier types + lint + suite**

Run: `npx tsc -b`
Expected: aucune erreur.

Run: `npx eslint src/features/telegram/ src/stores/telegram.store.ts`
Expected: aucune erreur (warnings tolérés).

Run: `npx vitest run`
Expected: PASS — les nouveaux tests (store 2, inboxWorker 4) passent, aucune régression.

- [ ] **Step 5 : Commit**

```bash
git add src/features/telegram/useTelegramInboxWorker.ts src/features/telegram/TelegramSettings.tsx src/features/auth/AuthProvider.tsx
git commit -m "feat(telegram/2a): hook worker (onSnapshot+transaction) + réglage bot token + montage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

> Note : le hook (onSnapshot/transaction) est une enveloppe I/O ; sa logique est couverte par
> les tests de `inboxWorker` (Task 4). Vérification réelle à la Task 7.

---

## Task 6 : Règles Firestore

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1 : Ajouter les règles**

Dans `firestore.rules`, à l'intérieur du bloc `match /databases/{database}/documents { ... }` (au même niveau que les autres `match` de collection), ajouter :

```
    // ── Telegram entrant (2a) ──────────────────────────────────
    // File des messages reçus : lisible/modifiable par tout utilisateur connecté
    // (l'app perso est mono-utilisateur ; le mapping chat_id→uid est hors périmètre 2a).
    match /telegramInbox/{messageId} {
      allow read, write: if request.auth != null;
    }

    // Config (secret webhook + allowlist) : JAMAIS accessible au client.
    // Seul le SDK admin de la Function y accède (il contourne les règles).
    match /telegramConfig/{docId} {
      allow read, write: if false;
    }
```

- [ ] **Step 2 : Vérifier la syntaxe des règles**

Run: `npx firebase deploy --only firestore:rules --dry-run 2>/dev/null || echo "Dry-run indisponible — vérifier manuellement la syntaxe avant déploiement réel (Task 7)."`
Expected: pas d'erreur de syntaxe (ou message de repli).

- [ ] **Step 3 : Commit**

```bash
git add firestore.rules
git commit -m "feat(telegram/2a): règles Firestore telegramInbox (auth) + telegramConfig (verrouillé)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 : Déploiement + configuration + vérification de bout en bout (manuel — utilisateur)

> Ces étapes nécessitent les identifiants Firebase/Telegram de l'utilisateur (déploiement,
> console, bot token) et **ne sont pas exécutables par un sous-agent**. À dérouler par
> l'utilisateur une fois les Tasks 1-6 mergées. Listées ici pour complétude.

- [ ] **Step 1 : Déployer la Function et les règles**

```bash
firebase deploy --only functions:telegramWebhook,firestore:rules
```
Noter l'URL publique de la Function affichée (ex.
`https://europe-west1-web2print-6fe5a.cloudfunctions.net/telegramWebhook`).

- [ ] **Step 2 : Créer le doc de config**

Dans la console Firebase → Firestore, créer le document `telegramConfig/main` :
```
webhookSecret   (string)  : <une chaîne aléatoire forte, ex. générée avec `openssl rand -hex 16`>
allowedChatIds  (array)   : [ 8229250033 ]   // ton chat_id (number)
```

- [ ] **Step 3 : Enregistrer le webhook auprès de Telegram**

```bash
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=<URL_FONCTION>" \
  -d "secret_token=<MÊME_webhookSecret_QU_AU_STEP_2>"
```
Vérifier : `curl -s "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"` → `"url"` renseignée, `pending_update_count` cohérent.

- [ ] **Step 4 : Renseigner le bot token côté app**

Ouvrir l'app (connecté), aller dans les réglages → section Telegram, coller le bot token (champ ajouté en Task 5). Laisser l'onglet ouvert (worker actif).

- [ ] **Step 5 : Test réel**

Depuis Telegram, envoyer « bonjour » à @Ibsstudio_bot.
Attendu : recevoir « reçu : bonjour ». Vérifier dans Firestore que le doc `telegramInbox/{update_id}` est passé `pending → processing → done`.

- [ ] **Step 6 : Vérifier la sécurité**

- Appeler l'URL de la Function sans le header secret (`curl -X POST <URL_FONCTION> -d '{}'`) → réponse `401`.
- Envoyer un message depuis un compte Telegram dont le chat_id n'est PAS dans `allowedChatIds` → aucun doc créé, aucune réponse.

---

## Notes d'implémentation

- **Pas de `runTransaction` ni d'`onRequest` préexistant** dans le repo : ce plan introduit les deux (patterns standard firebase). Le claim transactionnel est la garantie anti-double-traitement en multi-onglet.
- **`evaluateUpdate` est volontairement séparée du handler** pour être testable sans firebase-functions-test (que le projet n'a pas).
- **Collision canvas** : non concernée en 2a (aucune exécution). À traiter au design de 2c.
- **Sécurité** : le `webhookSecret` n'est jamais exposé au client (règle `if false` + lecture admin). Le bot token worker vit en localStorage (même profil de risque que la Phase 1). Ne jamais logger l'un ni l'autre.
- **Mono-utilisateur** : `telegramInbox` n'est pas scopé par `ownerId` (le webhook ne connaît pas l'uid Firebase, seulement le chat_id). Le mapping chat_id→uid pour le multi-tenant est hors périmètre 2a.
```
