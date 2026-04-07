# Briefs IA — Lot 3 : Étapes 1-2-3 (formulaire, questions IA, panier IA) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le cœur fonctionnel du module Briefs IA : création/édition d'un brief avec un éditeur en 5 étapes (seules les étapes 1, 2, 3 sont implémentées dans ce lot), génération IA des questions dynamiques et du panier produits via Google Gemini appelé directement depuis le navigateur, liste réelle des briefs dans `BriefsPanel`.

**Architecture:**
- **Pas de Cloud Function.** La clé `VITE_GEMINI_API_KEY` est lue via `@/lib/apiKeys::getApiKey('gemini')` (existant) et utilisée pour appeler `generativelanguage.googleapis.com` depuis le navigateur.
- Wrapper `geminiClient.ts` typé qui contraint la réponse à du JSON (`responseMimeType: 'application/json'` + `responseSchema`), valide via Zod, et fait 1 retry avec injection d'erreur si la validation échoue.
- Prompts versionnés dans `features/briefs/ai/prompts/*.prompt.ts` (chaque fichier exporte `VERSION` + `buildPrompt()` + `RESPONSE_SCHEMA` Zod). La version est stockée sur `brief.aiVersions` à chaque génération pour la reproductibilité.
- Logique pure (parsing JSON, guard-rail SKU, math panier, builder CSV) testée en TDD ; UI non testée.
- L'éditeur de brief est une grosse modale `fixed inset-0` (cohérent avec `FormBuilderModal`). Stepper horizontal en haut, contenu de l'étape courante en dessous. Linéaire avec validation : on ne passe à l'étape N+1 que si l'étape N est complète.

**Tech Stack:** React 18, Zustand, React Query (existant), Zod 4 (existant), sonner toasts, Gemini API REST direct (model `gemini-2.5-flash` pour le texte JSON).

**Spec de référence :** `docs/superpowers/specs/2026-04-07-taxonomy-briefs-design.md` sections 4 (flow), 5 (data), 6.2/6.3/6.4 (UI étapes 1-2-3), 7 (contrats IA)
**Dépend de :** Lots 1 & 2 terminés (types `Brief`, hooks `useBriefs`/`useBrief`/`useBriefMutations`, `DynamicFormRenderer`, `BriefsPanel`, `useBriefUIStore`, mock catalog).

---

## File Structure

**Création (logique IA pure) :**
- `src/features/briefs/ai/geminiClient.ts` — wrapper typé `generateJson<T>(opts)` (model, prompt, schema, version) avec retry-on-validation-fail
- `src/features/briefs/ai/geminiClient.test.ts` — tests parser/retry (mock fetch)
- `src/features/briefs/ai/prompts/dynamicQuestions.prompt.ts` — `VERSION`, `buildPrompt()`, `RESPONSE_SCHEMA` Zod
- `src/features/briefs/ai/prompts/cartGeneration.prompt.ts` — idem
- `src/features/briefs/ai/skuGuardRail.ts` — fonction pure qui filtre les SKUs hallucinés et indique s'il faut retry
- `src/features/briefs/ai/skuGuardRail.test.ts`
- `src/features/briefs/cart/cartMath.ts` — `computeSubtotal`, `applyDiscount`, `computeTotal`
- `src/features/briefs/cart/cartMath.test.ts`
- `src/features/briefs/cart/cartCsv.ts` — `cartItemsToCsv(items, discount?)`
- `src/features/briefs/cart/cartCsv.test.ts`

**Création (hooks React Query) :**
- `src/features/briefs/ai/useGenerateDynamicQuestions.ts`
- `src/features/briefs/ai/useGenerateCart.ts`

**Création (composants UI) :**
- `src/components/briefs/editor/BriefStepper.tsx` — indicateur horizontal 1→5
- `src/components/briefs/editor/Step1Form.tsx` — formulaire client (consomme `DynamicFormRenderer`)
- `src/components/briefs/editor/Step2Questions.tsx` — empty state → bouton générer → renderer questions → suivant
- `src/components/briefs/editor/QuestionRenderer.tsx` — rend une `DynamicQuestion[]` (5 types)
- `src/components/briefs/editor/Step3Cart.tsx` — bouton générer panier → CartTable → totaux/discount/CSV
- `src/components/briefs/editor/CartTable.tsx` — tableau éditable (qty, prix override, suppression, ajout manuel)
- `src/components/briefs/editor/CartSummary.tsx` — sous-total, remise globale, total
- `src/components/briefs/editor/BriefEditorModal.tsx` — modale fixed inset-0, stepper + switch d'étape
- `src/components/briefs/BriefsList.tsx` — liste des briefs (cartes) + bouton "Nouveau brief"

**Modification :**
- `src/components/briefs/BriefsPanel.tsx` — remplace l'empty state par `BriefsList`, ouvre `BriefEditorModal`
- `src/stores/brief.store.ts` — ajoute `briefEditorOpen` + `openBriefEditor(id)` + `closeBriefEditor()`

**Aucune modification des types Lot 1 ni des hooks Firestore Lot 1.**

---

## Conventions pour ce lot

- **Pas de tests UI** (faible ROI, RTL non installé). TDD strict sur : `geminiClient` (parser/retry mocké), `skuGuardRail`, `cartMath`, `cartCsv`. **Cible : 50 tests passants à l'issue du lot** (27 hérités + ~23 ajoutés).
- **Composants ≤ 150 lignes**. `BriefEditorModal`, `Step3Cart`, `CartTable` sont les plus gros — extraire si nécessaire.
- **Dark mode obligatoire** (mêmes tokens que Lot 2 : `#0f0f0f` / `#1a1a1a` / `#6366f1`, bordures `white/[0.06]`).
- **Pas de `any`** sur les API publiques. Importer types depuis `@/features/briefs/types` et `@/features/taxonomy/types`.
- **Modèle Gemini :** `gemini-2.5-flash` pour le texte JSON (rapide, bon marché, supporte `responseSchema`). Endpoint : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=KEY`.
- **git hygiene** : stager uniquement les fichiers explicites de chaque task, jamais `git add -A` (working tree dirty).
- **Snapshotting :** quand on crée un brief, copier `taxonomy.formTemplate` (ou `createDefaultFormTemplate()` en fallback) dans `brief.client.formTemplateSnapshot`. Quand on génère les questions IA, persister `dynamicForm.questions` + `selectedNodeIds` + `aiVersions.questions` sur le brief.

---

## Task 1 : Wrapper `geminiClient.ts` (TDD parser + retry)

**Files:**
- Create: `src/features/briefs/ai/geminiClient.ts`
- Create: `src/features/briefs/ai/geminiClient.test.ts`

But : `generateJson<T>({ prompt, schema, schemaForGemini, model?, version })` qui :
1. Lit la clé via `getApiKey('gemini')`. Throw `Error('Clé Gemini absente')` si vide.
2. POST à l'endpoint `generateContent` avec `responseMimeType: 'application/json'` + `responseSchema: schemaForGemini`.
3. Parse le `candidates[0].content.parts[0].text` en JSON.
4. Valide avec `schema.safeParse(parsed)`. Si KO → re-tente UNE fois en injectant le message d'erreur Zod dans le prompt (`\n\nErreur précédente : ${error}. Renvoie un JSON strictement conforme au schéma.`).
5. Si le second essai échoue aussi → throw avec le message Zod.

- [ ] **Step 1: Écrire les tests d'abord**

Create `src/features/briefs/ai/geminiClient.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { generateJson } from './geminiClient'

const ResponseSchema = z.object({ items: z.array(z.string()) })

function mockGeminiResponse(text: string, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
    text: async () => text,
  } as Response
}

