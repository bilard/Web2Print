# Web Scraping Redesign — Phase 1: Nouveau core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire les briques fondamentales du nouveau pipeline de scraping (schéma canonique, parseurs, prompts, projecteurs) en parallèle de l'ancien code, sans aucun branchement encore. À la fin de cette phase, on dispose d'un module `features/scraping/core/` testé qui transforme du markdown en `EnrichedProduct` validé Zod, prêt à être consommé par les futurs engines (Phase 2) et UI (Phase 3).

**Architecture:** Les parseurs existants (sans tests, dans `useProductEnrichment.ts` 4322 l) sont extraits un par un dans des modules dédiés sous `features/scraping/core/parsers/`, avec tests unitaires sur fixtures markdown. Le schéma canonique unique `EnrichedProduct` (Zod) remplace les deux structures actuelles. Aucun fichier existant n'est supprimé en phase 1 (refactor zéro-régression).

**Tech Stack:** TypeScript strict, Zod (validation runtime), Vitest (tests unitaires), zod-to-json-schema (génération du JSON Schema pour le LLM), import alias `@/` pour `src/`.

**Spec source:** `docs/superpowers/specs/2026-04-29-web-scraping-redesign.md` (sections 2-3).

**Hors scope phase 1 :** engines (single/listing/batch/crawl), modal UI, EnrichmentPanel, suppression de l'ancien code, migration Firestore, hub admin. Tout ça en phases 2-5.

---

## Plan d'exécution — vue d'ensemble

| # | Task | Files créés | Test |
|---|---|---|---|
| 1 | Bootstrap : arborescence + dépendances | `features/scraping/core/` (dossier) | — |
| 2 | Schéma canonique Zod | `core/canonicalSchema.ts` | `core/__tests__/canonicalSchema.test.ts` |
| 3 | Debug log déplacé | `core/debug.ts` | — (move only) |
| 4 | bundleSources déplacé/généralisé | `core/bundleSources.ts` | (existant `scrapeBundle.test.ts` déplacé) |
| 5 | relatedUrls déplacé | `core/relatedUrls.ts` | (existant `relatedUrls.test.ts` déplacé) |
| 6 | garbageFilter parser | `core/parsers/garbageFilter.ts` | `__tests__/garbageFilter.test.ts` |
| 7 | parsePrice parser | `core/parsers/parsePrice.ts` | `__tests__/parsePrice.test.ts` |
| 8 | parseDescription parser | `core/parsers/parseDescription.ts` | `__tests__/parseDescription.test.ts` |
| 9 | parseAdvantages parser | `core/parsers/parseAdvantages.ts` | `__tests__/parseAdvantages.test.ts` |
| 10 | parseSpecifications parser | `core/parsers/parseSpecifications.ts` | `__tests__/parseSpecifications.test.ts` |
| 11 | parseVariants parser | `core/parsers/parseVariants.ts` | `__tests__/parseVariants.test.ts` |
| 12 | parseImages parser | `core/parsers/parseImages.ts` | `__tests__/parseImages.test.ts` |
| 13 | parseDocuments parser | `core/parsers/parseDocuments.ts` | `__tests__/parseDocuments.test.ts` |
| 14 | Module prompts | `core/prompts.ts` | `__tests__/prompts.test.ts` |
| 15 | fetchPage wrapper | `core/fetchPage.ts` | `__tests__/fetchPage.test.ts` |
| 16 | extractCanonical (LLM call + Zod validation + retry) | `core/extractCanonical.ts` | `__tests__/extractCanonical.test.ts` |
| 17 | Projecteurs canonical→Excel | `core/canonicalProjectors.ts` | `__tests__/canonicalProjectors.test.ts` |
| 18 | Smoke test bout-en-bout sur fixture markdown | `__tests__/integration.test.ts` | — |

---

## File Structure (phase 1 cible)

```
src/features/scraping/core/
├── canonicalSchema.ts         # Zod schema EnrichedProduct (source de vérité)
├── prompts.ts                 # SYSTEM_PROMPT + buildExtractPrompt
├── extractCanonical.ts        # LLM call + Zod validation + retry
├── canonicalProjectors.ts     # productToSheetRow, productsToSheet
├── fetchPage.ts               # Jina Reader + Cloud Function fallback
├── bundleSources.ts           # multi-page bundle (depuis scrapeBundle.ts)
├── relatedUrls.ts             # découverte tabs/PDFs/subpages (déplacé)
├── debug.ts                   # debug log (déplacé depuis scraping-hub)
├── parsers/
│   ├── garbageFilter.ts       # isGarbageContent + isMainlyGarbage
│   ├── parsePrice.ts          # "299,00 €" → { amount, currency, raw }
│   ├── parseDescription.ts    # parseDescriptionFromMarkdown
│   ├── parseAdvantages.ts     # parseAdvantagesFromMarkdown + mergeGroupsIntoAdvantages
│   ├── parseSpecifications.ts # parseSpecsFromMarkdown + extractCharacteristicsBlobs + parseCharacteristicsBlob + extractSpecsFromHtml
│   ├── parseVariants.ts       # parseVariantsFromMarkdown + helpers
│   ├── parseImages.ts         # parseImagesFromMarkdown + canonicalizeImageUrl + isJunkImageUrl + imageStem
│   └── parseDocuments.ts      # filterDocumentsByProductRef + cleanDocumentName + extractNameFromUrl + humanizeName + deduplicateDocuments
└── __tests__/
    ├── canonicalSchema.test.ts
    ├── prompts.test.ts
    ├── extractCanonical.test.ts
    ├── canonicalProjectors.test.ts
    ├── fetchPage.test.ts
    ├── garbageFilter.test.ts
    ├── parsePrice.test.ts
    ├── parseDescription.test.ts
    ├── parseAdvantages.test.ts
    ├── parseSpecifications.test.ts
    ├── parseVariants.test.ts
    ├── parseImages.test.ts
    ├── parseDocuments.test.ts
    └── integration.test.ts
```

**Conventions :**
- Tous les modules dans `core/` exportent des **fonctions pures** (pas de hooks React, pas de state global). Les hooks et le store viennent en Phase 2.
- Chaque parser prend en entrée du markdown ou du HTML (string), retourne la portion typée du `EnrichedProduct` qu'il extrait.
- Tous les tests utilisent **Vitest** (déjà installé, voir `package.json`).
- Imports : `import { x } from '@/features/scraping/core/...'`.

---

### Task 1: Bootstrap — créer l'arborescence et installer la dépendance

