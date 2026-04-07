# Briefs IA — Lot 1 : Modèle & Infra — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser les fondations data du module Briefs clients IA : types, schémas Zod, hooks Firestore CRUD, catalogue mock, sans aucune UI.

**Architecture:** Extension du domaine taxonomie existant (`features/taxonomy/types.ts`) pour porter `formTemplate` + `questions` par nœud. Nouveau domaine `features/briefs/` parallèle qui gère la collection `briefs/{id}` via React Query + Firestore. Provider catalogue produit derrière une interface stable (mock JSON pour le MVP). Vitest installé pour permettre TDD sur la logique pure (le projet n'a aucun test aujourd'hui).

**Tech Stack:** TypeScript strict, Zod v4, React Query v5, Firebase 10 (Firestore + Storage), Vitest (à installer).

**Spec de référence :** `docs/superpowers/specs/2026-04-07-taxonomy-briefs-design.md` (sections 3, 4.1, 4.2, 8 lot 1)

---

## File Structure

**Création :**
- `vitest.config.ts` — config tests
- `src/test/setup.ts` — setup globals tests
- `src/features/briefs/types.ts` — types Brief, CartItem, BriefImage, ClientFormField, DynamicQuestion
- `src/features/briefs/schemas.ts` — schémas Zod miroir des types (validation runtime)
- `src/features/briefs/defaults.ts` — `createDefaultFormTemplate()` (champs builtins)
- `src/features/briefs/defaults.test.ts` — tests TDD du défaut
- `src/features/briefs/useBriefs.ts` — liste paginée filtrée
- `src/features/briefs/useBrief.ts` — un brief par id
- `src/features/briefs/useBriefMutations.ts` — create / update / delete / advanceStep
- `src/features/briefs/useFormTemplate.ts` — read/write template sur la taxonomie
- `src/features/briefs/catalog/ProductCatalogProvider.ts` — interface
- `src/features/briefs/catalog/MockCatalogProvider.ts` — implémentation mock
- `src/features/briefs/catalog/MockCatalogProvider.test.ts` — tests TDD du mock
- `src/features/briefs/catalog/mock-catalog.json` — données seed
- `src/features/briefs/catalog/catalog.factory.ts` — sélection runtime
- `firestore.rules.briefs.snippet` — snippet de règles à reporter dans le projet Firebase

**Modification :**
- `package.json` — ajout devDependencies vitest
- `src/features/taxonomy/types.ts` — extension `TaxonomyNode` (questions, magento) + `Taxonomy` (formTemplate)
- `src/features/taxonomy/useTaxonomyMutations.ts` — initialiser `formTemplate` à la création
- `tsconfig.app.json` — ajout du type `vitest/globals` si nécessaire

**Aucune modification d'UI dans ce lot.**

---

## Conventions de TDD pour ce plan

- Les **fichiers à logique pure** (`defaults.ts`, `MockCatalogProvider.ts`, `schemas.ts`) sont **développés en TDD strict** : test rouge → impl minimale → test vert → commit.
- Les **hooks Firestore** ne sont pas testés unitairement (le mocking de Firebase est coûteux et faible ROI ; la couverture viendra des tests E2E manuels du lot 3). Ils sont validés par : `tsc -b` qui passe + lint qui passe + smoke test manuel via console navigateur sur l'app dev.
- Chaque task se termine par un commit isolé avec message convention `feat(briefs): ...`.

---

## Task 0 : Installer et configurer Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Installer vitest et @testing-library**

Run:
```bash
cd /Applications/_IA/Claude_workspace/Web2Print
npm install -D vitest @vitest/ui jsdom
```

Expected: install success, `vitest` apparaît dans `devDependencies` de `package.json`.

- [ ] **Step 2: Ajouter le script test dans package.json**

Modifier `package.json` pour ajouter dans `scripts` :
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 3: Créer vitest.config.ts**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 4: Créer src/test/setup.ts**

Create `src/test/setup.ts`:
```ts
// Setup global pour les tests Vitest.
// Ajouter ici les mocks ou polyfills globaux si besoin.
export {}
```

- [ ] **Step 5: Créer un test sanity pour vérifier que vitest tourne**

Create `src/test/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Lancer le test**

Run: `npm run test:run`
Expected: 1 test passed, exit code 0.

- [ ] **Step 7: Supprimer le test sanity (gardé uniquement pour l'install)**

Delete `src/test/sanity.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test/setup.ts
git commit -m "chore(test): install and configure Vitest"
```

---

## Task 1 : Étendre les types Taxonomy avec questions et formTemplate

**Files:**
- Modify: `src/features/taxonomy/types.ts`

- [ ] **Step 1: Ajouter les nouveaux types dans `src/features/taxonomy/types.ts`**

Le fichier actuel contient `TaxonomyNode`, `Taxonomy`, `TaxonomyNodeWithChildren`. Remplacer son contenu par :

```ts
import type { Timestamp } from 'firebase/firestore'

// ─── Questions dynamiques par nœud ──────────────────────────────────────────
export type DynamicQuestionType =
  | 'text'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'boolean'

export interface DynamicQuestion {
  id: string                 // uuid stable
  label: string
  type: DynamicQuestionType
  options?: string[]         // pour select / multiselect
  required: boolean
  helpText?: string
}

// ─── Champs du formulaire client (template par taxonomie) ───────────────────
export type ClientFormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'select'
  | 'color'
  | 'logo_upload'
  | 'budget_range'
  | 'address'

