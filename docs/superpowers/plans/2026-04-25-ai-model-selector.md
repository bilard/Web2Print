# AI Model Selector + Cost Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'utilisateur de choisir le modèle texte/JSON utilisé pour Claude/Gemini/OpenAI via l'onglet Réglages → IA, afficher les tarifs par 1M tokens à côté de chaque modèle, et tracker automatiquement la consommation cumulée par mois dans Firestore avec affichage dans Statistiques.

**Architecture:** Catalogue statique des modèles (`src/lib/aiModels.ts`) + store Zustand persisté (`src/stores/aiSettings.store.ts`) lu depuis le `llmRouter` via un helper non-React. Tracking via callback ajouté dans les helpers `callClaude/callOpenAI` et exposé sur `geminiClient.generateJson`, agrégé dans Firestore (`aiUsage/{userId}_{YYYY-MM}`). UI dans un nouveau composant `AiProviderCard.tsx` qui remplace les `ApiKeyRow` de l'onglet IA.

**Tech Stack:** React 18, TypeScript strict, Zustand v4 + persist, Vitest, Firebase Firestore (SDK browser), shadcn/ui + Tailwind v3, Sonner pour les toasts.

**Spec source :** `docs/superpowers/specs/2026-04-25-ai-model-selector-design.md`

---

## File Structure

**Nouveaux fichiers :**
- `src/lib/aiModels.ts` — catalogue statique des modèles + types + getters purs
- `src/lib/aiModels.test.ts` — tests unitaires du catalogue
- `src/stores/aiSettings.store.ts` — store Zustand persisté pour la sélection + cache des modèles fetched
- `src/stores/aiSettings.store.test.ts` — tests unitaires du store
- `src/features/stats/aiUsageTracking.ts` — `recordAiUsage()` + helpers de calcul de coût
- `src/features/stats/aiUsageTracking.test.ts` — tests unitaires du calcul de coût
- `src/components/shared/AiProviderCard.tsx` — carte unifiée clé + sélecteur + refresh par provider

**Fichiers modifiés :**
- `src/features/ai/llmRouter.ts` — remplace `DEFAULT_MODEL` par `getSelectedModel`, ajoute appels à `recordAiUsage`
- `src/features/briefs/ai/geminiClient.ts` — expose `usageMetadata` via callback `onUsage`
- `src/features/stats/useUsageStats.ts` — étend `UsageStats` avec `aiCost`, fetch `aiUsage/{userId}_{currentMonth}`
- `src/components/shared/SettingsPanel.tsx` — `AiTab` utilise 3 `AiProviderCard`, `StatsTab` ajoute la carte "Coût IA"

---

## Task 1: Catalogue de modèles `aiModels.ts`

**Files:**
- Create: `src/lib/aiModels.ts`
- Test: `src/lib/aiModels.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/aiModels.test.ts
import { describe, it, expect } from 'vitest'
import { AI_MODELS, getModel, getDefaultModel, type AiProvider } from './aiModels'

describe('aiModels catalog', () => {
  it('exports a default model for each provider', () => {
    const providers: AiProvider[] = ['claude', 'gemini', 'openai']
    for (const p of providers) {
      const list = AI_MODELS[p]
      expect(list.length).toBeGreaterThan(0)
      const defaults = list.filter((m) => m.isDefault)
      expect(defaults.length).toBe(1)
    }
  })

  it('getModel returns the matching entry', () => {
    expect(getModel('claude', 'claude-opus-4-7')?.label).toBe('Claude Opus 4.7')
  })

  it('getModel returns undefined for unknown id', () => {
    expect(getModel('claude', 'nope')).toBeUndefined()
  })

  it('getDefaultModel returns the isDefault entry', () => {
    expect(getDefaultModel('claude').id).toBe('claude-opus-4-7')
    expect(getDefaultModel('gemini').id).toBe('gemini-3.1-pro-preview')
    expect(getDefaultModel('openai').id).toBe('gpt-4o')
  })

  it('all models have a non-negative pricing', () => {
    for (const list of Object.values(AI_MODELS)) {
      for (const m of list) {
        expect(m.pricing.input).toBeGreaterThanOrEqual(0)
        expect(m.pricing.output).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiModels.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the catalog module**

```ts
// src/lib/aiModels.ts
export type AiProvider = 'claude' | 'gemini' | 'openai'

export interface AiModelInfo {
  id: string
  label: string
  pricing: { input: number; output: number }  // USD par 1M tokens
  isDefault?: boolean
}