**Files:**
- Create: `src/features/scraping/core/` (dossier, vide pour l'instant)
- Create: `src/features/scraping/core/parsers/` (dossier)
- Create: `src/features/scraping/core/__tests__/` (dossier)
- Modify: `package.json` (ajouter `zod-to-json-schema`)

- [ ] **Step 1 : Créer les dossiers**

```bash
mkdir -p src/features/scraping/core/parsers
mkdir -p src/features/scraping/core/__tests__
```

- [ ] **Step 2 : Vérifier que zod et vitest sont installés**

```bash
grep -E '"zod"|"vitest"' package.json
```

Expected: les deux apparaissent dans `dependencies` et `devDependencies` respectivement.

- [ ] **Step 3 : Installer zod-to-json-schema (utilisé pour générer le JSON Schema envoyé au LLM)**

```bash
pnpm add zod-to-json-schema
```

(Si le projet utilise npm/yarn, adapter — vérifier avec `cat package-lock.json 2>/dev/null && echo npm || cat yarn.lock 2>/dev/null && echo yarn || echo pnpm`.)

- [ ] **Step 4 : Vérifier l'installation**

```bash
node -e "console.log(require('zod-to-json-schema').name)"
```

Expected: `zodToJsonSchema` (ou similaire).

- [ ] **Step 5 : Commit**

```bash
git add package.json pnpm-lock.yaml src/features/scraping/core/
git commit -m "chore(scraping): bootstrap core module structure"
```

---

### Task 2: Schéma canonique `EnrichedProduct`

**Files:**
- Create: `src/features/scraping/core/canonicalSchema.ts`
- Create: `src/features/scraping/core/__tests__/canonicalSchema.test.ts`

- [ ] **Step 1 : Écrire le test (failing)**

```typescript
// src/features/scraping/core/__tests__/canonicalSchema.test.ts
import { describe, it, expect } from 'vitest'
import { EnrichedProductSchema } from '../canonicalSchema'

describe('EnrichedProductSchema', () => {
  const minimal = {
    url: 'https://example.com/p/1',
    scrapedAt: 1714400000000,
    identity: { name: 'Perceuse 18V', reference: null, brand: null, ean: null, breadcrumb: [] },
    marketing: { subtitle: null, description: null, advantages: [] },
    commercial: { price: null, availability: null },
    specifications: [],
    variants: [],
    media: { images: [], documents: [] },
    meta: { sourcesScraped: ['https://example.com/p/1'], llmModel: 'gemini-3.1-pro-preview', llmProvider: 'gemini' as const, warnings: [] },
  }

  it('valide un produit minimal complet', () => {
    expect(() => EnrichedProductSchema.parse(minimal)).not.toThrow()
  })

  it('rejette une URL invalide', () => {
    expect(() => EnrichedProductSchema.parse({ ...minimal, url: 'not-a-url' })).toThrow()
  })

  it('rejette un nom manquant', () => {
    const bad = { ...minimal, identity: { ...minimal.identity, name: undefined } }
    expect(() => EnrichedProductSchema.parse(bad)).toThrow()
  })

  it('accepte des specs groupées', () => {
    const withSpecs = { ...minimal, specifications: [
      { group: 'Moteur', name: 'Tension', value: '18 V' },
      { group: 'Moteur', name: 'Puissance', value: '500 W' },
    ] }
    expect(() => EnrichedProductSchema.parse(withSpecs)).not.toThrow()
  })

  it('accepte un prix structuré', () => {
    const withPrice = { ...minimal, commercial: {
      price: { amount: 299, currency: 'EUR', raw: '299,00 €' },
      availability: 'En stock',
    } }
    expect(() => EnrichedProductSchema.parse(withPrice)).not.toThrow()
  })

  it('accepte llmProvider claude/gemini/openai uniquement', () => {
    const bad = { ...minimal, meta: { ...minimal.meta, llmProvider: 'mistral' as unknown as 'claude' } }
    expect(() => EnrichedProductSchema.parse(bad)).toThrow()
  })
})
```

- [ ] **Step 2 : Lancer le test (FAIL)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/canonicalSchema.test.ts
```

Expected: FAIL — `Cannot find module '../canonicalSchema'`.

- [ ] **Step 3 : Implémenter le schéma**

```typescript
// src/features/scraping/core/canonicalSchema.ts
import { z } from 'zod'

export const EnrichedProductSchema = z.object({
  url: z.string().url(),
  scrapedAt: z.number(),

  identity: z.object({
    name: z.string().min(1),
    reference: z.string().nullable(),
    brand: z.string().nullable(),
    ean: z.string().nullable(),
    breadcrumb: z.array(z.string()).default([]),
  }),

  marketing: z.object({
    subtitle: z.string().nullable(),
    description: z.string().nullable(),
    advantages: z.array(z.object({
      text: z.string(),
      group: z.string().optional(),
    })).default([]),
  }),

  commercial: z.object({
    price: z.object({
      amount: z.number().nullable(),
      currency: z.string().default('EUR'),
      raw: z.string(),
    }).nullable(),
    availability: z.string().nullable(),
  }),

  specifications: z.array(z.object({
    group: z.string(),
    name: z.string(),
    value: z.string(),
  })).default([]),

  variants: z.array(z.object({
    reference: z.string(),
    label: z.string(),
    properties: z.record(z.string()),
  })).default([]),

  media: z.object({
    images: z.array(z.string().url()).default([]),
    documents: z.array(z.object({
      name: z.string(),
      url: z.string().url(),
    })).default([]),
  }),

  meta: z.object({
    sourcesScraped: z.array(z.string()),
    llmModel: z.string(),
    llmProvider: z.enum(['claude', 'gemini', 'openai']),
    warnings: z.array(z.string()).default([]),
  }),
})

export type EnrichedProduct = z.infer<typeof EnrichedProductSchema>
```

- [ ] **Step 4 : Lancer le test (PASS)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/canonicalSchema.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/features/scraping/core/canonicalSchema.ts src/features/scraping/core/__tests__/canonicalSchema.test.ts
git commit -m "feat(scraping): canonical EnrichedProduct schema (Zod)"
```

---

### Task 3: Déplacer le debug log vers `core/debug.ts`

**Files:**
- Create: `src/features/scraping/core/debug.ts` (copie de `src/features/scraping-hub/debugLog.ts`)
- Modify: imports dans `src/features/scraping/useJina.ts` (ligne 7) et `src/features/excel/ai-enrichment/useProductEnrichment.ts` (ligne 11) — **NE PAS MODIFIER** en phase 1, on duplique. La suppression se fera en phase 4.

> **Note importante** : ce déplacement est un *copy*, pas un *move*. L'ancien `scraping-hub/debugLog.ts` reste utilisé par `RulesTab.tsx`, `DebugTab.tsx`, etc. — on ne le supprime pas avant la phase 4.

- [ ] **Step 1 : Lire l'existant**

```bash
cat src/features/scraping-hub/debugLog.ts
```

Lire le fichier (~60 l). Note : il exporte `appendDebugEntry`, `genId`, `subscribeDebug`, `getDebugEntries`, `clearDebug`, et probablement un type `DebugEntry`.

- [ ] **Step 2 : Copier le contenu vers `core/debug.ts`**

```bash
cp src/features/scraping-hub/debugLog.ts src/features/scraping/core/debug.ts
```

- [ ] **Step 3 : Vérifier que le typecheck passe**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: aucune erreur (le nouveau fichier est isolé, ne change rien).

- [ ] **Step 4 : Commit**

```bash
git add src/features/scraping/core/debug.ts
git commit -m "chore(scraping): copy debugLog to core/debug.ts (parallel)"
```

---

### Task 4: Déplacer `scrapeBundle.ts` vers `core/bundleSources.ts`

**Files:**
- Create: `src/features/scraping/core/bundleSources.ts` (copie de `src/features/excel/ai-enrichment/scrapeBundle.ts`)
- Create: `src/features/scraping/core/__tests__/bundleSources.test.ts` (copie de `scrapeBundle.test.ts`, imports adaptés)

> **Note** : copie, pas move. L'ancien reste utilisé par `useProductEnrichment.ts` jusqu'en phase 3.

- [ ] **Step 1 : Copier le source**

```bash
cp src/features/excel/ai-enrichment/scrapeBundle.ts src/features/scraping/core/bundleSources.ts
cp src/features/excel/ai-enrichment/scrapeBundle.test.ts src/features/scraping/core/__tests__/bundleSources.test.ts
```

- [ ] **Step 2 : Adapter l'import dans le test**

```typescript
// Dans src/features/scraping/core/__tests__/bundleSources.test.ts, remplacer :
//   import { scrapeProductBundle } from './scrapeBundle'
// par :
//   import { scrapeProductBundle } from '../bundleSources'
```

Utiliser l'éditeur (Edit tool) pour faire ce remplacement.

- [ ] **Step 3 : Adapter les imports relatifs dans `bundleSources.ts`**

Le fichier importe `discoverRelatedUrls` depuis `./relatedUrls`. Pour l'instant on ne déplace pas encore `relatedUrls`, donc on adapte :

```typescript
// Dans src/features/scraping/core/bundleSources.ts, remplacer :
//   import { discoverRelatedUrls, type RelatedUrls } from './relatedUrls'
// par :
//   import { discoverRelatedUrls, type RelatedUrls } from '@/features/excel/ai-enrichment/relatedUrls'
```

(On corrigera après Task 5 quand `relatedUrls` aura été déplacé aussi.)

- [ ] **Step 4 : Lancer les tests**

```bash
pnpm vitest run src/features/scraping/core/__tests__/bundleSources.test.ts
```

Expected: PASS (mêmes tests que l'original).

- [ ] **Step 5 : Commit**

```bash
git add src/features/scraping/core/bundleSources.ts src/features/scraping/core/__tests__/bundleSources.test.ts
git commit -m "chore(scraping): copy scrapeBundle to core/bundleSources.ts"
```

---

### Task 5: Déplacer `relatedUrls.ts` vers `core/relatedUrls.ts`

**Files:**
- Create: `src/features/scraping/core/relatedUrls.ts` (copie de `src/features/excel/ai-enrichment/relatedUrls.ts`)
- Create: `src/features/scraping/core/__tests__/relatedUrls.test.ts` (copie du test existant)
- Modify: `src/features/scraping/core/bundleSources.ts` — l'import `relatedUrls` repointe vers le nouveau fichier local

- [ ] **Step 1 : Copier**

```bash
cp src/features/excel/ai-enrichment/relatedUrls.ts src/features/scraping/core/relatedUrls.ts
cp src/features/excel/ai-enrichment/relatedUrls.test.ts src/features/scraping/core/__tests__/relatedUrls.test.ts
```

- [ ] **Step 2 : Adapter l'import du test**

```typescript
// Dans src/features/scraping/core/__tests__/relatedUrls.test.ts :
// remplacer  import { discoverRelatedUrls } from './relatedUrls'
// par         import { discoverRelatedUrls } from '../relatedUrls'
```

- [ ] **Step 3 : Repointer l'import dans `bundleSources.ts` vers le local**

```typescript
// Dans src/features/scraping/core/bundleSources.ts :
// remplacer  import { discoverRelatedUrls, type RelatedUrls } from '@/features/excel/ai-enrichment/relatedUrls'
// par         import { discoverRelatedUrls, type RelatedUrls } from './relatedUrls'
```

- [ ] **Step 4 : Lancer tous les tests core**

```bash
pnpm vitest run src/features/scraping/core/__tests__/
```

Expected: PASS (canonicalSchema + bundleSources + relatedUrls).

- [ ] **Step 5 : Commit**

```bash
git add src/features/scraping/core/relatedUrls.ts src/features/scraping/core/__tests__/relatedUrls.test.ts src/features/scraping/core/bundleSources.ts
git commit -m "chore(scraping): copy relatedUrls to core/, repoint bundleSources"
```

---

### Task 6: Parser `garbageFilter`

**Files:**
- Create: `src/features/scraping/core/parsers/garbageFilter.ts`
- Create: `src/features/scraping/core/__tests__/garbageFilter.test.ts`

**Source à extraire** : `src/features/excel/ai-enrichment/useProductEnrichment.ts` lignes 44-46 (regex `GARBAGE_RE`), 49-51 (`isGarbageContent`), 233-256 (`isMainlyGarbage`).

- [ ] **Step 1 : Écrire les tests**

```typescript
// src/features/scraping/core/__tests__/garbageFilter.test.ts
import { describe, it, expect } from 'vitest'
import { isGarbageContent, isMainlyGarbage } from '../parsers/garbageFilter'

describe('isGarbageContent', () => {
  it('détecte un bandeau cookies', () => {
    expect(isGarbageContent('We use cookies to improve your experience')).toBe(true)
  })

  it('détecte une mention GDPR française', () => {
    expect(isGarbageContent('Politique de confidentialité — Préférences cookies')).toBe(true)
  })

  it('détecte reCAPTCHA', () => {
    expect(isGarbageContent('Please complete the reCAPTCHA below')).toBe(true)
  })

  it('laisse passer un texte produit normal', () => {
    expect(isGarbageContent('Perceuse-visseuse 18V avec batterie Li-Ion')).toBe(false)
  })

  it('détecte OneTrust / Cookiebot', () => {
    expect(isGarbageContent('Powered by OneTrust')).toBe(true)
    expect(isGarbageContent('Cookiebot consent manager')).toBe(true)
  })
})

describe('isMainlyGarbage', () => {
  it('renvoie true si > 50% des lignes sont garbage', () => {
    const text = [
      'Cookie banner',
      'Accept all cookies',
      'Reject all',
      'Manage preferences',
      'Perceuse 18V',
    ].join('\n')
    expect(isMainlyGarbage(text)).toBe(true)
  })

  it('renvoie false sur du texte produit', () => {
    const text = [
      'Perceuse-visseuse compacte',
      'Batterie 18V Li-Ion incluse',
      'Couple maxi 60 Nm',
      'Mandrin auto-serrant 13 mm',
    ].join('\n')
    expect(isMainlyGarbage(text)).toBe(false)
  })

  it('renvoie false sur texte vide', () => {
    expect(isMainlyGarbage('')).toBe(false)
  })
})
```

- [ ] **Step 2 : Lancer (FAIL)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/garbageFilter.test.ts
```

Expected: FAIL — module introuvable.

- [ ] **Step 3 : Lire le source à extraire**

```bash
sed -n '44,52p;233,257p' src/features/excel/ai-enrichment/useProductEnrichment.ts
```

(Note : on utilise `sed -n` ici uniquement pour lecture, pas pour modification. Lire le contenu pour l'extraire textuellement.)

- [ ] **Step 4 : Implémenter `garbageFilter.ts`**

Copier le contenu lu à l'étape 3 dans le nouveau fichier, en remplaçant `function isGarbageContent` par `export function isGarbageContent` et idem pour `isMainlyGarbage`. Garder la regex `GARBAGE_RE` et le commentaire JSDoc associés.

```typescript
// src/features/scraping/core/parsers/garbageFilter.ts

/** Regex couvrant cookies, GDPR, reCAPTCHA, consent managers (FR + EN). */
const GARBAGE_RE = /<<COPIER LA REGEX EXACTE DEPUIS useProductEnrichment.ts:46>>/i

/** Détecte si un texte est du contenu parasite (cookie banner, GDPR, reCAPTCHA). */
export function isGarbageContent(text: string): boolean {
  return GARBAGE_RE.test(text)
}

/** Renvoie true si > 50 % des lignes non-vides du texte sont du garbage. */
export function isMainlyGarbage(text: string): boolean {
  // <<COPIER LA LOGIQUE EXACTE DEPUIS useProductEnrichment.ts:233-256>>
}
```

> **Important** : ne pas paraphraser la regex. Recopier au caractère près pour préserver le comportement (le regex couvre 30+ termes spécifiques).

- [ ] **Step 5 : Lancer (PASS)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/garbageFilter.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 6 : Commit**

```bash
git add src/features/scraping/core/parsers/garbageFilter.ts src/features/scraping/core/__tests__/garbageFilter.test.ts
git commit -m "feat(scraping): extract garbageFilter parser to core/"
```

---

### Task 7: Parser `parsePrice`

**Files:**
- Create: `src/features/scraping/core/parsers/parsePrice.ts`
- Create: `src/features/scraping/core/__tests__/parsePrice.test.ts`

**Note** : aucune fonction parsePrice n'existe dans le code actuel — le prix est stocké en string brute. On la crée.

- [ ] **Step 1 : Écrire les tests**

```typescript
// src/features/scraping/core/__tests__/parsePrice.test.ts
import { describe, it, expect } from 'vitest'
import { parsePrice } from '../parsers/parsePrice'

describe('parsePrice', () => {
  it('parse "299,00 €"', () => {
    expect(parsePrice('299,00 €')).toEqual({ amount: 299, currency: 'EUR', raw: '299,00 €' })
  })

  it('parse "1 299,99 €"', () => {
    expect(parsePrice('1 299,99 €')).toEqual({ amount: 1299.99, currency: 'EUR', raw: '1 299,99 €' })
  })

  it('parse "$1,299.99"', () => {
    expect(parsePrice('$1,299.99')).toEqual({ amount: 1299.99, currency: 'USD', raw: '$1,299.99' })
  })

  it('parse "£99.50"', () => {
    expect(parsePrice('£99.50')).toEqual({ amount: 99.5, currency: 'GBP', raw: '£99.50' })
  })

  it('parse une valeur sans symbole comme EUR par défaut', () => {
    expect(parsePrice('99.50')).toEqual({ amount: 99.5, currency: 'EUR', raw: '99.50' })
  })

  it('garde raw si amount illisible', () => {
    expect(parsePrice('À partir de 99 €')).toEqual({ amount: 99, currency: 'EUR', raw: 'À partir de 99 €' })
  })

  it('renvoie null pour une chaîne vide', () => {
    expect(parsePrice('')).toBeNull()
  })

  it('renvoie null si aucun nombre détectable', () => {
    expect(parsePrice('Sur devis')).toEqual({ amount: null, currency: 'EUR', raw: 'Sur devis' })
  })
})
```

- [ ] **Step 2 : Lancer (FAIL)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parsePrice.test.ts
```

Expected: FAIL.

- [ ] **Step 3 : Implémenter**

```typescript
// src/features/scraping/core/parsers/parsePrice.ts

const CURRENCY_SYMBOLS: Record<string, string> = {
  '€': 'EUR', 'EUR': 'EUR',
  '$': 'USD', 'USD': 'USD',
  '£': 'GBP', 'GBP': 'GBP',
  '¥': 'JPY', 'JPY': 'JPY',
  'CHF': 'CHF',
}

export interface ParsedPrice {
  amount: number | null
  currency: string
  raw: string
}

/**
 * Parse une chaîne prix en `{ amount, currency, raw }`.
 * - Détecte la devise via symbole ou code ISO.
 * - Gère le format français (`1 299,99 €`) et anglo-saxon (`$1,299.99`).
 * - Retourne null si la chaîne est vide.
 * - Retourne `{ amount: null, currency: 'EUR', raw }` si aucun nombre détectable
 *   (ex: « Sur devis ») — utile pour préserver l'info brute.
 */
export function parsePrice(input: string): ParsedPrice | null {
  const raw = input.trim()
  if (!raw) return null

  let currency = 'EUR'
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (raw.includes(sym)) { currency = code; break }
  }

  // Capture le premier groupe numérique : 1 299,99 | 1,299.99 | 299 | 99.50
  const m = raw.match(/(\d{1,3}(?:[ .,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/)
  if (!m) return { amount: null, currency, raw }

  let numStr = m[1].replace(/\s/g, '')
  // Si la chaîne contient à la fois des virgules et des points, considérer
  // le dernier comme séparateur décimal et l'autre comme milliers.
  const hasComma = numStr.includes(',')
  const hasDot = numStr.includes('.')
  if (hasComma && hasDot) {
    const lastComma = numStr.lastIndexOf(',')
    const lastDot = numStr.lastIndexOf('.')
    if (lastComma > lastDot) numStr = numStr.replace(/\./g, '').replace(',', '.')
    else numStr = numStr.replace(/,/g, '')
  } else if (hasComma) {
    // Format français : "1299,99" → "1299.99" ; ou milliers "1,299" → ambigu, garde la virgule comme décimale
    numStr = numStr.replace(',', '.')
  }
  // hasDot only → déjà bon

  const amount = Number(numStr)
  return { amount: Number.isFinite(amount) ? amount : null, currency, raw }
}
```

- [ ] **Step 4 : Lancer (PASS)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parsePrice.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/features/scraping/core/parsers/parsePrice.ts src/features/scraping/core/__tests__/parsePrice.test.ts
git commit -m "feat(scraping): parsePrice parser (FR + anglo-saxon)"
```

---

### Task 8: Parser `parseDescription`

**Files:**
- Create: `src/features/scraping/core/parsers/parseDescription.ts`
- Create: `src/features/scraping/core/__tests__/parseDescription.test.ts`

**Source à extraire** : `useProductEnrichment.ts` ligne 2592 (`parseDescriptionFromMarkdown`) jusqu'à environ la ligne 2745.

- [ ] **Step 1 : Lire le source existant pour comprendre la signature et les heuristiques**

```bash
sed -n '2592,2744p' src/features/excel/ai-enrichment/useProductEnrichment.ts
```

Lire la fonction. Noter :
- Sa signature exacte (probablement `(md: string): string`)
- Les regex et patterns utilisés (sections markdown, début après le titre, fin avant les specs)
- Les imports/helpers internes utilisés (s'il y en a, les noter pour les recopier aussi)

- [ ] **Step 2 : Écrire les tests**

```typescript
// src/features/scraping/core/__tests__/parseDescription.test.ts
import { describe, it, expect } from 'vitest'
import { parseDescriptionFromMarkdown } from '../parsers/parseDescription'

const SAMPLE_MD_1 = `# Perceuse 18V

Perceuse-visseuse compacte 18V avec batterie Li-Ion intégrée. Idéale pour les
professionnels du bâtiment.

## Caractéristiques techniques

| Tension | 18 V |
| Couple maxi | 60 Nm |
`

const SAMPLE_MD_2 = `# Visseuse à chocs

## Description

Visseuse à chocs 18V haute performance. Couple impressionnant de 250 Nm.

## Avantages

- Robuste
- Compacte
`

const SAMPLE_NO_DESC = `# Produit X

## Spécifications

| Poids | 1.5 kg |
`

describe('parseDescriptionFromMarkdown', () => {
  it('extrait le paragraphe sous le H1 quand pas de section dédiée', () => {
    const desc = parseDescriptionFromMarkdown(SAMPLE_MD_1)
    expect(desc).toContain('Perceuse-visseuse compacte 18V')
    expect(desc).not.toContain('Caractéristiques')
  })

  it('extrait la section "## Description" si présente', () => {
    const desc = parseDescriptionFromMarkdown(SAMPLE_MD_2)
    expect(desc).toContain('haute performance')
    expect(desc).not.toContain('Robuste')
  })

  it('renvoie chaîne vide si pas de description', () => {
    const desc = parseDescriptionFromMarkdown(SAMPLE_NO_DESC)
    expect(desc).toBe('')
  })

  it('ignore les bandeaux cookies', () => {
    const md = '# Produit\n\nWe use cookies. Accept all cookies. Manage preferences.\n\n## Specs\n'
    expect(parseDescriptionFromMarkdown(md)).toBe('')
  })
})
```

- [ ] **Step 3 : Lancer (FAIL)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parseDescription.test.ts
```

- [ ] **Step 4 : Implémenter**

Copier la fonction `parseDescriptionFromMarkdown` lue à l'étape 1, en :
- ajoutant `export` devant la déclaration
- adaptant les imports (importer `isMainlyGarbage` depuis `./garbageFilter` si elle est utilisée)

```typescript
// src/features/scraping/core/parsers/parseDescription.ts
import { isMainlyGarbage } from './garbageFilter'

/**
 * Extrait la description marketing d'un produit depuis du markdown.
 * Stratégie (héritée de useProductEnrichment.ts) :
 *   1. Chercher une section "## Description" / "## À propos" en priorité
 *   2. Sinon, premier paragraphe non-titre après le H1
 *   3. Filtrer les bandeaux cookies (isMainlyGarbage)
 *   4. Couper avant la première section "Spécifications" / "Caractéristiques"
 */
export function parseDescriptionFromMarkdown(md: string): string {
  // <<COPIER LA LOGIQUE EXACTE DEPUIS useProductEnrichment.ts:2592-2744>>
}
```

- [ ] **Step 5 : Lancer (PASS)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parseDescription.test.ts
```

Si certains tests échouent : vérifier que la regex extraite est identique au source. Les tests sont délibérément simples — si la fonction extrait *plus* de texte que prévu, c'est OK tant qu'elle respecte les invariants (pas de section "Caractéristiques" dans le résultat).

- [ ] **Step 6 : Commit**

```bash
git add src/features/scraping/core/parsers/parseDescription.ts src/features/scraping/core/__tests__/parseDescription.test.ts
git commit -m "feat(scraping): extract parseDescription parser to core/"
```

---

### Task 9: Parser `parseAdvantages`

**Files:**
- Create: `src/features/scraping/core/parsers/parseAdvantages.ts`
- Create: `src/features/scraping/core/__tests__/parseAdvantages.test.ts`

**Source à extraire** : `useProductEnrichment.ts` lignes 58-90 (`mergeGroupsIntoAdvantages`) et 3102 jusqu'à environ 3236 (`parseAdvantagesFromMarkdown`).

- [ ] **Step 1 : Lire le source**

```bash
sed -n '58,90p;3102,3236p' src/features/excel/ai-enrichment/useProductEnrichment.ts
```

- [ ] **Step 2 : Écrire les tests**

```typescript
// src/features/scraping/core/__tests__/parseAdvantages.test.ts
import { describe, it, expect } from 'vitest'
import { parseAdvantagesFromMarkdown, mergeGroupsIntoAdvantages } from '../parsers/parseAdvantages'

const MD_FLAT = `## Points forts

- Robuste et durable
- Compacte
- Batterie longue durée
`

const MD_GROUPED = `## Avantages performance

- Couple maxi 250 Nm
- 3 vitesses

## Avantages confort

- Poignée ergonomique
- LED intégrée
`

describe('parseAdvantagesFromMarkdown', () => {
  it('extrait une liste plate sans groupes', () => {
    const advs = parseAdvantagesFromMarkdown(MD_FLAT)
    expect(advs).toHaveLength(3)
    expect(advs[0]).toEqual({ text: 'Robuste et durable' })
  })

  it('extrait avec groupes quand sections multiples', () => {
    const advs = parseAdvantagesFromMarkdown(MD_GROUPED)
    expect(advs).toHaveLength(4)
    expect(advs.find(a => a.text.includes('Couple maxi'))).toMatchObject({ group: expect.stringContaining('performance') })
    expect(advs.find(a => a.text.includes('Poignée'))).toMatchObject({ group: expect.stringContaining('confort') })
  })

  it('renvoie tableau vide si pas d\'avantages', () => {
    expect(parseAdvantagesFromMarkdown('# Produit\n\nDescription seulement')).toEqual([])
  })
})

describe('mergeGroupsIntoAdvantages', () => {
  it('ajoute les groupes sans supprimer d\'items existants', () => {
    const existing = [{ text: 'Robuste' }, { text: 'Compacte' }]
    const md = [{ text: 'Robuste', group: 'Performance' }, { text: 'Légère', group: 'Confort' }]
    const merged = mergeGroupsIntoAdvantages(existing, md)
    expect(merged).toHaveLength(3)
    expect(merged.find(a => a.text === 'Robuste')).toMatchObject({ group: 'Performance' })
    expect(merged.find(a => a.text === 'Compacte')).toBeDefined()
    expect(merged.find(a => a.text === 'Légère')).toMatchObject({ group: 'Confort' })
  })

  it('ne duplique pas un item déjà présent', () => {
    const existing = [{ text: 'Robuste' }]
    const md = [{ text: 'Robuste', group: 'Performance' }]
    const merged = mergeGroupsIntoAdvantages(existing, md)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ text: 'Robuste', group: 'Performance' })
  })
})
```

- [ ] **Step 3 : Lancer (FAIL)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parseAdvantages.test.ts
```