describe('generateJson', () => {
  beforeEach(() => {
    localStorage.setItem('designstudio_apikey_gemini', 'fake-key')
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('returns the parsed JSON when the response is valid', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockGeminiResponse('{"items":["a","b"]}'),
    )
    const result = await generateJson({
      prompt: 'list two letters',
      schema: ResponseSchema,
      schemaForGemini: { type: 'object' },
      version: 'test-1',
    })
    expect(result).toEqual({ items: ['a', 'b'] })
  })

  it('retries once with error injection when validation fails', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(mockGeminiResponse('{"items":[1,2]}')) // wrong types
      .mockResolvedValueOnce(mockGeminiResponse('{"items":["a","b"]}'))
    const result = await generateJson({
      prompt: 'list two letters',
      schema: ResponseSchema,
      schemaForGemini: { type: 'object' },
      version: 'test-1',
    })
    expect(result).toEqual({ items: ['a', 'b'] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    const secondPrompt = secondCallBody.contents[0].parts[0].text as string
    expect(secondPrompt).toContain('Erreur précédente')
  })

  it('throws after a second validation failure', async () => {
    ;(fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockGeminiResponse('{"items":[1]}'))
      .mockResolvedValueOnce(mockGeminiResponse('{"items":[2]}'))
    await expect(
      generateJson({
        prompt: 'list',
        schema: ResponseSchema,
        schemaForGemini: { type: 'object' },
        version: 'test-1',
      }),
    ).rejects.toThrow(/conforme/i)
  })

  it('throws when the API key is missing', async () => {
    localStorage.removeItem('designstudio_apikey_gemini')
    // Also unstub env in case .env.local has one — override with empty
    vi.stubEnv('VITE_GEMINI_API_KEY', '')
    await expect(
      generateJson({
        prompt: 'x',
        schema: ResponseSchema,
        schemaForGemini: { type: 'object' },
        version: 'test-1',
      }),
    ).rejects.toThrow(/Clé Gemini/)
    vi.unstubAllEnvs()
  })

  it('throws on a non-2xx response', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockGeminiResponse('quota exceeded', false, 429),
    )
    await expect(
      generateJson({
        prompt: 'x',
        schema: ResponseSchema,
        schemaForGemini: { type: 'object' },
        version: 'test-1',
      }),
    ).rejects.toThrow(/429/)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npm run test:run -- geminiClient`
Expected: tests échouent (module introuvable).

- [ ] **Step 3: Implémenter le wrapper**

Create `src/features/briefs/ai/geminiClient.ts`:
```ts
import { z } from 'zod'
import { getApiKey } from '@/lib/apiKeys'

const DEFAULT_MODEL = 'gemini-2.5-flash'
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

interface GenerateJsonOptions<T> {
  prompt: string
  schema: z.ZodSchema<T>
  /** JSON Schema-like object passé à Gemini comme `responseSchema`. */
  schemaForGemini: Record<string, unknown>
  model?: string
  /** Identifiant du prompt pour traçabilité (stocké dans brief.aiVersions). */
  version: string
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> }
}
interface GeminiResponse {
  candidates?: GeminiCandidate[]
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  schemaForGemini: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${ENDPOINT(model)}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schemaForGemini,
        temperature: 0.4,
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini API ${res.status} : ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as GeminiResponse
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini : réponse vide')
  return text
}

/**
 * Génère un objet JSON typé via Gemini, avec validation Zod et retry-on-fail.
 */
export async function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<T> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) throw new Error('Clé Gemini absente. Configurez-la dans Réglages.')

  const model = opts.model ?? DEFAULT_MODEL

  // 1er essai
  const firstText = await callGemini(apiKey, model, opts.prompt, opts.schemaForGemini)
  const firstParsed = safeJsonParse(firstText)
  const firstValidation = opts.schema.safeParse(firstParsed)
  if (firstValidation.success) return firstValidation.data

  // 2e essai avec injection d'erreur
  const errorMessage = firstValidation.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join(' ; ')
  const retryPrompt =
    opts.prompt +
    `\n\nErreur précédente : ${errorMessage}. Renvoie un JSON strictement conforme au schéma demandé.`
  const secondText = await callGemini(apiKey, model, retryPrompt, opts.schemaForGemini)
  const secondParsed = safeJsonParse(secondText)
  const secondValidation = opts.schema.safeParse(secondParsed)
  if (secondValidation.success) return secondValidation.data

  throw new Error(
    `Réponse Gemini non conforme au schéma après retry : ${secondValidation.error.issues
      .map((i) => i.message)
      .join(' ; ')}`,
  )
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // Gemini renvoie parfois ```json ... ``` malgré responseMimeType
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (match) return JSON.parse(match[1])
    throw new Error('Réponse Gemini non parsable en JSON')
  }
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npm run test:run -- geminiClient`
Expected: 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/briefs/ai/geminiClient.ts src/features/briefs/ai/geminiClient.test.ts
git commit -m "feat(briefs): add Gemini JSON client with Zod validation and retry"
```

---

## Task 2 : Prompt `dynamicQuestions.prompt.ts`

**Files:**
- Create: `src/features/briefs/ai/prompts/dynamicQuestions.prompt.ts`

But : à partir du contexte client (`brief.client.values`) + des nœuds de la taxonomie (id, label, hiérarchie), demander à Gemini de :
1. Sélectionner les nœuds pertinents (`selectedNodeIds`).
2. Générer 4 à 8 questions complémentaires qui aideront à choisir des produits.
3. Justifier brièvement (`reasoning`).

- [ ] **Step 1: Créer le fichier de prompt**

Create `src/features/briefs/ai/prompts/dynamicQuestions.prompt.ts`:
```ts
import { z } from 'zod'
import type { TaxonomyNode } from '@/features/taxonomy/types'

export const VERSION = 'dynamic-questions-2026-04-07-1'

export const QuestionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'number', 'select', 'multiselect', 'boolean']),
  options: z.array(z.string()).optional(),
  required: z.boolean(),
  helpText: z.string().optional(),
})

export const DynamicQuestionsResponseSchema = z.object({
  selectedNodeIds: z.array(z.string()).min(1),
  questions: z.array(QuestionSchema).min(2).max(10),
  reasoning: z.string(),
})

export type DynamicQuestionsResponse = z.infer<
  typeof DynamicQuestionsResponseSchema
>

/** Schéma JSON-Schema pour Gemini `responseSchema`. */
export const RESPONSE_SCHEMA_FOR_GEMINI = {
  type: 'object',
  properties: {
    selectedNodeIds: { type: 'array', items: { type: 'string' } },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          type: {
            type: 'string',
            enum: ['text', 'number', 'select', 'multiselect', 'boolean'],
          },
          options: { type: 'array', items: { type: 'string' } },
          required: { type: 'boolean' },
          helpText: { type: 'string' },
        },
        required: ['id', 'label', 'type', 'required'],
      },
    },
    reasoning: { type: 'string' },
  },
  required: ['selectedNodeIds', 'questions', 'reasoning'],
}

interface BuildOpts {
  clientValues: Record<string, unknown>
  nodes: Pick<TaxonomyNode, 'id' | 'label' | 'parentId' | 'level'>[]
}

export function buildPrompt({ clientValues, nodes }: BuildOpts): string {
  const nodesSummary = nodes
    .map((n) => `- ${n.id} (level ${n.level}, parent ${n.parentId ?? 'root'}): ${n.label}`)
    .join('\n')

  return `Tu es un expert en signalétique et PLV. Sur la base d'un brief client et d'une taxonomie de produits, tu dois :
1) Identifier les nœuds de taxonomie pertinents pour ce client (entre 1 et 6 ids).
2) Générer 4 à 8 questions complémentaires courtes pour préciser le besoin avant de choisir des produits. Évite les questions déjà couvertes par le brief.
3) Justifier ton raisonnement en 2-3 phrases.

Brief client :
${JSON.stringify(clientValues, null, 2)}

Taxonomie disponible :
${nodesSummary}

Contraintes :
- Les ids dans selectedNodeIds DOIVENT exister dans la liste ci-dessus.
- Les questions doivent être en français, claires, et avoir un type adapté (text, number, select, multiselect, boolean).
- Pour select / multiselect, fournis 2 à 6 options.
- Le champ id de chaque question doit être un slug court unique (ex: "q-format", "q-emplacement").