export const AI_MODELS: Record<AiProvider, AiModelInfo[]> = {
  claude: [
    { id: 'claude-opus-4-7',   label: 'Claude Opus 4.7',   pricing: { input: 15,   output: 75 }, isDefault: true },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', pricing: { input: 3,    output: 15 } },
    { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',  pricing: { input: 0.80, output: 4 } },
  ],
  gemini: [
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', pricing: { input: 1.25,  output: 10 },  isDefault: true },
    { id: 'gemini-3-flash',         label: 'Gemini 3 Flash',         pricing: { input: 0.075, output: 0.30 } },
  ],
  openai: [
    { id: 'gpt-4o',      label: 'GPT-4o',      pricing: { input: 2.50, output: 10 },  isDefault: true },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', pricing: { input: 0.15, output: 0.60 } },
  ],
}

export function getModel(provider: AiProvider, id: string): AiModelInfo | undefined {
  return AI_MODELS[provider].find((m) => m.id === id)
}

export function getDefaultModel(provider: AiProvider): AiModelInfo {
  const found = AI_MODELS[provider].find((m) => m.isDefault)
  if (!found) throw new Error(`AI_MODELS["${provider}"] sans entrée isDefault`)
  return found
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiModels.test.ts`
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiModels.ts src/lib/aiModels.test.ts
git commit -m "feat(ai): add AI models catalog with pricing"
```

---

## Task 2: Store `aiSettings.store.ts`

**Files:**
- Create: `src/stores/aiSettings.store.ts`
- Test: `src/stores/aiSettings.store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/stores/aiSettings.store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  useAiSettingsStore,
  getSelectedModel,
  getEffectiveModelList,
} from './aiSettings.store'

describe('aiSettings.store', () => {
  beforeEach(() => {
    localStorage.clear()
    // Reset to fresh state (the persist middleware hydrates lazily, so we
    // re-initialise selectedModel/fetchedModels manually).
    useAiSettingsStore.setState({
      selectedModel: { claude: 'claude-opus-4-7', gemini: 'gemini-3.1-pro-preview', openai: 'gpt-4o' },
      fetchedModels: { claude: [], gemini: [], openai: [] },
    })
  })

  it('initialises selectedModel with catalog defaults', () => {
    expect(getSelectedModel('claude')).toBe('claude-opus-4-7')
    expect(getSelectedModel('gemini')).toBe('gemini-3.1-pro-preview')
    expect(getSelectedModel('openai')).toBe('gpt-4o')
  })

  it('setSelectedModel updates selection', () => {
    useAiSettingsStore.getState().setSelectedModel('claude', 'claude-sonnet-4-6')
    expect(getSelectedModel('claude')).toBe('claude-sonnet-4-6')
  })

  it('getSelectedModel falls back to default if stored id is unknown', () => {
    useAiSettingsStore.setState({
      selectedModel: { claude: 'ghost-model', gemini: 'gemini-3.1-pro-preview', openai: 'gpt-4o' },
      fetchedModels: { claude: [], gemini: [], openai: [] },
    })
    expect(getSelectedModel('claude')).toBe('claude-opus-4-7')
  })

  it('getEffectiveModelList merges catalog + fetchedModels (catalog wins on dedup)', () => {
    useAiSettingsStore.getState().setFetchedModels('claude', [
      { id: 'claude-opus-4-7', label: 'OVERRIDDEN', pricing: { input: 0, output: 0 } },
      { id: 'claude-future-99', label: 'Claude Future', pricing: { input: 0, output: 0 } },
    ])
    const list = getEffectiveModelList('claude')
    expect(list.find((m) => m.id === 'claude-opus-4-7')?.label).toBe('Claude Opus 4.7')
    expect(list.find((m) => m.id === 'claude-future-99')?.label).toBe('Claude Future')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/aiSettings.store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the store**

```ts
// src/stores/aiSettings.store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AI_MODELS, getModel, getDefaultModel, type AiProvider, type AiModelInfo } from '@/lib/aiModels'

interface AiSettingsState {
  selectedModel: Record<AiProvider, string>
  fetchedModels: Record<AiProvider, AiModelInfo[]>
  setSelectedModel: (provider: AiProvider, id: string) => void
  setFetchedModels: (provider: AiProvider, models: AiModelInfo[]) => void
}

const initialSelected = (): Record<AiProvider, string> => ({
  claude: getDefaultModel('claude').id,
  gemini: getDefaultModel('gemini').id,
  openai: getDefaultModel('openai').id,
})

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      selectedModel: initialSelected(),
      fetchedModels: { claude: [], gemini: [], openai: [] },
      setSelectedModel: (provider, id) =>
        set((s) => ({ selectedModel: { ...s.selectedModel, [provider]: id } })),
      setFetchedModels: (provider, models) =>
        set((s) => ({ fetchedModels: { ...s.fetchedModels, [provider]: models } })),
    }),
    { name: 'designstudio_ai_settings' },
  ),
)

export function getSelectedModel(provider: AiProvider): string {
  const id = useAiSettingsStore.getState().selectedModel[provider]
  const fromCatalog = getModel(provider, id)
  if (fromCatalog) return id
  const fromFetched = useAiSettingsStore.getState().fetchedModels[provider].find((m) => m.id === id)
  if (fromFetched) return id
  return getDefaultModel(provider).id
}