- [ ] **Step 4 : Implémenter**

```typescript
// src/features/scraping/core/parsers/parseAdvantages.ts
import { isGarbageContent } from './garbageFilter'

export interface Advantage {
  text: string
  group?: string
}

/** Extrait une liste d'avantages/points forts depuis du markdown. */
export function parseAdvantagesFromMarkdown(md: string): Advantage[] {
  // <<COPIER LA LOGIQUE EXACTE DEPUIS useProductEnrichment.ts:3102-3236>>
}

/**
 * Fusionne les groupes du markdown dans les avantages existants par matching textuel.
 * Ne supprime JAMAIS d'items existants.
 */
export function mergeGroupsIntoAdvantages(
  existing: Advantage[],
  mdAdvantages: Advantage[],
): Advantage[] {
  // <<COPIER LA LOGIQUE EXACTE DEPUIS useProductEnrichment.ts:58-90>>
}
```

- [ ] **Step 5 : Lancer (PASS)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parseAdvantages.test.ts
```

- [ ] **Step 6 : Commit**

```bash
git add src/features/scraping/core/parsers/parseAdvantages.ts src/features/scraping/core/__tests__/parseAdvantages.test.ts
git commit -m "feat(scraping): extract parseAdvantages parser to core/"
```

---

### Task 10: Parser `parseSpecifications`

**Files:**
- Create: `src/features/scraping/core/parsers/parseSpecifications.ts`
- Create: `src/features/scraping/core/__tests__/parseSpecifications.test.ts`

**Source à extraire** : `useProductEnrichment.ts` ligne 991 (`extractSpecsFromHtml`), 2378 (`parseSpecsFromMarkdown`), 2889 (`extractCharacteristicsBlobs`), 2903 (`parseCharacteristicsBlob`), 2930 (`truncateBeforeNonProductSections`).

- [ ] **Step 1 : Lire le source des 5 fonctions**

```bash
sed -n '991,1100p;2378,2591p;2889,2937p' src/features/excel/ai-enrichment/useProductEnrichment.ts
```

- [ ] **Step 2 : Écrire les tests**

```typescript
// src/features/scraping/core/__tests__/parseSpecifications.test.ts
import { describe, it, expect } from 'vitest'
import { parseSpecsFromMarkdown, extractSpecsFromHtml } from '../parsers/parseSpecifications'