export interface ClientFormField {
  id: string                 // uuid stable
  key: string                // 'companyName', 'siret'...
  label: string
  type: ClientFormFieldType
  required: boolean
  placeholder?: string
  helpText?: string
  options?: string[]         // pour select
  group?: string             // 'Société' | 'Identité visuelle' | ...
  order: number
  builtin: boolean           // non supprimable
}

// ─── Nœud de taxonomie ──────────────────────────────────────────────────────
export interface TaxonomyNode {
  id: string
  label: string
  parentId: string | null
  order: number
  level: number
  linkedProjectIds: string[]

  // Lot 1 : nouveaux champs (tous optionnels pour rétro-compat)
  magentoCategoryId?: string
  magentoSkus?: string[]
  questions?: DynamicQuestion[]
  questionsGeneratedAt?: Timestamp
}

// ─── Taxonomie ──────────────────────────────────────────────────────────────
export interface Taxonomy {
  id: string
  name: string
  ownerId: string
  createdAt: Timestamp
  updatedAt: Timestamp
  nodes: Record<string, TaxonomyNode>

  // Lot 1 : template du formulaire client (1:1 avec la taxonomie)
  formTemplate?: ClientFormField[]
}

export interface TaxonomyNodeWithChildren extends TaxonomyNode {
  children: TaxonomyNodeWithChildren[]
  isLeaf: boolean
}
```

- [ ] **Step 2: Vérifier que tsc passe sur tout le projet**

Run: `npx tsc -b`
Expected: pas d'erreur. Tous les nouveaux champs étant optionnels, aucun appel existant n'est cassé.

- [ ] **Step 3: Commit**

```bash
git add src/features/taxonomy/types.ts
git commit -m "feat(taxonomy): extend types with questions and form template"
```

---

## Task 2 : Créer les types Brief et BriefImage

**Files:**
- Create: `src/features/briefs/types.ts`

- [ ] **Step 1: Créer le fichier de types**

Create `src/features/briefs/types.ts`:
```ts
import type { Timestamp } from 'firebase/firestore'
import type {
  ClientFormField,
  DynamicQuestion,
} from '@/features/taxonomy/types'

// ─── Item du panier ─────────────────────────────────────────────────────────
export interface CartItem {
  sku: string
  name: string
  categoryNodeId: string         // traçabilité taxonomie
  quantity: number
  unitPrice?: number             // prix catalogue d'origine
  unitPriceOverride?: number     // prix édité par l'utilisateur
  imageUrl?: string
  description?: string
  aiJustification?: string
  source: 'ai' | 'manual'
}

// ─── Remise globale ─────────────────────────────────────────────────────────
export interface CartDiscount {
  type: 'percent' | 'amount'
  value: number
}

// ─── Spec d'une slide (union discriminée) ───────────────────────────────────
export type SlideSpec =
  | {
      type: 'cover'
      title: string
      subtitle: string
      heroPrompt: string
    }
  | {
      type: 'context'
      title: string
      bullets: string[]
    }
  | {
      type: 'product_grid'
      title: string
      productSkus: string[]
      layout: '2x2' | '3x2' | '1x3'
    }
  | {
      type: 'product_focus'
      title: string
      productSku: string
      keyPoints: string[]
      imagePrompt: string
    }
  | {
      type: 'budget'
      title: string
      showTotal: boolean
      showItemized: boolean
    }
  | {
      type: 'cta'
      title: string
      message: string
      contactEmail?: string
    }

export type SlideType = SlideSpec['type']

// ─── Versions de prompts IA stockées sur le brief ───────────────────────────
export interface BriefAiVersions {
  questions?: string
  branchSelection?: string
  cart?: string
  deck?: string
}

// ─── Brief ──────────────────────────────────────────────────────────────────
export type BriefStatus =
  | 'draft'
  | 'form_filled'
  | 'cart_ready'
  | 'deck_ready'
  | 'completed'

export type BriefStep = 1 | 2 | 3 | 4 | 5

export interface Brief {
  id: string
  taxonomyId: string
  ownerId: string
  clientName: string             // dénormalisé pour la liste
  status: BriefStatus
  currentStep: BriefStep

  client: {
    formTemplateSnapshot: ClientFormField[]
    values: Record<string, unknown>
  }

  dynamicForm?: {
    selectedNodeIds: string[]
    questions: DynamicQuestion[]
    answers: Record<string, unknown>
    aiReasoning?: string
  }

  cart?: {
    items: CartItem[]
    subtotal?: number
    discount?: CartDiscount
    totalEstimate?: number
    aiReasoning?: string
  }

  deck?: {
    slides: SlideSpec[]
  }

  pptxUrl?: string