export function getEffectiveModelList(provider: AiProvider): AiModelInfo[] {
  const catalog = AI_MODELS[provider]
  const fetched = useAiSettingsStore.getState().fetchedModels[provider]
  const seen = new Set(catalog.map((m) => m.id))
  const extras = fetched.filter((m) => !seen.has(m.id))
  return [...catalog, ...extras]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/aiSettings.store.test.ts`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/stores/aiSettings.store.ts src/stores/aiSettings.store.test.ts
git commit -m "feat(ai): add AI settings store with selected/fetched models"
```

---

## Task 3: Tracking module `aiUsageTracking.ts`

**Files:**
- Create: `src/features/stats/aiUsageTracking.ts`
- Test: `src/features/stats/aiUsageTracking.test.ts`

Le test couvre uniquement la fonction pure `computeCost`. La partie Firestore est testée manuellement (Task 10) — mocker Firestore + auth ici aurait un coût hors proportion.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/stats/aiUsageTracking.test.ts
import { describe, it, expect } from 'vitest'
import { computeCost } from './aiUsageTracking'

describe('aiUsageTracking.computeCost', () => {
  it('computes USD from token counts and pricing per 1M', () => {
    // Claude Opus 4.7: $15 in / $75 out
    const cost = computeCost(
      { input: 1_000_000, output: 1_000_000 },
      { input: 15, output: 75 },
    )
    expect(cost).toBeCloseTo(90, 5)
  })

  it('handles fractional tokens correctly', () => {
    const cost = computeCost(
      { input: 1234, output: 567 },
      { input: 3, output: 15 },
    )
    // 1234*3/1e6 + 567*15/1e6 = 0.003702 + 0.008505 = 0.012207
    expect(cost).toBeCloseTo(0.012207, 6)
  })

  it('returns 0 for unknown pricing (both 0)', () => {
    expect(computeCost({ input: 1000, output: 1000 }, { input: 0, output: 0 })).toBe(0)
  })

  it('returns 0 for zero tokens', () => {
    expect(computeCost({ input: 0, output: 0 }, { input: 15, output: 75 })).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/stats/aiUsageTracking.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the tracking module**

```ts
// src/features/stats/aiUsageTracking.ts
import { doc, setDoc, increment } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { getModel, type AiProvider } from '@/lib/aiModels'
import { useAuthStore } from '@/stores/auth.store'

export function computeCost(
  tokens: { input: number; output: number },
  pricing: { input: number; output: number },
): number {
  return (tokens.input * pricing.input + tokens.output * pricing.output) / 1_000_000
}

interface RecordParams {
  provider: AiProvider
  model: string
  inputTokens: number
  outputTokens: number
}

export async function recordAiUsage(params: RecordParams): Promise<void> {
  try {
    const userId = useAuthStore.getState().user?.uid
    if (!userId) return

    const info = getModel(params.provider, params.model)
    const pricing = info?.pricing ?? { input: 0, output: 0 }
    const costUsd = computeCost(
      { input: params.inputTokens, output: params.outputTokens },
      pricing,
    )

    const month = new Date().toISOString().slice(0, 7)
    const docId = `${userId}_${month}`

    await setDoc(
      doc(db, 'aiUsage', docId),
      {
        ownerId: userId,
        month,
        [`byProvider.${params.provider}.tokensIn`]: increment(params.inputTokens),
        [`byProvider.${params.provider}.tokensOut`]: increment(params.outputTokens),
        [`byProvider.${params.provider}.costUsd`]: increment(costUsd),
        'total.costUsd': increment(costUsd),
      },
      { merge: true },
    )
  } catch (e) {
    console.warn('[aiUsageTracking] recordAiUsage failed:', e)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/stats/aiUsageTracking.test.ts`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/features/stats/aiUsageTracking.ts src/features/stats/aiUsageTracking.test.ts
git commit -m "feat(stats): add AI usage cost tracking to Firestore"
```

---

## Task 4: Expose `usageMetadata` dans `geminiClient.ts`

**Files:**
- Modify: `src/features/briefs/ai/geminiClient.ts`

- [ ] **Step 1: Add `onUsage` callback to options interface**

Edit `src/features/briefs/ai/geminiClient.ts`:

```ts
// At the top, after imports, modify GenerateJsonOptions:
interface GenerateJsonOptions<T> {
  prompt: string
  schema: z.ZodSchema<T>
  schemaForGemini: Record<string, unknown>
  model?: string
  version: string
  /** Callback invoqué après chaque appel réussi avec les compteurs de tokens. */
  onUsage?: (u: { input: number; output: number }) => void
}
```

- [ ] **Step 2: Extend the GeminiResponse type and capture usage**

Replace the `GeminiResponse` interface and the `callGemini` function in `src/features/briefs/ai/geminiClient.ts`:

```ts
interface GeminiResponse {
  candidates?: GeminiCandidate[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
  }
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  schemaForGemini: Record<string, unknown>,
): Promise<{ text: string; usage: { input: number; output: number } }> {
  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), 180_000)
  const sanitized = sanitizeSchemaForGemini(schemaForGemini) as Record<string, unknown>
  const res = await fetch(`${ENDPOINT(model)}?key=${apiKey}`, {
    method: 'POST',
    signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: sanitized,
        temperature: 0.4,
      },
    }),
  })

  clearTimeout(timeoutId)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini API ${res.status} : ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as GeminiResponse
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini : réponse vide')
  return {
    text,
    usage: {
      input: data.usageMetadata?.promptTokenCount ?? 0,
      output: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  }
}
```

- [ ] **Step 3: Wire `onUsage` callback into both attempts of `generateJson`**

Replace the `generateJson` function body in `src/features/briefs/ai/geminiClient.ts`:

```ts
export async function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<T> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) throw new Error('Clé Gemini absente. Configurez-la dans Réglages.')

  const model = opts.model ?? DEFAULT_MODEL

  // 1er essai
  const first = await callGemini(apiKey, model, opts.prompt, opts.schemaForGemini)
  opts.onUsage?.(first.usage)
  const firstParsed = safeJsonParse(first.text)
  const firstValidation = opts.schema.safeParse(firstParsed)
  if (firstValidation.success) return firstValidation.data

  // 2e essai avec injection d'erreur
  const errorMessage = firstValidation.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join(' ; ')
  const retryPrompt =
    opts.prompt +
    `\n\nErreur précédente : ${errorMessage}. Renvoie un JSON strictement conforme au schéma demandé.`
  const second = await callGemini(apiKey, model, retryPrompt, opts.schemaForGemini)
  opts.onUsage?.(second.usage)
  const secondParsed = safeJsonParse(second.text)
  const secondValidation = opts.schema.safeParse(secondParsed)
  if (secondValidation.success) return secondValidation.data

  throw new Error(
    `Réponse Gemini non conforme au schéma après retry : ${secondValidation.error.issues
      .map((i) => i.message)
      .join(' ; ')}`,
  )
}
```

- [ ] **Step 4: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: succès (aucune nouvelle erreur introduite).

- [ ] **Step 5: Commit**

```bash
git add src/features/briefs/ai/geminiClient.ts
git commit -m "feat(ai): expose usageMetadata via onUsage callback in geminiClient"
```

---

## Task 5: Wire model selection + tracking dans `llmRouter.ts`

**Files:**
- Modify: `src/features/ai/llmRouter.ts`

- [ ] **Step 1: Add imports and replace `DEFAULT_MODEL` lookup**

Edit `src/features/ai/llmRouter.ts`. Add these imports at the top with the existing imports:

```ts
import { getSelectedModel } from '@/stores/aiSettings.store'
import { recordAiUsage } from '@/features/stats/aiUsageTracking'
import type { AiProvider } from '@/lib/aiModels'
```

- [ ] **Step 2: Replace `DEFAULT_MODEL` constant with helper**

In `src/features/ai/llmRouter.ts`, find this block:

```ts
const DEFAULT_MODEL: Record<LLMProviderId, string> = {
  claude: 'claude-opus-4-7',
  gemini: 'gemini-3.1-pro-preview',
  openai: 'gpt-4o',
}
```

Replace with:

```ts
function defaultModelFor(provider: LLMProviderId): string {
  // LLMProviderId values are also valid AiProvider values.
  return getSelectedModel(provider as AiProvider)
}
```

Then update both `onProviderUsed` callsites in `generateJson` to use the helper:

```ts
export async function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<T> {
  const route = TASK_ROUTING[opts.task]
  const primary = opts.forceProvider ?? route.primary
  const fallback = opts.forceProvider ? undefined : route.fallback

  try {
    const result = await callProvider(primary, opts, route.model)
    opts.onProviderUsed?.({ provider: primary, model: route.model ?? defaultModelFor(primary) })
    return result
  } catch (err) {
    if (!fallback) throw err
    console.warn(
      `[llmRouter] ${opts.task}: provider primaire "${primary}" a échoué, fallback sur "${fallback}". Cause:`,
      err,
    )
    const result = await callProvider(fallback, opts)
    opts.onProviderUsed?.({ provider: fallback, model: defaultModelFor(fallback) })
    return result
  }
}
```

- [ ] **Step 3: Update `callProvider` to use `defaultModelFor`**

In `src/features/ai/llmRouter.ts`, replace `callProvider` with:

```ts
async function callProvider<T>(
  provider: LLMProviderId,
  opts: GenerateJsonOptions<T>,
  modelOverride?: string,
): Promise<T> {
  const model = modelOverride ?? defaultModelFor(provider)
  if (provider === 'claude') {
    return await callClaude(opts, model)
  }
  if (provider === 'gemini') {
    return await geminiGenerateJson({
      prompt: opts.prompt,
      schema: opts.schema,
      schemaForGemini: opts.schemaForLLM,
      version: opts.version,
      model,
      onUsage: (u) => recordAiUsage({ provider: 'gemini', model, inputTokens: u.input, outputTokens: u.output }),
    })
  }
  if (provider === 'openai') {
    return await callOpenAI(opts, model)
  }
  throw new Error(`Provider inconnu : ${provider}`)
}
```

- [ ] **Step 4: Capture Anthropic `usage` and call `recordAiUsage` in `callClaude`**

In `src/features/ai/llmRouter.ts`, find the `AnthropicResponse` interface and extend it:

```ts
interface AnthropicResponse {
  content?: AnthropicContentBlock[]
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
}
```

Then in `callClaude`, after `const data = (await res.json()) as AnthropicResponse`, add:

```ts
  // After the first successful API call:
  if (data.usage) {
    recordAiUsage({
      provider: 'claude',
      model,
      inputTokens: data.usage.input_tokens ?? 0,
      outputTokens: data.usage.output_tokens ?? 0,
    })
  }