const MD_TABLE = `## Caractéristiques techniques

| Caractéristique | Valeur |
|---|---|
| Tension | 18 V |
| Couple maxi | 60 Nm |
| Poids | 1.5 kg |
`

const MD_GROUPED = `## Moteur

| Tension | 18 V |
| Puissance | 500 W |

## Batterie

| Capacité | 4 Ah |
| Type | Li-Ion |
`

const MD_INLINE = `## Spécifications

- Tension : 18 V
- Couple maxi : 60 Nm
- Poids : 1.5 kg
`

describe('parseSpecsFromMarkdown', () => {
  it('parse une table simple', () => {
    const specs = parseSpecsFromMarkdown(MD_TABLE)
    expect(specs).toHaveLength(3)
    expect(specs[0]).toEqual({ name: 'Tension', value: '18 V', group: expect.stringContaining('Caractéristiques') })
  })

  it('respecte les groupes quand sections multiples', () => {
    const specs = parseSpecsFromMarkdown(MD_GROUPED)
    const tensionSpec = specs.find(s => s.name === 'Tension')
    const capSpec = specs.find(s => s.name === 'Capacité')
    expect(tensionSpec?.group).toMatch(/Moteur/i)
    expect(capSpec?.group).toMatch(/Batterie/i)
  })

  it('parse des paires inline (- key : value)', () => {
    const specs = parseSpecsFromMarkdown(MD_INLINE)
    expect(specs).toHaveLength(3)
    expect(specs.find(s => s.name === 'Tension')?.value).toBe('18 V')
  })

  it('renvoie tableau vide si pas de specs', () => {
    expect(parseSpecsFromMarkdown('# Produit\n\nDescription')).toEqual([])
  })
})

describe('extractSpecsFromHtml', () => {
  it('extrait depuis un <table>', () => {
    const html = `<table><tr><th>Tension</th><td>18 V</td></tr></table>`
    const md = extractSpecsFromHtml(html)
    expect(md).toContain('Tension')
    expect(md).toContain('18 V')
  })

  it('renvoie null si pas de table exploitable', () => {
    expect(extractSpecsFromHtml('<div>nothing here</div>')).toBeNull()
  })
})
```

- [ ] **Step 3 : Lancer (FAIL)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parseSpecifications.test.ts
```

- [ ] **Step 4 : Implémenter**

```typescript
// src/features/scraping/core/parsers/parseSpecifications.ts

export interface Specification {
  group: string
  name: string
  value: string
}

/** Extrait les paires nom/valeur depuis un blob de "caractéristiques inline".
 *  Format attendu : "Clé : valeur ; Clé : valeur" ou "Clé: valeur, Clé: valeur". */
function parseCharacteristicsBlob(blob: string): Record<string, string> {
  // <<COPIER DEPUIS useProductEnrichment.ts:2903-2929>>
}

/** Trouve les blocs "Caractéristiques :" inline dans le markdown. */
function extractCharacteristicsBlobs(md: string): string[] {
  // <<COPIER DEPUIS useProductEnrichment.ts:2889-2902>>
}

/** Coupe le markdown avant les sections non-produit (Reviews, Avis, Promo, etc.). */
function truncateBeforeNonProductSections(md: string): string {
  // <<COPIER DEPUIS useProductEnrichment.ts:2930-2937>>
}

/** Parse les spécifications depuis du markdown (tables + paires inline + blobs caractéristiques). */
export function parseSpecsFromMarkdown(md: string): Specification[] {
  // <<COPIER DEPUIS useProductEnrichment.ts:2378-2591>>
}

/** Extrait du HTML les <table> de specs et les renvoie en markdown lisible. */
export function extractSpecsFromHtml(html: string): string | null {
  // <<COPIER DEPUIS useProductEnrichment.ts:991-1261>>
}
```

> **Note** : `parseSpecsFromMarkdown` est la fonction la plus longue du fichier (~213 l). Recopier intégralement, en exposant les helpers internes uniquement si nécessaire pour les tests.

- [ ] **Step 5 : Lancer (PASS)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parseSpecifications.test.ts
```

- [ ] **Step 6 : Commit**

```bash
git add src/features/scraping/core/parsers/parseSpecifications.ts src/features/scraping/core/__tests__/parseSpecifications.test.ts
git commit -m "feat(scraping): extract parseSpecifications parser to core/"
```

---

### Task 11: Parser `parseVariants`

**Files:**
- Create: `src/features/scraping/core/parsers/parseVariants.ts`
- Create: `src/features/scraping/core/__tests__/parseVariants.test.ts`

**Source à extraire** : `useProductEnrichment.ts` lignes 2745-2888 (`stripCellHeaderPrefix`, `isJunkCellValue`, `parseVariantsFromMarkdown`).

- [ ] **Step 1 : Lire le source**

```bash
sed -n '2745,2888p' src/features/excel/ai-enrichment/useProductEnrichment.ts
```

- [ ] **Step 2 : Écrire les tests**

```typescript
// src/features/scraping/core/__tests__/parseVariants.test.ts
import { describe, it, expect } from 'vitest'
import { parseVariantsFromMarkdown } from '../parsers/parseVariants'

const MD_TABLE_VARIANTS = `## Variantes

| Réf. | Libellé | Couleur | Capacité |
|---|---|---|---|
| M18-001 | Modèle compact | Rouge | 4 Ah |
| M18-002 | Modèle pro | Rouge | 6 Ah |
| M18-003 | Modèle pack | Rouge | 8 Ah |
`

const MD_BULLETS = `## Références disponibles

- M18-001 — Modèle compact
- M18-002 — Modèle pro
- M18-003 — Modèle pack
`

describe('parseVariantsFromMarkdown', () => {
  it('parse une table de variantes structurée', () => {
    const variants = parseVariantsFromMarkdown(MD_TABLE_VARIANTS)
    expect(variants).toHaveLength(3)
    expect(variants[0]).toEqual({
      reference: 'M18-001',
      label: 'Modèle compact',
      properties: { Couleur: 'Rouge', Capacité: '4 Ah' },
    })
  })

  it('parse des bullets "REF — Label"', () => {
    const variants = parseVariantsFromMarkdown(MD_BULLETS)
    expect(variants).toHaveLength(3)
    expect(variants[0].reference).toBe('M18-001')
    expect(variants[0].label).toBe('Modèle compact')
  })

  it('renvoie tableau vide si pas de variantes', () => {
    expect(parseVariantsFromMarkdown('# Produit')).toEqual([])
  })
})
```

- [ ] **Step 3 : Lancer (FAIL)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parseVariants.test.ts
```

- [ ] **Step 4 : Implémenter**

```typescript
// src/features/scraping/core/parsers/parseVariants.ts

export interface Variant {
  reference: string
  label: string
  properties: Record<string, string>
}

function stripCellHeaderPrefix(colName: string, val: string): string {
  // <<COPIER DEPUIS useProductEnrichment.ts:2745-2757>>
}

function isJunkCellValue(v: string): boolean {
  // <<COPIER DEPUIS useProductEnrichment.ts:2758-2764>>
}

/** Parse les variantes/déclinaisons d'un produit depuis du markdown. */
export function parseVariantsFromMarkdown(md: string): Variant[] {
  // <<COPIER DEPUIS useProductEnrichment.ts:2765-2888>>
}
```

- [ ] **Step 5 : Lancer (PASS)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parseVariants.test.ts
```

- [ ] **Step 6 : Commit**

```bash
git add src/features/scraping/core/parsers/parseVariants.ts src/features/scraping/core/__tests__/parseVariants.test.ts
git commit -m "feat(scraping): extract parseVariants parser to core/"
```

---

### Task 12: Parser `parseImages`

**Files:**
- Create: `src/features/scraping/core/parsers/parseImages.ts`
- Create: `src/features/scraping/core/__tests__/parseImages.test.ts`

**Source à extraire** : `useProductEnrichment.ts` lignes 2938-3101 (`imageStem`, `canonicalizeImageUrl`, `isJunkImageUrl`, `parseImagesFromMarkdown`).

- [ ] **Step 1 : Lire le source**

```bash
sed -n '2938,3101p' src/features/excel/ai-enrichment/useProductEnrichment.ts
```

- [ ] **Step 2 : Écrire les tests**

```typescript
// src/features/scraping/core/__tests__/parseImages.test.ts
import { describe, it, expect } from 'vitest'
import { parseImagesFromMarkdown, isJunkImageUrl, canonicalizeImageUrl } from '../parsers/parseImages'

describe('isJunkImageUrl', () => {
  it('rejette les pixels de tracking', () => {
    expect(isJunkImageUrl('https://example.com/tracker.gif?id=123')).toBe(true)
    expect(isJunkImageUrl('https://example.com/pixel.png?w=1&h=1')).toBe(true)
  })

  it('rejette les icônes de site', () => {
    expect(isJunkImageUrl('https://example.com/favicon.ico')).toBe(true)
    expect(isJunkImageUrl('https://example.com/logo.svg')).toBe(true)
  })

  it('accepte une vraie image produit', () => {
    expect(isJunkImageUrl('https://cdn.example.com/products/M18-001/main.jpg')).toBe(false)
  })
})

describe('canonicalizeImageUrl', () => {
  it('absolutise une URL relative', () => {
    expect(canonicalizeImageUrl('/img/p/123.jpg', 'https://example.com/p/x')).toBe('https://example.com/img/p/123.jpg')
  })

  it('garde une URL déjà absolue', () => {
    expect(canonicalizeImageUrl('https://cdn.example.com/p.jpg', 'https://example.com/')).toBe('https://cdn.example.com/p.jpg')
  })
})

describe('parseImagesFromMarkdown', () => {
  it('extrait les URLs ![]() du markdown', () => {
    const md = `![photo](https://cdn.example.com/p1.jpg)\n![autre](https://cdn.example.com/p2.png)`
    const imgs = parseImagesFromMarkdown(md, 'https://example.com/p/x')
    expect(imgs).toEqual(expect.arrayContaining([
      'https://cdn.example.com/p1.jpg',
      'https://cdn.example.com/p2.png',
    ]))
  })

  it('filtre les junks (favicon, pixel)', () => {
    const md = `![](https://example.com/favicon.ico)\n![](https://cdn.example.com/p1.jpg)`
    const imgs = parseImagesFromMarkdown(md, 'https://example.com/p/x')
    expect(imgs).toEqual(['https://cdn.example.com/p1.jpg'])
  })

  it('déduplique les URLs', () => {
    const md = `![a](https://cdn.example.com/p1.jpg)\n![b](https://cdn.example.com/p1.jpg)`
    const imgs = parseImagesFromMarkdown(md, 'https://example.com/p/x')
    expect(imgs).toHaveLength(1)
  })
})
```

- [ ] **Step 3 : Lancer (FAIL)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parseImages.test.ts
```

- [ ] **Step 4 : Implémenter**