Réponds en JSON strict conforme au schéma demandé.`
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`
Expected: pas d'erreur nouvelle.

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/ai/prompts/dynamicQuestions.prompt.ts
git commit -m "feat(briefs): add dynamic questions prompt and Zod schema"
```

---

## Task 3 : Prompt `cartGeneration.prompt.ts`

**Files:**
- Create: `src/features/briefs/ai/prompts/cartGeneration.prompt.ts`

But : à partir du contexte client + réponses aux questions dynamiques + catalogue (liste de SKUs avec nom/description/prix), demander à Gemini de proposer un panier.

- [ ] **Step 1: Créer le fichier**

Create `src/features/briefs/ai/prompts/cartGeneration.prompt.ts`:
```ts
import { z } from 'zod'
import type { CatalogProduct } from '@/features/briefs/catalog/ProductCatalogProvider'

export const VERSION = 'cart-generation-2026-04-07-1'

export const CartItemSuggestionSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  aiJustification: z.string().min(1),
})

export const CartResponseSchema = z.object({
  items: z.array(CartItemSuggestionSchema).min(1).max(20),
  reasoning: z.string(),
})

export type CartResponse = z.infer<typeof CartResponseSchema>

export const RESPONSE_SCHEMA_FOR_GEMINI = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sku: { type: 'string' },
          quantity: { type: 'integer' },
          aiJustification: { type: 'string' },
        },
        required: ['sku', 'quantity', 'aiJustification'],
      },
    },
    reasoning: { type: 'string' },
  },
  required: ['items', 'reasoning'],
}

interface BuildOpts {
  clientValues: Record<string, unknown>
  answers: Record<string, unknown>
  catalog: CatalogProduct[]
}