  aiVersions?: BriefAiVersions

  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Image générée pour un brief (sous-collection) ──────────────────────────
export interface BriefImage {
  id: string                     // 'hero' ou `product_${sku}`
  type: 'hero' | 'product'
  productSku?: string
  prompt: string
  url: string                    // Firebase Storage
  thumbnailUrl?: string
  updatedAt: Timestamp
}
```

- [ ] **Step 2: Vérifier que tsc passe**

Run: `npx tsc -b`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/types.ts
git commit -m "feat(briefs): add Brief, CartItem, SlideSpec types"
```

---

## Task 3 : Créer les schémas Zod (validation runtime)

**Files:**
- Create: `src/features/briefs/schemas.ts`

Les schémas servent à valider les réponses Gemini (lots futurs) et à valider les inputs côté client. Ils miroitent les types de la Task 2.

- [ ] **Step 1: Créer le fichier de schémas**

Create `src/features/briefs/schemas.ts`:
```ts
import { z } from 'zod'

// ─── Champs du formulaire client ────────────────────────────────────────────
export const ClientFormFieldTypeSchema = z.enum([
  'text',
  'textarea',
  'number',
  'email',
  'select',
  'color',
  'logo_upload',
  'budget_range',
  'address',
])

export const ClientFormFieldSchema = z.object({
  id: z.string(),
  key: z.string().min(1),
  label: z.string().min(1),
  type: ClientFormFieldTypeSchema,
  required: z.boolean(),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  options: z.array(z.string()).optional(),
  group: z.string().optional(),
  order: z.number().int().nonnegative(),
  builtin: z.boolean(),
})

// ─── Questions dynamiques ───────────────────────────────────────────────────
export const DynamicQuestionTypeSchema = z.enum([
  'text',
  'number',
  'select',
  'multiselect',
  'boolean',
])

export const DynamicQuestionSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  type: DynamicQuestionTypeSchema,
  options: z.array(z.string()).optional(),
  required: z.boolean(),
  helpText: z.string().optional(),
})

// ─── Panier ─────────────────────────────────────────────────────────────────
export const CartItemSchema = z.object({
  sku: z.string().min(1),
  name: z.string(),
  categoryNodeId: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative().optional(),
  unitPriceOverride: z.number().nonnegative().optional(),
  imageUrl: z.string().optional(),
  description: z.string().optional(),
  aiJustification: z.string().optional(),
  source: z.enum(['ai', 'manual']),
})

export const CartDiscountSchema = z.object({
  type: z.enum(['percent', 'amount']),
  value: z.number().nonnegative(),
})

// ─── Slide spec (union discriminée) ─────────────────────────────────────────
export const SlideSpecSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cover'),
    title: z.string(),
    subtitle: z.string(),
    heroPrompt: z.string(),
  }),
  z.object({
    type: z.literal('context'),
    title: z.string(),
    bullets: z.array(z.string()).max(6),
  }),
  z.object({
    type: z.literal('product_grid'),
    title: z.string(),
    productSkus: z.array(z.string()).min(1).max(6),
    layout: z.enum(['2x2', '3x2', '1x3']),
  }),
  z.object({
    type: z.literal('product_focus'),
    title: z.string(),
    productSku: z.string(),
    keyPoints: z.array(z.string()).max(4),
    imagePrompt: z.string(),
  }),
  z.object({
    type: z.literal('budget'),
    title: z.string(),
    showTotal: z.boolean(),
    showItemized: z.boolean(),
  }),
  z.object({
    type: z.literal('cta'),
    title: z.string(),
    message: z.string(),
    contactEmail: z.string().email().optional(),
  }),
])

// ─── Statut & étape du brief ────────────────────────────────────────────────
export const BriefStatusSchema = z.enum([
  'draft',
  'form_filled',
  'cart_ready',
  'deck_ready',
  'completed',
])

export const BriefStepSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
])
```

- [ ] **Step 2: Vérifier compatibilité avec les types**

Create un fichier de check temporaire `src/features/briefs/_typecheck.ts`:
```ts
import type { z } from 'zod'
import type { ClientFormField, DynamicQuestion } from '@/features/taxonomy/types'
import type { CartItem, CartDiscount, SlideSpec } from './types'
import {
  ClientFormFieldSchema,
  DynamicQuestionSchema,
  CartItemSchema,
  CartDiscountSchema,
  SlideSpecSchema,
} from './schemas'

// Vérifie au compile-time que les schémas Zod inferent un type compatible avec les types TS.
const _f: ClientFormField = {} as z.infer<typeof ClientFormFieldSchema>
const _q: DynamicQuestion = {} as z.infer<typeof DynamicQuestionSchema>
const _c: CartItem = {} as z.infer<typeof CartItemSchema>
const _d: CartDiscount = {} as z.infer<typeof CartDiscountSchema>
const _s: SlideSpec = {} as z.infer<typeof SlideSpecSchema>
void _f; void _q; void _c; void _d; void _s
```

Run: `npx tsc -b`
Expected: pas d'erreur. Si erreur, ajuster soit le type soit le schéma jusqu'à cohérence.

- [ ] **Step 3: Supprimer le fichier de typecheck**

Delete `src/features/briefs/_typecheck.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/features/briefs/schemas.ts
git commit -m "feat(briefs): add Zod schemas mirroring types"
```

---

## Task 4 : `defaults.ts` — template de formulaire par défaut (TDD)

**Files:**
- Create: `src/features/briefs/defaults.test.ts`
- Create: `src/features/briefs/defaults.ts`

- [ ] **Step 1: Écrire les tests d'abord**

Create `src/features/briefs/defaults.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createDefaultFormTemplate } from './defaults'

describe('createDefaultFormTemplate', () => {
  it('returns the 11 builtin fields', () => {
    const fields = createDefaultFormTemplate()
    expect(fields).toHaveLength(11)
  })

  it('marks all default fields as builtin', () => {
    const fields = createDefaultFormTemplate()
    expect(fields.every((f) => f.builtin === true)).toBe(true)
  })

  it('makes companyName and contextSummary required', () => {
    const fields = createDefaultFormTemplate()
    const required = fields.filter((f) => f.required).map((f) => f.key)
    expect(required).toEqual(['companyName', 'contextSummary'])
  })

  it('assigns unique stable ids', () => {
    const fields = createDefaultFormTemplate()
    const ids = fields.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('orders fields with strictly increasing order values', () => {
    const fields = createDefaultFormTemplate()
    for (let i = 1; i < fields.length; i++) {
      expect(fields[i].order).toBeGreaterThan(fields[i - 1].order)
    }
  })

  it('groups fields into Société, Identité visuelle, Livraison, Contexte', () => {
    const fields = createDefaultFormTemplate()
    const groups = new Set(fields.map((f) => f.group))
    expect(groups).toEqual(
      new Set(['Société', 'Identité visuelle', 'Livraison', 'Contexte']),
    )
  })

  it('includes the SIRET and shippingAddress fields', () => {
    const keys = createDefaultFormTemplate().map((f) => f.key)
    expect(keys).toContain('siret')
    expect(keys).toContain('shippingAddress')
  })

  it('uses logo_upload type for logoUrl and color type for the two color fields', () => {
    const fields = createDefaultFormTemplate()
    expect(fields.find((f) => f.key === 'logoUrl')?.type).toBe('logo_upload')
    expect(fields.find((f) => f.key === 'primaryColor')?.type).toBe('color')
    expect(fields.find((f) => f.key === 'secondaryColor')?.type).toBe('color')
  })

  it('uses budget_range type for budget', () => {
    const fields = createDefaultFormTemplate()
    expect(fields.find((f) => f.key === 'budget')?.type).toBe('budget_range')
  })

  it('returns a fresh array each call (no shared mutation)', () => {
    const a = createDefaultFormTemplate()
    const b = createDefaultFormTemplate()
    expect(a).not.toBe(b)
    a[0].label = 'mutated'
    expect(b[0].label).not.toBe('mutated')
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm run test:run -- defaults`
Expected: tous les tests échouent avec "Cannot find module './defaults'" ou équivalent.

- [ ] **Step 3: Implémenter `defaults.ts`**

Create `src/features/briefs/defaults.ts`:
```ts
import type { ClientFormField } from '@/features/taxonomy/types'

/**
 * Construit la liste des champs builtins du formulaire client.
 * Appelé à la création d'une nouvelle taxonomie pour initialiser son `formTemplate`.
 *
 * Chaque appel renvoie une nouvelle copie (pas de mutation partagée).
 */
export function createDefaultFormTemplate(): ClientFormField[] {
  const fields: Array<Omit<ClientFormField, 'order' | 'builtin'>> = [
    // ─── Société ────────────────────────────────────────────────────────────
    {
      id: 'builtin-companyName',
      key: 'companyName',
      label: 'Raison sociale',
      type: 'text',
      required: true,
      group: 'Société',
    },
    {
      id: 'builtin-siret',
      key: 'siret',
      label: 'SIRET',
      type: 'text',
      required: false,
      group: 'Société',
    },
    {
      id: 'builtin-sector',
      key: 'sector',
      label: 'Secteur d\u2019activité',
      type: 'text',
      required: false,
      group: 'Société',
    },
    {
      id: 'builtin-contactName',
      key: 'contactName',
      label: 'Nom du contact',
      type: 'text',
      required: false,
      group: 'Société',
    },
    {
      id: 'builtin-contactEmail',
      key: 'contactEmail',
      label: 'Email du contact',
      type: 'email',
      required: false,
      group: 'Société',
    },

    // ─── Identité visuelle ──────────────────────────────────────────────────
    {
      id: 'builtin-logoUrl',
      key: 'logoUrl',
      label: 'Logo',
      type: 'logo_upload',
      required: false,
      group: 'Identité visuelle',
    },
    {
      id: 'builtin-primaryColor',
      key: 'primaryColor',
      label: 'Couleur primaire',
      type: 'color',
      required: false,
      group: 'Identité visuelle',
    },
    {
      id: 'builtin-secondaryColor',
      key: 'secondaryColor',
      label: 'Couleur secondaire',
      type: 'color',
      required: false,
      group: 'Identité visuelle',
    },

    // ─── Livraison ──────────────────────────────────────────────────────────
    {
      id: 'builtin-shippingAddress',
      key: 'shippingAddress',
      label: 'Adresse de livraison',
      type: 'address',
      required: false,
      group: 'Livraison',
    },

    // ─── Contexte ───────────────────────────────────────────────────────────
    {
      id: 'builtin-contextSummary',
      key: 'contextSummary',
      label: 'Brief / contexte',
      type: 'textarea',
      required: true,
      group: 'Contexte',
    },
    {
      id: 'builtin-budget',
      key: 'budget',
      label: 'Budget',
      type: 'budget_range',
      required: false,
      group: 'Contexte',
    },
  ]

  return fields.map((f, i) => ({
    ...f,
    order: i * 10, // pas de 10 pour permettre l'insertion ultérieure
    builtin: true,
  }))
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm run test:run -- defaults`
Expected: 10 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/briefs/defaults.ts src/features/briefs/defaults.test.ts
git commit -m "feat(briefs): add createDefaultFormTemplate with 11 builtin fields"
```

---

## Task 5 : `MockCatalogProvider` (TDD)

**Files:**
- Create: `src/features/briefs/catalog/ProductCatalogProvider.ts`
- Create: `src/features/briefs/catalog/mock-catalog.json`
- Create: `src/features/briefs/catalog/MockCatalogProvider.test.ts`
- Create: `src/features/briefs/catalog/MockCatalogProvider.ts`

- [ ] **Step 1: Définir l'interface `ProductCatalogProvider`**

Create `src/features/briefs/catalog/ProductCatalogProvider.ts`:
```ts
export interface CatalogProduct {
  sku: string
  name: string
  description: string
  price: number
  imageUrl: string
  magentoCategoryIds?: string[]
  attributes?: Record<string, unknown>
}

export interface CatalogSearchFilter {
  categoryNodeIds?: string[]    // ids de nœuds taxonomie
  magentoCategoryIds?: string[]
  query?: string                // recherche libre dans name + description
  limit?: number
}

export interface ProductCatalogProvider {
  search(filter: CatalogSearchFilter): Promise<CatalogProduct[]>
  getBySku(sku: string): Promise<CatalogProduct | null>
}
```

- [ ] **Step 2: Créer le mock JSON seed**

Create `src/features/briefs/catalog/mock-catalog.json`:
```json
[
  {
    "sku": "DRP-FR-100150",
    "name": "Drapeau France 100x150 polyester",
    "description": "Drapeau français en polyester maille, 100x150 cm, fourreau et corde.",
    "price": 24,
    "imageUrl": "https://placehold.co/600x400?text=Drapeau+France",
    "magentoCategoryIds": ["drapeaux-france"],
    "attributes": { "matiere": "polyester", "taille": "100x150" }
  },
  {
    "sku": "DRP-EU-100150",
    "name": "Drapeau Europe 100x150 polyester",
    "description": "Drapeau européen en polyester maille, 100x150 cm.",
    "price": 26,
    "imageUrl": "https://placehold.co/600x400?text=Drapeau+Europe",
    "magentoCategoryIds": ["drapeaux-europe"],
    "attributes": { "matiere": "polyester", "taille": "100x150" }
  },
  {
    "sku": "MAT-FIX-6M",
    "name": "Mât fixe aluminium 6m",
    "description": "Mât fixe en aluminium anodisé, hauteur 6 m, fixation au sol.",
    "price": 480,
    "imageUrl": "https://placehold.co/600x400?text=Mat+6m",
    "magentoCategoryIds": ["mats-fixes"],
    "attributes": { "hauteur": 6, "matiere": "aluminium" }
  },
  {
    "sku": "MAT-TEL-8M",
    "name": "Mât télescopique 8m",
    "description": "Mât télescopique en aluminium, hauteur ajustable jusqu'à 8 m.",
    "price": 720,
    "imageUrl": "https://placehold.co/600x400?text=Mat+telescopique",
    "magentoCategoryIds": ["mats-telescopiques"],
    "attributes": { "hauteur": 8, "matiere": "aluminium" }
  },
  {
    "sku": "FIX-SOL-STD",
    "name": "Fixation au sol standard",
    "description": "Platine de fixation au sol pour mât diamètre 60 mm.",
    "price": 85,
    "imageUrl": "https://placehold.co/600x400?text=Fixation+sol",
    "magentoCategoryIds": ["fixations-sol"],
    "attributes": { "diametre": 60 }
  }
]
```

- [ ] **Step 3: Écrire les tests de `MockCatalogProvider`**

Create `src/features/briefs/catalog/MockCatalogProvider.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { MockCatalogProvider } from './MockCatalogProvider'
import type { CatalogProduct } from './ProductCatalogProvider'

const sample: CatalogProduct[] = [
  {
    sku: 'A',
    name: 'Drapeau France',
    description: 'tricolore',
    price: 10,
    imageUrl: '',
    magentoCategoryIds: ['cat-drap'],
  },
  {
    sku: 'B',
    name: 'Mât 6m',
    description: 'aluminium',
    price: 100,
    imageUrl: '',
    magentoCategoryIds: ['cat-mat'],
  },
  {
    sku: 'C',
    name: 'Mât 8m',
    description: 'aluminium télescopique',
    price: 200,
    imageUrl: '',
    magentoCategoryIds: ['cat-mat'],
  },
]

describe('MockCatalogProvider', () => {
  let provider: MockCatalogProvider

  beforeEach(() => {
    provider = new MockCatalogProvider(sample)
  })

  describe('search', () => {
    it('returns all products when filter is empty', async () => {
      const result = await provider.search({})
      expect(result).toHaveLength(3)
    })

    it('filters by magentoCategoryIds (single match)', async () => {
      const result = await provider.search({ magentoCategoryIds: ['cat-drap'] })
      expect(result.map((p) => p.sku)).toEqual(['A'])
    })

    it('filters by magentoCategoryIds (multiple match)', async () => {
      const result = await provider.search({ magentoCategoryIds: ['cat-mat'] })
      expect(result.map((p) => p.sku).sort()).toEqual(['B', 'C'])
    })

    it('filters by query (case insensitive, in name)', async () => {
      const result = await provider.search({ query: 'drapeau' })
      expect(result.map((p) => p.sku)).toEqual(['A'])
    })

    it('filters by query (case insensitive, in description)', async () => {
      const result = await provider.search({ query: 'aluminium' })
      expect(result.map((p) => p.sku).sort()).toEqual(['B', 'C'])
    })

    it('combines filters with AND semantics', async () => {
      const result = await provider.search({
        magentoCategoryIds: ['cat-mat'],
        query: '8m',
      })
      expect(result.map((p) => p.sku)).toEqual(['C'])
    })

    it('respects the limit', async () => {
      const result = await provider.search({ limit: 2 })
      expect(result).toHaveLength(2)
    })

    it('returns empty when no match', async () => {
      const result = await provider.search({ query: 'inexistant' })
      expect(result).toEqual([])
    })

    it('ignores categoryNodeIds in MVP (mock has no node mapping)', async () => {
      // Le mock ne porte pas de mapping nœud taxonomie, donc categoryNodeIds est ignoré.
      // Comportement à documenter pour l'implémentation Magento future.
      const result = await provider.search({ categoryNodeIds: ['anything'] })
      expect(result).toHaveLength(3)
    })
  })

  describe('getBySku', () => {
    it('returns the matching product', async () => {
      const result = await provider.getBySku('B')
      expect(result?.name).toBe('Mât 6m')
    })

    it('returns null when sku not found', async () => {
      const result = await provider.getBySku('Z')
      expect(result).toBeNull()
    })
  })
})
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm run test:run -- MockCatalogProvider`
Expected: tous échouent (module introuvable).

- [ ] **Step 5: Implémenter `MockCatalogProvider`**

Create `src/features/briefs/catalog/MockCatalogProvider.ts`:
```ts
import type {
  CatalogProduct,
  CatalogSearchFilter,
  ProductCatalogProvider,
} from './ProductCatalogProvider'
import seed from './mock-catalog.json'

export class MockCatalogProvider implements ProductCatalogProvider {
  private readonly products: CatalogProduct[]