```

And in the retry block, after `const retryData = (await retryRes.json()) as AnthropicResponse`, add the symmetric call:

```ts
  if (retryData.usage) {
    recordAiUsage({
      provider: 'claude',
      model,
      inputTokens: retryData.usage.input_tokens ?? 0,
      outputTokens: retryData.usage.output_tokens ?? 0,
    })
  }
```

- [ ] **Step 5: Capture OpenAI `usage` in `callOpenAI`**

In `src/features/ai/llmRouter.ts`, replace `callOpenAI` body so it parses usage. Find:

```ts
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = data.choices?.[0]?.message?.content
```

Replace with:

```ts
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  if (data.usage) {
    recordAiUsage({
      provider: 'openai',
      model,
      inputTokens: data.usage.prompt_tokens ?? 0,
      outputTokens: data.usage.completion_tokens ?? 0,
    })
  }
  const text = data.choices?.[0]?.message?.content
```

- [ ] **Step 6: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: succès (aucune nouvelle erreur introduite).

- [ ] **Step 7: Commit**

```bash
git add src/features/ai/llmRouter.ts
git commit -m "feat(ai): wire model selection store + token tracking into llmRouter"
```

---

## Task 6: Étendre `useUsageStats.ts` avec `aiCost`

**Files:**
- Modify: `src/features/stats/useUsageStats.ts`

- [ ] **Step 1: Replace the file content**

Replace the entire content of `src/features/stats/useUsageStats.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { AiProvider } from '@/lib/aiModels'