export function buildPrompt({ clientValues, answers, catalog }: BuildOpts): string {
  const catalogSummary = catalog
    .map(
      (p) =>
        `- ${p.sku} | ${p.name} | ${p.price.toFixed(2)} € | ${p.description.slice(0, 120)}`,
    )
    .join('\n')

  return `Tu es un expert commercial en signalétique et PLV. Sur la base d'un brief client et d'un catalogue de produits, propose un panier cohérent (3 à 8 références) qui répond précisément au besoin.

Brief client :
${JSON.stringify(clientValues, null, 2)}

Réponses complémentaires :
${JSON.stringify(answers, null, 2)}

Catalogue disponible :
${catalogSummary}

Contraintes :
- TOUS les SKUs proposés DOIVENT exister exactement dans le catalogue ci-dessus. N'invente AUCUN SKU.
- Quantités positives entières, cohérentes avec le besoin (ex: nombre de points de vente, surface, etc.).
- Pour chaque item, justifie en une phrase pourquoi il répond au besoin.
- Reasoning global : 2-3 phrases sur ta logique de construction du panier.

Réponds en JSON strict conforme au schéma demandé.`
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/ai/prompts/cartGeneration.prompt.ts
git commit -m "feat(briefs): add cart generation prompt and Zod schema"
```

---

## Task 4 : Guard-rail SKU (TDD)

**Files:**
- Create: `src/features/briefs/ai/skuGuardRail.ts`
- Create: `src/features/briefs/ai/skuGuardRail.test.ts`

But : filtre les items proposés par l'IA en ne gardant que ceux dont le SKU existe réellement dans le catalogue, et indique si la perte est trop importante (>30%) — auquel cas l'appelant fera un retry.

- [ ] **Step 1: Écrire les tests**

Create `src/features/briefs/ai/skuGuardRail.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { filterValidSkus } from './skuGuardRail'

const catalogSkus = ['A1', 'A2', 'B1']

describe('filterValidSkus', () => {
  it('keeps items whose SKU exists in the catalog', () => {
    const r = filterValidSkus(
      [
        { sku: 'A1', quantity: 2, aiJustification: 'x' },
        { sku: 'A2', quantity: 1, aiJustification: 'y' },
      ],
      catalogSkus,
    )
    expect(r.kept).toHaveLength(2)
    expect(r.invalidSkus).toHaveLength(0)
    expect(r.shouldRetry).toBe(false)
  })

  it('drops hallucinated SKUs and reports them', () => {
    const r = filterValidSkus(
      [
        { sku: 'A1', quantity: 1, aiJustification: 'x' },
        { sku: 'ZZZ', quantity: 1, aiJustification: 'y' },
      ],
      catalogSkus,
    )
    expect(r.kept).toHaveLength(1)
    expect(r.invalidSkus).toEqual(['ZZZ'])
  })

  it('flags shouldRetry when more than 30% of SKUs are invalid', () => {
    const r = filterValidSkus(
      [
        { sku: 'A1', quantity: 1, aiJustification: 'x' },
        { sku: 'X', quantity: 1, aiJustification: 'y' },
        { sku: 'Y', quantity: 1, aiJustification: 'z' },
      ],
      catalogSkus,
    )
    expect(r.shouldRetry).toBe(true)
  })

  it('does not flag retry at exactly 33% if threshold is strict >30%', () => {
    // 1/3 = 33% → > 30% → retry
    const r = filterValidSkus(
      [
        { sku: 'A1', quantity: 1, aiJustification: 'x' },
        { sku: 'A2', quantity: 1, aiJustification: 'y' },
        { sku: 'X', quantity: 1, aiJustification: 'z' },
      ],
      catalogSkus,
    )
    expect(r.shouldRetry).toBe(true)
  })

  it('handles an empty input', () => {
    const r = filterValidSkus([], catalogSkus)
    expect(r.kept).toHaveLength(0)
    expect(r.shouldRetry).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `npm run test:run -- skuGuardRail`

- [ ] **Step 3: Implémenter**

Create `src/features/briefs/ai/skuGuardRail.ts`:
```ts
interface AiSuggestion {
  sku: string
  quantity: number
  aiJustification: string
}

export interface GuardRailResult {
  kept: AiSuggestion[]
  invalidSkus: string[]
  shouldRetry: boolean
}

const INVALID_RATIO_THRESHOLD = 0.3

/**
 * Filtre les suggestions IA pour ne conserver que les SKUs présents dans le catalogue.
 * Si plus de 30% des suggestions ont un SKU inconnu, recommande un retry.
 */
export function filterValidSkus(
  suggestions: AiSuggestion[],
  catalogSkus: string[],
): GuardRailResult {
  if (suggestions.length === 0) {
    return { kept: [], invalidSkus: [], shouldRetry: false }
  }
  const set = new Set(catalogSkus)
  const kept: AiSuggestion[] = []
  const invalidSkus: string[] = []
  for (const s of suggestions) {
    if (set.has(s.sku)) kept.push(s)
    else invalidSkus.push(s.sku)
  }
  const ratio = invalidSkus.length / suggestions.length
  return { kept, invalidSkus, shouldRetry: ratio > INVALID_RATIO_THRESHOLD }
}
```

- [ ] **Step 4: Run, expect pass (5)**

Run: `npm run test:run -- skuGuardRail`

- [ ] **Step 5: Commit**

```bash
git add src/features/briefs/ai/skuGuardRail.ts src/features/briefs/ai/skuGuardRail.test.ts
git commit -m "feat(briefs): add SKU guard-rail filter for AI hallucinations"
```

---

## Task 5 : Math du panier (TDD)

**Files:**
- Create: `src/features/briefs/cart/cartMath.ts`
- Create: `src/features/briefs/cart/cartMath.test.ts`

- [ ] **Step 1: Tests**

Create `src/features/briefs/cart/cartMath.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeSubtotal, applyDiscount, computeTotal } from './cartMath'
import type { CartItem, CartDiscount } from '@/features/briefs/types'

function item(overrides: Partial<CartItem>): CartItem {
  return {
    sku: 'X',
    name: 'X',
    categoryNodeId: 'n1',
    quantity: 1,
    unitPrice: 10,
    source: 'manual',
    ...overrides,
  }
}

describe('computeSubtotal', () => {
  it('returns 0 for an empty cart', () => {
    expect(computeSubtotal([])).toBe(0)
  })
  it('sums unitPrice * quantity', () => {
    expect(
      computeSubtotal([item({ unitPrice: 10, quantity: 2 }), item({ unitPrice: 5, quantity: 3 })]),
    ).toBe(35)
  })
  it('uses unitPriceOverride when provided', () => {
    expect(
      computeSubtotal([item({ unitPrice: 10, unitPriceOverride: 8, quantity: 2 })]),
    ).toBe(16)
  })
  it('treats missing prices as 0', () => {
    expect(computeSubtotal([item({ unitPrice: undefined, quantity: 2 })])).toBe(0)
  })
})

describe('applyDiscount', () => {
  it('returns the subtotal when no discount', () => {
    expect(applyDiscount(100, undefined)).toBe(100)
  })
  it('applies a percent discount', () => {
    const d: CartDiscount = { type: 'percent', value: 10 }
    expect(applyDiscount(100, d)).toBe(90)
  })
  it('applies an amount discount', () => {
    const d: CartDiscount = { type: 'amount', value: 15 }
    expect(applyDiscount(100, d)).toBe(85)
  })
  it('clamps the result at 0 if discount > subtotal', () => {
    expect(applyDiscount(10, { type: 'amount', value: 50 })).toBe(0)
  })
  it('clamps percent discount above 100%', () => {
    expect(applyDiscount(100, { type: 'percent', value: 150 })).toBe(0)
  })
})

describe('computeTotal', () => {
  it('combines subtotal and discount', () => {
    const items = [item({ unitPrice: 50, quantity: 2 })] // subtotal = 100
    expect(computeTotal(items, { type: 'percent', value: 20 })).toBe(80)
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `npm run test:run -- cartMath`

- [ ] **Step 3: Implémenter**

Create `src/features/briefs/cart/cartMath.ts`:
```ts
import type { CartItem, CartDiscount } from '@/features/briefs/types'

export function computeSubtotal(items: CartItem[]): number {
  return items.reduce((sum, it) => {
    const price = it.unitPriceOverride ?? it.unitPrice ?? 0
    return sum + price * it.quantity
  }, 0)
}

export function applyDiscount(subtotal: number, discount: CartDiscount | undefined): number {
  if (!discount) return subtotal
  let after = subtotal
  if (discount.type === 'percent') {
    after = subtotal * (1 - discount.value / 100)
  } else {
    after = subtotal - discount.value
  }
  return after < 0 ? 0 : after
}

export function computeTotal(items: CartItem[], discount: CartDiscount | undefined): number {
  return applyDiscount(computeSubtotal(items), discount)
}
```

- [ ] **Step 4: Run, expect pass (10)**

Run: `npm run test:run -- cartMath`

- [ ] **Step 5: Commit**

```bash
git add src/features/briefs/cart/cartMath.ts src/features/briefs/cart/cartMath.test.ts
git commit -m "feat(briefs): add cart math (subtotal, discount, total)"
```

---

## Task 6 : Export CSV (TDD)

**Files:**
- Create: `src/features/briefs/cart/cartCsv.ts`
- Create: `src/features/briefs/cart/cartCsv.test.ts`

- [ ] **Step 1: Tests**

Create `src/features/briefs/cart/cartCsv.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { cartItemsToCsv } from './cartCsv'
import type { CartItem } from '@/features/briefs/types'

const item = (o: Partial<CartItem> = {}): CartItem => ({
  sku: 'A1',
  name: 'Produit A',
  categoryNodeId: 'n1',
  quantity: 2,
  unitPrice: 10,
  source: 'ai',
  ...o,
})

describe('cartItemsToCsv', () => {
  it('outputs a header row first', () => {
    const csv = cartItemsToCsv([item()])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('SKU,Nom,Quantité,Prix unitaire,Prix appliqué,Total ligne')
  })

  it('uses unitPriceOverride for "prix appliqué" when set', () => {
    const csv = cartItemsToCsv([item({ unitPriceOverride: 8 })])
    expect(csv).toContain('A1,Produit A,2,10.00,8.00,16.00')
  })

  it('escapes fields containing commas with double quotes', () => {
    const csv = cartItemsToCsv([item({ name: 'Produit, premium' })])
    expect(csv).toContain('"Produit, premium"')
  })

  it('escapes embedded double quotes by doubling them', () => {
    const csv = cartItemsToCsv([item({ name: 'Produit "X"' })])
    expect(csv).toContain('"Produit ""X"""')
  })

  it('handles multiple lines', () => {
    const csv = cartItemsToCsv([item({ sku: 'A' }), item({ sku: 'B', quantity: 3 })])
    expect(csv.split('\n')).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `npm run test:run -- cartCsv`

- [ ] **Step 3: Implémenter**

Create `src/features/briefs/cart/cartCsv.ts`:
```ts
import type { CartItem } from '@/features/briefs/types'

const HEADER = ['SKU', 'Nom', 'Quantité', 'Prix unitaire', 'Prix appliqué', 'Total ligne']

function escape(field: string | number): string {
  const s = String(field)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function fmt(n: number | undefined): string {
  return (n ?? 0).toFixed(2)
}

export function cartItemsToCsv(items: CartItem[]): string {
  const lines: string[] = [HEADER.join(',')]
  for (const it of items) {
    const applied = it.unitPriceOverride ?? it.unitPrice ?? 0
    const lineTotal = applied * it.quantity
    lines.push(
      [
        escape(it.sku),
        escape(it.name),
        escape(it.quantity),
        fmt(it.unitPrice),
        fmt(applied),
        fmt(lineTotal),
      ].join(','),
    )
  }
  return lines.join('\n')
}
```

- [ ] **Step 4: Run, expect pass (5)**

Run: `npm run test:run -- cartCsv`

- [ ] **Step 5: Commit**

```bash
git add src/features/briefs/cart/cartCsv.ts src/features/briefs/cart/cartCsv.test.ts
git commit -m "feat(briefs): add cart CSV export"
```

---

## Task 7 : Hook `useGenerateDynamicQuestions`

**Files:**
- Create: `src/features/briefs/ai/useGenerateDynamicQuestions.ts`

- [ ] **Step 1: Créer le hook**

Create `src/features/briefs/ai/useGenerateDynamicQuestions.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { generateJson } from './geminiClient'
import {
  buildPrompt,
  RESPONSE_SCHEMA_FOR_GEMINI,
  DynamicQuestionsResponseSchema,
  VERSION,
} from './prompts/dynamicQuestions.prompt'
import type { Brief } from '@/features/briefs/types'
import type { Taxonomy } from '@/features/taxonomy/types'

interface Args {
  brief: Brief
  taxonomy: Taxonomy
}

/**
 * Génère les questions dynamiques pour un brief via Gemini, puis persiste
 * dynamicForm.questions / selectedNodeIds / aiVersions.questions sur le brief.
 */
export function useGenerateDynamicQuestions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief, taxonomy }: Args) => {
      const nodes = Object.values(taxonomy.nodes).map((n) => ({
        id: n.id,
        label: n.label,
        parentId: n.parentId,
        level: n.level,
      }))
      const prompt = buildPrompt({
        clientValues: brief.client.values,
        nodes,
      })
      const result = await generateJson({
        prompt,
        schema: DynamicQuestionsResponseSchema,
        schemaForGemini: RESPONSE_SCHEMA_FOR_GEMINI,
        version: VERSION,
      })

      // Filtre les ids hallucinés
      const validIds = new Set(nodes.map((n) => n.id))
      const selectedNodeIds = result.selectedNodeIds.filter((id) => validIds.has(id))

      await updateDoc(doc(db, 'briefs', brief.id), {
        'dynamicForm.selectedNodeIds': selectedNodeIds,
        'dynamicForm.questions': result.questions,
        'dynamicForm.answers': brief.dynamicForm?.answers ?? {},
        'dynamicForm.aiReasoning': result.reasoning,
        'aiVersions.questions': VERSION,
        updatedAt: serverTimestamp(),
      })

      return { selectedNodeIds, questions: result.questions, reasoning: result.reasoning }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['brief', vars.brief.id] })
      qc.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/ai/useGenerateDynamicQuestions.ts
git commit -m "feat(briefs): add useGenerateDynamicQuestions mutation"
```

---

## Task 8 : Hook `useGenerateCart` (avec retry guard-rail)

**Files:**
- Create: `src/features/briefs/ai/useGenerateCart.ts`

- [ ] **Step 1: Créer le hook**

Create `src/features/briefs/ai/useGenerateCart.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { generateJson } from './geminiClient'
import {
  buildPrompt,
  RESPONSE_SCHEMA_FOR_GEMINI,
  CartResponseSchema,
  VERSION,
} from './prompts/cartGeneration.prompt'
import { filterValidSkus } from './skuGuardRail'
import { getProductCatalog } from '@/features/briefs/catalog/catalog.factory'
import type { CatalogProduct } from '@/features/briefs/catalog/ProductCatalogProvider'
import type { Brief, CartItem } from '@/features/briefs/types'
import { computeSubtotal } from '@/features/briefs/cart/cartMath'

interface Args {
  brief: Brief
}

export function useGenerateCart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief }: Args) => {
      const provider = getProductCatalog()
      // Pour le MVP on récupère tout le catalogue (mock = 5 produits).
      // Au lot Magento on filtrera par selectedNodeIds → magentoCategoryIds.
      const catalog = await provider.search({})

      const askGemini = async (extraInstruction?: string) => {
        let prompt = buildPrompt({
          clientValues: brief.client.values,
          answers: brief.dynamicForm?.answers ?? {},
          catalog,
        })
        if (extraInstruction) prompt += `\n\n${extraInstruction}`
        return generateJson({
          prompt,
          schema: CartResponseSchema,
          schemaForGemini: RESPONSE_SCHEMA_FOR_GEMINI,
          version: VERSION,
        })
      }

      // 1er essai
      let response = await askGemini()
      let guard = filterValidSkus(response.items, catalog.map((c) => c.sku))

      // Retry si trop d'hallucinations
      if (guard.shouldRetry) {
        response = await askGemini(
          `Attention : lors de ta première tentative, ${guard.invalidSkus.length} SKUs n'existaient pas dans le catalogue (${guard.invalidSkus.join(', ')}). Utilise UNIQUEMENT les SKUs présents dans le catalogue ci-dessus.`,
        )
        guard = filterValidSkus(response.items, catalog.map((c) => c.sku))
      }

      const cartItems: CartItem[] = guard.kept.map((s) => {
        const product = catalog.find((c) => c.sku === s.sku) as CatalogProduct
        return {
          sku: product.sku,
          name: product.name,
          categoryNodeId: product.magentoCategoryIds?.[0] ?? '',
          quantity: s.quantity,
          unitPrice: product.price,
          imageUrl: product.imageUrl,
          description: product.description,
          aiJustification: s.aiJustification,
          source: 'ai',
        }
      })

      const subtotal = computeSubtotal(cartItems)

      await updateDoc(doc(db, 'briefs', brief.id), {
        'cart.items': cartItems,
        'cart.subtotal': subtotal,
        'cart.aiReasoning': response.reasoning,
        'aiVersions.cart': VERSION,
        updatedAt: serverTimestamp(),
      })

      return { items: cartItems, reasoning: response.reasoning, droppedSkus: guard.invalidSkus }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['brief', vars.brief.id] })
      qc.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/ai/useGenerateCart.ts
git commit -m "feat(briefs): add useGenerateCart mutation with SKU guard-rail retry"
```

---

## Task 9 : Étendre `brief.store.ts` (état modale éditeur)

**Files:**
- Modify: `src/stores/brief.store.ts`

- [ ] **Step 1: Ajouter `briefEditorOpen` + `currentBriefId`**

Edit `src/stores/brief.store.ts` — remplacer le state existant par :
```ts
import { create } from 'zustand'

export type TaxonomyTab = 'tree' | 'briefs'

interface BriefUIState {
  currentTab: TaxonomyTab
  setCurrentTab: (tab: TaxonomyTab) => void

  formBuilderOpen: boolean
  openFormBuilder: () => void
  closeFormBuilder: () => void

  briefEditorOpen: boolean
  currentBriefId: string | null
  openBriefEditor: (id: string) => void
  closeBriefEditor: () => void
  setCurrentBriefId: (id: string | null) => void
}

export const useBriefUIStore = create<BriefUIState>((set) => ({
  currentTab: 'tree',
  setCurrentTab: (tab) => set({ currentTab: tab }),

  formBuilderOpen: false,
  openFormBuilder: () => set({ formBuilderOpen: true }),
  closeFormBuilder: () => set({ formBuilderOpen: false }),

  briefEditorOpen: false,
  currentBriefId: null,
  openBriefEditor: (id) => set({ briefEditorOpen: true, currentBriefId: id }),
  closeBriefEditor: () => set({ briefEditorOpen: false, currentBriefId: null }),
  setCurrentBriefId: (id) => set({ currentBriefId: id }),
}))
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/stores/brief.store.ts
git commit -m "feat(briefs): extend brief UI store with editor modal state"
```

---

## Task 10 : `BriefStepper`

**Files:**
- Create: `src/components/briefs/editor/BriefStepper.tsx`

- [ ] **Step 1: Créer le composant**

Create `src/components/briefs/editor/BriefStepper.tsx`:
```tsx
import { Check } from 'lucide-react'
import type { BriefStep } from '@/features/briefs/types'

interface Props {
  current: BriefStep
}

const STEPS: { id: BriefStep; label: string }[] = [
  { id: 1, label: 'Brief client' },
  { id: 2, label: 'Questions IA' },
  { id: 3, label: 'Panier' },
  { id: 4, label: 'Deck' },
  { id: 5, label: 'Export PPT' },
]

export function BriefStepper({ current }: Props) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, idx) => {
        const done = step.id < current
        const active = step.id === current
        return (
          <div key={step.id} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                done
                  ? 'bg-indigo-500 text-white'
                  : active
                    ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/60'
                    : 'bg-white/[0.06] text-white/40'
              }`}
            >
              {done ? <Check className="w-3.5 h-3.5" /> : step.id}
            </div>
            <span
              className={`text-[12px] ${active ? 'text-white' : done ? 'text-white/60' : 'text-white/30'}`}
            >
              {step.label}
            </span>
            {idx < STEPS.length - 1 && (
              <div className={`w-6 h-px ${done ? 'bg-indigo-500/60' : 'bg-white/[0.08]'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/editor/BriefStepper.tsx
git commit -m "feat(briefs): add BriefStepper indicator"
```

---

## Task 11 : `Step1Form` — formulaire client

**Files:**
- Create: `src/components/briefs/editor/Step1Form.tsx`

- [ ] **Step 1: Créer le composant**

Create `src/components/briefs/editor/Step1Form.tsx`:
```tsx
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { DynamicFormRenderer } from '@/components/briefs/form-renderer/DynamicFormRenderer'
import { useUpdateBrief } from '@/features/briefs/useBriefMutations'
import type { Brief } from '@/features/briefs/types'

interface Props {
  brief: Brief
  onAdvance: () => void
}

export function Step1Form({ brief, onAdvance }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(brief.client.values)
  const update = useUpdateBrief()

  const handleChange = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleNext = async () => {
    const missing = brief.client.formTemplateSnapshot.filter(
      (f) => f.required && !values[f.key],
    )
    if (missing.length > 0) {
      toast.error(`Champs obligatoires manquants : ${missing.map((f) => f.label).join(', ')}`)
      return
    }
    const clientName = String(values.companyName ?? brief.clientName ?? 'Sans nom')
    try {
      await update.mutateAsync({
        briefId: brief.id,
        patch: {
          clientName,
          'client.values': values,
          status: 'form_filled',
          currentStep: 2,
        } as never,
      })
      onAdvance()
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde')
      console.error(err)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-[14px] font-semibold text-white/80 mb-1">
            Informations client
          </h2>
          <p className="text-[12px] text-white/40 mb-6">
            Remplissez les champs ci-dessous. Les champs marqués d'un astérisque sont obligatoires.
          </p>
          <DynamicFormRenderer
            fields={brief.client.formTemplateSnapshot}
            values={values}
            onChange={handleChange}
          />
        </div>
      </div>
      <div className="border-t border-white/[0.06] bg-[#141414] px-6 py-3 flex justify-end shrink-0">
        <button
          onClick={handleNext}
          disabled={update.isPending}
          className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded-md disabled:opacity-50"
        >
          Étape suivante
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/editor/Step1Form.tsx
git commit -m "feat(briefs): add Step1Form for client info"
```

---

## Task 12 : `QuestionRenderer` (5 types)

**Files:**
- Create: `src/components/briefs/editor/QuestionRenderer.tsx`

- [ ] **Step 1: Créer**

Create `src/components/briefs/editor/QuestionRenderer.tsx`:
```tsx
import type { DynamicQuestion } from '@/features/taxonomy/types'

interface Props {
  questions: DynamicQuestion[]
  values: Record<string, unknown>
  onChange: (id: string, value: unknown) => void
}

const baseInput =
  'bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60'

export function QuestionRenderer({ questions, values, onChange }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-1.5">
          <label className="text-[12px] text-white/70">
            {q.label}
            {q.required && <span className="text-red-400 ml-1">*</span>}
          </label>
          {renderField(q, values[q.id], (v) => onChange(q.id, v))}
          {q.helpText && <p className="text-[11px] text-white/40">{q.helpText}</p>}
        </div>
      ))}
    </div>
  )
}

function renderField(
  q: DynamicQuestion,
  value: unknown,
  onChange: (v: unknown) => void,
) {
  switch (q.type) {
    case 'text':
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          value={(value as number | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className={baseInput}
        />
      )
    case 'select':
      return (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        >
          <option value="">—</option>
          {(q.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    case 'multiselect': {
      const arr = (value as string[]) ?? []
      const toggle = (opt: string) => {
        if (arr.includes(opt)) onChange(arr.filter((o) => o !== opt))
        else onChange([...arr, opt])
      }
      return (
        <div className="flex flex-wrap gap-2">
          {(q.options ?? []).map((opt) => {
            const on = arr.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`text-[12px] px-2.5 py-1 rounded-md border ${
                  on
                    ? 'bg-indigo-500/20 border-indigo-500/60 text-white'
                    : 'bg-[#0f0f0f] border-white/[0.08] text-white/60 hover:text-white/90'
                }`}
              >
                {opt}
              </button>
            )
          })}
        </div>
      )
    }
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-[12px] text-white/70 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 accent-indigo-500"
          />
          Oui
        </label>
      )
  }
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/editor/QuestionRenderer.tsx
git commit -m "feat(briefs): add QuestionRenderer for dynamic questions"
```

---

## Task 13 : `Step2Questions`

**Files:**
- Create: `src/components/briefs/editor/Step2Questions.tsx`

- [ ] **Step 1: Créer le composant**

Create `src/components/briefs/editor/Step2Questions.tsx`:
```tsx
import { useState } from 'react'
import { ArrowRight, Sparkles, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useGenerateDynamicQuestions } from '@/features/briefs/ai/useGenerateDynamicQuestions'
import { useUpdateBrief } from '@/features/briefs/useBriefMutations'
import { QuestionRenderer } from './QuestionRenderer'
import type { Brief } from '@/features/briefs/types'
import type { Taxonomy } from '@/features/taxonomy/types'

interface Props {
  brief: Brief
  taxonomy: Taxonomy
  onAdvance: () => void
}

export function Step2Questions({ brief, taxonomy, onAdvance }: Props) {
  const generate = useGenerateDynamicQuestions()
  const update = useUpdateBrief()
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    brief.dynamicForm?.answers ?? {},
  )

  const questions = brief.dynamicForm?.questions ?? []
  const hasQuestions = questions.length > 0

  const handleGenerate = async () => {
    try {
      await generate.mutateAsync({ brief, taxonomy })
      toast.success('Questions générées')
    } catch (err) {
      toast.error((err as Error).message || 'Échec de la génération')
    }
  }

  const handleNext = async () => {
    const missing = questions.filter((q) => q.required && (answers[q.id] === undefined || answers[q.id] === ''))
    if (missing.length > 0) {
      toast.error(`Réponses obligatoires manquantes : ${missing.map((q) => q.label).join(', ')}`)
      return
    }
    try {
      await update.mutateAsync({
        briefId: brief.id,
        patch: {
          'dynamicForm.answers': answers,
          currentStep: 3,
        } as never,
      })
      onAdvance()
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde')
      console.error(err)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[14px] font-semibold text-white/80">Questions complémentaires</h2>
              <p className="text-[12px] text-white/40">
                Générées par l'IA à partir du brief client et de la taxonomie.
              </p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generate.isPending}
              className="flex items-center gap-1.5 text-[12px] text-indigo-300 hover:text-white hover:bg-indigo-500/10 px-3 py-1.5 rounded-md disabled:opacity-50"
            >
              {hasQuestions ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              {generate.isPending ? 'Génération…' : hasQuestions ? 'Régénérer' : 'Générer les questions'}
            </button>
          </div>

          {!hasQuestions && !generate.isPending && (
            <div className="text-[12px] text-white/40 text-center py-12 border border-dashed border-white/[0.08] rounded-md">
              Cliquez sur « Générer les questions » pour démarrer.
            </div>
          )}

          {hasQuestions && (
            <QuestionRenderer
              questions={questions}
              values={answers}
              onChange={(id, v) => setAnswers((prev) => ({ ...prev, [id]: v }))}
            />
          )}

          {brief.dynamicForm?.aiReasoning && (
            <p className="mt-6 text-[11px] text-white/40 italic">
              IA : {brief.dynamicForm.aiReasoning}
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-white/[0.06] bg-[#141414] px-6 py-3 flex justify-end shrink-0">
        <button
          onClick={handleNext}
          disabled={!hasQuestions || update.isPending}
          className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded-md disabled:opacity-50"
        >
          Étape suivante
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/editor/Step2Questions.tsx
git commit -m "feat(briefs): add Step2Questions with AI generation"
```

---

## Task 14 : `CartTable` (édition lignes)

**Files:**
- Create: `src/components/briefs/editor/CartTable.tsx`

- [ ] **Step 1: Créer**

Create `src/components/briefs/editor/CartTable.tsx`:
```tsx
import { Trash2, Plus } from 'lucide-react'
import type { CartItem } from '@/features/briefs/types'

interface Props {
  items: CartItem[]
  onChange: (items: CartItem[]) => void
}

export function CartTable({ items, onChange }: Props) {
  const updateItem = (idx: number, patch: Partial<CartItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  const removeItem = (idx: number) => onChange(items.filter((_, i) => i !== idx))
  const addManual = () =>
    onChange([
      ...items,
      {
        sku: 'CUSTOM',
        name: 'Produit manuel',
        categoryNodeId: '',
        quantity: 1,
        unitPrice: 0,
        source: 'manual',
      },
    ])

  return (
    <div className="border border-white/[0.06] rounded-md overflow-hidden">
      <table className="w-full text-[12px]">
        <thead className="bg-[#161616] text-white/40 uppercase text-[10px] tracking-wide">
          <tr>
            <th className="text-left px-3 py-2">SKU</th>
            <th className="text-left px-3 py-2">Nom</th>
            <th className="text-right px-3 py-2 w-20">Qté</th>
            <th className="text-right px-3 py-2 w-28">Prix</th>
            <th className="text-right px-3 py-2 w-28">Total</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const price = it.unitPriceOverride ?? it.unitPrice ?? 0
            const total = price * it.quantity
            return (
              <tr key={`${it.sku}-${idx}`} className="border-t border-white/[0.06]">
                <td className="px-3 py-2 text-white/60 font-mono text-[11px]">
                  <input
                    type="text"
                    value={it.sku}
                    onChange={(e) => updateItem(idx, { sku: e.target.value })}
                    className="bg-transparent w-full focus:outline-none"
                  />
                </td>
                <td className="px-3 py-2 text-white/80">
                  <input
                    type="text"
                    value={it.name}
                    onChange={(e) => updateItem(idx, { name: e.target.value })}
                    className="bg-transparent w-full focus:outline-none"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                    className="bg-transparent w-full text-right focus:outline-none"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={price}
                    onChange={(e) => updateItem(idx, { unitPriceOverride: Number(e.target.value) })}
                    className="bg-transparent w-full text-right focus:outline-none"
                  />
                </td>
                <td className="px-3 py-2 text-right text-white/80">{total.toFixed(2)} €</td>
                <td className="px-2 py-2 text-right">
                  <button
                    onClick={() => removeItem(idx)}
                    className="text-white/30 hover:text-red-400"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            )
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-white/30">
                Aucun item dans le panier
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="border-t border-white/[0.06] bg-[#141414] px-3 py-2">
        <button
          onClick={addManual}
          className="flex items-center gap-1.5 text-[11px] text-white/60 hover:text-white"
        >
          <Plus className="w-3 h-3" />
          Ajouter un item manuel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/editor/CartTable.tsx
git commit -m "feat(briefs): add editable CartTable"
```

---

## Task 15 : `CartSummary` + `Step3Cart`

**Files:**
- Create: `src/components/briefs/editor/CartSummary.tsx`
- Create: `src/components/briefs/editor/Step3Cart.tsx`

- [ ] **Step 1: Créer CartSummary**

Create `src/components/briefs/editor/CartSummary.tsx`:
```tsx
import type { CartDiscount } from '@/features/briefs/types'

interface Props {
  subtotal: number
  total: number
  discount: CartDiscount | undefined
  onDiscountChange: (d: CartDiscount | undefined) => void
}

export function CartSummary({ subtotal, total, discount, onDiscountChange }: Props) {
  return (
    <div className="border border-white/[0.06] rounded-md p-4 bg-[#141414] flex flex-col gap-3 text-[12px]">
      <div className="flex justify-between text-white/60">
        <span>Sous-total</span>
        <span>{subtotal.toFixed(2)} €</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-white/60 flex-1">Remise globale</span>
        <select
          value={discount?.type ?? ''}
          onChange={(e) => {
            const t = e.target.value
            if (!t) onDiscountChange(undefined)
            else onDiscountChange({ type: t as 'percent' | 'amount', value: discount?.value ?? 0 })
          }}
          className="bg-[#0f0f0f] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-white"
        >
          <option value="">Aucune</option>
          <option value="percent">%</option>
          <option value="amount">€</option>
        </select>
        <input
          type="number"
          min={0}
          value={discount?.value ?? 0}
          disabled={!discount}
          onChange={(e) =>
            discount && onDiscountChange({ ...discount, value: Number(e.target.value) })
          }
          className="bg-[#0f0f0f] border border-white/[0.08] rounded px-2 py-1 w-20 text-right text-[11px] text-white disabled:opacity-40"
        />
      </div>

      <div className="border-t border-white/[0.06] pt-3 flex justify-between text-white font-semibold text-[13px]">
        <span>Total estimé</span>
        <span>{total.toFixed(2)} €</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Créer Step3Cart**

Create `src/components/briefs/editor/Step3Cart.tsx`:
```tsx
import { useState, useMemo, useEffect } from 'react'
import { ArrowRight, Sparkles, RefreshCw, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useGenerateCart } from '@/features/briefs/ai/useGenerateCart'
import { useUpdateBrief } from '@/features/briefs/useBriefMutations'
import { computeSubtotal, computeTotal } from '@/features/briefs/cart/cartMath'
import { cartItemsToCsv } from '@/features/briefs/cart/cartCsv'
import { CartTable } from './CartTable'
import { CartSummary } from './CartSummary'
import type { Brief, CartItem, CartDiscount } from '@/features/briefs/types'

interface Props {
  brief: Brief
  onAdvance: () => void
}

export function Step3Cart({ brief, onAdvance }: Props) {
  const generate = useGenerateCart()
  const update = useUpdateBrief()
  const [items, setItems] = useState<CartItem[]>(brief.cart?.items ?? [])
  const [discount, setDiscount] = useState<CartDiscount | undefined>(brief.cart?.discount)

  // resync si Firestore renvoie de nouveaux items après generation
  useEffect(() => {
    setItems(brief.cart?.items ?? [])
    setDiscount(brief.cart?.discount)
  }, [brief.cart?.items, brief.cart?.discount])

  const subtotal = useMemo(() => computeSubtotal(items), [items])
  const total = useMemo(() => computeTotal(items, discount), [items, discount])
  const hasItems = items.length > 0

  const handleGenerate = async () => {
    try {
      const r = await generate.mutateAsync({ brief })
      toast.success(`${r.items.length} produits générés`)
      if (r.droppedSkus.length > 0) {
        toast.warning(`${r.droppedSkus.length} SKU(s) ignoré(s) car inconnus`)
      }
    } catch (err) {
      toast.error((err as Error).message || 'Échec de la génération')
    }
  }

  const handleExportCsv = () => {
    const csv = cartItemsToCsv(items)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `panier-${brief.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleNext = async () => {
    if (!hasItems) {
      toast.error('Le panier est vide')
      return
    }
    try {
      await update.mutateAsync({
        briefId: brief.id,
        patch: {
          'cart.items': items,
          'cart.subtotal': subtotal,
          'cart.discount': discount ?? null,
          'cart.totalEstimate': total,
          status: 'cart_ready',
          currentStep: 4,
        } as never,
      })
      onAdvance()
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde')
      console.error(err)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[14px] font-semibold text-white/80">Panier produits</h2>
              <p className="text-[12px] text-white/40">
                Généré par l'IA à partir du brief et des réponses. Modifiable ligne par ligne.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {hasItems && (
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 text-[12px] text-white/60 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/[0.06]"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
              )}
              <button
                onClick={handleGenerate}
                disabled={generate.isPending}
                className="flex items-center gap-1.5 text-[12px] text-indigo-300 hover:text-white hover:bg-indigo-500/10 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {hasItems ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                {generate.isPending ? 'Génération…' : hasItems ? 'Régénérer' : 'Générer le panier'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_280px] gap-4">
            <CartTable items={items} onChange={setItems} />
            <CartSummary subtotal={subtotal} total={total} discount={discount} onDiscountChange={setDiscount} />
          </div>

          {brief.cart?.aiReasoning && (
            <p className="mt-6 text-[11px] text-white/40 italic">IA : {brief.cart.aiReasoning}</p>
          )}
        </div>
      </div>
      <div className="border-t border-white/[0.06] bg-[#141414] px-6 py-3 flex justify-end shrink-0">
        <button
          onClick={handleNext}
          disabled={!hasItems || update.isPending}
          className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded-md disabled:opacity-50"
        >
          Étape suivante
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 4: Commit**

```bash
git add src/components/briefs/editor/CartSummary.tsx src/components/briefs/editor/Step3Cart.tsx
git commit -m "feat(briefs): add Step3Cart with summary, edit, discount and CSV"
```

---

## Task 16 : `BriefEditorModal` (assemblage)

**Files:**
- Create: `src/components/briefs/editor/BriefEditorModal.tsx`

- [ ] **Step 1: Créer la modale**

Create `src/components/briefs/editor/BriefEditorModal.tsx`:
```tsx
import { X } from 'lucide-react'
import { useBriefUIStore } from '@/stores/brief.store'
import { useBrief } from '@/features/briefs/useBrief'
import { BriefStepper } from './BriefStepper'
import { Step1Form } from './Step1Form'
import { Step2Questions } from './Step2Questions'
import { Step3Cart } from './Step3Cart'
import type { Taxonomy } from '@/features/taxonomy/types'

interface Props {
  taxonomy: Taxonomy
}

export function BriefEditorModal({ taxonomy }: Props) {
  const { briefEditorOpen, currentBriefId, closeBriefEditor } = useBriefUIStore()
  const { data: brief, isLoading } = useBrief(currentBriefId)

  if (!briefEditorOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch p-6">
      <div className="flex-1 bg-[#0f0f0f] border border-white/[0.06] rounded-lg flex flex-col overflow-hidden">
        <div className="h-14 bg-[#161616] border-b border-white/[0.06] flex items-center px-4 gap-4 shrink-0">
          <h2 className="text-[13px] font-semibold text-white/80 truncate max-w-[240px]">
            {brief?.clientName || 'Nouveau brief'}
          </h2>
          <div className="flex-1 flex justify-center">
            {brief && <BriefStepper current={brief.currentStep} />}
          </div>
          <button
            onClick={closeBriefEditor}
            aria-label="Fermer"
            className="text-white/40 hover:text-white/80 p-1.5 rounded-md hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {isLoading && (
            <div className="h-full flex items-center justify-center text-[12px] text-white/40">
              Chargement…
            </div>
          )}
          {brief && brief.currentStep === 1 && (
            <Step1Form brief={brief} onAdvance={() => {}} />
          )}
          {brief && brief.currentStep === 2 && (
            <Step2Questions brief={brief} taxonomy={taxonomy} onAdvance={() => {}} />
          )}
          {brief && brief.currentStep === 3 && (
            <Step3Cart brief={brief} onAdvance={() => {}} />
          )}
          {brief && brief.currentStep >= 4 && (
            <div className="h-full flex items-center justify-center text-[12px] text-white/40">
              Étapes 4 et 5 disponibles dans le prochain lot.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/editor/BriefEditorModal.tsx
git commit -m "feat(briefs): add BriefEditorModal assembling steps 1-3"
```

---

## Task 17 : `BriefsList` + intégration dans `BriefsPanel`

**Files:**
- Create: `src/components/briefs/BriefsList.tsx`
- Modify: `src/components/briefs/BriefsPanel.tsx`

- [ ] **Step 1: Créer BriefsList**

Create `src/components/briefs/BriefsList.tsx`:
```tsx
import { Plus, FileText, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useBriefs } from '@/features/briefs/useBriefs'
import { useCreateBrief, useDeleteBrief } from '@/features/briefs/useBriefMutations'
import { useBriefUIStore } from '@/stores/brief.store'
import { createDefaultFormTemplate } from '@/features/briefs/defaults'
import type { Taxonomy } from '@/features/taxonomy/types'

interface Props {
  taxonomy: Taxonomy
}

export function BriefsList({ taxonomy }: Props) {
  const { data: briefs = [], isLoading } = useBriefs({ taxonomyId: taxonomy.id })
  const create = useCreateBrief()
  const remove = useDeleteBrief()
  const openBriefEditor = useBriefUIStore((s) => s.openBriefEditor)

  const handleNew = async () => {
    try {
      const id = await create.mutateAsync({
        taxonomyId: taxonomy.id,
        clientName: 'Nouveau brief',
        formTemplateSnapshot: taxonomy.formTemplate ?? createDefaultFormTemplate(),
      })
      openBriefEditor(id)
    } catch (err) {
      toast.error('Erreur lors de la création')
      console.error(err)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Supprimer ce brief ?')) return
    try {
      await remove.mutateAsync(id)
      toast.success('Brief supprimé')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[12px] uppercase tracking-wide text-white/40 font-semibold">
          {briefs.length} brief{briefs.length > 1 ? 's' : ''}
        </h3>
        <button
          onClick={handleNew}
          disabled={create.isPending}
          className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau brief
        </button>
      </div>

      {isLoading && <p className="text-[12px] text-white/40">Chargement…</p>}

      {!isLoading && briefs.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 text-center px-6 py-16 border border-dashed border-white/[0.08] rounded-md">
          <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center">
            <FileText className="w-5 h-5 text-white/30" />
          </div>
          <p className="text-[12px] text-white/40 max-w-sm">
            Aucun brief pour cette taxonomie. Cliquez sur « Nouveau brief » pour démarrer.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {briefs.map((b) => (
          <div
            key={b.id}
            onClick={() => openBriefEditor(b.id)}
            className="group bg-[#141414] border border-white/[0.06] rounded-md p-4 cursor-pointer hover:border-indigo-500/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="text-[13px] text-white/90 font-medium truncate flex-1">{b.clientName}</h4>
              <button
                onClick={(e) => handleDelete(b.id, e)}
                className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <span className="px-1.5 py-0.5 rounded bg-white/[0.04]">{b.status}</span>
              <span>Étape {b.currentStep}/5</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Modifier BriefsPanel**

Edit `src/components/briefs/BriefsPanel.tsx` — remplacer l'empty state par :
- importer `BriefsList` et `BriefEditorModal`
- conserver le header avec le bouton "Configurer le formulaire"
- remplacer `<div className="flex-1 ... empty state ...">` par `<BriefsList taxonomy={taxonomy} />`
- ajouter `<BriefEditorModal taxonomy={taxonomy} />` à côté de `<FormBuilderModal>` à la fin du composant

Le fichier complet doit ressembler à :
```tsx
import { Settings } from 'lucide-react'
import type { Taxonomy } from '@/features/taxonomy/types'
import { useBriefUIStore } from '@/stores/brief.store'
import { FormBuilderModal } from './form-builder/FormBuilderModal'
import { BriefsList } from './BriefsList'
import { BriefEditorModal } from './editor/BriefEditorModal'

interface Props {
  taxonomy: Taxonomy
}

export function BriefsPanel({ taxonomy }: Props) {
  const { formBuilderOpen, openFormBuilder, closeFormBuilder } = useBriefUIStore()

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="h-11 bg-[#161616] border-b border-white/[0.06] flex items-center px-4 gap-3 shrink-0">
          <h2 className="text-[13px] font-semibold text-white/70">Briefs clients</h2>
          <div className="flex-1" />
          <button
            onClick={openFormBuilder}
            className="flex items-center gap-1.5 text-[12px] text-white/60 hover:text-white hover:bg-white/[0.06] px-3 py-1.5 rounded-md transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Configurer le formulaire
          </button>
        </div>

        <BriefsList taxonomy={taxonomy} />
      </div>

      <FormBuilderModal open={formBuilderOpen} taxonomy={taxonomy} onClose={closeFormBuilder} />
      <BriefEditorModal taxonomy={taxonomy} />
    </>
  )
}
```

- [ ] **Step 3: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 4: Commit**

```bash
git add src/components/briefs/BriefsList.tsx src/components/briefs/BriefsPanel.tsx
git commit -m "feat(briefs): wire BriefsList and BriefEditorModal into BriefsPanel"
```

---

## Task 18 : Vérification globale

**Files:** aucune modification.

- [ ] **Step 1: Suite de tests**

Run: `npm run test:run`
Expected: ~50 tests passants (27 hérités + 5 geminiClient + 5 skuGuardRail + 10 cartMath + 5 cartCsv = 52). 0 failed.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: 0 erreur nouvelle.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 erreur nouvelle.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build OK.

---

## Récapitulatif

À l'issue du Lot 3 :
- Wrapper Gemini browser-side typé avec validation Zod et retry-on-fail (`generateJson<T>`)
- 2 prompts versionnés (`dynamicQuestions`, `cartGeneration`) avec schémas Zod et JSON-Schema pour Gemini
- Guard-rail SKU pour filtrer les hallucinations + retry au-delà de 30%
- Math panier (subtotal, discount %/€, total clamp) et export CSV (avec escaping)
- 2 hooks de mutation (`useGenerateDynamicQuestions`, `useGenerateCart`) qui appellent Gemini, valident, persistent sur Firestore et invalident React Query
- Éditeur de brief plein écran avec stepper 5 étapes (étapes 1-3 fonctionnelles)
- Liste des briefs réelle dans `BriefsPanel` (plus d'empty state hard-codé), création/suppression
- ~52 tests unitaires passants (27 hérités + ~25 ajoutés)
- Premier flow IA bout-en-bout fonctionnel : créer un brief → remplir le formulaire → générer les questions → y répondre → générer le panier → l'éditer → exporter en CSV

**Hors scope du lot :**
- Étape 4 (génération deck + images Nano Banana) — Lot 4
- Étape 5 (assemblage PPTX) — Lot 5
- Filtrage du catalogue par `selectedNodeIds → magentoCategoryIds` (le mock ignore le filtre, à brancher avec Magento plus tard)
- Upload réel logo vers Firebase Storage (input URL pour l'instant)
- Widget Dashboard "briefs récents" (sera ajouté quand la fonctionnalité sera stabilisée)

**Prochaine étape (Lot 4) :** générer la structure du deck (`SlideSpec[]`) via Gemini, puis générer les images hero + produit via Gemini Image (Nano Banana 2), persister dans Firebase Storage et la sous-collection `briefs/{id}/images`, afficher dans une galerie.