```typescript
// src/features/scraping/core/parsers/parseImages.ts

/** Renvoie le stem (nom sans extension) d'une URL d'image. */
export function imageStem(url: string): string {
  // <<COPIER DEPUIS useProductEnrichment.ts:2938-2952>>
}

/** Absolutise et nettoie une URL d'image (params trackers retirés). */
export function canonicalizeImageUrl(url: string, baseUrl?: string): string {
  // <<COPIER DEPUIS useProductEnrichment.ts:2953-2973>>
  // ⚠ La signature originale prend juste url. On ajoute baseUrl optionnel
  // pour l'absolutisation (currently inline dans parseImagesFromMarkdown).
}

/** Détecte les URLs d'images parasites (favicon, pixels, logos). */
export function isJunkImageUrl(url: string): boolean {
  // <<COPIER DEPUIS useProductEnrichment.ts:2974-3004>>
}

/** Extrait toutes les URLs d'images produit depuis du markdown, dédupliquées. */
export function parseImagesFromMarkdown(md: string, baseUrl?: string): string[] {
  // <<COPIER DEPUIS useProductEnrichment.ts:3005-3101>>
}
```

> **Note signature `canonicalizeImageUrl`** : si la version originale ne prend pas `baseUrl`, garder la signature originale et faire l'absolutisation dans `parseImagesFromMarkdown` (à voir en lisant le code).

- [ ] **Step 5 : Lancer (PASS)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parseImages.test.ts
```

- [ ] **Step 6 : Commit**

```bash
git add src/features/scraping/core/parsers/parseImages.ts src/features/scraping/core/__tests__/parseImages.test.ts
git commit -m "feat(scraping): extract parseImages parser to core/"
```

---

### Task 13: Parser `parseDocuments`

**Files:**
- Create: `src/features/scraping/core/parsers/parseDocuments.ts`
- Create: `src/features/scraping/core/__tests__/parseDocuments.test.ts`

**Source à extraire** : `useProductEnrichment.ts` lignes 258-602 (`filterDocumentsByProductRef`, `cleanDocumentName`, `extractNameFromUrl`, `humanizeName`, `deduplicateDocuments`).

- [ ] **Step 1 : Lire le source**

```bash
sed -n '258,605p;2229,2244p' src/features/excel/ai-enrichment/useProductEnrichment.ts
```

- [ ] **Step 2 : Écrire les tests**

```typescript
// src/features/scraping/core/__tests__/parseDocuments.test.ts
import { describe, it, expect } from 'vitest'
import {
  cleanDocumentName,
  extractNameFromUrl,
  humanizeName,
  filterDocumentsByProductRef,
  deduplicateDocuments,
} from '../parsers/parseDocuments'

describe('humanizeName', () => {
  it('humanise un slug à tirets', () => {
    expect(humanizeName('fiche-technique-m18')).toBe('Fiche technique m18')
  })

  it('humanise un slug à underscores', () => {
    expect(humanizeName('notice_utilisation')).toBe('Notice utilisation')
  })
})

describe('extractNameFromUrl', () => {
  it('extrait le filename depuis une URL', () => {
    expect(extractNameFromUrl('https://example.com/docs/fiche-technique.pdf')).toContain('Fiche technique')
  })
})

describe('cleanDocumentName', () => {
  it('retire les extensions de fichier', () => {
    expect(cleanDocumentName('Fiche technique.pdf')).toBe('Fiche technique')
  })

  it('retire les codes produit en suffixe', () => {
    expect(cleanDocumentName('Notice — M18-001.pdf')).toMatch(/Notice/i)
  })
})

describe('deduplicateDocuments', () => {
  it('déduplique par URL', () => {
    const docs = [
      'https://example.com/doc.pdf',
      'https://example.com/doc.pdf',
      'https://example.com/autre.pdf',
    ]
    expect(deduplicateDocuments(docs)).toHaveLength(2)
  })
})

describe('filterDocumentsByProductRef', () => {
  it('garde les PDFs dont le path contient la référence', () => {
    const docs = [
      'https://example.com/docs/M18-001-notice.pdf',
      'https://example.com/docs/M99-999-other.pdf',
    ]
    const filtered = filterDocumentsByProductRef(docs, ['M18-001'])
    expect(filtered).toEqual(['https://example.com/docs/M18-001-notice.pdf'])
  })

  it('renvoie tous les docs si aucune ref fournie', () => {
    const docs = ['https://example.com/a.pdf', 'https://example.com/b.pdf']
    expect(filterDocumentsByProductRef(docs, [])).toEqual(docs)
  })
})
```

- [ ] **Step 3 : Lancer (FAIL)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parseDocuments.test.ts
```

- [ ] **Step 4 : Implémenter**

```typescript
// src/features/scraping/core/parsers/parseDocuments.ts

/** Filtre les documents PDF non-pertinents pour le produit (référencé par REF). */
export function filterDocumentsByProductRef(docs: string[], productRefs: string[]): string[] {
  // <<COPIER DEPUIS useProductEnrichment.ts:258-305>>
}

/** Nettoie un nom de document (retire extensions, codes en suffixe, etc.). */
export function cleanDocumentName(doc: string): string {
  // <<COPIER DEPUIS useProductEnrichment.ts:398-418>>
}

/** Extrait un nom lisible depuis l'URL d'un document. */
export function extractNameFromUrl(url: string): string {
  // <<COPIER DEPUIS useProductEnrichment.ts:419-444>>
}

/** Humanise un slug en titre lisible (premier-en-majuscule, tirets en espaces). */
export function humanizeName(slug: string): string {
  // <<COPIER DEPUIS useProductEnrichment.ts:445-602>>
}

/** Déduplique une liste d'URLs de documents. */
export function deduplicateDocuments(docs: string[]): string[] {
  // <<COPIER DEPUIS useProductEnrichment.ts:2229-2244>>
}
```

> **Note** : `humanizeName` peut être longue (157 l selon l'estimation) — c'est probablement un dictionnaire de remplacements. Recopier intégralement, ne pas refactorer.

- [ ] **Step 5 : Lancer (PASS)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/parseDocuments.test.ts
```

- [ ] **Step 6 : Commit**

```bash
git add src/features/scraping/core/parsers/parseDocuments.ts src/features/scraping/core/__tests__/parseDocuments.test.ts
git commit -m "feat(scraping): extract parseDocuments parser to core/"
```

---

### Task 14: Module `prompts.ts`

**Files:**
- Create: `src/features/scraping/core/prompts.ts`
- Create: `src/features/scraping/core/__tests__/prompts.test.ts`

**Note** : la fonction `buildEnrichmentPrompt` existante (`src/features/scraping-templates/buildEnrichmentPrompt.ts`, 26 l) est trop simple et tournée vers les templates. On écrit une nouvelle version.

- [ ] **Step 1 : Lire l'existant pour s'inspirer**

```bash
cat src/features/scraping-templates/buildEnrichmentPrompt.ts
sed -n '716,732p' src/features/scraping/useJina.ts  # EXTRACTION_SYSTEM_PROMPT
```

- [ ] **Step 2 : Écrire les tests**

```typescript
// src/features/scraping/core/__tests__/prompts.test.ts
import { describe, it, expect } from 'vitest'
import { SYSTEM_PROMPT, buildExtractPrompt } from '../prompts'

describe('SYSTEM_PROMPT', () => {
  it('mentionne les règles absolues clés', () => {
    expect(SYSTEM_PROMPT).toMatch(/français/i)
    expect(SYSTEM_PROMPT).toMatch(/n'invente/i)
    expect(SYSTEM_PROMPT).toMatch(/null/)
  })

  it('mentionne les groupes de specs', () => {
    expect(SYSTEM_PROMPT).toMatch(/group/i)
  })
})

describe('buildExtractPrompt', () => {
  it('inclut le SYSTEM_PROMPT', () => {
    const p = buildExtractPrompt({ isSingle: true })
    expect(p).toContain(SYSTEM_PROMPT)
  })

  it('mentionne le mode single quand isSingle=true', () => {
    const p = buildExtractPrompt({ isSingle: true })
    expect(p).toMatch(/produit principal/i)
  })

  it('mentionne le mode listing quand isSingle=false', () => {
    const p = buildExtractPrompt({ isSingle: false })
    expect(p).toMatch(/listing|liste|catalogue/i)
  })

  it('injecte le vendorPrompt en section dédiée', () => {
    const p = buildExtractPrompt({
      isSingle: true,
      vendorPrompt: 'Sur Milwaukee, le breadcrumb est dans data-attribute',
    })
    expect(p).toContain('Milwaukee')
    expect(p).toMatch(/CONSIGNES FOURNISSEUR/i)
  })

  it('injecte les globalRules', () => {
    const p = buildExtractPrompt({
      isSingle: true,
      globalRules: '- Toujours ignorer les avis clients\n- Préférer le résumé court',
    })
    expect(p).toMatch(/RÈGLES GLOBALES/i)
    expect(p).toContain('avis clients')
  })

  it('priorise userPrompt en dernière position', () => {
    const p = buildExtractPrompt({
      isSingle: true,
      vendorPrompt: 'vendor',
      globalRules: 'rules',
      userPrompt: 'Extrais uniquement la première variante',
    })
    const userIdx = p.indexOf('première variante')
    const vendorIdx = p.indexOf('vendor')
    expect(userIdx).toBeGreaterThan(vendorIdx)
  })
})
```

- [ ] **Step 3 : Lancer (FAIL)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/prompts.test.ts
```

- [ ] **Step 4 : Implémenter**

```typescript
// src/features/scraping/core/prompts.ts

export const SYSTEM_PROMPT = `Tu es un extracteur de données produit professionnel pour un éditeur de catalogues français.

RÈGLES ABSOLUES :

1. LANGUE : Toutes les données textuelles DOIVENT être retournées EN FRANÇAIS. Si le texte source est en anglais, allemand ou toute autre langue, TRADUIS-LE en français courant et naturel. Seules les références produit, codes EAN, URLs et unités de mesure restent dans leur forme originale.

2. EXHAUSTIVITÉ : Extrais TOUTES les informations disponibles, sans exception. Les pages de fabricants contiennent souvent des données dans des sections repliables (accordéons), des onglets, des panneaux dynamiques. Le contenu Markdown ci-dessous inclut le texte de TOUTES ces sections — parcours-le ENTIÈREMENT.

3. SPÉCIFICATIONS GROUPÉES : Les spécifications techniques sont souvent organisées en groupes/sections sur la page (ex: "Caractéristiques générales", "Moteur", "Batterie", "Dimensions et poids", "Bruit et vibrations", "Contenu de la livraison"). Tu DOIS conserver le nom exact du groupe dans le champ "group" de chaque spécification. Si une spec n'a pas de groupe visible, utilise "Général".

4. DOCUMENTS / PDF : Pour chaque document téléchargeable, utilise le texte du lien visible sur la page comme "name" (ex: "Fiche technique", "Notice d'utilisation", "Déclaration de conformité CE") et l'URL complète comme "url". Ne raccourcis pas les URLs, ne modifie pas les noms.

5. FIDÉLITÉ : N'INVENTE JAMAIS de données. Si une information n'est pas clairement lisible dans le contenu, retourne null. Ne déduis pas, n'invente pas, ne complète pas avec des valeurs fictives.

6. IMAGES : Retourne les URLs ABSOLUES COMPLÈTES des images (pas de chemins relatifs). Inclure toutes les images produit, pas les icônes ou logos du site.

7. SORTIE : Tu retournes EXCLUSIVEMENT un objet JSON conforme au schéma EnrichedProduct fourni. Aucun texte avant ou après.`

export interface BuildExtractPromptOpts {
  /** Mode single (1 produit principal) ou listing (N items). */
  isSingle: boolean
  /** Prompt vendor (Firestore, par domaine) — instructions spécifiques au site. */
  vendorPrompt?: string
  /** Règles globales markdown (Hub admin) — directives transverses. */
  globalRules?: string
  /** Saisie utilisateur ad-hoc — prioritaire sur le reste en cas de conflit. */
  userPrompt?: string
}

export function buildExtractPrompt(opts: BuildExtractPromptOpts): string {
  const parts: string[] = [SYSTEM_PROMPT]

  if (opts.isSingle) {
    parts.push(
      '\nMODE : produit unique. Extrais UNIQUEMENT les données du produit PRINCIPAL visible sur cette page. Ignore les produits similaires, accessoires, navigation et footer. Retourne un objet unique conforme à EnrichedProduct.',
    )
  } else {
    parts.push(
      '\nMODE : listing/catalogue. Extrais TOUS les produits visibles sous forme d\'un tableau d\'objets EnrichedProduct. Ignore menus et footer.',
    )
  }

  if (opts.globalRules?.trim()) {
    parts.push(`\n── RÈGLES GLOBALES ──\n${opts.globalRules.trim()}`)
  }

  if (opts.vendorPrompt?.trim()) {
    parts.push(`\n── CONSIGNES FOURNISSEUR ──\n${opts.vendorPrompt.trim()}`)
  }

  if (opts.userPrompt?.trim()) {
    parts.push(`\n── CONSIGNES UTILISATEUR (prioritaires en cas de conflit) ──\n${opts.userPrompt.trim()}`)
  }

  return parts.join('\n')
}
```

- [ ] **Step 5 : Lancer (PASS)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/prompts.test.ts
```

- [ ] **Step 6 : Commit**

```bash
git add src/features/scraping/core/prompts.ts src/features/scraping/core/__tests__/prompts.test.ts
git commit -m "feat(scraping): SYSTEM_PROMPT and buildExtractPrompt"
```

---

### Task 15: Module `fetchPage.ts`

**Files:**
- Create: `src/features/scraping/core/fetchPage.ts`
- Create: `src/features/scraping/core/__tests__/fetchPage.test.ts`

**Source à extraire** : `useJina.ts` lignes 17-25 (`jinaHeaders`), 466-528 (`jinaRead`), 535-577 (`jinaReadHtml`), 707-714 (`sanitizeHeaders`).

- [ ] **Step 1 : Lire le source**

```bash
sed -n '17,25p;466,577p;707,714p' src/features/scraping/useJina.ts
```

- [ ] **Step 2 : Écrire les tests** (avec mock fetch)

```typescript
// src/features/scraping/core/__tests__/fetchPage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchMarkdown, fetchHtml } from '../fetchPage'

vi.mock('@/lib/apiKeys', () => ({ getApiKey: vi.fn(() => 'fake-jina-key') }))
vi.mock('../debug', () => ({ appendDebugEntry: vi.fn(), genId: () => 'id-1' }))

describe('fetchMarkdown', () => {
  beforeEach(() => { global.fetch = vi.fn() })

  it('parse une réponse Jina valide', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, data: { title: 'Perceuse', content: '# Perceuse\n', url: 'https://x.com/p', description: '', links: {}, images: {} } }),
    } as Response)
    const data = await fetchMarkdown('https://x.com/p')
    expect(data.title).toBe('Perceuse')
    expect(data.content).toContain('Perceuse')
  })

  it('throws si HTTP non-ok', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    } as Response)
    await expect(fetchMarkdown('https://x.com/p')).rejects.toThrow(/503/)
  })

  it('throws si data vide', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, data: { title: '', content: '', url: '', description: '' } }),
    } as Response)
    await expect(fetchMarkdown('https://x.com/p')).rejects.toThrow(/aucun contenu/i)
  })

  it('utilise X-Engine: browser pour les sites protégés', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, data: { title: 't', content: 'c', url: 'u', description: '' } }),
    } as Response)
    await fetchMarkdown('https://leroymerlin.fr/p/x')
    const callArgs = fetchMock.mock.calls[0]
    const headers = callArgs[1]?.headers as Record<string, string>
    expect(headers['X-Engine']).toBe('browser')
  })
})