interface AiProviderUsage {
  tokensIn: number
  tokensOut: number
  costUsd: number
}

interface UsageStats {
  projectCount: number
  exportCount: number
  storageUsedMb: number
  storageQuotaMb: number
  aiCost: {
    total: number
    byProvider: Record<AiProvider, AiProviderUsage>
  }
}

const EMPTY_PROVIDER: AiProviderUsage = { tokensIn: 0, tokensOut: 0, costUsd: 0 }

async function fetchAiCost(userId: string): Promise<UsageStats['aiCost']> {
  const month = new Date().toISOString().slice(0, 7)
  const snap = await getDoc(doc(db, 'aiUsage', `${userId}_${month}`))
  if (!snap.exists()) {
    return {
      total: 0,
      byProvider: { claude: EMPTY_PROVIDER, gemini: EMPTY_PROVIDER, openai: EMPTY_PROVIDER },
    }
  }
  const data = snap.data() as {
    total?: { costUsd?: number }
    byProvider?: Partial<Record<AiProvider, Partial<AiProviderUsage>>>
  }
  const merge = (p: AiProvider): AiProviderUsage => ({
    tokensIn:  data.byProvider?.[p]?.tokensIn  ?? 0,
    tokensOut: data.byProvider?.[p]?.tokensOut ?? 0,
    costUsd:   data.byProvider?.[p]?.costUsd   ?? 0,
  })
  return {
    total: data.total?.costUsd ?? 0,
    byProvider: { claude: merge('claude'), gemini: merge('gemini'), openai: merge('openai') },
  }
}

async function fetchStats(userId: string): Promise<UsageStats> {
  const q = query(collection(db, 'projects'), where('ownerId', '==', userId))
  const [snap, aiCost] = await Promise.all([getDocs(q), fetchAiCost(userId)])

  let totalBytes = 0
  snap.docs.forEach((d) => {
    const data = d.data()
    if (data.canvasData) totalBytes += (data.canvasData as string).length * 2
    if (data.thumbnail) totalBytes += (data.thumbnail as string).length * 0.75
  })

  return {
    projectCount: snap.size,
    exportCount: 0,
    storageUsedMb: Math.round(totalBytes / (1024 * 1024) * 100) / 100,
    storageQuotaMb: 500,
    aiCost,
  }
}

