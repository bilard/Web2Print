# Briefs IA — Lot 2 : Builder de formulaire + onglets TaxonomiesPage — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer une modale plein écran qui permet de configurer le formulaire client d'une taxonomie (ajout/suppression/réorder/édition des champs), accessible depuis un nouvel onglet "Briefs clients" dans `TaxonomiesPage`. Premier jalon visible utilisateur du module Briefs IA. **Pas d'IA dans ce lot.**

**Architecture:** Nouveau répertoire `src/components/briefs/` avec sous-dossiers `form-builder/` et `form-renderer/`. Le `DynamicFormRenderer` est réutilisable — il sera consommé par le builder (aperçu live) et par le Step 1 du Lot 3 (formulaire client réel). Les onglets `TaxonomiesPage` sont gérés par un nouveau composant `TaxonomyMainTabs` qui ne casse rien de l'existant (l'onglet "Arbre" rend le comportement actuel à 100 %). État UI (onglet courant, builder ouvert) dans un petit store `brief.store.ts`.

**Tech Stack:** React 18, Zustand v4, @dnd-kit v6 (déjà installé), Tailwind v3, shadcn minimal (pas de dépendance ajoutée), lucide-react.

**Spec de référence :** `docs/superpowers/specs/2026-04-07-taxonomy-briefs-design.md` sections 6.1, 6.6, 8 lot 2
**Dépend de :** Lot 1 terminé (types `ClientFormField`, hooks `useSaveFormTemplate`, `createDefaultFormTemplate`)

---

## File Structure

**Création :**
- `src/stores/brief.store.ts` — état UI (currentTab, formBuilderOpen)
- `src/components/briefs/form-builder/fieldTypes.ts` — registry `{ type → { label, icon, defaultField } }`
- `src/components/briefs/form-builder/fieldTypes.test.ts` — tests TDD du registry
- `src/components/briefs/form-renderer/DynamicFormRenderer.tsx` — rend un formulaire à partir d'un `ClientFormField[]` + values
- `src/components/briefs/form-renderer/fields/TextField.tsx`
- `src/components/briefs/form-renderer/fields/TextareaField.tsx`
- `src/components/briefs/form-renderer/fields/NumberField.tsx`
- `src/components/briefs/form-renderer/fields/EmailField.tsx`
- `src/components/briefs/form-renderer/fields/SelectField.tsx`
- `src/components/briefs/form-renderer/fields/ColorField.tsx`
- `src/components/briefs/form-renderer/fields/LogoUploadField.tsx` — MVP sans upload réel (input url)
- `src/components/briefs/form-renderer/fields/BudgetRangeField.tsx`
- `src/components/briefs/form-renderer/fields/AddressField.tsx`
- `src/components/briefs/form-builder/FieldEditor.tsx` — édition des props d'un champ
- `src/components/briefs/form-builder/FieldList.tsx` — dnd-kit sortable list
- `src/components/briefs/form-builder/FormBuilderModal.tsx` — conteneur modale 3 colonnes
- `src/components/briefs/BriefsPanel.tsx` — empty state + bouton "Configurer le formulaire"
- `src/components/taxonomy/TaxonomyMainTabs.tsx` — onglets Arbre / Briefs clients

**Modification :**
- `src/pages/TaxonomiesPage.tsx` — intégration de `TaxonomyMainTabs` à la place du rendu direct de l'arbre dans le `<main>`

**Aucune modification des hooks Firestore ni des types du Lot 1.**

---

## Conventions pour ce lot

- **Pas de tests UI** automatisés (faible ROI, pas de RTL installé). TDD strict uniquement sur `fieldTypes.ts` (logique pure).
- **Composants ≤ 150 lignes** (convention CLAUDE.md). `FormBuilderModal` et `DynamicFormRenderer` sont les plus gros — rester sous la limite.
- **Dark mode obligatoire** : `#0f0f0f` fond, `#1a1a1a` surfaces, `#6366f1` accent (indigo 500), bordures `white/[0.06]`. Pattern identique à `TaxonomiesPage` existant.
- **Pas de `any`** sur les props publiques. Types importés depuis `@/features/taxonomy/types` et `@/features/briefs/types`.
- **git hygiene** : stager uniquement les fichiers explicites de chaque task, jamais `git add -A` (working tree dirty avec travaux parallèles).

---

## Task 1 : Store UI `brief.store.ts`

**Files:**
- Create: `src/stores/brief.store.ts`

- [ ] **Step 1: Créer le store**

Create `src/stores/brief.store.ts`:
```ts
import { create } from 'zustand'

export type TaxonomyTab = 'tree' | 'briefs'

interface BriefUIState {
  // Onglet actif dans TaxonomiesPage
  currentTab: TaxonomyTab
  setCurrentTab: (tab: TaxonomyTab) => void

  // Modale du builder de formulaire
  formBuilderOpen: boolean
  openFormBuilder: () => void
  closeFormBuilder: () => void

  // Brief en cours d'édition (Lot 3) — placeholder ici
  currentBriefId: string | null
  setCurrentBriefId: (id: string | null) => void
}

export const useBriefUIStore = create<BriefUIState>((set) => ({
  currentTab: 'tree',
  setCurrentTab: (tab) => set({ currentTab: tab }),

  formBuilderOpen: false,
  openFormBuilder: () => set({ formBuilderOpen: true }),
  closeFormBuilder: () => set({ formBuilderOpen: false }),

  currentBriefId: null,
  setCurrentBriefId: (id) => set({ currentBriefId: id }),
}))
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`
Expected: pas de nouvelle erreur.