describe('fetchHtml', () => {
  beforeEach(() => { global.fetch = vi.fn() })

  it('renvoie le HTML quand la réponse est text/html', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<html><body>X</body></html>',
    } as Response)
    const html = await fetchHtml('https://x.com/p')
    expect(html).toContain('<body>')
  })

  it('renvoie null en cas d\'échec', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)
    expect(await fetchHtml('https://x.com/p')).toBeNull()
  })
})
```

- [ ] **Step 3 : Lancer (FAIL)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/fetchPage.test.ts
```

- [ ] **Step 4 : Implémenter**

```typescript
// src/features/scraping/core/fetchPage.ts
import { getApiKey } from '@/lib/apiKeys'
import { appendDebugEntry, genId } from './debug'

const JINA_READER = 'https://r.jina.ai'

/**
 * Liste de domaines connus pour servir un challenge anti-bot (DataDome, Akamai)
 * → on force `X-Engine: browser` (Chromium headless) avec timeout long.
 *
 * Note : cette liste est généraliste, pas un mapping vendor → parser. Elle ne
 * sert qu'à choisir le moteur Jina, jamais à parser différemment selon le site.
 */
const PROTECTED_HOSTS = /leroymerlin|castorama|boulanger|fnac|darty|amazon|cdiscount|manomano|conforama|ikea|bricomarche|bricodepot|bricorama|mr-bricolage|toolstation|prolians|wurth|berner|distriartisan|outillage-online|guedo|mabeo|maxoutil|debonix/i

function jinaHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey('jina')}`,
    Accept: 'application/json',
    'X-With-Links-Summary': 'true',
    'X-With-Images-Summary': 'true',
    ...extra,
  }
}

function sanitizeHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) {
    out[k] = /authorization/i.test(k) ? 'Bearer ***' : v
  }
  return out
}

export interface JinaReaderData {
  title: string
  description: string
  url: string
  content: string
  links?: Record<string, string>
  images?: Record<string, string>
  html?: string
}

export interface FetchOpts {
  /** Timeout en ms passé à Jina (X-Timeout). Auto-augmenté pour sites protégés. */
  timeout?: number
  /** Force un re-fetch (X-No-Cache). */
  noCache?: boolean
}

/** Récupère le markdown d'une page via Jina Reader, avec moteur browser
 *  automatique pour les sites protégés DataDome/Akamai. Throw en cas d'échec. */
export async function fetchMarkdown(url: string, opts: FetchOpts = {}): Promise<JinaReaderData> {
  const isProtected = (() => {
    try { return PROTECTED_HOSTS.test(new URL(url).hostname) } catch { return false }
  })()

  const timeout = Math.max(opts.timeout ?? 0, isProtected ? 30000 : 10000)
  const extra: Record<string, string> = {
    'X-Timeout': String(Math.ceil(timeout / 1000)),
  }
  if (opts.noCache) extra['X-No-Cache'] = 'true'
  if (isProtected) {
    extra['X-Engine'] = 'browser'
    extra['X-Wait-For-Selector'] = 'main, [itemtype*="Product" i], [class*="product" i]'
  } else {
    extra['X-Wait-For-Selector'] = 'body'
  }

  const headers = jinaHeaders(extra)
  const startedAt = performance.now()
  const entryBase = {
    id: genId(),
    timestamp: Date.now(),
    kind: 'jina' as const,
    url,
    method: 'GET' as const,
    headers: sanitizeHeaders(headers),
  }

  try {
    const res = await fetch(`${JINA_READER}/${url}`, { headers })
    if (!res.ok) {
      const text = await (res as Response & { text(): Promise<string> }).text().catch(() => '')
      const error = `Jina Reader: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`
      appendDebugEntry({ ...entryBase, durationMs: Math.round(performance.now() - startedAt), error })
      throw new Error(error)
    }
    const json = await res.json() as { code: number; data: JinaReaderData }
    if (!json.data?.content && !json.data?.title) {
      const error = 'Jina Reader n\'a retourné aucun contenu'
      appendDebugEntry({ ...entryBase, durationMs: Math.round(performance.now() - startedAt), error })
      throw new Error(error)
    }
    appendDebugEntry({
      ...entryBase,
      durationMs: Math.round(performance.now() - startedAt),
      response: json.data.content ?? '',
    })
    return json.data
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/Jina Reader:/.test(msg) && !/n'a retourné aucun contenu/.test(msg)) {
      appendDebugEntry({ ...entryBase, durationMs: Math.round(performance.now() - startedAt), error: msg })
    }
    throw err
  }
}

/** Récupère le HTML brut d'une page via Jina Reader (X-Return-Format: html).
 *  Retourne null en cas d'échec (silencieux). Utilisé pour parsing déterministe
 *  HTML (specs depuis <table>, etc.). */
export async function fetchHtml(url: string, opts: FetchOpts = {}): Promise<string | null> {
  const timeout = Math.max(opts.timeout ?? 0, 25000)
  const extra: Record<string, string> = {
    'X-Timeout': String(Math.ceil(timeout / 1000)),
    'X-Return-Format': 'html',
    'X-Wait-For-Selector': 'body',
    'X-Engine': 'browser',
  }
  if (opts.noCache) extra['X-No-Cache'] = 'true'

  try {
    const res = await fetch(`${JINA_READER}/${url}`, { headers: jinaHeaders(extra) })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('json')) {
      const json = await res.json() as { data?: { html?: string; content?: string } }
      return json.data?.html ?? json.data?.content ?? null
    }
    return await res.text()
  } catch {
    return null
  }
}
```

- [ ] **Step 5 : Lancer (PASS)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/fetchPage.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6 : Commit**

```bash
git add src/features/scraping/core/fetchPage.ts src/features/scraping/core/__tests__/fetchPage.test.ts
git commit -m "feat(scraping): fetchMarkdown/fetchHtml via Jina Reader"
```

---

### Task 16: Module `extractCanonical.ts` — appel LLM avec validation Zod et retry

**Files:**
- Create: `src/features/scraping/core/extractCanonical.ts`
- Create: `src/features/scraping/core/__tests__/extractCanonical.test.ts`

**Dépendance** : utilise `generateJson` depuis `@/features/ai/llmRouter` (déjà existant).

- [ ] **Step 1 : Vérifier l'API du llmRouter**

```bash
grep -n "export\|generateJson" src/features/ai/llmRouter.ts | head -20
```

Comprendre la signature de `generateJson` (probablement `{ model, schema, messages, temperature, ... }`).

- [ ] **Step 2 : Écrire les tests**

```typescript
// src/features/scraping/core/__tests__/extractCanonical.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractCanonical } from '../extractCanonical'

vi.mock('@/features/ai/llmRouter', () => ({
  generateJson: vi.fn(),
}))

import { generateJson } from '@/features/ai/llmRouter'
const mockedGenerateJson = vi.mocked(generateJson)

const VALID_RESPONSE = {
  url: 'https://x.com/p',
  scrapedAt: 1714400000000,
  identity: { name: 'Perceuse 18V', reference: 'M18-001', brand: 'Milwaukee', ean: null, breadcrumb: ['Outillage', 'Perceuses'] },
  marketing: { subtitle: null, description: 'Perceuse compacte', advantages: [] },
  commercial: { price: { amount: 299, currency: 'EUR', raw: '299,00 €' }, availability: 'En stock' },
  specifications: [{ group: 'Moteur', name: 'Tension', value: '18 V' }],
  variants: [],
  media: { images: ['https://cdn.x.com/p1.jpg'], documents: [] },
  meta: { sourcesScraped: ['https://x.com/p'], llmModel: 'gemini-3.1-pro-preview', llmProvider: 'gemini' as const, warnings: [] },
}