export function useUsageStats() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['stats', user?.uid],
    queryFn: () => fetchStats(user!.uid),
    enabled: !!user,
    staleTime: 60_000,
  })
}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: succès. (Le `StatsTab` n'utilise pas encore `aiCost` — il sera mis à jour Task 9. TS reste vert car le champ est ajouté, pas requis ailleurs.)

- [ ] **Step 3: Commit**

```bash
git add src/features/stats/useUsageStats.ts
git commit -m "feat(stats): fetch AI cost aggregate from Firestore for current month"
```

---

## Task 7: Composant `AiProviderCard.tsx`

**Files:**
- Create: `src/components/shared/AiProviderCard.tsx`

- [ ] **Step 1: Créer le composant**

Create `src/components/shared/AiProviderCard.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import {
  Eye, EyeOff, RotateCcw, CheckCircle2, XCircle, Loader2, Wifi,
  ChevronDown, RefreshCw, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getApiKey, setApiKey, isApiKeyOverridden, resetApiKey, getEnvDefault, testApiKey,
  type ApiTestResult,
} from '@/lib/apiKeys'
import { type AiProvider, type AiModelInfo } from '@/lib/aiModels'
import { useAiSettingsStore, getEffectiveModelList } from '@/stores/aiSettings.store'

interface AiProviderCardProps {
  provider: AiProvider
  apiKeyId: 'gemini' | 'anthropic' | 'openai'
  label: string
  description: string
  logo?: React.ReactNode
  /** Si true, affiche la note "image gen utilise toujours Nano Banana" (carte Gemini uniquement). */
  noteForGemini?: boolean
}

function formatPricing(pricing: { input: number; output: number }): string {
  if (pricing.input === 0 && pricing.output === 0) return '— · 1M tok'
  const fmt = (n: number) => (n < 1 ? n.toFixed(2) : n.toString())
  return `$${fmt(pricing.input)} in / $${fmt(pricing.output)} out · 1M tok`
}

async function fetchModelsFromProvider(
  provider: AiProvider,
  apiKey: string,
): Promise<AiModelInfo[]> {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}`)
    const data = await res.json() as { data?: Array<{ id: string; display_name?: string }> }
    return (data.data ?? [])
      .filter((m) => m.id.startsWith('claude-'))
      .map((m) => ({ id: m.id, label: m.display_name ?? m.id, pricing: { input: 0, output: 0 } }))
  }
  if (provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    if (!res.ok) throw new Error(`Gemini ${res.status}`)
    const data = await res.json() as { models?: Array<{ name: string; displayName?: string }> }
    return (data.models ?? [])
      .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName ?? m.name }))
      .filter((m) => m.id.startsWith('gemini-') && !/(image|tts|embedding|aqa)/i.test(m.id))
      .map((m) => ({ id: m.id, label: m.label, pricing: { input: 0, output: 0 } }))
  }
  // openai
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}`)
  const data = await res.json() as { data?: Array<{ id: string }> }
  return (data.data ?? [])
    .filter((m) => m.id.startsWith('gpt-') && !/(audio|realtime|search|tts|whisper|image)/i.test(m.id))
    .map((m) => ({ id: m.id, label: m.id, pricing: { input: 0, output: 0 } }))
}

export function AiProviderCard({ provider, apiKeyId, label, description, logo, noteForGemini }: AiProviderCardProps) {
  // ── API key state (mirrors ApiKeyRow)
  const [editing, setEditing] = useState(false)
  const [visible, setVisible] = useState(false)
  const [keyValue, setKeyValue] = useState(() => getApiKey(apiKeyId))
  const [testStatus, setTestStatus] = useState<ApiTestResult | 'testing' | null>(null)
  const [testMessage, setTestMessage] = useState('')
  const overridden = isApiKeyOverridden(apiKeyId)

  // ── Model selection state
  // Subscribe to both selectedModel[provider] and fetchedModels[provider] so the
  // component re-renders after `Rafraîchir` populates new entries. We don't use
  // the subscribed `fetched` directly — `getEffectiveModelList` re-reads it at
  // render time — but the selector is what triggers the re-render.
  const selectedId = useAiSettingsStore((s) => s.selectedModel[provider])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fetchedSubscribe = useAiSettingsStore((s) => s.fetchedModels[provider])
  const setSelectedModel = useAiSettingsStore((s) => s.setSelectedModel)
  const setFetchedModels = useAiSettingsStore((s) => s.setFetchedModels)
  const models = getEffectiveModelList(provider)
  const selected = models.find((m) => m.id === selectedId) ?? models[0]
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const k = getApiKey(apiKeyId)
    if (k) {
      setTestStatus('testing')
      testApiKey(apiKeyId).then((r) => { setTestStatus(r.status); setTestMessage(r.message) })
    }
  }, [apiKeyId])

  useEffect(() => {
    if (!popoverOpen) return
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopoverOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [popoverOpen])

  const handleSaveKey = () => {
    setApiKey(apiKeyId, keyValue)
    setEditing(false)
    setTestStatus('testing')
    testApiKey(apiKeyId).then((r) => { setTestStatus(r.status); setTestMessage(r.message) })
  }
  const handleResetKey = () => {
    resetApiKey(apiKeyId)
    setKeyValue(getApiKey(apiKeyId))
    setTestStatus('testing')
    testApiKey(apiKeyId).then((r) => { setTestStatus(r.status); setTestMessage(r.message) })
  }
  const handleTestKey = () => {
    setTestStatus('testing')
    setTestMessage('')
    testApiKey(apiKeyId).then((r) => { setTestStatus(r.status); setTestMessage(r.message) })
  }

  const handleRefreshModels = async () => {
    const key = getApiKey(apiKeyId)
    if (!key) return
    setRefreshing(true)
    try {
      const fetched = await fetchModelsFromProvider(provider, key)
      setFetchedModels(provider, fetched)
      const known = new Set(models.map((m) => m.id))
      const newCount = fetched.filter((m) => !known.has(m.id)).length
      toast.success(newCount > 0 ? `${newCount} nouveau(x) modèle(s) trouvé(s)` : 'Aucun nouveau modèle')
    } catch (e) {
      toast.error(`Erreur de récupération : ${e instanceof Error ? e.message : 'inconnue'}`)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="bg-white/[0.03] rounded-xl p-3 flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {logo}
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-white/70">{label}</p>
              {testStatus === 'testing' && <Loader2 className="w-3 h-3 text-white/30 animate-spin" />}
              {testStatus === 'ok' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
              {testStatus === 'error' && <XCircle className="w-3 h-3 text-red-400" />}
              {testStatus === 'empty' && <XCircle className="w-3 h-3 text-white/20" />}
            </div>
            <p className="text-[10px] text-white/30">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={handleTestKey} title="Tester la connexion" className="text-white/20 hover:text-indigo-400 transition-colors p-1 rounded hover:bg-white/5">
            <Wifi className="w-3 h-3" />
          </button>
          {overridden && (
            <button onClick={handleResetKey} title="Réinitialiser (utiliser .env)" className="text-white/20 hover:text-amber-400 transition-colors p-1 rounded hover:bg-white/5">
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {testStatus && testStatus !== 'testing' && testMessage && (
        <p className={`text-[10px] ${testStatus === 'ok' ? 'text-green-400/70' : testStatus === 'error' ? 'text-red-400/70' : 'text-white/20'}`}>
          {testMessage}
        </p>
      )}

      {/* API key */}
      {editing ? (
        <div className="flex gap-1.5">
          <input
            type={visible ? 'text' : 'password'}
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500/50"
            placeholder="Entrer la clé API..."
            autoFocus
          />
          <button onClick={() => setVisible(!visible)} className="text-white/30 hover:text-white/60 px-1">
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleSaveKey} className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors">
            OK
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-left text-xs font-mono text-white/30 bg-white/5 rounded-lg px-2.5 py-1.5 hover:bg-white/10 transition-colors truncate"
        >
          {overridden ? '••••••••' + keyValue.slice(-4) : getEnvDefault(apiKeyId)}
          {overridden && <span className="ml-2 text-[9px] text-indigo-400">(personnalisée)</span>}
        </button>
      )}

      {/* Model selector */}
      <div className="flex flex-col gap-1.5 mt-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Modèle texte/JSON</p>
          <button
            onClick={handleRefreshModels}
            disabled={!keyValue || refreshing}
            title="Récupérer les modèles disponibles"
            className="flex items-center gap-1 text-[10px] text-white/40 hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Rafraîchir
          </button>
        </div>

        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setPopoverOpen((v) => !v)}
            className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <div className="flex flex-col items-start min-w-0">
              <span className="text-xs text-white/80 truncate">{selected.label}</span>
              <span className="text-[10px] font-mono text-white/30">{formatPricing(selected.pricing)}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0 ml-2" />
          </button>

          {popoverOpen && (
            <div className="absolute z-10 mt-1 w-full bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl py-1 max-h-72 overflow-y-auto">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedModel(provider, m.id); setPopoverOpen(false) }}
                  className={`w-full flex flex-col items-start px-2.5 py-1.5 hover:bg-white/5 transition-colors ${m.id === selected.id ? 'bg-white/[0.04]' : ''}`}
                >
                  <span className="text-xs text-white/80">{m.label}</span>
                  <span className="text-[10px] font-mono text-white/30">{formatPricing(m.pricing)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {noteForGemini && (
        <div className="flex items-start gap-1.5 mt-1 text-[10px] text-white/30">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          <span>La génération d'image utilise toujours Nano Banana (<code className="font-mono">gemini-3.1-flash-image-preview</code>).</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: succès.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/AiProviderCard.tsx
git commit -m "feat(settings): add AiProviderCard with model picker and refresh"
```