- [ ] **Step 3: Commit**

```bash
git add src/stores/brief.store.ts
git commit -m "feat(briefs): add brief UI store (tab, form builder modal)"
```

---

## Task 2 : Registry `fieldTypes.ts` (TDD)

**Files:**
- Create: `src/components/briefs/form-builder/fieldTypes.test.ts`
- Create: `src/components/briefs/form-builder/fieldTypes.ts`

Le registry associe chaque `ClientFormFieldType` à un label FR, une icône lucide, et une fabrique qui produit un champ vierge de ce type (utilisé par le bouton "+ Ajouter un champ").

- [ ] **Step 1: Écrire les tests d'abord**

Create `src/components/briefs/form-builder/fieldTypes.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { FIELD_TYPE_REGISTRY, createEmptyField, ALL_FIELD_TYPES } from './fieldTypes'

describe('FIELD_TYPE_REGISTRY', () => {
  it('covers all 9 ClientFormFieldType values', () => {
    expect(ALL_FIELD_TYPES).toHaveLength(9)
    expect(ALL_FIELD_TYPES).toEqual(
      expect.arrayContaining([
        'text', 'textarea', 'number', 'email', 'select',
        'color', 'logo_upload', 'budget_range', 'address',
      ]),
    )
  })

  it('provides a label for every type', () => {
    for (const t of ALL_FIELD_TYPES) {
      expect(FIELD_TYPE_REGISTRY[t].label).toBeTruthy()
    }
  })
})

describe('createEmptyField', () => {
  it('creates a text field with builtin=false and a unique id', () => {
    const a = createEmptyField('text', 100)
    const b = createEmptyField('text', 100)
    expect(a.type).toBe('text')
    expect(a.builtin).toBe(false)
    expect(a.required).toBe(false)
    expect(a.order).toBe(100)
    expect(a.id).not.toBe(b.id)
  })

  it('creates a select field with a default option', () => {
    const f = createEmptyField('select', 0)
    expect(f.type).toBe('select')
    expect(f.options).toBeDefined()
    expect(f.options!.length).toBeGreaterThan(0)
  })

  it('assigns a human label derived from the type', () => {
    const f = createEmptyField('email', 0)
    expect(f.label.length).toBeGreaterThan(0)
  })

  it('generates unique keys per call', () => {
    const a = createEmptyField('text', 0)
    const b = createEmptyField('text', 0)
    expect(a.key).not.toBe(b.key)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npm run test:run -- fieldTypes`
Expected: tous les tests échouent (module introuvable).

- [ ] **Step 3: Implémenter le registry**

Create `src/components/briefs/form-builder/fieldTypes.ts`:
```ts
import type {
  ClientFormField,
  ClientFormFieldType,
} from '@/features/taxonomy/types'
import type { LucideIcon } from 'lucide-react'
import {
  Type,
  AlignLeft,
  Hash,
  Mail,
  List,
  Palette,
  ImageUp,
  Wallet,
  MapPin,
} from 'lucide-react'

interface FieldTypeMeta {
  label: string
  icon: LucideIcon
}

export const FIELD_TYPE_REGISTRY: Record<ClientFormFieldType, FieldTypeMeta> = {
  text:         { label: 'Texte court',      icon: Type },
  textarea:     { label: 'Texte long',       icon: AlignLeft },
  number:       { label: 'Nombre',           icon: Hash },
  email:        { label: 'Email',            icon: Mail },
  select:       { label: 'Liste déroulante', icon: List },
  color:        { label: 'Couleur',          icon: Palette },
  logo_upload:  { label: 'Logo',             icon: ImageUp },
  budget_range: { label: 'Fourchette budget',icon: Wallet },
  address:      { label: 'Adresse',          icon: MapPin },
}

export const ALL_FIELD_TYPES = Object.keys(
  FIELD_TYPE_REGISTRY,
) as ClientFormFieldType[]

const LABEL_BY_TYPE: Record<ClientFormFieldType, string> = {
  text: 'Nouveau champ texte',
  textarea: 'Nouveau champ long',
  number: 'Nouveau champ nombre',
  email: 'Nouvel email',
  select: 'Nouvelle liste',
  color: 'Nouvelle couleur',
  logo_upload: 'Nouveau logo',
  budget_range: 'Nouveau budget',
  address: 'Nouvelle adresse',
}

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

/**
 * Crée un champ custom (non-builtin) vierge du type demandé.
 */
export function createEmptyField(
  type: ClientFormFieldType,
  order: number,
): ClientFormField {
  const id = nextId('field')
  const base: ClientFormField = {
    id,
    key: `custom_${id}`,
    label: LABEL_BY_TYPE[type],
    type,
    required: false,
    order,
    builtin: false,
  }
  if (type === 'select') {
    base.options = ['Option 1']
  }
  return base
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npm run test:run -- fieldTypes`
Expected: 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/briefs/form-builder/fieldTypes.ts src/components/briefs/form-builder/fieldTypes.test.ts
git commit -m "feat(briefs): add field type registry and createEmptyField"
```

---

## Task 3 : Composants de champ individuels (form-renderer/fields)

**Files (9 créations) :**
- `src/components/briefs/form-renderer/fields/TextField.tsx`
- `src/components/briefs/form-renderer/fields/TextareaField.tsx`
- `src/components/briefs/form-renderer/fields/NumberField.tsx`
- `src/components/briefs/form-renderer/fields/EmailField.tsx`
- `src/components/briefs/form-renderer/fields/SelectField.tsx`
- `src/components/briefs/form-renderer/fields/ColorField.tsx`
- `src/components/briefs/form-renderer/fields/LogoUploadField.tsx`
- `src/components/briefs/form-renderer/fields/BudgetRangeField.tsx`
- `src/components/briefs/form-renderer/fields/AddressField.tsx`

Tous les composants partagent la même interface props et le même style dark. Pas de tests (composants purement présentationnels). Chacun ≤ 80 lignes.

### Contrat de props commun

```ts
interface FieldProps<T = unknown> {
  field: ClientFormField          // métadonnées du champ
  value: T | undefined
  onChange: (value: T) => void
  disabled?: boolean              // mode aperçu read-only
}
```

- [ ] **Step 1: TextField**

Create `src/components/briefs/form-renderer/fields/TextField.tsx`:
```tsx
import type { ClientFormField } from '@/features/taxonomy/types'