  constructor(products?: CatalogProduct[]) {
    this.products = products ?? (seed as CatalogProduct[])
  }

  async search(filter: CatalogSearchFilter): Promise<CatalogProduct[]> {
    const { magentoCategoryIds, query, limit } = filter
    const q = query?.trim().toLowerCase()

    let result = this.products.filter((p) => {
      if (magentoCategoryIds && magentoCategoryIds.length > 0) {
        const intersect = (p.magentoCategoryIds ?? []).some((c) =>
          magentoCategoryIds.includes(c),
        )
        if (!intersect) return false
      }
      if (q) {
        const haystack = `${p.name} ${p.description}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })

    if (typeof limit === 'number' && limit >= 0) {
      result = result.slice(0, limit)
    }
    return result
  }

  async getBySku(sku: string): Promise<CatalogProduct | null> {
    return this.products.find((p) => p.sku === sku) ?? null
  }
}
```

- [ ] **Step 6: Activer l'import JSON dans tsconfig si nécessaire**

Si `npm run test:run` échoue avec une erreur sur l'import JSON, vérifier que `tsconfig.app.json` contient `"resolveJsonModule": true` dans `compilerOptions`. Si absent, l'ajouter.

- [ ] **Step 7: Lancer les tests pour vérifier qu'ils passent**

Run: `npm run test:run -- MockCatalogProvider`
Expected: 11 tests passed.

- [ ] **Step 8: Créer la factory**

Create `src/features/briefs/catalog/catalog.factory.ts`:
```ts
import type { ProductCatalogProvider } from './ProductCatalogProvider'
import { MockCatalogProvider } from './MockCatalogProvider'

/**
 * Choisit l'implémentation runtime du catalogue produit.
 *
 * MVP : toujours `MockCatalogProvider`.
 * Évolution : lire `import.meta.env.VITE_CATALOG_PROVIDER === 'magento'`
 * et retourner `new MagentoCatalogProvider(...)` quand le lot Magento sera livré.
 */
export function getProductCatalog(): ProductCatalogProvider {
  return new MockCatalogProvider()
}
```

- [ ] **Step 9: Vérifier tsc**

Run: `npx tsc -b`
Expected: pas d'erreur.

- [ ] **Step 10: Commit**

```bash
git add src/features/briefs/catalog/ tsconfig.app.json
git commit -m "feat(briefs): add ProductCatalogProvider interface and MockCatalogProvider"
```

---

## Task 6 : Hook `useFormTemplate`

**Files:**
- Create: `src/features/briefs/useFormTemplate.ts`

Le template vit dans le doc Firestore `taxonomies/{id}` sous `formTemplate`. Hook fin qui lit/écrit ce champ.

- [ ] **Step 1: Créer le hook**

Create `src/features/briefs/useFormTemplate.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { ClientFormField } from '@/features/taxonomy/types'

interface SaveFormTemplateInput {
  taxonomyId: string
  fields: ClientFormField[]
}

/**
 * Mutation pour sauvegarder le `formTemplate` d'une taxonomie.
 * Le template est stocké directement sur le doc `taxonomies/{id}` (1:1).
 *
 * Note : la lecture du template se fait via le hook existant `useTaxonomyById`,
 * qui retourne déjà le doc complet incluant `formTemplate`.
 */
export function useSaveFormTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taxonomyId, fields }: SaveFormTemplateInput) => {
      const ref = doc(db, 'taxonomies', taxonomyId)
      await updateDoc(ref, {
        formTemplate: fields,
        updatedAt: serverTimestamp(),
      })
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['taxonomy', vars.taxonomyId] })
      queryClient.invalidateQueries({ queryKey: ['taxonomies'] })
    },
  })
}
```

- [ ] **Step 2: Vérifier tsc et lint**

Run: `npx tsc -b && npm run lint`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/useFormTemplate.ts
git commit -m "feat(briefs): add useSaveFormTemplate hook"
```

---

## Task 7 : Initialiser `formTemplate` à la création d'une taxonomie

**Files:**
- Modify: `src/features/taxonomy/useTaxonomyMutations.ts`

- [ ] **Step 1: Lire le fichier actuel pour repérer la fonction de création**

Run: `cat src/features/taxonomy/useTaxonomyMutations.ts | head -80`

Localiser la mutation/fonction qui crée une nouvelle taxonomie (`addDoc(collection(db, 'taxonomies'), ...)`). C'est généralement nommé `useCreateTaxonomy` ou `useAddTaxonomy`.

- [ ] **Step 2: Modifier le payload de création**

Dans la fonction de création, ajouter `formTemplate: createDefaultFormTemplate()` au payload `addDoc`. Importer `createDefaultFormTemplate` :

```ts
import { createDefaultFormTemplate } from '@/features/briefs/defaults'
```

Et dans le payload :
```ts
await addDoc(collection(db, 'taxonomies'), {
  name,
  ownerId: user.uid,
  nodes: {},
  formTemplate: createDefaultFormTemplate(),  // ← ajouter cette ligne
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})
```

(L'exact détail des champs voisins dépend de l'implémentation actuelle — adapter sans rien retirer.)

- [ ] **Step 3: Vérifier tsc et lint**

Run: `npx tsc -b && npm run lint`
Expected: pas d'erreur.

- [ ] **Step 4: Smoke test manuel**

Run: `npm run dev`
Dans le navigateur : créer une nouvelle taxonomie depuis l'UI existante. Ouvrir la console Firebase (ou DevTools → Network → Firestore), vérifier que le doc créé contient bien un tableau `formTemplate` avec 11 champs builtins.

- [ ] **Step 5: Commit**

```bash
git add src/features/taxonomy/useTaxonomyMutations.ts
git commit -m "feat(taxonomy): initialize formTemplate on new taxonomy creation"
```

---

## Task 8 : Hook `useBriefs` (liste filtrée)

**Files:**
- Create: `src/features/briefs/useBriefs.ts`

- [ ] **Step 1: Créer le hook**

Create `src/features/briefs/useBriefs.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import {
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getDocs,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { Brief } from './types'

interface UseBriefsOptions {
  taxonomyId?: string
  limit?: number
}

async function fetchBriefs(
  userId: string,
  opts: UseBriefsOptions,
): Promise<Brief[]> {
  const constraints: QueryConstraint[] = [where('ownerId', '==', userId)]

  if (opts.taxonomyId) {
    constraints.push(where('taxonomyId', '==', opts.taxonomyId))
  }
  constraints.push(orderBy('updatedAt', 'desc'))
  if (typeof opts.limit === 'number') {
    constraints.push(fbLimit(opts.limit))
  }

  const q = query(collection(db, 'briefs'), ...constraints)
  const snapshot = await getDocs(q)
  return snapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() } as Brief),
  )
}

/**
 * Liste les briefs de l'utilisateur courant.
 *
 * Options :
 * - `taxonomyId` : restreint à une taxonomie (BriefsPanel)
 * - `limit` : pour le widget Dashboard (5 derniers)
 */
export function useBriefs(opts: UseBriefsOptions = {}) {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['briefs', user?.uid, opts.taxonomyId ?? null, opts.limit ?? null],
    queryFn: () => fetchBriefs(user!.uid, opts),
    enabled: !!user,
  })
}
```

- [ ] **Step 2: Vérifier tsc et lint**

Run: `npx tsc -b && npm run lint`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/useBriefs.ts
git commit -m "feat(briefs): add useBriefs hook with taxonomy and limit filters"
```

---

## Task 9 : Hook `useBrief` (un brief par id)

**Files:**
- Create: `src/features/briefs/useBrief.ts`

- [ ] **Step 1: Créer le hook**

Create `src/features/briefs/useBrief.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Brief } from './types'

async function fetchBrief(briefId: string): Promise<Brief | null> {
  const snap = await getDoc(doc(db, 'briefs', briefId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Brief
}

export function useBrief(briefId: string | null | undefined) {
  return useQuery({
    queryKey: ['brief', briefId],
    queryFn: () => fetchBrief(briefId!),
    enabled: !!briefId,
  })
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/useBrief.ts
git commit -m "feat(briefs): add useBrief hook"
```

---

## Task 10 : Hook `useBriefMutations` (create / update / delete / advanceStep)

**Files:**
- Create: `src/features/briefs/useBriefMutations.ts`

- [ ] **Step 1: Créer le hook**

Create `src/features/briefs/useBriefMutations.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { Brief, BriefStep } from './types'
import type { ClientFormField } from '@/features/taxonomy/types'

interface CreateBriefInput {
  taxonomyId: string
  clientName: string
  formTemplateSnapshot: ClientFormField[]
}

interface UpdateBriefInput {
  briefId: string
  patch: Partial<Omit<Brief, 'id' | 'ownerId' | 'createdAt'>>
}

interface AdvanceStepInput {
  briefId: string
  step: BriefStep
}

export function useCreateBrief() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateBriefInput): Promise<string> => {
      if (!user) throw new Error('not authenticated')
      const ref = await addDoc(collection(db, 'briefs'), {
        taxonomyId: input.taxonomyId,
        ownerId: user.uid,
        clientName: input.clientName,
        status: 'draft',
        currentStep: 1,
        client: {
          formTemplateSnapshot: input.formTemplateSnapshot,
          values: {},
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      return ref.id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}

export function useUpdateBrief() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ briefId, patch }: UpdateBriefInput) => {
      const ref = doc(db, 'briefs', briefId)
      await updateDoc(ref, {
        ...patch,
        updatedAt: serverTimestamp(),
      })
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['brief', vars.briefId] })
      queryClient.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}

export function useDeleteBrief() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (briefId: string) => {
      await deleteDoc(doc(db, 'briefs', briefId))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}

export function useAdvanceBriefStep() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ briefId, step }: AdvanceStepInput) => {
      const ref = doc(db, 'briefs', briefId)
      await updateDoc(ref, {
        currentStep: step,
        updatedAt: serverTimestamp(),
      })
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['brief', vars.briefId] })
      queryClient.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}
```

- [ ] **Step 2: Vérifier tsc et lint**

Run: `npx tsc -b && npm run lint`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/useBriefMutations.ts
git commit -m "feat(briefs): add useBriefMutations hooks (create/update/delete/advanceStep)"
```

---

## Task 11 : Hook `useBriefImages` (sous-collection)

**Files:**
- Create: `src/features/briefs/useBriefImages.ts`

- [ ] **Step 1: Créer le hook**

Create `src/features/briefs/useBriefImages.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { BriefImage } from './types'

async function fetchBriefImages(briefId: string): Promise<BriefImage[]> {
  const snap = await getDocs(collection(db, 'briefs', briefId, 'images'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BriefImage))
}

export function useBriefImages(briefId: string | null | undefined) {
  return useQuery({
    queryKey: ['brief-images', briefId],
    queryFn: () => fetchBriefImages(briefId!),
    enabled: !!briefId,
  })
}

interface UpsertBriefImageInput {
  briefId: string
  image: Omit<BriefImage, 'updatedAt'>
}

/**
 * Upsert d'une image de brief.
 * Régénération = écrasement (1 slot par rôle, clé naturelle = id).
 */
export function useUpsertBriefImage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ briefId, image }: UpsertBriefImageInput) => {
      const ref = doc(db, 'briefs', briefId, 'images', image.id)
      await setDoc(ref, {
        ...image,
        updatedAt: serverTimestamp(),
      })
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['brief-images', vars.briefId] })
    },
  })
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/useBriefImages.ts
git commit -m "feat(briefs): add useBriefImages and useUpsertBriefImage hooks"
```

---

## Task 12 : Snippet de règles Firestore

**Files:**
- Create: `firestore.rules.briefs.snippet`

Le projet n'a peut-être pas encore de fichier `firestore.rules` versionné — dans ce cas, on livre un snippet à reporter manuellement dans la console Firebase.

- [ ] **Step 1: Créer le snippet**

Create `firestore.rules.briefs.snippet`:
```
// À ajouter dans firestore.rules (console Firebase) ou dans le fichier
// firestore.rules versionné s'il existe.