---

## Task 8: Refactorer `AiTab` dans `SettingsPanel.tsx`

**Files:**
- Modify: `src/components/shared/SettingsPanel.tsx`

- [ ] **Step 1: Importer le nouveau composant**

In `src/components/shared/SettingsPanel.tsx`, add to the existing imports near the top:

```ts
import { AiProviderCard } from './AiProviderCard'
```

- [ ] **Step 2: Remplacer la fonction `AiTab`**

In `src/components/shared/SettingsPanel.tsx`, find:

```tsx
function AiTab() {
  return (
    <div className="flex flex-col gap-2">
      <ApiKeyRow id="gemini" label="Nano Banana (Gemini)" description="Génération d'images IA via Google Gemini" logo={<GeminiLogo />} />
      <ApiKeyRow id="anthropic" label="Claude (Anthropic)" description="Claude Opus 4.7 — raisonnement briefs, panier, deck" placeholder="sk-ant-..." />
      <ApiKeyRow id="openai" label="OpenAI" description="GPT — fallback ou tâches spécifiques (optionnel)" placeholder="sk-..." />
    </div>
  )
}
```

Replace with:

```tsx
function AiTab() {
  return (
    <div className="flex flex-col gap-2">
      <AiProviderCard
        provider="gemini"
        apiKeyId="gemini"
        label="Nano Banana (Gemini)"
        description="Génération d'images IA et raisonnement via Google Gemini"
        logo={<GeminiLogo />}
        noteForGemini
      />
      <AiProviderCard
        provider="claude"
        apiKeyId="anthropic"
        label="Claude (Anthropic)"
        description="Raisonnement briefs, panier, deck, design"
      />
      <AiProviderCard
        provider="openai"
        apiKeyId="openai"
        label="OpenAI"
        description="GPT — fallback ou tâches spécifiques (optionnel)"
      />
    </div>
  )
}
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: succès.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/SettingsPanel.tsx
git commit -m "feat(settings): use AiProviderCard for the AI tab"
```

---

## Task 9: Carte "Coût IA" dans `StatsTab`

**Files:**
- Modify: `src/components/shared/SettingsPanel.tsx`

- [ ] **Step 1: Import des labels providers**

In `src/components/shared/SettingsPanel.tsx`, just below `import { AiProviderCard } from './AiProviderCard'`, add:

```ts
import type { AiProvider } from '@/lib/aiModels'

const PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  openai: 'OpenAI',
}

function formatUsd(n: number): string {
  if (n === 0) return '$0.00'
  if (n < 0.01) return '< $0.01'
  return `$${n.toFixed(2)}`
}
```

- [ ] **Step 2: Étendre `StatsTab` avec la carte coûts IA**