describe('extractCanonical', () => {
  beforeEach(() => { mockedGenerateJson.mockReset() })

  it('parse une réponse LLM valide en EnrichedProduct', async () => {
    mockedGenerateJson.mockResolvedValueOnce({ result: VALID_RESPONSE, requestInfo: { model: 'gemini-3.1-pro-preview', provider: 'gemini' } } as never)
    const result = await extractCanonical({
      url: 'https://x.com/p',
      content: '# Perceuse',
      isSingle: true,
    })
    expect(result.identity.name).toBe('Perceuse 18V')
    expect(result.commercial.price?.amount).toBe(299)
  })

  it('retry une fois si la première réponse est invalide', async () => {
    mockedGenerateJson
      .mockResolvedValueOnce({ result: { invalid: 'shape' }, requestInfo: { model: 'gemini-3.1-pro-preview', provider: 'gemini' } } as never)
      .mockResolvedValueOnce({ result: VALID_RESPONSE, requestInfo: { model: 'gemini-3.1-pro-preview', provider: 'gemini' } } as never)
    const result = await extractCanonical({
      url: 'https://x.com/p',
      content: '# Perceuse',
      isSingle: true,
    })
    expect(result.identity.name).toBe('Perceuse 18V')
    expect(mockedGenerateJson).toHaveBeenCalledTimes(2)
  })

  it('throw après 2 échecs consécutifs', async () => {
    mockedGenerateJson
      .mockResolvedValueOnce({ result: { invalid: 1 }, requestInfo: { model: 'x', provider: 'gemini' } } as never)
      .mockResolvedValueOnce({ result: { invalid: 2 }, requestInfo: { model: 'x', provider: 'gemini' } } as never)
    await expect(extractCanonical({
      url: 'https://x.com/p',
      content: '# Perceuse',
      isSingle: true,
    })).rejects.toThrow(/validation/i)
  })

  it('utilise Claude Opus pour single par défaut', async () => {
    mockedGenerateJson.mockResolvedValueOnce({ result: VALID_RESPONSE, requestInfo: { model: 'claude-opus-4-7', provider: 'claude' } } as never)
    await extractCanonical({ url: 'https://x.com/p', content: '# X', isSingle: true })
    const callArgs = mockedGenerateJson.mock.calls[0][0] as { model?: string }
    expect(callArgs.model).toBe('claude-opus-4-7')
  })

  it('utilise Gemini pour listing par défaut', async () => {
    mockedGenerateJson.mockResolvedValueOnce({ result: { items: [VALID_RESPONSE] }, requestInfo: { model: 'gemini-3.1-pro-preview', provider: 'gemini' } } as never)
    await extractCanonical({ url: 'https://x.com/p', content: '# X', isSingle: false })
    const callArgs = mockedGenerateJson.mock.calls[0][0] as { model?: string }
    expect(callArgs.model).toBe('gemini-3.1-pro-preview')
  })
})
```

- [ ] **Step 3 : Lancer (FAIL)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/extractCanonical.test.ts
```

- [ ] **Step 4 : Implémenter**

```typescript
// src/features/scraping/core/extractCanonical.ts
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { generateJson } from '@/features/ai/llmRouter'
import { EnrichedProductSchema, type EnrichedProduct } from './canonicalSchema'
import { buildExtractPrompt } from './prompts'

export interface ExtractCanonicalInput {
  /** URL du produit (sera stockée dans l'output et dans `meta.sourcesScraped`). */
  url: string
  /** Markdown source (depuis `fetchMarkdown` ou `bundleSources`). */
  content: string
  /** Mode single (1 produit) ou listing (N items). */
  isSingle: boolean
  /** Surcharge du modèle. Par défaut : Opus pour single, Gemini pour listing. */
  model?: string
  /** Prompt vendor (depuis vendorPromptsStore). */
  vendorPrompt?: string
  /** Règles globales markdown. */
  globalRules?: string
  /** Saisie utilisateur ad-hoc. */
  userPrompt?: string
  /** Images détectées par Jina (forme `{ alt: url }`). Injectées en contexte. */
  images?: Record<string, string>
  /** Liens détectés par Jina (forme `{ text: url }`). Utiles pour les PDFs. */
  links?: Record<string, string>
}

const DEFAULT_MODEL_SINGLE = 'claude-opus-4-7'
const DEFAULT_MODEL_LISTING = 'gemini-3.1-pro-preview'
const MAX_RETRY = 1  // une retry = deux tentatives au total

const ListingSchema = z.object({ items: z.array(EnrichedProductSchema) })

/** Appelle le LLM, valide la réponse contre EnrichedProductSchema, retry une
 *  fois en réinjectant l'erreur Zod si la 1re tentative échoue à la validation. */
export async function extractCanonical(input: ExtractCanonicalInput): Promise<EnrichedProduct> {
  const model = input.model ?? (input.isSingle ? DEFAULT_MODEL_SINGLE : DEFAULT_MODEL_LISTING)
  const schema = zodToJsonSchema(input.isSingle ? EnrichedProductSchema : ListingSchema, { target: 'openAi' })

  let lastError: string | null = null

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    const prompt = buildExtractPrompt({
      isSingle: input.isSingle,
      vendorPrompt: input.vendorPrompt,
      globalRules: input.globalRules,
      userPrompt: lastError
        ? `${input.userPrompt ?? ''}\n\nLA TENTATIVE PRÉCÉDENTE A ÉCHOUÉ À LA VALIDATION : ${lastError}\nCorrige et retourne un objet conforme.`
        : input.userPrompt,
    })

    // Inclure images et liens détectés par Jina en contexte texte (le LLM les
    // référencera mieux qu'un blob inline dans le markdown).
    const imagesBlock = input.images && Object.keys(input.images).length
      ? `\n\n── IMAGES DÉTECTÉES ──\n${Object.entries(input.images).map(([alt, u]) => `- ${alt || '(sans alt)'}: ${u}`).join('\n')}`
      : ''
    const linksBlock = input.links && Object.keys(input.links).length
      ? `\n\n── LIENS DÉTECTÉS ──\n${Object.entries(input.links).map(([t, u]) => `- ${t}: ${u}`).join('\n')}`
      : ''

    const messages = [
      { role: 'system' as const, content: prompt },
      { role: 'user' as const, content: `URL : ${input.url}\nIS_SINGLE : ${input.isSingle}\n\n── CONTENU DE LA PAGE ──\n${input.content.slice(0, 80000)}${imagesBlock}${linksBlock}` },
    ]

    const { result, requestInfo } = await generateJson({
      model,
      schema,
      messages,
      temperature: 0.0,
      task: 'scraping.extractCanonical',
    })

    // Validation Zod stricte
    try {
      if (input.isSingle) {
        const parsed = EnrichedProductSchema.parse({
          ...(result as Record<string, unknown>),
          url: (result as Record<string, unknown>).url ?? input.url,
          scrapedAt: (result as Record<string, unknown>).scrapedAt ?? Date.now(),
          meta: {
            sourcesScraped: [input.url],
            llmModel: requestInfo.model,
            llmProvider: requestInfo.provider as 'claude' | 'gemini' | 'openai',
            warnings: [],
            ...((result as { meta?: Record<string, unknown> }).meta ?? {}),
          },
        })
        return parsed
      } else {
        // Mode listing : on prend le premier item pour ce contrat.
        // Les engines de listing géreront l'array → array de canonicals.
        const parsed = ListingSchema.parse(result)
        if (parsed.items.length === 0) throw new z.ZodError([])
        return parsed.items[0]
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        lastError = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
        if (attempt >= MAX_RETRY) {
          throw new Error(`extractCanonical: échec de validation après ${attempt + 1} tentative(s) — ${lastError}`)
        }
        continue
      }
      throw err
    }
  }

  // Inatteignable mais nécessaire pour TS
  throw new Error('extractCanonical: unreachable')
}
```

- [ ] **Step 5 : Lancer (PASS)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/extractCanonical.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6 : Commit**

```bash
git add src/features/scraping/core/extractCanonical.ts src/features/scraping/core/__tests__/extractCanonical.test.ts
git commit -m "feat(scraping): extractCanonical with Zod validation and retry"
```

---

### Task 17: Module `canonicalProjectors.ts` — projection EnrichedProduct → ExcelSheet

**Files:**
- Create: `src/features/scraping/core/canonicalProjectors.ts`
- Create: `src/features/scraping/core/__tests__/canonicalProjectors.test.ts`

**Source à inspirer** : `useJina.ts` lignes 279-447 (`scrapeResultToSheet` + helpers `isImageCol`, `isImageUrl`). On en garde l'esprit (specs en colonnes dynamiques, taxonomie depuis breadcrumb) mais on prend `EnrichedProduct` en entrée au lieu de `ScrapeResult`.

- [ ] **Step 1 : Lire le source pour la logique de projection**

```bash
sed -n '279,447p' src/features/scraping/useJina.ts
```

- [ ] **Step 2 : Écrire les tests**

```typescript
// src/features/scraping/core/__tests__/canonicalProjectors.test.ts
import { describe, it, expect } from 'vitest'
import { productToSheetRow, productsToSheet } from '../canonicalProjectors'
import type { EnrichedProduct } from '../canonicalSchema'

const PROD: EnrichedProduct = {
  url: 'https://x.com/p1',
  scrapedAt: 1714400000000,
  identity: { name: 'Perceuse 18V', reference: 'M18-001', brand: 'Milwaukee', ean: '1234567890123', breadcrumb: ['Outillage', 'Perceuses'] },
  marketing: { subtitle: null, description: 'Compacte', advantages: [{ text: 'Robuste' }, { text: 'Légère' }] },
  commercial: { price: { amount: 299, currency: 'EUR', raw: '299,00 €' }, availability: 'En stock' },
  specifications: [
    { group: 'Moteur', name: 'Tension', value: '18 V' },
    { group: 'Moteur', name: 'Puissance', value: '500 W' },
    { group: 'Batterie', name: 'Capacité', value: '4 Ah' },
  ],
  variants: [],
  media: { images: ['https://cdn.x.com/p1.jpg'], documents: [{ name: 'Notice', url: 'https://cdn.x.com/notice.pdf' }] },
  meta: { sourcesScraped: ['https://x.com/p1'], llmModel: 'g', llmProvider: 'gemini', warnings: [] },
}

describe('productToSheetRow', () => {
  it('produit une ligne avec les champs identity', () => {
    const row = productToSheetRow(PROD)
    expect(row.name).toBe('Perceuse 18V')
    expect(row.reference).toBe('M18-001')
    expect(row.brand).toBe('Milwaukee')
    expect(row.ean).toBe('1234567890123')
  })

  it('produit une colonne par spec groupée', () => {
    const row = productToSheetRow(PROD)
    expect(row['spec_moteur_tension']).toBe('18 V')
    expect(row['spec_moteur_puissance']).toBe('500 W')
    expect(row['spec_batterie_capacite']).toBe('4 Ah')
  })

  it('expose le breadcrumb en taxonomie_n1, n2', () => {
    const row = productToSheetRow(PROD)
    expect(row.taxonomie_n1).toBe('Outillage')
    expect(row.taxonomie_n2).toBe('Perceuses')
  })

  it('sérialise advantages en pipe', () => {
    const row = productToSheetRow(PROD)
    expect(row.advantages).toBe('Robuste | Légère')
  })

  it('sérialise les documents [name](url)', () => {
    const row = productToSheetRow(PROD)
    expect(row['doc_notice']).toBe('https://cdn.x.com/notice.pdf')
  })
})

describe('productsToSheet', () => {
  it('produit une feuille avec la bonne taxonomie', () => {
    const sheet = productsToSheet([PROD], 'milwaukee')
    expect(sheet.name).toBe('milwaukee')
    expect(sheet.rows).toHaveLength(1)
    expect(sheet.taxonomyLevels).toBeDefined()
    const cols = sheet.columns.map(c => c.key)
    expect(cols).toContain('name')
    expect(cols).toContain('taxonomie_n1')
    expect(cols).toContain('spec_moteur_tension')
  })

  it('union les colonnes de specs entre produits', () => {
    const p2: EnrichedProduct = { ...PROD, url: 'https://x.com/p2', identity: { ...PROD.identity, name: 'Visseuse', reference: 'M18-002' }, specifications: [
      { group: 'Moteur', name: 'Tension', value: '12 V' },
      { group: 'Mandrin', name: 'Type', value: 'Auto-serrant' },
    ] }
    const sheet = productsToSheet([PROD, p2], 'mix')
    const cols = sheet.columns.map(c => c.key)
    expect(cols).toContain('spec_moteur_tension')
    expect(cols).toContain('spec_moteur_puissance')
    expect(cols).toContain('spec_batterie_capacite')
    expect(cols).toContain('spec_mandrin_type')
  })
})
```

- [ ] **Step 3 : Lancer (FAIL)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/canonicalProjectors.test.ts
```

- [ ] **Step 4 : Implémenter**

```typescript
// src/features/scraping/core/canonicalProjectors.ts
import type { EnrichedProduct } from './canonicalSchema'
import type { ExcelSheet, ExcelRow, ExcelColumn } from '@/features/excel/types'
import { buildTaxonomyFromLevels } from '@/features/excel/taxonomyBuilder'

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûüÿçœæ]+/gi, '_').replace(/^_|_$/g, '')

