# Proxy LLM serveur + quotas — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire transiter tous les appels LLM JSON (Claude, Gemini, OpenAI, DeepSeek, OpenRouter) par une Cloud Function authentifiée qui lit la clé du user en Firestore et applique son budget mensuel — la clé ne voyage plus dans le navigateur sur le chemin principal, et le budget devient bloquant.

**Architecture:** Une callable `llmProxy` (europe-west1) reçoit `{provider, model, body}`, valide l'auth, lit la clé via `getUserApiKey` (déjà existant), vérifie `users/{uid}.aiSettings.monthlyBudgetUsd[provider]` contre `aiUsage/{uid}_{YYYY-MM}.byProvider[provider].costUsd`, forwarde la requête au provider et retourne `{status, body}` verbatim. Côté client, un helper `llmFetchViaProxy` renvoie un objet compatible `Response` (ok/status/text/json) ; en cas d'indisponibilité Functions ou de payload multimodal > 9 Mo, fallback sur le fetch direct existant (continuité de service). `resource-exhausted` (budget atteint) ne fallback PAS — c'est le but. Le tracking d'usage reste côté client (`recordAiUsage`, inchangé — pas de double comptage).

**Tech Stack:** Firebase Functions v2 (onCall), firebase-admin Firestore, Vitest (les deux côtés), client Firebase `httpsCallable`.

**Hors scope (suivi):** `geminiImageClient` (génération d'images), `useJina`, `chatRouter` — itération ultérieure ; notés dans la mémoire projet.

---

### Task 1: Logique pure serveur `proxyCore` (TDD)

**Files:**
- Create: `functions/src/llm/proxyCore.ts`
- Test: `functions/src/llm/proxyCore.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// functions/src/llm/proxyCore.test.ts
import { describe, it, expect } from 'vitest'
import { PROXY_PROVIDERS, buildProviderRequest, isOverBudget, keyIdForProvider } from './proxyCore'

describe('keyIdForProvider', () => {
  it('mappe claude sur la clé anthropic, les autres sur leur propre id', () => {
    expect(keyIdForProvider('claude')).toBe('anthropic')
    expect(keyIdForProvider('gemini')).toBe('gemini')
    expect(keyIdForProvider('openrouter')).toBe('openrouter')
  })
})

describe('buildProviderRequest', () => {
  it('claude : endpoint Anthropic + x-api-key SANS header direct-browser-access', () => {
    const spec = buildProviderRequest('claude', 'claude-opus-4-8', 'sk-test')
    expect(spec.url).toBe('https://api.anthropic.com/v1/messages')
    expect(spec.headers['x-api-key']).toBe('sk-test')
    expect(spec.headers['anthropic-version']).toBe('2023-06-01')
    expect(Object.keys(spec.headers)).not.toContain('anthropic-dangerous-direct-browser-access')
  })
  it('gemini : v1beta pour les modèles < 3.5, v1 pour 3.5+, clé en query param', () => {
    expect(buildProviderRequest('gemini', 'gemini-3.1-pro-preview', 'k').url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=k',
    )
    expect(buildProviderRequest('gemini', 'gemini-3.5-flash', 'k').url).toBe(
      'https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=k',
    )
  })
  it('openai/deepseek/openrouter : Bearer', () => {
    expect(buildProviderRequest('openai', 'gpt-5.2', 'k').headers.authorization).toBe('Bearer k')
    expect(buildProviderRequest('deepseek', 'deepseek-chat', 'k').url).toContain('api.deepseek.com')
    const or = buildProviderRequest('openrouter', 'anthropic/claude-opus-4-8', 'k')
    expect(or.headers['http-referer']).toBe('https://ibs-studio.com')
  })
  it('PROXY_PROVIDERS couvre les 5 providers du routeur client', () => {
    expect([...PROXY_PROVIDERS].sort()).toEqual(['claude', 'deepseek', 'gemini', 'openai', 'openrouter'])
  })
})

describe('isOverBudget', () => {
  it('null/undefined/0 = pas de budget → jamais bloquant', () => {
    expect(isOverBudget(null, 999)).toBe(false)
    expect(isOverBudget(undefined, 999)).toBe(false)
    expect(isOverBudget(0, 999)).toBe(false)
  })
  it('bloque quand le dépensé atteint le budget', () => {
    expect(isOverBudget(10, 9.99)).toBe(false)
    expect(isOverBudget(10, 10)).toBe(true)
    expect(isOverBudget(10, 12)).toBe(true)
  })
})
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `cd functions && npx vitest run src/llm/proxyCore.test.ts`
Expected: FAIL — `Cannot find module './proxyCore'`

- [ ] **Step 3: Implémentation minimale**

```typescript
// functions/src/llm/proxyCore.ts
/**
 * Logique pure du proxy LLM serveur : mapping provider → requête HTTP
 * (endpoint + headers d'auth) et règle de budget. Séparée de la callable
 * pour être testable sans firebase-admin.
 */

export type LlmProxyProvider = 'claude' | 'gemini' | 'openai' | 'deepseek' | 'openrouter'

export const PROXY_PROVIDERS: readonly LlmProxyProvider[] = ['claude', 'gemini', 'openai', 'deepseek', 'openrouter']

/** Id de clé API dans users/{uid}.apiKeys.overrides (le provider "claude" range sa clé sous "anthropic"). */
export function keyIdForProvider(provider: LlmProxyProvider): string {
  return provider === 'claude' ? 'anthropic' : provider
}

export interface ProviderRequestSpec {
  url: string
  headers: Record<string, string>
}

export function buildProviderRequest(provider: LlmProxyProvider, model: string, apiKey: string): ProviderRequestSpec {
  switch (provider) {
    case 'claude':
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      }
    case 'gemini': {
      // Gemini 3.5+ n'est servi que sur l'API stable `v1` (404 sur `v1beta`) —
      // même logique que ENDPOINT() dans src/features/briefs/ai/geminiClient.ts.
      const version = /^gemini-3\.5/.test(model) ? 'v1' : 'v1beta'
      return {
        url: `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`,
        headers: {},
      }
    }
    case 'openai':
      return { url: 'https://api.openai.com/v1/chat/completions', headers: { authorization: `Bearer ${apiKey}` } }
    case 'deepseek':
      return { url: 'https://api.deepseek.com/v1/chat/completions', headers: { authorization: `Bearer ${apiKey}` } }
    case 'openrouter':
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'http-referer': 'https://ibs-studio.com',
          'x-title': 'IBS-Studio',
        },
      }
  }
}