interface Props {
  field: ClientFormField
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
}

export function TextField({ field, value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        disabled={disabled}
        className="bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
      />
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TextareaField**

Create `src/components/briefs/form-renderer/fields/TextareaField.tsx`:
```tsx
import type { ClientFormField } from '@/features/taxonomy/types'

interface Props {
  field: ClientFormField
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
}

export function TextareaField({ field, value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        disabled={disabled}
        rows={4}
        className="bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50 resize-y"
      />
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: NumberField**

Create `src/components/briefs/form-renderer/fields/NumberField.tsx`:
```tsx
import type { ClientFormField } from '@/features/taxonomy/types'

interface Props {
  field: ClientFormField
  value: number | undefined
  onChange: (value: number | undefined) => void
  disabled?: boolean
}

export function NumberField({ field, value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? undefined : Number(v))
        }}
        placeholder={field.placeholder}
        disabled={disabled}
        className="bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
      />
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: EmailField**

Create `src/components/briefs/form-renderer/fields/EmailField.tsx`:
```tsx
import type { ClientFormField } from '@/features/taxonomy/types'

interface Props {
  field: ClientFormField
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
}

export function EmailField({ field, value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        type="email"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? 'contact@exemple.fr'}
        disabled={disabled}
        className="bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
      />
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: SelectField**

Create `src/components/briefs/form-renderer/fields/SelectField.tsx`:
```tsx
import type { ClientFormField } from '@/features/taxonomy/types'

interface Props {
  field: ClientFormField
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
}

export function SelectField({ field, value, onChange, disabled }: Props) {
  const options = field.options ?? []
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 6: ColorField**

Create `src/components/briefs/form-renderer/fields/ColorField.tsx`:
```tsx
import type { ClientFormField } from '@/features/taxonomy/types'

interface Props {
  field: ClientFormField
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
}

export function ColorField({ field, value, onChange, disabled }: Props) {
  const hex = value ?? '#6366f1'
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-10 h-10 rounded-md bg-[#0f0f0f] border border-white/[0.08] cursor-pointer disabled:opacity-50"
        />
        <input
          type="text"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="flex-1 bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white font-mono focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
        />
      </div>
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 7: LogoUploadField (MVP — input URL, pas d'upload réel)**

Create `src/components/briefs/form-renderer/fields/LogoUploadField.tsx`:
```tsx
import { ImageUp } from 'lucide-react'
import type { ClientFormField } from '@/features/taxonomy/types'

interface Props {
  field: ClientFormField
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
}

// MVP : stocke une URL d'image. L'upload vers Firebase Storage sera ajouté au Lot 3.
export function LogoUploadField({ field, value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-md bg-[#0f0f0f] border border-white/[0.08] flex items-center justify-center overflow-hidden">
          {value ? (
            <img src={value} alt="logo" className="w-full h-full object-contain" />
          ) : (
            <ImageUp className="w-5 h-5 text-white/30" />
          )}
        </div>
        <input
          type="url"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          disabled={disabled}
          className="flex-1 bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
        />
      </div>
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 8: BudgetRangeField**

Create `src/components/briefs/form-renderer/fields/BudgetRangeField.tsx`:
```tsx
import type { ClientFormField } from '@/features/taxonomy/types'

interface BudgetValue {
  min?: number
  max?: number
}

interface Props {
  field: ClientFormField
  value: BudgetValue | undefined
  onChange: (value: BudgetValue) => void
  disabled?: boolean
}

export function BudgetRangeField({ field, value, onChange, disabled }: Props) {
  const current: BudgetValue = value ?? {}
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={current.min ?? ''}
          onChange={(e) => onChange({ ...current, min: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="Min €"
          disabled={disabled}
          className="flex-1 bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
        />
        <span className="text-white/30 text-[12px]">—</span>
        <input
          type="number"
          value={current.max ?? ''}
          onChange={(e) => onChange({ ...current, max: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="Max €"
          disabled={disabled}
          className="flex-1 bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
        />
      </div>
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 9: AddressField**

Create `src/components/briefs/form-renderer/fields/AddressField.tsx`:
```tsx
import type { ClientFormField } from '@/features/taxonomy/types'

interface AddressValue {
  street?: string
  postalCode?: string
  city?: string
  country?: string
}

interface Props {
  field: ClientFormField
  value: AddressValue | undefined
  onChange: (value: AddressValue) => void
  disabled?: boolean
}

export function AddressField({ field, value, onChange, disabled }: Props) {
  const current: AddressValue = value ?? {}
  const baseInput = "bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={current.street ?? ''}
          onChange={(e) => onChange({ ...current, street: e.target.value })}
          placeholder="Rue"
          disabled={disabled}
          className={baseInput}
        />
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <input
            type="text"
            value={current.postalCode ?? ''}
            onChange={(e) => onChange({ ...current, postalCode: e.target.value })}
            placeholder="Code postal"
            disabled={disabled}
            className={baseInput}
          />
          <input
            type="text"
            value={current.city ?? ''}
            onChange={(e) => onChange({ ...current, city: e.target.value })}
            placeholder="Ville"
            disabled={disabled}
            className={baseInput}
          />
        </div>
        <input
          type="text"
          value={current.country ?? 'France'}
          onChange={(e) => onChange({ ...current, country: e.target.value })}
          placeholder="Pays"
          disabled={disabled}
          className={baseInput}
        />
      </div>
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 10: Vérifier tsc**

Run: `npx tsc -b`
Expected: pas d'erreur nouvelle sur ces 9 fichiers.

- [ ] **Step 11: Commit**

```bash
git add src/components/briefs/form-renderer/fields/
git commit -m "feat(briefs): add 9 form field components for renderer"
```

---

## Task 4 : `DynamicFormRenderer`

**Files:**
- Create: `src/components/briefs/form-renderer/DynamicFormRenderer.tsx`

Ce composant prend un `ClientFormField[]` + un objet de values + un handler onChange. Il groupe les champs par `group` et rend le bon composant de champ selon `field.type`.

- [ ] **Step 1: Créer le renderer**

Create `src/components/briefs/form-renderer/DynamicFormRenderer.tsx`:
```tsx
import type { ClientFormField } from '@/features/taxonomy/types'
import { TextField } from './fields/TextField'
import { TextareaField } from './fields/TextareaField'
import { NumberField } from './fields/NumberField'
import { EmailField } from './fields/EmailField'
import { SelectField } from './fields/SelectField'
import { ColorField } from './fields/ColorField'
import { LogoUploadField } from './fields/LogoUploadField'
import { BudgetRangeField } from './fields/BudgetRangeField'
import { AddressField } from './fields/AddressField'

interface Props {
  fields: ClientFormField[]
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  disabled?: boolean
}

/**
 * Rend un formulaire dynamique à partir d'un template de champs.
 * Groupe les champs par `field.group` et ordonne par `field.order`.
 */
export function DynamicFormRenderer({
  fields,
  values,
  onChange,
  disabled,
}: Props) {
  const sorted = [...fields].sort((a, b) => a.order - b.order)
  const grouped = groupByGroup(sorted)

  return (
    <div className="flex flex-col gap-6">
      {grouped.map(({ group, items }) => (
        <section key={group ?? '_'} className="flex flex-col gap-3">
          {group && (
            <h3 className="text-[11px] uppercase tracking-wide text-white/40 font-semibold">
              {group}
            </h3>
          )}
          <div className="flex flex-col gap-4">
            {items.map((field) => (
              <FieldRenderer
                key={field.id}
                field={field}
                value={values[field.key]}
                onChange={(v) => onChange(field.key, v)}
                disabled={disabled}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function groupByGroup(fields: ClientFormField[]) {
  const map = new Map<string | undefined, ClientFormField[]>()
  for (const f of fields) {
    const k = f.group
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(f)
  }
  return Array.from(map.entries()).map(([group, items]) => ({ group, items }))
}

interface FieldRendererProps {
  field: ClientFormField
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
}

function FieldRenderer({ field, value, onChange, disabled }: FieldRendererProps) {
  switch (field.type) {
    case 'text':
      return <TextField field={field} value={value as string} onChange={onChange} disabled={disabled} />
    case 'textarea':
      return <TextareaField field={field} value={value as string} onChange={onChange} disabled={disabled} />
    case 'number':
      return <NumberField field={field} value={value as number} onChange={onChange} disabled={disabled} />
    case 'email':
      return <EmailField field={field} value={value as string} onChange={onChange} disabled={disabled} />
    case 'select':
      return <SelectField field={field} value={value as string} onChange={onChange} disabled={disabled} />
    case 'color':
      return <ColorField field={field} value={value as string} onChange={onChange} disabled={disabled} />
    case 'logo_upload':
      return <LogoUploadField field={field} value={value as string} onChange={onChange} disabled={disabled} />
    case 'budget_range':
      return <BudgetRangeField field={field} value={value as { min?: number; max?: number }} onChange={onChange} disabled={disabled} />
    case 'address':
      return <AddressField field={field} value={value as { street?: string; postalCode?: string; city?: string; country?: string }} onChange={onChange} disabled={disabled} />
    default: {
      const _exhaust: never = field.type
      return <div className="text-red-400 text-[12px]">Type de champ inconnu: {String(_exhaust)}</div>
    }
  }
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/form-renderer/DynamicFormRenderer.tsx
git commit -m "feat(briefs): add DynamicFormRenderer for form templates"
```

---

## Task 5 : `FieldEditor` (édition des props d'un champ)

**Files:**
- Create: `src/components/briefs/form-builder/FieldEditor.tsx`

- [ ] **Step 1: Créer FieldEditor**

Create `src/components/briefs/form-builder/FieldEditor.tsx`:
```tsx
import { Trash2 } from 'lucide-react'
import type { ClientFormField } from '@/features/taxonomy/types'

interface Props {
  field: ClientFormField | null
  onChange: (patch: Partial<ClientFormField>) => void
  onDelete: () => void
}

export function FieldEditor({ field, onChange, onDelete }: Props) {
  if (!field) {
    return (
      <div className="h-full flex items-center justify-center text-[12px] text-white/30">
        Sélectionnez un champ pour l'éditer
      </div>
    )
  }

  const isSelect = field.type === 'select'

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-wide text-white/40 font-semibold">
          Édition du champ
        </h3>
        {field.builtin && (
          <span className="text-[10px] uppercase tracking-wide text-indigo-400/80 bg-indigo-500/10 px-2 py-0.5 rounded">
            builtin
          </span>
        )}
      </div>

      <Label>Label</Label>
      <Input
        value={field.label}
        onChange={(v) => onChange({ label: v })}
      />

      <Label>Aide (helpText)</Label>
      <Input
        value={field.helpText ?? ''}
        onChange={(v) => onChange({ helpText: v || undefined })}
      />

      <Label>Placeholder</Label>
      <Input
        value={field.placeholder ?? ''}
        onChange={(v) => onChange({ placeholder: v || undefined })}
      />

      <label className="flex items-center gap-2 text-[12px] text-white/70 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onChange({ required: e.target.checked })}
          className="w-4 h-4 accent-indigo-500"
        />
        Obligatoire
      </label>

      {isSelect && (
        <>
          <Label>Options (une par ligne)</Label>
          <textarea
            value={(field.options ?? []).join('\n')}
            onChange={(e) => onChange({ options: e.target.value.split('\n').filter(Boolean) })}
            rows={5}
            className="bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-indigo-500/60 font-mono"
          />
        </>
      )}

      {!field.builtin && (
        <button
          onClick={onDelete}
          className="mt-2 flex items-center gap-2 text-[12px] text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded-md transition-colors self-start"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Supprimer ce champ
        </button>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[12px] text-white/70 -mb-2">{children}</label>
}

function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-indigo-500/60"
    />
  )
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/form-builder/FieldEditor.tsx
git commit -m "feat(briefs): add FieldEditor component"
```

---

## Task 6 : `FieldList` (sortable dnd-kit)

**Files:**
- Create: `src/components/briefs/form-builder/FieldList.tsx`

- [ ] **Step 1: Créer FieldList**

Create `src/components/briefs/form-builder/FieldList.tsx`:
```tsx
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus } from 'lucide-react'
import { useState } from 'react'
import type { ClientFormField, ClientFormFieldType } from '@/features/taxonomy/types'
import { FIELD_TYPE_REGISTRY, ALL_FIELD_TYPES, createEmptyField } from './fieldTypes'

interface Props {
  fields: ClientFormField[]
  selectedFieldId: string | null
  onSelect: (id: string) => void
  onReorder: (fields: ClientFormField[]) => void
  onAdd: (field: ClientFormField) => void
}

export function FieldList({
  fields,
  selectedFieldId,
  onSelect,
  onReorder,
  onAdd,
}: Props) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const sorted = [...fields].sort((a, b) => a.order - b.order)

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = sorted.findIndex((f) => f.id === active.id)
    const newIdx = sorted.findIndex((f) => f.id === over.id)
    const moved = arrayMove(sorted, oldIdx, newIdx).map((f, i) => ({
      ...f,
      order: i * 10,
    }))
    onReorder(moved)
  }

  const handleAdd = (type: ClientFormFieldType) => {
    const maxOrder = sorted.reduce((m, f) => Math.max(m, f.order), 0)
    onAdd(createEmptyField(type, maxOrder + 10))
    setAddMenuOpen(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sorted.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            {sorted.map((field) => (
              <SortableRow
                key={field.id}
                field={field}
                selected={field.id === selectedFieldId}
                onSelect={() => onSelect(field.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <div className="relative border-t border-white/[0.06] p-2">
        <button
          onClick={() => setAddMenuOpen((o) => !o)}
          className="w-full flex items-center justify-center gap-1.5 text-[12px] text-white/60 hover:text-white hover:bg-white/[0.06] px-3 py-2 rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter un champ
        </button>
        {addMenuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1 bg-[#1a1a1a] border border-white/[0.08] rounded-md shadow-lg p-1 z-10">
            {ALL_FIELD_TYPES.map((t) => {
              const meta = FIELD_TYPE_REGISTRY[t]
              const Icon = meta.icon
              return (
                <button
                  key={t}
                  onClick={() => handleAdd(t)}
                  className="w-full flex items-center gap-2 text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] px-2 py-1.5 rounded transition-colors"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {meta.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SortableRow({
  field,
  selected,
  onSelect,
}: {
  field: ClientFormField
  selected: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const Icon = FIELD_TYPE_REGISTRY[field.type].icon

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer mb-0.5 ${
        selected
          ? 'bg-indigo-500/15 ring-1 ring-indigo-500/40'
          : 'hover:bg-white/[0.04]'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="text-white/30 hover:text-white/60 cursor-grab active:cursor-grabbing"
        aria-label="Déplacer"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <Icon className="w-3.5 h-3.5 text-white/40" />
      <span className="flex-1 text-[12px] text-white/80 truncate">{field.label}</span>
      {field.required && <span className="text-red-400 text-[11px]">*</span>}
      {field.builtin && (
        <span className="text-[9px] uppercase text-indigo-400/70">built</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/form-builder/FieldList.tsx
git commit -m "feat(briefs): add sortable FieldList with add-field menu"
```

---

## Task 7 : `FormBuilderModal` (assemblage)

**Files:**
- Create: `src/components/briefs/form-builder/FormBuilderModal.tsx`

La modale assemble `FieldList` (gauche), `FieldEditor` (centre), `DynamicFormRenderer` en mode aperçu (droite). Gère l'état local du draft et sauvegarde via `useSaveFormTemplate`.

- [ ] **Step 1: Créer FormBuilderModal**

Create `src/components/briefs/form-builder/FormBuilderModal.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { X, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { ClientFormField, Taxonomy } from '@/features/taxonomy/types'
import { createDefaultFormTemplate } from '@/features/briefs/defaults'
import { useSaveFormTemplate } from '@/features/briefs/useFormTemplate'
import { FieldList } from './FieldList'
import { FieldEditor } from './FieldEditor'
import { DynamicFormRenderer } from '../form-renderer/DynamicFormRenderer'

interface Props {
  open: boolean
  taxonomy: Taxonomy | null
  onClose: () => void
}

export function FormBuilderModal({ open, taxonomy, onClose }: Props) {
  const [draft, setDraft] = useState<ClientFormField[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({})
  const save = useSaveFormTemplate()

  // Hydrate le draft à l'ouverture
  useEffect(() => {
    if (!open || !taxonomy) return
    const initial = taxonomy.formTemplate ?? createDefaultFormTemplate()
    setDraft(initial)
    setSelectedId(initial[0]?.id ?? null)
    setPreviewValues({})
  }, [open, taxonomy])

  if (!open || !taxonomy) return null

  const selectedField = draft.find((f) => f.id === selectedId) ?? null

  const handleFieldChange = (patch: Partial<ClientFormField>) => {
    if (!selectedField) return
    setDraft((prev) =>
      prev.map((f) => (f.id === selectedField.id ? { ...f, ...patch } : f)),
    )
  }

  const handleDelete = () => {
    if (!selectedField || selectedField.builtin) return
    setDraft((prev) => prev.filter((f) => f.id !== selectedField.id))
    setSelectedId(null)
  }

  const handleAdd = (field: ClientFormField) => {
    setDraft((prev) => [...prev, field])
    setSelectedId(field.id)
  }

  const handleSave = async () => {
    try {
      await save.mutateAsync({ taxonomyId: taxonomy.id, fields: draft })
      toast.success('Formulaire enregistré')
      onClose()
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde')
      console.error(err)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch p-6">
      <div className="flex-1 bg-[#0f0f0f] border border-white/[0.06] rounded-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-12 bg-[#161616] border-b border-white/[0.06] flex items-center px-4 gap-3 shrink-0">
          <h2 className="text-[13px] font-semibold text-white/80">
            Configurer le formulaire — {taxonomy.name}
          </h2>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="text-[12px] text-white/50 hover:text-white/80 px-3 py-1.5 rounded-md hover:bg-white/[0.06]"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={save.isPending}
            className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            Enregistrer
          </button>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-white/40 hover:text-white/80 p-1.5 rounded-md hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body 3 colonnes */}
        <div className="flex-1 grid grid-cols-[260px_320px_1fr] overflow-hidden">
          {/* Col 1 — champs */}
          <div className="border-r border-white/[0.06] bg-[#141414] overflow-hidden">
            <FieldList
              fields={draft}
              selectedFieldId={selectedId}
              onSelect={setSelectedId}
              onReorder={setDraft}
              onAdd={handleAdd}
            />
          </div>

          {/* Col 2 — éditeur */}
          <div className="border-r border-white/[0.06] bg-[#141414] overflow-y-auto">
            <FieldEditor
              field={selectedField}
              onChange={handleFieldChange}
              onDelete={handleDelete}
            />
          </div>

          {/* Col 3 — aperçu live */}
          <div className="overflow-y-auto p-6 bg-[#0f0f0f]">
            <h3 className="text-[11px] uppercase tracking-wide text-white/40 font-semibold mb-4">
              Aperçu
            </h3>
            <div className="max-w-lg">
              <DynamicFormRenderer
                fields={draft}
                values={previewValues}
                onChange={(key, value) =>
                  setPreviewValues((prev) => ({ ...prev, [key]: value }))
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/form-builder/FormBuilderModal.tsx
git commit -m "feat(briefs): add FormBuilderModal assembling list/editor/preview"
```

---

## Task 8 : `BriefsPanel` (empty state placeholder)

**Files:**
- Create: `src/components/briefs/BriefsPanel.tsx`

Pour ce lot, le panel est un simple empty state qui annonce que la liste des briefs viendra au Lot 3. Il expose le bouton "Configurer le formulaire" qui ouvre la modale.

- [ ] **Step 1: Créer BriefsPanel**

Create `src/components/briefs/BriefsPanel.tsx`:
```tsx
import { Settings, FileText } from 'lucide-react'
import type { Taxonomy } from '@/features/taxonomy/types'
import { useBriefUIStore } from '@/stores/brief.store'
import { FormBuilderModal } from './form-builder/FormBuilderModal'

interface Props {
  taxonomy: Taxonomy
}

export function BriefsPanel({ taxonomy }: Props) {
  const { formBuilderOpen, openFormBuilder, closeFormBuilder } = useBriefUIStore()

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Header de l'onglet */}
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

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="w-14 h-14 rounded-full bg-white/[0.04] flex items-center justify-center">
            <FileText className="w-6 h-6 text-white/30" />
          </div>
          <h3 className="text-[14px] text-white/70 font-medium">Aucun brief pour cette taxonomie</h3>
          <p className="text-[12px] text-white/40 max-w-sm">
            La création de briefs clients sera disponible prochainement. En attendant, vous pouvez
            configurer le formulaire client qui sera utilisé pour recueillir les demandes.
          </p>
          <button
            onClick={openFormBuilder}
            className="mt-2 text-[12px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 px-4 py-2 rounded-md transition-colors"
          >
            Configurer le formulaire →
          </button>
        </div>
      </div>

      <FormBuilderModal
        open={formBuilderOpen}
        taxonomy={taxonomy}
        onClose={closeFormBuilder}
      />
    </>
  )
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/BriefsPanel.tsx
git commit -m "feat(briefs): add BriefsPanel with empty state and form builder access"
```

---

## Task 9 : `TaxonomyMainTabs` + intégration dans `TaxonomiesPage`

**Files:**
- Create: `src/components/taxonomy/TaxonomyMainTabs.tsx`
- Modify: `src/pages/TaxonomiesPage.tsx`

- [ ] **Step 1: Créer TaxonomyMainTabs**

Create `src/components/taxonomy/TaxonomyMainTabs.tsx`:
```tsx
import { useBriefUIStore, type TaxonomyTab } from '@/stores/brief.store'

interface TabDef {
  id: TaxonomyTab
  label: string
}

const TABS: TabDef[] = [
  { id: 'tree', label: 'Arbre' },
  { id: 'briefs', label: 'Briefs clients' },
]

export function TaxonomyMainTabs() {
  const { currentTab, setCurrentTab } = useBriefUIStore()

  return (
    <div className="h-10 bg-[#141414] border-b border-white/[0.06] flex items-center px-2 gap-1 shrink-0">
      {TABS.map((tab) => {
        const active = currentTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => setCurrentTab(tab.id)}
            className={`text-[12px] px-3 py-1.5 rounded-md transition-colors ${
              active
                ? 'bg-white/[0.08] text-white'
                : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
            }`}
            aria-pressed={active}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Lire TaxonomiesPage.tsx pour préparer la modification**

Run: `cat src/pages/TaxonomiesPage.tsx`

Repérer le bloc JSX à l'intérieur du `<main>` qui rend actuellement l'arbre (header avec SearchBar + TaxonomyTree). Ce bloc devra être conditionné par `currentTab === 'tree'`.

- [ ] **Step 3: Modifier TaxonomiesPage**

Ajouter en haut du fichier :
```ts
import { TaxonomyMainTabs } from '@/components/taxonomy/TaxonomyMainTabs'
import { BriefsPanel } from '@/components/briefs/BriefsPanel'
import { useBriefUIStore } from '@/stores/brief.store'
```

Dans le composant, ajouter :
```ts
const currentTab = useBriefUIStore((s) => s.currentTab)
```

Dans le JSX, **immédiatement avant** le bloc `<>` qui contient le header + TaxonomyTree (la branche `!selectedTaxonomy ? ... : (<> ... </>)`), ajouter un wrapper qui rend :
- `<TaxonomyMainTabs />` en haut
- Puis conditionnellement : si `currentTab === 'tree'` → garde le rendu actuel (header + TaxonomyTree), si `currentTab === 'briefs'` → `<BriefsPanel taxonomy={selectedTaxonomy} />`.

Concrètement, remplacer la branche `<> header + TaxonomyTree </>` existante par :
```tsx
<>
  <TaxonomyMainTabs />
  {currentTab === 'tree' ? (
    <>
      {/* bloc header avec SearchBar + boutons existant */}
      {/* puis TaxonomyTree */}
      {/* ← GARDER LE CONTENU ACTUEL INTACT ICI */}
    </>
  ) : (
    <BriefsPanel taxonomy={selectedTaxonomy} />
  )}
</>
```

**Important :** préserver exactement le rendu actuel de l'onglet "Arbre". Aucune modification visuelle quand `currentTab === 'tree'`. Le test de non-régression est : recharger la page, l'app doit ressembler exactement à avant, mais avec une barre d'onglets en plus au-dessus.

- [ ] **Step 4: Vérifier tsc et lint**

Run: `npx tsc -b && npm run lint`
Expected: pas de nouvelle erreur.

- [ ] **Step 5: Smoke test manuel**

Run: `npm run dev`

Dans le navigateur :
1. Sélectionner une taxonomie dans la sidebar → onglets "Arbre" et "Briefs clients" visibles
2. Onglet "Arbre" → comportement inchangé (recherche, expand/collapse, add node, etc.)
3. Onglet "Briefs clients" → empty state + bouton "Configurer le formulaire"
4. Clic sur "Configurer le formulaire" → modale plein écran avec 3 colonnes :
   - Gauche : 11 champs builtins listés, drag handle visible
   - Centre : édition du premier champ sélectionné
   - Droite : aperçu live du formulaire
5. Modifier le label d'un champ → l'aperçu droit se met à jour instantanément
6. Ajouter un champ custom via "+ Ajouter un champ" → apparaît en bas de la liste et dans l'aperçu
7. Réorganiser les champs par drag-and-drop → l'aperçu reflète l'ordre
8. Supprimer un champ custom → disparaît ; pas de bouton supprimer sur les builtins
9. Cliquer "Enregistrer" → toast de succès, modale se ferme
10. Rouvrir la modale → les modifications sont persistées (lues depuis Firestore)

- [ ] **Step 6: Commit**

```bash
git add src/components/taxonomy/TaxonomyMainTabs.tsx src/pages/TaxonomiesPage.tsx
git commit -m "feat(taxonomy): add main tabs (Arbre / Briefs clients)"
```

---

## Task 10 : Vérification globale du lot

**Files:** aucune modification.

- [ ] **Step 1: Suite de tests**

Run: `npm run test:run`
Expected: 27 tests passing (21 du lot 1 + 6 du registry fieldTypes), 0 failed.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: 0 erreur nouvelle par rapport au lot 1.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 erreur nouvelle.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

---

## Récapitulatif

À l'issue du lot 2 :
- Nouveau store UI `useBriefUIStore` (tab + modale)
- 9 composants de champs du `form-renderer` (Text, Textarea, Number, Email, Select, Color, LogoUpload, BudgetRange, Address)
- `DynamicFormRenderer` réutilisable (consommé ici par l'aperçu du builder, consommé au Lot 3 par le Step 1 du brief)
- `FormBuilderModal` plein écran 3 colonnes avec drag-and-drop, ajout/suppression/réorder, aperçu live
- `BriefsPanel` avec empty state et accès au builder
- `TaxonomyMainTabs` + intégration transparente dans `TaxonomiesPage` (zéro régression sur l'onglet Arbre)
- 27 tests unitaires passants (21 lot 1 + 6 registry)
- Premier jalon visible utilisateur : tu peux configurer le formulaire client d'une taxonomie et voir le résultat en live

**Hors scope du lot :**
- Liste des briefs réels (empty state pour l'instant)
- Création/édition d'un brief (Lot 3)
- Upload logo vers Firebase Storage (input URL seulement)
- Appels IA (Lot 3)

**Prochaine étape (Lot 3) :** implémenter les étapes 1-2-3 du brief (formulaire client rempli, questions dynamiques IA, génération panier), consommer `DynamicFormRenderer` dans le Step 1, brancher la Cloud Function Gemini, afficher la liste des briefs dans `BriefsPanel`.