// ─── Briefs : seul le owner peut lire/écrire ──────────────────────────────
match /briefs/{briefId} {
  allow read: if request.auth != null
                && resource.data.ownerId == request.auth.uid;
  allow create: if request.auth != null
                  && request.resource.data.ownerId == request.auth.uid;
  allow update, delete: if request.auth != null
                          && resource.data.ownerId == request.auth.uid;

  // Sous-collection images : même règle, ownership remonté via get()
  match /images/{imageId} {
    allow read, write: if request.auth != null
      && get(/databases/$(database)/documents/briefs/$(briefId)).data.ownerId == request.auth.uid;
  }
}
```

- [ ] **Step 2: Documenter dans le snippet l'index nécessaire**

Append au même fichier :
```

// ─── Index Firestore composites à créer ───────────────────────────────────
//
// Collection : briefs
//
// 1) Pour useBriefs({ taxonomyId }) :
//    Champs : ownerId (Asc), taxonomyId (Asc), updatedAt (Desc)
//
// 2) Pour useBriefs({ limit }) (widget Dashboard) :
//    Champs : ownerId (Asc), updatedAt (Desc)
//
// La console Firebase proposera automatiquement la création du 1er index
// la première fois qu'une requête échoue avec un lien direct.
```

- [ ] **Step 3: Commit**

```bash
git add firestore.rules.briefs.snippet
git commit -m "docs(briefs): add Firestore rules snippet and index requirements"
```

---

## Task 13 : Smoke test manuel global du lot

**Files:** aucune création/modification.

- [ ] **Step 1: Lancer la suite de tests complète**

Run: `npm run test:run`
Expected: tous les tests passent (`defaults` + `MockCatalogProvider`), 0 failed.

- [ ] **Step 2: Lancer le typecheck**

Run: `npx tsc -b`
Expected: 0 erreur.

- [ ] **Step 3: Lancer le lint**

Run: `npm run lint`
Expected: 0 erreur (warnings tolérés s'ils existent déjà).

- [ ] **Step 4: Lancer le build de production**

Run: `npm run build`
Expected: build succeeds, pas de nouvelle erreur introduite.

- [ ] **Step 5: Smoke test interactif via la console navigateur**

Run: `npm run dev`

Dans la console navigateur (DevTools), une fois l'utilisateur connecté, exécuter :

```js
// 1. Vérifier que l'import des nouveaux modules fonctionne
const { MockCatalogProvider } = await import('/src/features/briefs/catalog/MockCatalogProvider.ts')
const cat = new MockCatalogProvider()
console.log('Search all:', await cat.search({}))
console.log('By SKU:', await cat.getBySku('DRP-FR-100150'))