/** Budget mensuel bloquant : `null`/`undefined`/`0` = pas de limite. */
export function isOverBudget(budgetUsd: number | null | undefined, spentUsd: number): boolean {
  return typeof budgetUsd === 'number' && budgetUsd > 0 && spentUsd >= budgetUsd
}
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `cd functions && npx vitest run src/llm/proxyCore.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add functions/src/llm/proxyCore.ts functions/src/llm/proxyCore.test.ts
git commit -m "feat(llm): logique pure du proxy LLM serveur (mapping providers + budget)"
```

### Task 2: Callable `llmProxy` + export

**Files:**
- Create: `functions/src/llm/llmProxy.ts`
- Modify: `functions/src/index.ts` (ajout export)

- [ ] **Step 1: Écrire la callable**

```typescript
// functions/src/llm/llmProxy.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import { getFirestore } from 'firebase-admin/firestore'
import { getUserApiKey } from '../workflow/apiKeys'
import {
  PROXY_PROVIDERS,
  buildProviderRequest,
  isOverBudget,
  keyIdForProvider,
  type LlmProxyProvider,
} from './proxyCore'

interface LlmProxyData {
  provider?: string
  model?: string
  body?: Record<string, unknown>
}

/**
 * Proxy LLM authentifié : le navigateur n'envoie plus sa clé API aux providers,
 * il envoie la requête au proxy qui lit la clé du user en Firestore
 * (users/{uid}.apiKeys.overrides) et applique son budget mensuel
 * (users/{uid}.aiSettings.monthlyBudgetUsd vs aiUsage/{uid}_{YYYY-MM}).
 * La réponse provider est retournée verbatim ({status, body texte}) — la
 * validation Zod et le tracking d'usage restent côté client (llmRouter).
 */
export const llmProxy = onCall<LlmProxyData, Promise<{ status: number; body: string }>>(
  { timeoutSeconds: 300, memory: '256MiB', region: 'europe-west1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Authentification Firebase requise')
    const uid = req.auth.uid
    const provider = req.data?.provider as LlmProxyProvider
    const model = req.data?.model
    const body = req.data?.body
    if (!PROXY_PROVIDERS.includes(provider)) {
      throw new HttpsError('invalid-argument', `Provider non supporté : ${String(req.data?.provider)}`)
    }
    if (!model || typeof model !== 'string') throw new HttpsError('invalid-argument', 'model manquant')
    if (!body || typeof body !== 'object') throw new HttpsError('invalid-argument', 'body manquant')

    const keyId = keyIdForProvider(provider)
    const apiKey = await getUserApiKey(uid, keyId)
    if (!apiKey) {
      throw new HttpsError('failed-precondition', `Clé ${keyId} absente du profil Firestore — enregistre-la dans Réglages → Connecteurs.`)
    }

    const db = getFirestore()
    const month = new Date().toISOString().slice(0, 7)
    const [userSnap, usageSnap] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.doc(`aiUsage/${uid}_${month}`).get(),
    ])
    const budgets = (userSnap.data()?.aiSettings?.monthlyBudgetUsd ?? {}) as Record<string, number | null>
    const budget = budgets[provider]
    const spent = (usageSnap.data()?.byProvider?.[provider]?.costUsd ?? 0) as number
    if (isOverBudget(budget, spent)) {
      throw new HttpsError(
        'resource-exhausted',
        `Budget mensuel ${provider} atteint (${spent.toFixed(2)} / ${budget} USD). Ajuste-le dans Réglages → IA.`,
      )
    }

    const spec = buildProviderRequest(provider, model, apiKey)
    try {
      const res = await fetch(spec.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...spec.headers },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      if (!res.ok) {
        logger.warn('[llmProxy] provider non-2xx', { uid, provider, model, status: res.status, body: text.slice(0, 200) })
      }
      return { status: res.status, body: text }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('[llmProxy] échec réseau provider', { uid, provider, model, msg: msg.slice(0, 200) })
      throw new HttpsError('unavailable', `Échec de l'appel ${provider} : ${msg.slice(0, 200)}`)
    }
  },
)
```

- [ ] **Step 2: Exporter dans index.ts**

Dans `functions/src/index.ts`, après le bloc `// --- Workflow webhook entrant ---` :