In `src/components/shared/SettingsPanel.tsx`, replace the `StatsTab` function:

```tsx
function StatsTab() {
  const { data: stats, isLoading } = useUsageStats()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }
  if (!stats) {
    return <p className="text-xs text-white/30">Impossible de charger les statistiques</p>
  }

  const providers: AiProvider[] = ['claude', 'gemini', 'openai']

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-white/[0.03] rounded-xl p-4">
        <StatRow label="Projets" value={String(stats.projectCount)} />
        <StatRow label="Exports ce mois" value={stats.exportCount === 0 ? '—' : String(stats.exportCount)} />
      </div>

      <div className="bg-white/[0.03] rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">
          <HardDrive className="w-3 h-3" /> Stockage Firestore
        </div>
        <StorageBar used={stats.storageUsedMb} quota={stats.storageQuotaMb} />
      </div>

      <div className="bg-white/[0.03] rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
            <Sparkles className="w-3 h-3" /> Coût IA estimé ce mois
          </div>
          <span className="text-[9px] text-white/20 uppercase">estimation</span>
        </div>
        <p className="text-2xl font-mono text-white/90">{formatUsd(stats.aiCost.total)}</p>
        <div className="flex flex-col gap-1 mt-2">
          {providers.map((p) => {
            const u = stats.aiCost.byProvider[p]
            return (
              <div key={p} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                <span className="text-xs text-white/50">{PROVIDER_LABELS[p]}</span>
                <span className="text-[10px] font-mono text-white/40">
                  {u.tokensIn.toLocaleString()} in · {u.tokensOut.toLocaleString()} out · {formatUsd(u.costUsd)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: succès.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/SettingsPanel.tsx
git commit -m "feat(stats): add AI cost card to Stats tab"
```

---

## Task 10: Validation manuelle + build

**Files:** aucun changement de code attendu — diagnostic uniquement.

- [ ] **Step 1: Vérifier le build complet**

Run: `npm run build`
Expected: build TypeScript + Vite réussi, aucune nouvelle erreur.

- [ ] **Step 2: Lancer le serveur dev**

Run: `npm run dev`
Expected: serveur lance sur le port habituel (vite affiche l'URL — typiquement `http://localhost:5173`).

- [ ] **Step 3: Test manuel — sélection de modèle**

Dans le navigateur :
1. Ouvrir Réglages → IA
2. Vérifier que les 3 cartes (Nano Banana, Claude, OpenAI) affichent : clé masquée + sélecteur avec modèle par défaut + tarif
3. Cliquer sur le sélecteur Claude, choisir "Claude Sonnet 4.6"
4. Recharger la page (F5) → le sélecteur Claude doit toujours afficher Sonnet 4.6 (persistance localStorage OK)
5. Console DevTools : `localStorage.getItem('designstudio_ai_settings')` doit contenir `"claude":"claude-sonnet-4-6"`

- [ ] **Step 4: Test manuel — bouton Rafraîchir**

1. Avec une clé Anthropic valide configurée, cliquer "Rafraîchir" sur la carte Claude
2. Toast Sonner doit s'afficher (succès "X nouveaux modèles" ou "aucun nouveau modèle")
3. Le sélecteur Claude doit lister les nouveaux modèles avec pricing "—"
4. Sans clé : bouton désactivé (opacity réduite, cursor not-allowed)
5. Avec clé invalide : toast d'erreur

- [ ] **Step 5: Test manuel — tracking de coûts**

1. Dans le navigateur, lancer une action qui appelle Claude (ex : générer un brief, ou tout autre appel `generateJson`)
2. Console DevTools : aucun warning `[aiUsageTracking]`
3. Firestore Console (web2print-6fe5a) → collection `aiUsage` → document `{userId}_2026-04` doit exister avec `byProvider.claude.tokensIn`, `tokensOut`, `costUsd` non nuls
4. Réglages → Statistiques : la carte "Coût IA estimé ce mois" doit afficher le total + ligne Claude avec tokens et coût

- [ ] **Step 6: Test manuel — Gemini note**

Vérifier que la note "La génération d'image utilise toujours Nano Banana..." n'apparaît QUE sur la carte Gemini, pas sur Claude/OpenAI.

- [ ] **Step 7: Si tous les tests manuels passent, commit final (rien à commit normalement)**

```bash
git status
# Doit être clean. Sinon, déterminer la cause avant de fermer la tâche.
```

---

## Notes d'implémentation

- **Modèle hors catalogue + persisté** : si l'utilisateur sélectionne un modèle "fetched" non catalogué et recharge la page, le `fetchedModels` n'est pas persisté (par design — éviter de garder un état qui ne reflète plus l'API). `getSelectedModel` détectera l'id manquant et fallback sur le défaut catalogue. Acceptable : l'utilisateur clique "Rafraîchir" à nouveau s'il veut retrouver son modèle exotique.
- **Image gen non trackée** : `geminiImageClient.ts` reste inchangé. Tarification image gen ≠ tarification token, hors périmètre.
- **Erreurs Firestore** : `recordAiUsage` catch tout. Un échec d'écriture stats ne casse jamais un appel LLM.
- **Race conditions Firestore** : utilisation systématique d'`increment()` côté serveur — concurrent-safe.