// 2. Vérifier le défaut du formulaire
const { createDefaultFormTemplate } = await import('/src/features/briefs/defaults.ts')
console.log('Default fields:', createDefaultFormTemplate())
```

Expected :
- 5 produits listés depuis le mock
- 1 produit retourné pour le SKU
- 11 champs builtins listés

- [ ] **Step 6: Commit final (tag mental)**

Aucun nouveau commit nécessaire — le smoke test ne modifie rien. Si tout passe, le lot 1 est livré.

---

## Récapitulatif

À l'issue du lot 1 :
- Vitest installé et opérationnel
- Tous les types et schémas Zod du domaine `briefs` posés
- 21 tests unitaires passants (10 sur `defaults`, 11 sur `MockCatalogProvider`)
- 6 hooks Firestore prêts pour les futurs lots UI : `useBriefs`, `useBrief`, `useCreateBrief`, `useUpdateBrief`, `useDeleteBrief`, `useAdvanceBriefStep`, `useBriefImages`, `useUpsertBriefImage`, `useSaveFormTemplate`
- `MockCatalogProvider` + factory prêts pour le futur branchement Magento
- Toute nouvelle taxonomie créée porte un `formTemplate` initialisé avec 11 champs builtins
- Snippet de règles Firestore prêt à être appliqué

**Aucune UI** dans ce lot. La prochaine étape (lot 2) consommera tous ces hooks pour construire le `FormBuilderModal` et l'onglet "Briefs clients" dans `TaxonomiesPage`.