```typescript
// --- Proxy LLM authentifié (clé Firestore + budget mensuel bloquant) ---
export { llmProxy } from './llm/llmProxy'
```

- [ ] **Step 3: Vérifier la compilation**

Run: `cd functions && npm run build`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add functions/src/llm/llmProxy.ts functions/src/index.ts
git commit -m "feat(llm): callable llmProxy — clé user Firestore + budget mensuel bloquant"
```

### Task 3: Client `llmProxyClient` (TDD)

**Files:**
- Create: `src/lib/llmProxyClient.ts`
- Test: `src/lib/llmProxyClient.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

```typescript
// src/lib/llmProxyClient.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const callMock = vi.fn()
vi.mock('firebase/functions', () => ({
  httpsCallable: () => callMock,
}))
vi.mock('@/lib/firebase/config', () => ({ functions: {} }))

import { llmFetchViaProxy, LlmBudgetError } from './llmProxyClient'

beforeEach(() => callMock.mockReset())

describe('llmFetchViaProxy', () => {
  it('retourne une réponse compatible Response sur succès proxy', async () => {
    callMock.mockResolvedValue({ data: { status: 200, body: '{"ok":true}' } })
    const fallback = vi.fn()
    const res = await llmFetchViaProxy('claude', 'claude-opus-4-8', { messages: [] }, fallback)
    expect(res.ok).toBe(true)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"ok":true}')
    expect(await res.json()).toEqual({ ok: true })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('propage le status provider non-2xx sans fallback (erreur provider ≠ erreur proxy)', async () => {
    callMock.mockResolvedValue({ data: { status: 429, body: 'rate limited' } })
    const fallback = vi.fn()
    const res = await llmFetchViaProxy('gemini', 'gemini-3.1-pro-preview', {}, fallback)
    expect(res.ok).toBe(false)
    expect(res.status).toBe(429)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('budget atteint (resource-exhausted) → LlmBudgetError, PAS de fallback direct', async () => {
    callMock.mockRejectedValue(Object.assign(new Error('budget'), { code: 'functions/resource-exhausted' }))
    const fallback = vi.fn()
    await expect(llmFetchViaProxy('claude', 'm', {}, fallback)).rejects.toBeInstanceOf(LlmBudgetError)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('proxy indisponible → fallback direct', async () => {
    callMock.mockRejectedValue(Object.assign(new Error('down'), { code: 'functions/internal' }))
    const fallback = vi.fn().mockResolvedValue(new Response('direct', { status: 200 }))
    const res = await llmFetchViaProxy('openai', 'gpt-5.2', {}, fallback)
    expect(fallback).toHaveBeenCalledOnce()
    expect(await res.text()).toBe('direct')
  })

  it('payload > 9 Mo → fallback direct sans tenter la callable', async () => {
    const fallback = vi.fn().mockResolvedValue(new Response('direct', { status: 200 }))
    const big = { data: 'x'.repeat(9_500_000) }
    await llmFetchViaProxy('gemini', 'm', big, fallback)
    expect(callMock).not.toHaveBeenCalled()
    expect(fallback).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npx vitest run src/lib/llmProxyClient.test.ts`