/** Projette un EnrichedProduct en `ExcelRow`. Specs et docs explosés en colonnes. */
export function productToSheetRow(p: EnrichedProduct, idx = 0): ExcelRow {
  const row: ExcelRow = {
    _id: `scraped_${idx}`,
    name: p.identity.name,
    reference: p.identity.reference,
    brand: p.identity.brand,
    ean: p.identity.ean,
    description: p.marketing.description,
    subtitle: p.marketing.subtitle,
    price: p.commercial.price?.raw ?? null,
    availability: p.commercial.availability,
    advantages: p.marketing.advantages.length
      ? p.marketing.advantages.map(a => a.text).join(' | ')
      : null,
    image_url: p.media.images[0] ?? null,
    images: p.media.images.length ? p.media.images.join(' | ') : null,
    url: p.url,
  }

  // Taxonomie depuis breadcrumb
  for (let i = 0; i < p.identity.breadcrumb.length; i++) {
    row[`taxonomie_n${i + 1}`] = p.identity.breadcrumb[i]
  }

  // Specs : une colonne par (group, name)
  for (const s of p.specifications) {
    const key = `spec_${slug(s.group).slice(0, 25)}_${slug(s.name).slice(0, 40)}`
    row[key] = s.value
  }

  // Docs : une colonne par doc
  for (const d of p.media.documents) {
    const key = `doc_${slug(d.name).slice(0, 40)}`
    row[key] = d.url
  }

  return row
}

/** Projette N EnrichedProduct en une `ExcelSheet`. Colonnes union, taxonomie auto. */
export function productsToSheet(products: EnrichedProduct[], name: string): ExcelSheet {
  if (products.length === 0) {
    return { name, columns: [], rows: [], taxonomy: [] }
  }

  // 1. Construire les rows pour collecter les keys
  const rows = products.map((p, i) => productToSheetRow(p, i))

  // 2. Union des colonnes
  const seenKeys = new Set<string>()
  const colsOrdered: string[] = []
  // Ordre fixe pour les standards
  const STANDARD_ORDER = ['name', 'reference', 'brand', 'ean', 'subtitle', 'description', 'advantages', 'price', 'availability', 'image_url', 'images', 'url']
  for (const k of STANDARD_ORDER) { colsOrdered.push(k); seenKeys.add(k) }

  // Taxonomies
  const maxDepth = Math.max(...products.map(p => p.identity.breadcrumb.length), 0)
  for (let i = 1; i <= maxDepth; i++) {
    const k = `taxonomie_n${i}`
    if (!seenKeys.has(k)) { colsOrdered.push(k); seenKeys.add(k) }
  }

  // Specs et docs : ordre d'apparition
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (k.startsWith('spec_') || k.startsWith('doc_')) {
        if (!seenKeys.has(k)) { colsOrdered.push(k); seenKeys.add(k) }
      }
    }
  }

  // 3. Construire ExcelColumn[]
  const columns: ExcelColumn[] = colsOrdered.map((key, i) => {
    const isImage = /image|photo|picture/i.test(key)
    const isUrl = key === 'url' || key.startsWith('doc_')
    const isSpec = key.startsWith('spec_')
    return {
      key,
      label: labelFor(key),
      fieldType: isImage ? 'image' : isUrl ? 'url' : 'text',
      detectedType: isImage ? 'image' : isUrl ? 'url' : 'text',
      isPrimary: i === 0,
      width: isImage ? 120 : isSpec ? 160 : isUrl ? 240 : 180,
    }
  })

  // 4. Taxonomie hiérarchique
  const taxonomyLevels: Record<string, number> = {}
  for (let i = 1; i <= maxDepth; i++) taxonomyLevels[`taxonomie_n${i}`] = i

  const sheet: ExcelSheet = { name, columns, rows, taxonomy: [] }
  if (maxDepth > 0) {
    sheet.taxonomyLevels = taxonomyLevels
    sheet.taxonomy = buildTaxonomyFromLevels(sheet, taxonomyLevels)
  }
  return sheet
}

function labelFor(key: string): string {
  if (key.startsWith('taxonomie_n')) return `Taxonomie Niveau ${key.slice(11)}`
  if (key.startsWith('spec_')) {
    const rest = key.slice(5).replace(/_/g, ' ')
    return rest.replace(/\b\w/g, c => c.toUpperCase())
  }
  if (key.startsWith('doc_')) {
    return `📄 ${key.slice(4).replace(/_/g, ' ')}`
  }
  const labels: Record<string, string> = {
    name: 'Nom', reference: 'Référence', brand: 'Marque', ean: 'EAN',
    subtitle: 'Sous-titre', description: 'Description', advantages: 'Avantages',
    price: 'Prix', availability: 'Disponibilité', image_url: 'Image',
    images: 'Images', url: 'URL source',
  }
  return labels[key] ?? key
}
```

- [ ] **Step 5 : Lancer (PASS)**

```bash
pnpm vitest run src/features/scraping/core/__tests__/canonicalProjectors.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 6 : Commit**

```bash
git add src/features/scraping/core/canonicalProjectors.ts src/features/scraping/core/__tests__/canonicalProjectors.test.ts
git commit -m "feat(scraping): productToSheetRow / productsToSheet projectors"
```

---

### Task 18: Smoke test bout-en-bout (parsers chaînés sur fixture markdown)

**Files:**
- Create: `src/features/scraping/core/__tests__/integration.test.ts`

**Objectif** : valider que les parseurs combinés produisent un objet *partiel* (pas validé Zod, c'est le job de `extractCanonical` avec le LLM) cohérent depuis un markdown réaliste. Ce test garantit qu'on n'a pas régressé en extrayant les fonctions individuellement.

- [ ] **Step 1 : Écrire le test avec une fixture inline**

```typescript
// src/features/scraping/core/__tests__/integration.test.ts
import { describe, it, expect } from 'vitest'
import { parseDescriptionFromMarkdown } from '../parsers/parseDescription'
import { parseAdvantagesFromMarkdown } from '../parsers/parseAdvantages'
import { parseSpecsFromMarkdown } from '../parsers/parseSpecifications'
import { parseVariantsFromMarkdown } from '../parsers/parseVariants'
import { parseImagesFromMarkdown } from '../parsers/parseImages'
import { parsePrice } from '../parsers/parsePrice'

const FIXTURE_MD = `# Perceuse-visseuse 18V — M18 FUEL™

## Description

La perceuse-visseuse Milwaukee M18 FUEL™ offre des performances haut de gamme pour
les professionnels du bâtiment. Couple maxi 135 Nm. Mandrin auto-serrant 13 mm.

299,00 € TTC

## Points forts

- Moteur sans charbon POWERSTATE™
- Couple maxi 135 Nm
- 3 vitesses
- Mandrin auto-serrant 13 mm
- Compacte et ergonomique

## Caractéristiques techniques

| Tension | 18 V |
| Puissance | 500 W |
| Couple maxi | 135 Nm |
| Vitesses | 3 |

## Variantes disponibles

| Réf. | Libellé | Capacité |
|---|---|---|
| M18-FPDX-0X | Solo (sans batterie) | — |
| M18-FPDX-502X | Pack 2x 5 Ah | 5 Ah |
| M18-FPDX-902X | Pack 2x 9 Ah | 9 Ah |

![Perceuse vue principale](https://cdn.milwaukeetool.eu/m18-fpdx-main.jpg)
![Perceuse en action](https://cdn.milwaukeetool.eu/m18-fpdx-lifestyle.jpg)
`

describe('integration: parsers chaînés sur markdown réaliste', () => {
  it('extrait description, avantages, specs, variants, images, prix', () => {
    const description = parseDescriptionFromMarkdown(FIXTURE_MD)
    const advantages = parseAdvantagesFromMarkdown(FIXTURE_MD)
    const specs = parseSpecsFromMarkdown(FIXTURE_MD)
    const variants = parseVariantsFromMarkdown(FIXTURE_MD)
    const images = parseImagesFromMarkdown(FIXTURE_MD)
    const price = parsePrice('299,00 €')

    expect(description).toContain('M18 FUEL')
    expect(description).not.toContain('Caractéristiques')
    expect(advantages.length).toBeGreaterThanOrEqual(3)
    expect(advantages.some(a => /Couple maxi/i.test(a.text))).toBe(true)
    expect(specs.length).toBeGreaterThanOrEqual(3)
    expect(specs.find(s => s.name === 'Tension')?.value).toBe('18 V')
    expect(variants.length).toBe(3)
    expect(variants[0].reference).toMatch(/M18/)
    expect(images).toHaveLength(2)
    expect(images[0]).toContain('milwaukeetool')
    expect(price?.amount).toBe(299)
    expect(price?.currency).toBe('EUR')
  })
})
```

- [ ] **Step 2 : Lancer**

```bash
pnpm vitest run src/features/scraping/core/__tests__/integration.test.ts
```

Expected: PASS — si certains parseurs ne produisent pas exactement ce qu'on attend, c'est un signal de régression vs. l'extraction depuis `useProductEnrichment.ts`. Ajuster les parseurs (pas le test) jusqu'à PASS.

- [ ] **Step 3 : Lancer toute la suite core**

```bash
pnpm vitest run src/features/scraping/core/
```

Expected: PASS sur **toutes** les `__tests__/*.test.ts`.

- [ ] **Step 4 : Vérifier le typecheck global**

```bash
pnpm tsc --noEmit
```

Expected: aucune nouvelle erreur (l'ancien code reste branché).

- [ ] **Step 5 : Commit**

```bash
git add src/features/scraping/core/__tests__/integration.test.ts
git commit -m "test(scraping): integration smoke test on realistic markdown"
```

---

## Final — vérification de phase 1

- [ ] **Step 1 : Liste les fichiers créés**

```bash
find src/features/scraping/core -type f | sort
```

Expected: 14 fichiers de code + 14 fichiers de test (≈28 fichiers).

- [ ] **Step 2 : Toutes les suites passent**

```bash
pnpm vitest run src/features/scraping/core/
```

Expected: 0 failed, ~70 tests passants.

- [ ] **Step 3 : Aucun fichier existant n'est modifié hors `package.json`**

```bash
git diff --stat HEAD~18 -- ':!docs' ':!src/features/scraping/core' ':!package.json' ':!pnpm-lock.yaml'
```

Expected: vide ou minimal (ne touche pas au reste du codebase).

- [ ] **Step 4 : L'app build et tourne sans régression**

```bash
pnpm build
```

Expected: build réussi (le nouveau core est isolé, ne devrait rien casser).

- [ ] **Step 5 : Tag de fin de phase**

```bash
git tag scraping-redesign-phase-1-complete
```

---

## Récap phase 1

À la fin de cette phase, on a :

- **`features/scraping/core/`** : 14 modules de 50–250 lignes chacun, couverts par tests unitaires.
- **Schéma canonique `EnrichedProduct`** : Zod, source de vérité unique.
- **Parseurs** : 7 modules dans `parsers/` avec une responsabilité claire chacun.
- **`extractCanonical`** : appel LLM avec validation Zod stricte + retry.
- **`productToSheetRow` / `productsToSheet`** : projecteurs canonical → ExcelSheet.
- **`fetchPage`, `bundleSources`, `relatedUrls`, `debug`** : briques de fetch/bundling/log.

**Aucun consommateur encore branché**. L'ancien code (`useJina.ts`, `useProductEnrichment.ts`, etc.) tourne toujours en production. La phase 2 (engines) consommera ce core ; la phase 3 (UI) branchera la modal et le panel ; la phase 4 supprimera l'ancien.

**Plans suivants** :
- `docs/superpowers/plans/<date>-web-scraping-redesign-phase-2-engines.md` (à écrire après validation empirique de la phase 1)
- `docs/superpowers/plans/<date>-web-scraping-redesign-phase-3-ui.md`
- `docs/superpowers/plans/<date>-web-scraping-redesign-phase-4-deletion.md`
- `docs/superpowers/plans/<date>-web-scraping-redesign-phase-5-admin.md`