Expected: FAIL — module inexistant

- [ ] **Step 3: Implémentation**

```typescript
// src/lib/llmProxyClient.ts
/**
 * Client du proxy LLM serveur (`llmProxy` Cloud Function).
 *
 * Chemin principal : la requête provider (payload JSON complet, SANS clé API)
 * part vers la callable authentifiée qui ajoute la clé du user (Firestore) et
 * applique son budget mensuel. Le retour {status, body} est enveloppé dans un
 * objet compatible `Response` pour que les routeurs existants (llmRouter,
 * geminiClient) gardent leur code de parsing inchangé.
 *
 * Fallback direct (fetch navigateur, comme avant) UNIQUEMENT si :
 *  - le payload dépasse la limite des callables (~10 Mo) — multimodal lourd ;
 *  - la Function est indisponible / clé absente côté Firestore.
 * Budget atteint (`resource-exhausted`) ne fallback JAMAIS : c'est l'enforcement.
 */
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'

export type LlmProxyProvider = 'claude' | 'gemini' | 'openai' | 'deepseek' | 'openrouter'

interface LlmProxyRequest {
  provider: LlmProxyProvider
  model: string
  body: Record<string, unknown>
}
interface LlmProxyResult {
  status: number
  body: string
}

/** Marge sous la limite 10 Mo des callables (sérialisation + enveloppe). */
const MAX_PROXY_PAYLOAD_BYTES = 9_000_000

export class LlmBudgetError extends Error {}

/** Sous-ensemble de Response utilisé par les routeurs LLM (ok/status/text/json). */
export interface LlmHttpResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
  json: () => Promise<unknown>
}

const callLlmProxy = httpsCallable<LlmProxyRequest, LlmProxyResult>(functions, 'llmProxy', { timeout: 300_000 })

export async function llmFetchViaProxy(
  provider: LlmProxyProvider,
  model: string,
  body: Record<string, unknown>,
  directFallback: () => Promise<LlmHttpResponse | Response>,
): Promise<LlmHttpResponse | Response> {
  if (JSON.stringify(body).length > MAX_PROXY_PAYLOAD_BYTES) {
    return directFallback()
  }
  try {
    const res = await callLlmProxy({ provider, model, body })
    const { status, body: text } = res.data
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      json: async () => JSON.parse(text),
    }
  } catch (err) {
    const code = (err as { code?: string })?.code ?? ''
    if (code === 'functions/resource-exhausted') {
      throw new LlmBudgetError(err instanceof Error ? err.message : 'Budget LLM mensuel atteint')
    }
    // failed-precondition (clé absente en Firestore), unavailable, internal,
    // réseau… → continuité de service via l'appel direct historique.
    console.warn(`[llmProxyClient] proxy ${provider} indisponible (${code || 'réseau'}) → appel direct`, err)
    return directFallback()
  }
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run src/lib/llmProxyClient.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/llmProxyClient.ts src/lib/llmProxyClient.test.ts
git commit -m "feat(llm): client du proxy LLM — fallback direct contrôlé, budget bloquant"
```

### Task 4: Brancher llmRouter (claude, openai, deepseek, openrouter) sur le proxy

**Files:**
- Modify: `src/features/ai/llmRouter.ts`

- [ ] **Step 1: Import + restructuration `callClaude`**

Ajouter l'import en tête :

```typescript
import { llmFetchViaProxy } from '@/lib/llmProxyClient'
```

Dans `callClaude`, remplacer le bloc clé + premier fetch (`const apiKey = getApiKey('anthropic') … if (!apiKey) throw …` et le `fetch(ANTHROPIC_ENDPOINT, …)` avec son AbortController) par :

```typescript
  // La clé locale n'est plus requise : le chemin principal passe par le proxy
  // serveur (clé Firestore). Elle ne sert qu'au fallback direct.
  const directClaudeFetch = async (payload: unknown): Promise<Response> => {
    const apiKey = getApiKey('anthropic')
    if (!apiKey) throw new Error('Clé Anthropic absente. Configurez-la dans Réglages.')
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 180_000)
    try {
      return await fetch(ANTHROPIC_ENDPOINT, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(payload),
      })
    } finally {
      clearTimeout(timeoutId)
    }
  }
```

puis le premier appel devient :

```typescript
  const res = await llmFetchViaProxy('claude', model, requestPayload as unknown as Record<string, unknown>, () => directClaudeFetch(requestPayload))
```

Le retry (2e fetch) construit son payload et passe par le même chemin :

```typescript
  const retryPayload = {
    model,
    max_tokens,
    tools: [tool],
    tool_choice: { type: 'tool', name: toolName },
    messages: [{ role: 'user', content: retryMessageContent }],
  }
  const retryRes = await llmFetchViaProxy('claude', model, retryPayload as unknown as Record<string, unknown>, () => directClaudeFetch(retryPayload))
```

(supprimer la garde `const apiKey = getApiKey('anthropic'); if (!apiKey) throw` du début de `callClaude` — elle vit désormais dans `directClaudeFetch`.)

- [ ] **Step 2: Restructuration `callOpenAICompatible`**

Remplacer le bloc clé + fetch par :

```typescript
  const requestBody = {
    model,
    temperature,
    max_tokens,
    messages: [{ role: 'user', content: fullPrompt }],
    response_format: { type: 'json_object' as const },
  }

  const directFetch = async (): Promise<Response> => {
    const apiKey = getApiKey(config.apiKeyId)
    if (!apiKey) throw new Error(`Clé ${config.displayName} absente. Configurez-la dans Réglages.`)
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 180_000)
    try {
      return await fetch(config.endpoint, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(config.extraHeaders ?? {}),
        },
        body: JSON.stringify(requestBody),
      })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const res = await llmFetchViaProxy(config.providerId, model, requestBody as unknown as Record<string, unknown>, directFetch)
```

(la garde clé en tête de fonction est supprimée — déplacée dans `directFetch`.)

- [ ] **Step 3: Restructuration `callOpenAI`** — même pattern (provider `'openai'`, endpoint `https://api.openai.com/v1/chat/completions`).

- [ ] **Step 4: Vérifier types + tests**

Run: `npx tsc -b && npx vitest run src/features/ai src/lib/llmProxyClient.test.ts`
Expected: exit 0, tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/llmRouter.ts
git commit -m "feat(llm): llmRouter passe par le proxy serveur (claude/openai/deepseek/openrouter)"
```

### Task 5: Brancher geminiClient sur le proxy

**Files:**
- Modify: `src/features/briefs/ai/geminiClient.ts`

- [ ] **Step 1: Restructurer `callGemini`**

Import : `import { llmFetchViaProxy } from '@/lib/llmProxyClient'`.

`callGemini` construit le body puis :

```typescript
  const requestBody = {
    contents: [{ parts }],
    generationConfig: /* … inchangé … */,
  }

  const directFetch = async (): Promise<Response> => {
    const apiKey = getApiKey('gemini')
    if (!apiKey) throw new Error('Clé Gemini absente. Configurez-la dans Réglages.')
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 180_000)
    try {
      return await fetch(`${ENDPOINT(model)}?key=${apiKey}`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const res = await llmFetchViaProxy('gemini', model, requestBody as unknown as Record<string, unknown>, directFetch)
```

La signature `callGemini(apiKey, …)` perd son paramètre `apiKey` ; `generateJson` ne throw plus si `getApiKey('gemini')` est vide (la garde descend dans `directFetch`).

- [ ] **Step 2: Vérifier types + tests existants**

Run: `npx tsc -b && npm run test:run`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/ai/geminiClient.ts
git commit -m "feat(llm): leg Gemini du routeur via le proxy serveur"
```

### Task 6: Vérification complète + déploiement

- [ ] **Step 1: Build + lint + knip**

Run: `npx tsc -b && npm run lint && npm run test:run && npx knip`
Expected: exit 0 partout (knip baseline 0)

- [ ] **Step 2: Build functions**

Run: `cd functions && npm run build && npx vitest run`
Expected: exit 0

- [ ] **Step 3: Déploiement**

Run: `npm run build && firebase deploy --only functions:llmProxy,hosting`
Expected: deploy OK

- [ ] **Step 4: Mémoire + commit final éventuel**

Mettre à jour la mémoire projet (nouvelle entrée `project_llm_server_proxy.md`) : chemin principal proxifié, fallbacks, hors-scope (image gen, Jina, chatRouter).
