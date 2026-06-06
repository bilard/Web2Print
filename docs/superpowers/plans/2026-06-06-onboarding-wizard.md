# Wizard d'onboarding A→Z — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le wizard mono-étape `OnboardingKeysWizard` par un assistant de configuration en 5 étapes (clés LLM obligatoire, cascade IA, connecteurs, profil/tour), auto-ouvert pour les nouveaux users tant qu'aucune clé LLM n'existe, mémorisé par un flag Firestore `users/{uid}.onboardingComplete`.

**Architecture:** Logique d'ouverture isolée dans une fonction pure testable (`shouldAutoOpenOnboarding`) + un store Zustand (`onboarding.store.ts`) pilotant l'ouverture/l'étape. Le flag `onboardingComplete` est lu en piggyback sur le `getDoc(users/{uid})` déjà fait par `useAccessInit` (exposé via `access.store`), et écrit par `completeOnboarding(uid)` (gardé contre la fluctuation auth `null→uid`). Les composants lourds de config (cascade IA, lignes connecteurs Drive/Bright Data) sont extraits de `SettingsPanel.tsx` (1237 l) en composants partagés, réutilisés par le wizard ET les Réglages — aucune logique métier dupliquée.

**Tech Stack:** React 18 + TypeScript strict, Zustand v4, Firebase Firestore (merge writes), Vitest, Tailwind (dark mode `#0f0f0f`/`#1a1a1a`/accent `#6366f1`), driver.js (`features/tour`).

**Référence spec :** `docs/superpowers/specs/2026-06-06-onboarding-wizard-design.md`

**Vérification globale :** types via `npx tsc -b` (⚠️ jamais `tsc --noEmit`), tests via `npm run test:run`, build via `npm run build`.

---

## Structure des fichiers

**Créés :**
- `src/features/onboarding/onboardingGate.ts` — fonction pure `shouldAutoOpenOnboarding`
- `src/features/onboarding/onboardingGate.test.ts` — table de vérité
- `src/features/onboarding/completeOnboarding.ts` — écriture du flag (gardée)
- `src/features/onboarding/completeOnboarding.test.ts`
- `src/features/onboarding/onboarding.store.ts` — état `{ open, step }` + actions
- `src/features/onboarding/OnboardingWizard.tsx` — coquille modale + câblage du gate
- `src/features/onboarding/steps/WelcomeStep.tsx`
- `src/features/onboarding/steps/KeysStep.tsx`
- `src/features/onboarding/steps/AiStep.tsx`
- `src/features/onboarding/steps/ConnectorsStep.tsx`
- `src/features/onboarding/steps/FinishStep.tsx`
- `src/features/onboarding/ResumeSetupButton.tsx` — bouton de ré-entrée partagé
- `src/features/ai/providerLogos.tsx` — logos providers (déplacés depuis SettingsPanel)
- `src/features/ai/AiCascadeEditor.tsx` — sélecteur de cascade (extrait)
- `src/features/gdrive/GDriveConnectorRow.tsx` — ligne Drive (extraite)
- `src/features/scraping/BrightDataConnectorRow.tsx` — ligne Bright Data (extraite)

**Modifiés :**
- `src/stores/access.store.ts` — ajout champ `onboardingComplete` + setter
- `src/features/access/useAccess.ts` — lecture du flag (piggyback)
- `src/components/shared/SettingsPanel.tsx` — imports des composants extraits + bandeau de ré-entrée
- `src/pages/DashboardPage.tsx` — remplace `<OnboardingKeysWizard />` par `<OnboardingWizard />`
- `src/features/navigation/ModuleNavDrawer.tsx` — entrée « Configurer l'application »

**Supprimés :**
- `src/features/onboarding/OnboardingKeysWizard.tsx`

**Conservé inchangé :** `src/features/onboarding/onboardingKeys.ts` (`hasAnyLlmKey`, `LLM_KEY_IDS`, `RECOMMENDED_KEY_IDS`, `ONBOARDING_DISMISS_KEY`), `src/components/shared/ApiKeyRow.tsx`, `src/features/telegram/TelegramSettings.tsx`.

---

## Phase A — Logique & état (TDD)

### Task 1: Fonction pure du gate d'auto-ouverture

**Files:**
- Create: `src/features/onboarding/onboardingGate.ts`
- Test: `src/features/onboarding/onboardingGate.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// src/features/onboarding/onboardingGate.test.ts
import { describe, it, expect } from 'vitest'
import { shouldAutoOpenOnboarding } from './onboardingGate'

const base = {
  hydrated: true,
  accessLoading: false,
  onboardingComplete: false,
  hasLlmKey: false,
  dismissedThisSession: false,
}

describe('shouldAutoOpenOnboarding', () => {
  it('ouvre pour un nouvel user : hydraté, pas de flag, pas de clé', () => {
    expect(shouldAutoOpenOnboarding(base)).toBe(true)
  })
  it('n\'ouvre pas tant que les clés ne sont pas hydratées (évite le flash)', () => {
    expect(shouldAutoOpenOnboarding({ ...base, hydrated: false })).toBe(false)
  })
  it('n\'ouvre pas tant que l\'accès n\'est pas hydraté', () => {
    expect(shouldAutoOpenOnboarding({ ...base, accessLoading: true })).toBe(false)
  })
  it('n\'ouvre pas si onboarding déjà terminé', () => {
    expect(shouldAutoOpenOnboarding({ ...base, onboardingComplete: true })).toBe(false)
  })
  it('CAS USER EXISTANT : a déjà une clé → ne s\'ouvre PAS même sans flag', () => {
    expect(shouldAutoOpenOnboarding({ ...base, hasLlmKey: true })).toBe(false)
  })
  it('n\'ouvre pas si « Plus tard » a été cliqué cette session', () => {
    expect(shouldAutoOpenOnboarding({ ...base, dismissedThisSession: true })).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npm run test:run -- src/features/onboarding/onboardingGate.test.ts`
Expected: FAIL (`shouldAutoOpenOnboarding` introuvable / module manquant)

- [ ] **Step 3: Implémenter la fonction pure**

```ts
// src/features/onboarding/onboardingGate.ts

/** Entrées (toutes synchrones) qui décident de l'auto-ouverture du wizard. */
export interface OnboardingGateInputs {
  /** Les clés API sont-elles hydratées depuis Firestore ? (sinon flash) */
  hydrated: boolean
  /** L'accès (et donc le flag onboardingComplete) est-il encore en cours de chargement ? */
  accessLoading: boolean
  /** Flag Firestore : l'utilisateur a-t-il déjà terminé le wizard ? */
  onboardingComplete: boolean
  /** Au moins une clé LLM est-elle configurée ? */
  hasLlmKey: boolean
  /** « Plus tard » cliqué pendant cette session ? */
  dismissedThisSession: boolean
}

/**
 * Vrai ⟺ on doit auto-ouvrir le wizard. Dès qu'une clé LLM existe, plus
 * d'auto-ouverture — ce qui garantit que les users existants (clés déjà là,
 * pas de flag) ne sont jamais harcelés.
 */
export function shouldAutoOpenOnboarding(i: OnboardingGateInputs): boolean {
  if (!i.hydrated || i.accessLoading) return false
  if (i.onboardingComplete) return false
  if (i.dismissedThisSession) return false
  return !i.hasLlmKey
}
```

- [ ] **Step 4: Lancer le test → succès**

Run: `npm run test:run -- src/features/onboarding/onboardingGate.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding/onboardingGate.ts src/features/onboarding/onboardingGate.test.ts
git commit -m "feat(onboarding): fonction pure shouldAutoOpenOnboarding + tests"
```

---

### Task 2: Écriture du flag `onboardingComplete` (gardée)

**Files:**
- Create: `src/features/onboarding/completeOnboarding.ts`
- Test: `src/features/onboarding/completeOnboarding.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// src/features/onboarding/completeOnboarding.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const setDoc = vi.fn(() => Promise.resolve())
const doc = vi.fn((_db, _col, uid) => ({ _path: `users/${uid}` }))
vi.mock('firebase/firestore', () => ({ setDoc: (...a: unknown[]) => setDoc(...a), doc: (...a: unknown[]) => doc(...a) }))
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

import { completeOnboarding } from './completeOnboarding'

beforeEach(() => { setDoc.mockClear(); doc.mockClear() })

describe('completeOnboarding', () => {
  it('uid vide → aucune écriture (garde anti null→uid)', async () => {
    await completeOnboarding('')
    expect(setDoc).not.toHaveBeenCalled()
  })
  it('uid valide → setDoc merge { onboardingComplete: true }', async () => {
    await completeOnboarding('abc123')
    expect(setDoc).toHaveBeenCalledTimes(1)
    const [, payload, opts] = setDoc.mock.calls[0]
    expect(payload).toEqual({ onboardingComplete: true })
    expect(opts).toEqual({ merge: true })
  })
})
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npm run test:run -- src/features/onboarding/completeOnboarding.test.ts`
Expected: FAIL (module manquant)

- [ ] **Step 3: Implémenter**

```ts
// src/features/onboarding/completeOnboarding.ts
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

/**
 * Marque l'onboarding comme terminé dans users/{uid}. `merge: true` n'écrase ni
 * les secrets ni les champs access*. Garde `if (!uid) return` : la fluctuation
 * auth null→uid a déjà poussé un {} qui a effacé la config Telegram — on n'écrit
 * jamais sans uid stable et truthy.
 */
export async function completeOnboarding(uid: string): Promise<void> {
  if (!uid) return
  try {
    await setDoc(doc(db, 'users', uid), { onboardingComplete: true }, { merge: true })
  } catch (e) {
    console.warn('[completeOnboarding] failed:', e)
  }
}
```

- [ ] **Step 4: Lancer le test → succès**

Run: `npm run test:run -- src/features/onboarding/completeOnboarding.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding/completeOnboarding.ts src/features/onboarding/completeOnboarding.test.ts
git commit -m "feat(onboarding): completeOnboarding écrit le flag Firestore (gardé null→uid)"
```

---

### Task 3: Exposer `onboardingComplete` via access.store (piggyback)

**Files:**
- Modify: `src/stores/access.store.ts`
- Modify: `src/features/access/useAccess.ts:43-49` (l'appel `setAccess`) et `useAccess.ts:53` (le fallback catch)

- [ ] **Step 1: Ajouter le champ + setter au store**

Dans `src/stores/access.store.ts`, modifier l'interface `AccessState` et le créateur. Remplacer le bloc interface + create par :

```ts
interface AccessState {
  permissions: Set<string>
  roleId: string | null
  isOwner: boolean
  blocked: boolean
  loading: boolean
  /** Flag Firestore users/{uid}.onboardingComplete — lu en piggyback à l'hydratation de l'accès. */
  onboardingComplete: boolean
  setAccess: (a: { permissions: Set<string>; roleId: string | null; isOwner: boolean; blocked: boolean; onboardingComplete: boolean }) => void
  setLoading: (loading: boolean) => void
  /** Mise à jour locale après clic « Terminer » (évite la réouverture dans la session). */
  setOnboardingComplete: (v: boolean) => void
  reset: () => void
}

export const useAccessStore = create<AccessState>((set) => ({
  permissions: new Set(),
  roleId: null,
  isOwner: false,
  blocked: false,
  loading: true,
  onboardingComplete: false,
  setAccess: (a) => set({ ...a, loading: false }),
  setLoading: (loading) => set({ loading }),
  setOnboardingComplete: (v) => set({ onboardingComplete: v }),
  reset: () => set({ permissions: new Set(), roleId: null, isOwner: false, blocked: false, loading: true, onboardingComplete: false }),
}))
```

- [ ] **Step 2: Lire le flag dans useAccessInit**

Dans `src/features/access/useAccess.ts`, dans le bloc `try` après `const revokes = ...` (vers la ligne 27), ajouter la lecture :

```ts
        const onboardingComplete = (data.onboardingComplete as boolean | undefined) ?? false
```

Puis, dans l'appel `setAccess({ ... })` (lignes 43-49), ajouter `onboardingComplete` au payload :

```ts
        setAccess({
          permissions: blocked ? new Set() : computeEffectivePermissions({ isOwner, rolePermissions, grants, revokes }),
          roleId: resolvedRoleId,
          isOwner,
          blocked,
          onboardingComplete,
        })
```

Et dans le `catch` (ligne ~53), ajouter `onboardingComplete: false` au payload de secours :

```ts
        setAccess({ permissions: computeEffectivePermissions({ isOwner, rolePermissions: null, grants: [], revokes: [] }), roleId: null, isOwner, blocked: false, onboardingComplete: false })
```

- [ ] **Step 3: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur (tous les `setAccess` du codebase passent désormais `onboardingComplete`).

- [ ] **Step 4: Commit**

```bash
git add src/stores/access.store.ts src/features/access/useAccess.ts
git commit -m "feat(onboarding): expose onboardingComplete via access.store (lecture piggyback)"
```

---

### Task 4: Store du wizard (ouverture / étape)

**Files:**
- Create: `src/features/onboarding/onboarding.store.ts`

- [ ] **Step 1: Implémenter le store**

```ts
// src/features/onboarding/onboarding.store.ts
import { create } from 'zustand'

/** Nombre total d'étapes (0=Bienvenue … 4=Profil/Tour). */
export const ONBOARDING_STEP_COUNT = 5

interface OnboardingState {
  /** La modale est-elle ouverte ? */
  open: boolean
  /** Index de l'étape courante (0-based). */
  step: number
  /** Ouvre le wizard (auto-gate OU ré-entrée manuelle), toujours à l'étape 0. */
  openWizard: () => void
  /** Ferme le wizard. */
  closeWizard: () => void
  next: () => void
  prev: () => void
  goTo: (step: number) => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  open: false,
  step: 0,
  openWizard: () => set({ open: true, step: 0 }),
  closeWizard: () => set({ open: false }),
  next: () => set((s) => ({ step: Math.min(s.step + 1, ONBOARDING_STEP_COUNT - 1) })),
  prev: () => set((s) => ({ step: Math.max(s.step - 1, 0) })),
  goTo: (step) => set({ step: Math.max(0, Math.min(step, ONBOARDING_STEP_COUNT - 1)) }),
}))
```

- [ ] **Step 2: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/onboarding.store.ts
git commit -m "feat(onboarding): store Zustand open/step du wizard"
```

---

## Phase B — Extraction de composants partagés (chirurgical)

> Règle pour toute la phase B : **un composant à la fois**, `npx tsc -b` après chaque tâche, et vérifier visuellement que `SettingsPanel` rend toujours (onglet IA / Connecteurs). Chaque nouveau fichier < 150 lignes. **Déplacement verbatim** : on ne réécrit pas la logique, on relocalise le code existant et on ajuste imports/exports.

### Task 5: Déplacer les logos providers vers un module partagé

**Files:**
- Create: `src/features/ai/providerLogos.tsx`
- Modify: `src/components/shared/SettingsPanel.tsx` (supprimer les consts locales, importer depuis le nouveau module)

- [ ] **Step 1: Créer le module de logos**

Couper **verbatim** depuis `SettingsPanel.tsx` les définitions de composants logos suivantes et les coller dans le nouveau fichier, en les préfixant de `export` :
- `FirebaseLogo` (l.79), `GeminiLogo` (l.92), `ClaudeLogo` (l.105), `OpenAILogo` (l.114), `DeepSeekLogo` (l.123), `KimiLogo` (l.132), `OpenRouterLogo` (l.142), `QwenLogo` (l.155), `JinaLogo` (l.164), `RemoveBgLogo` (l.170), `FirecrawlLogo` (l.178), `ScrapflyLogo` (l.184), `BrightDataLogo` (l.190), `GDriveLogo` (l.196).

```tsx
// src/features/ai/providerLogos.tsx
// Logos SVG inline des providers IA et connecteurs, partagés entre SettingsPanel,
// le wizard d'onboarding (cascade) et les lignes connecteurs extraites.
// (Coller ici le corps EXACT de chaque composant logo, préfixé de `export`.)

export const FirebaseLogo = () => (
  /* …corps inchangé depuis SettingsPanel… */
)
// … idem pour GeminiLogo, ClaudeLogo, OpenAILogo, DeepSeekLogo, KimiLogo,
//    OpenRouterLogo, QwenLogo, JinaLogo, RemoveBgLogo, FirecrawlLogo,
//    ScrapflyLogo, BrightDataLogo, GDriveLogo.
```

- [ ] **Step 2: Importer dans SettingsPanel**

Dans `SettingsPanel.tsx`, supprimer les 14 consts logos déplacées et ajouter en tête :

```ts
import {
  FirebaseLogo, GeminiLogo, ClaudeLogo, OpenAILogo, DeepSeekLogo, KimiLogo,
  OpenRouterLogo, QwenLogo, JinaLogo, RemoveBgLogo, FirecrawlLogo, ScrapflyLogo,
  BrightDataLogo, GDriveLogo,
} from '@/features/ai/providerLogos'
```

- [ ] **Step 3: Vérifier types + rendu**

Run: `npx tsc -b`
Expected: aucune erreur. Vérifier que les onglets Réglages affichent toujours les logos.

- [ ] **Step 4: Commit**

```bash
git add src/features/ai/providerLogos.tsx src/components/shared/SettingsPanel.tsx
git commit -m "refactor(settings): logos providers extraits dans features/ai/providerLogos"
```

---

### Task 6: Extraire `AiCascadeEditor` (sélecteur de cascade)

**Files:**
- Create: `src/features/ai/AiCascadeEditor.tsx`
- Modify: `src/components/shared/SettingsPanel.tsx` (supprimer `CASCADE_PROVIDER_INFO`, `ALL_REASONING_PROVIDERS`, `ReasoningCascadeSelector` ; importer `<AiCascadeEditor />`)

- [ ] **Step 1: Créer le composant**

Déplacer **verbatim** depuis `SettingsPanel.tsx` : `CASCADE_PROVIDER_INFO` (l.586), `ALL_REASONING_PROVIDERS` (l.595) et la fonction `ReasoningCascadeSelector` (l.597-724), renommée `AiCascadeEditor` et exportée. Ajouter les imports requis dans le nouveau fichier :

```tsx
// src/features/ai/AiCascadeEditor.tsx
import { useState } from 'react'
import { Sparkles, ChevronUp, ChevronDown, X, Plus } from 'lucide-react'
import { useAiSettingsStore, getSelectedModel, type ReasoningProvider } from '@/stores/aiSettings.store'
import type { AiProvider } from '@/lib/aiModels'
import { GeminiLogo, ClaudeLogo, OpenAILogo, DeepSeekLogo, QwenLogo, OpenRouterLogo } from './providerLogos'

const CASCADE_PROVIDER_INFO: Record<ReasoningProvider, { label: string; sub: string; logo: React.ReactNode }> = {
  /* …corps inchangé (gemini/claude/openai/deepseek/qwen/openrouter)… */
}

const ALL_REASONING_PROVIDERS: ReasoningProvider[] = ['gemini', 'claude', 'openai', 'deepseek', 'qwen', 'openrouter']

export function AiCascadeEditor() {
  /* …corps EXACT de ReasoningCascadeSelector, inchangé… */
}
```

- [ ] **Step 2: Brancher dans SettingsPanel**

Dans `SettingsPanel.tsx` : supprimer `CASCADE_PROVIDER_INFO`, `ALL_REASONING_PROVIDERS`, `ReasoningCascadeSelector`. Ajouter l'import :

```ts
import { AiCascadeEditor } from '@/features/ai/AiCascadeEditor'
```

Dans `AiTab` (l.741), remplacer `<ReasoningCascadeSelector />` par `<AiCascadeEditor />`. Nettoyer les imports lucide devenus inutilisés dans SettingsPanel uniquement s'ils ne servent plus ailleurs (vérifier `ChevronUp/ChevronDown` etc. via recherche dans le fichier avant suppression).

- [ ] **Step 3: Vérifier types + rendu**

Run: `npx tsc -b`
Expected: aucune erreur. Onglet IA des Réglages : la cascade s'affiche, monter/descendre/retirer/ajouter fonctionnent.

- [ ] **Step 4: Commit**

```bash
git add src/features/ai/AiCascadeEditor.tsx src/components/shared/SettingsPanel.tsx
git commit -m "refactor(settings): cascade de raisonnement extraite dans AiCascadeEditor"
```

---

### Task 7: Extraire `GDriveConnectorRow`

**Files:**
- Create: `src/features/gdrive/GDriveConnectorRow.tsx`
- Modify: `src/components/shared/SettingsPanel.tsx` (supprimer la fonction locale, importer)

- [ ] **Step 1: Créer le composant**

Déplacer **verbatim** la fonction `GDriveConnectorRow` (`SettingsPanel.tsx:490-566`), exportée. Imports requis :

```tsx
// src/features/gdrive/GDriveConnectorRow.tsx
import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, LogOut } from 'lucide-react'
import { GDriveLogo } from '@/features/ai/providerLogos'
import { useGoogleDrive } from '@/features/gdrive/useGoogleDrive'
import { useGDriveStore } from '@/stores/gdrive.store'
import { useGDriveSettings } from '@/features/gdrive/useGDriveSettings'

export function GDriveConnectorRow() {
  /* …corps EXACT, inchangé… */
}
```

- [ ] **Step 2: Brancher dans SettingsPanel**

Supprimer la fonction locale `GDriveConnectorRow`. Ajouter l'import :

```ts
import { GDriveConnectorRow } from '@/features/gdrive/GDriveConnectorRow'
```

(`ConnectorsTab` utilise déjà `<GDriveConnectorRow />` — aucun changement d'usage.)

- [ ] **Step 3: Vérifier types + rendu**

Run: `npx tsc -b`
Expected: aucune erreur. Onglet Connecteurs : la ligne Google Drive s'affiche (connecter/déconnecter OK).

- [ ] **Step 4: Commit**

```bash
git add src/features/gdrive/GDriveConnectorRow.tsx src/components/shared/SettingsPanel.tsx
git commit -m "refactor(settings): ligne Google Drive extraite dans GDriveConnectorRow"
```

---

### Task 8: Extraire `BrightDataConnectorRow`

**Files:**
- Create: `src/features/scraping/BrightDataConnectorRow.tsx`
- Modify: `src/components/shared/SettingsPanel.tsx` (supprimer la fonction locale, importer)

- [ ] **Step 1: Créer le composant**

Déplacer **verbatim** la fonction `BrightDataConnectorRow` (`SettingsPanel.tsx:232-488`, avec tout son state token/ws/test), exportée. Identifier les imports réellement utilisés par son corps et les recopier dans le nouveau fichier (lucide : `Loader2, CheckCircle2, XCircle, Wifi, Eye, EyeOff, KeyRound, CreditCard` ; le logo `BrightDataLogo` depuis `@/features/ai/providerLogos` ; les hooks/imports de chargement du token Bright Data exactement comme dans la version d'origine — repérer en haut de `SettingsPanel.tsx` les imports relatifs à Bright Data et les déplacer/copier).

```tsx
// src/features/scraping/BrightDataConnectorRow.tsx
import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, XCircle, Wifi, Eye, EyeOff, KeyRound, CreditCard } from 'lucide-react'
import { BrightDataLogo } from '@/features/ai/providerLogos'
// + imports du chargement/sauvegarde du token & WS (identiques à la source SettingsPanel)
export function BrightDataConnectorRow() {
  /* …corps EXACT, inchangé… */
}
```

⚠️ Le corps fait un `await import('@/features/scraping/core/brightDataFallback')` dynamique (l.311) — le conserver tel quel.

- [ ] **Step 2: Brancher dans SettingsPanel**

Supprimer la fonction locale `BrightDataConnectorRow`. Ajouter l'import :

```ts
import { BrightDataConnectorRow } from '@/features/scraping/BrightDataConnectorRow'
```

(`ConnectorsTab` utilise déjà `<BrightDataConnectorRow />`.)

- [ ] **Step 3: Vérifier types + rendu**

Run: `npx tsc -b`
Expected: aucune erreur. Onglet Connecteurs : ligne Bright Data complète (token, WS tier 2, bouton test) inchangée.

- [ ] **Step 4: Commit**

```bash
git add src/features/scraping/BrightDataConnectorRow.tsx src/components/shared/SettingsPanel.tsx
git commit -m "refactor(settings): ligne Bright Data extraite dans BrightDataConnectorRow"
```

---

## Phase C — UI du wizard

### Task 9: Composants des 5 étapes

**Files:**
- Create: `src/features/onboarding/steps/WelcomeStep.tsx`
- Create: `src/features/onboarding/steps/KeysStep.tsx`
- Create: `src/features/onboarding/steps/AiStep.tsx`
- Create: `src/features/onboarding/steps/ConnectorsStep.tsx`
- Create: `src/features/onboarding/steps/FinishStep.tsx`

- [ ] **Step 1: WelcomeStep**

```tsx
// src/features/onboarding/steps/WelcomeStep.tsx
import { Sparkles, KeyRound, Cpu, Plug, Compass } from 'lucide-react'

const ITEMS = [
  { icon: KeyRound, label: 'Clés IA', desc: 'Au moins une clé LLM pour faire fonctionner l\'app' },
  { icon: Cpu, label: 'Modèles & cascade', desc: 'Ordre des providers de raisonnement' },
  { icon: Plug, label: 'Connecteurs', desc: 'Google Drive, Telegram, Bright Data' },
  { icon: Compass, label: 'Visite guidée', desc: 'Découvrir l\'interface pas à pas' },
]

export function WelcomeStep() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-6 h-6 text-indigo-300" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Bienvenue sur IBS-Studio</h3>
          <p className="text-xs text-white/50">Configurons votre espace en quelques étapes. Vous pourrez tout modifier plus tard dans les Réglages.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {ITEMS.map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex items-center gap-3 bg-white/[0.03] rounded-xl p-3">
            <Icon className="w-4 h-4 text-indigo-300 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-white/80">{label}</p>
              <p className="text-[11px] text-white/40">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: KeysStep** (réutilise `ApiKeyRow` + helpers existants)

```tsx
// src/features/onboarding/steps/KeysStep.tsx
import { ApiKeyRow } from '@/components/shared/ApiKeyRow'
import { API_KEYS } from '@/lib/apiKeys'
import { LLM_KEY_IDS, RECOMMENDED_KEY_IDS } from '../onboardingKeys'

const KEY_CONFIGS = LLM_KEY_IDS.map((id) => API_KEYS.find((k) => k.id === id)!).filter(Boolean)

export function KeysStep() {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-white">Vos clés IA</h3>
        <p className="text-xs text-white/50 mt-0.5">
          IBS-Studio fonctionne avec votre propre clé LLM. Renseignez-en <span className="text-white/70 font-medium">au moins une</span> pour continuer.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {KEY_CONFIGS.map((cfg) => (
          <div key={cfg.id} className="relative">
            {RECOMMENDED_KEY_IDS.has(cfg.id) && (
              <span className="absolute -top-1.5 right-2 z-10 text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/25 text-indigo-200 border border-indigo-500/30">
                recommandé
              </span>
            )}
            <ApiKeyRow id={cfg.id} label={cfg.label} description={cfg.description} placeholder="Collez votre clé API…" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: AiStep** (réutilise `AiCascadeEditor` extrait)

```tsx
// src/features/onboarding/steps/AiStep.tsx
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAiSettingsStore } from '@/stores/aiSettings.store'
import { AiCascadeEditor } from '@/features/ai/AiCascadeEditor'

export function AiStep() {
  const resetToLatest = useAiSettingsStore((s) => s.resetToLatestModels)
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-white">Modèles & cascade IA</h3>
        <p className="text-xs text-white/50 mt-0.5">
          Définissez l'ordre des providers de raisonnement (le 1ᵉʳ est essayé en priorité, les suivants en fallback). Optionnel — des valeurs par défaut sont déjà en place.
        </p>
      </div>
      <button
        onClick={() => { resetToLatest(); toast.success('Tous les LLM mis à jour vers leur dernière version') }}
        className="flex items-center justify-center gap-1.5 text-xs font-medium text-violet-200 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 rounded-lg px-3 py-2 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Mettre à jour tous les LLM (dernières versions)
      </button>
      <AiCascadeEditor />
    </div>
  )
}
```

- [ ] **Step 4: ConnectorsStep** (réutilise les 3 composants extraits/existants)

```tsx
// src/features/onboarding/steps/ConnectorsStep.tsx
import { Plug } from 'lucide-react'
import { GDriveConnectorRow } from '@/features/gdrive/GDriveConnectorRow'
import { BrightDataConnectorRow } from '@/features/scraping/BrightDataConnectorRow'
import { TelegramSettings } from '@/features/telegram/TelegramSettings'

export function ConnectorsStep() {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-white">Connecteurs</h3>
        <p className="text-xs text-white/50 mt-0.5">
          Branchez vos services externes. Tout est optionnel et reconfigurable dans les Réglages.
        </p>
      </div>
      <GDriveConnectorRow />
      <BrightDataConnectorRow />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 px-1 pt-1 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
          <Plug className="w-3 h-3 text-cyan-400/70" /> Telegram
        </div>
        <div className="bg-white/[0.03] rounded-xl p-3">
          <TelegramSettings />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: FinishStep** (profil + lancement tour)

```tsx
// src/features/onboarding/steps/FinishStep.tsx
import { Compass, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useTourStore } from '@/features/tour/tour.store'

/** props.onLaunchTour : ferme le wizard ET démarre le tour Dashboard. */
export function FinishStep({ onLaunchTour }: { onLaunchTour: () => void }) {
  const user = useAuthStore((s) => s.user)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
        <div>
          <h3 className="text-base font-semibold text-white">Tout est prêt</h3>
          <p className="text-xs text-white/50">Votre espace est configuré. Bienvenue, {user?.displayName ?? user?.email ?? ''}.</p>
        </div>
      </div>
      <div className="bg-white/[0.03] rounded-xl p-4 flex items-center gap-4">
        {user?.photoURL
          ? <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full ring-1 ring-white/10" />
          : <div className="w-12 h-12 rounded-full bg-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-lg">{user?.displayName?.[0] ?? '?'}</div>}
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{user?.displayName}</p>
          <p className="text-xs text-white/40 truncate">{user?.email}</p>
        </div>
      </div>
      <button
        onClick={onLaunchTour}
        className="flex items-center justify-center gap-2 text-sm font-medium text-indigo-200 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 rounded-lg px-4 py-2.5 transition-colors"
      >
        <Compass className="w-4 h-4" /> Lancer la visite guidée du tableau de bord
      </button>
    </div>
  )
}

/** Démarre le tour Dashboard (utilisé par FinishStep via le shell). */
export function startDashboardTour() {
  useTourStore.getState().startTour('dashboard')
}
```

- [ ] **Step 6: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add src/features/onboarding/steps
git commit -m "feat(onboarding): composants des 5 étapes du wizard"
```

---

### Task 10: Coquille `OnboardingWizard` + câblage du gate

**Files:**
- Create: `src/features/onboarding/OnboardingWizard.tsx`

- [ ] **Step 1: Implémenter la coquille**

```tsx
// src/features/onboarding/OnboardingWizard.tsx
import { useEffect } from 'react'
import { X, ChevronLeft } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useAccessStore } from '@/stores/access.store'
import { areApiKeysHydrated, API_KEYS_HYDRATED_EVENT, API_KEYS_UPDATED_EVENT } from '@/features/settings/useApiKeysSync'
import { hasAnyLlmKey, ONBOARDING_DISMISS_KEY } from './onboardingKeys'
import { shouldAutoOpenOnboarding } from './onboardingGate'
import { useOnboardingStore, ONBOARDING_STEP_COUNT } from './onboarding.store'
import { completeOnboarding } from './completeOnboarding'
import { WelcomeStep } from './steps/WelcomeStep'
import { KeysStep } from './steps/KeysStep'
import { AiStep } from './steps/AiStep'
import { ConnectorsStep } from './steps/ConnectorsStep'
import { FinishStep, startDashboardTour } from './steps/FinishStep'

const STEP_TITLES = ['Bienvenue', 'Clés IA', 'Modèles', 'Connecteurs', 'Terminé']

export function OnboardingWizard() {
  const open = useOnboardingStore((s) => s.open)
  const step = useOnboardingStore((s) => s.step)
  const openWizard = useOnboardingStore((s) => s.openWizard)
  const closeWizard = useOnboardingStore((s) => s.closeWizard)
  const next = useOnboardingStore((s) => s.next)
  const prev = useOnboardingStore((s) => s.prev)
  const accessLoading = useAccessStore((s) => s.loading)
  const onboardingComplete = useAccessStore((s) => s.onboardingComplete)
  const setOnboardingComplete = useAccessStore((s) => s.setOnboardingComplete)
  const uid = useAuthStore((s) => s.user?.uid)

  // Auto-ouverture : réévalue à l'hydratation des clés / changement d'accès.
  useEffect(() => {
    const evaluate = () => {
      const dismissed = sessionStorage.getItem(ONBOARDING_DISMISS_KEY) === '1'
      if (shouldAutoOpenOnboarding({
        hydrated: areApiKeysHydrated(),
        accessLoading,
        onboardingComplete,
        hasLlmKey: hasAnyLlmKey(),
        dismissedThisSession: dismissed,
      })) {
        openWizard()
      }
    }
    evaluate()
    window.addEventListener(API_KEYS_HYDRATED_EVENT, evaluate)
    window.addEventListener(API_KEYS_UPDATED_EVENT, evaluate)
    return () => {
      window.removeEventListener(API_KEYS_HYDRATED_EVENT, evaluate)
      window.removeEventListener(API_KEYS_UPDATED_EVENT, evaluate)
    }
  }, [accessLoading, onboardingComplete, openWizard])

  if (!open) return null

  const isLast = step === ONBOARDING_STEP_COUNT - 1
  const keyReady = hasAnyLlmKey()
  // Étape 1 (Clés, index 1) bloque la progression tant qu'aucune clé n'existe.
  const nextDisabled = step === 1 && !keyReady

  const dismiss = () => {
    sessionStorage.setItem(ONBOARDING_DISMISS_KEY, '1')
    closeWizard()
  }

  const finish = async () => {
    if (uid) {
      await completeOnboarding(uid)
      setOnboardingComplete(true)
    }
    closeWizard()
  }

  const launchTour = async () => {
    await finish()
    startDashboardTour()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg max-h-[88vh] flex flex-col bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* En-tête : progression + fermer */}
        <div className="p-4 border-b border-white/[0.06] flex items-center gap-3">
          <div className="flex-1 flex items-center gap-1.5">
            {STEP_TITLES.map((t, i) => (
              <div key={t} className="flex items-center gap-1.5">
                <span className={`w-6 h-6 rounded-full text-[10px] font-semibold flex items-center justify-center transition-colors ${
                  i === step ? 'bg-indigo-500 text-white' : i < step ? 'bg-indigo-500/30 text-indigo-200' : 'bg-white/5 text-white/30'
                }`}>{i + 1}</span>
                {i < STEP_TITLES.length - 1 && <span className={`w-4 h-px ${i < step ? 'bg-indigo-500/40' : 'bg-white/10'}`} />}
              </div>
            ))}
          </div>
          <button onClick={dismiss} title="Plus tard" className="text-white/30 hover:text-white/70 transition-colors p-1 rounded hover:bg-white/5 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenu de l'étape */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 0 && <WelcomeStep />}
          {step === 1 && <KeysStep />}
          {step === 2 && <AiStep />}
          {step === 3 && <ConnectorsStep />}
          {step === 4 && <FinishStep onLaunchTour={launchTour} />}
        </div>

        {/* Pied : nav */}
        <div className="p-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <button
            onClick={prev}
            disabled={step === 0}
            className="flex items-center gap-1 text-xs text-white/50 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-2 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Précédent
          </button>
          <div className="flex items-center gap-2">
            {!isLast && step >= 2 && (
              <button onClick={next} className="text-xs text-white/40 hover:text-white/70 px-3 py-2 rounded-lg transition-colors">
                Passer
              </button>
            )}
            {step === 1 && (
              <button onClick={dismiss} className="text-xs text-white/40 hover:text-white/70 px-3 py-2 rounded-lg transition-colors">
                Plus tard
              </button>
            )}
            {isLast ? (
              <button onClick={finish} className="text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg transition-colors">
                Terminer
              </button>
            ) : (
              <button
                onClick={next}
                disabled={nextDisabled}
                title={nextDisabled ? 'Renseignez au moins une clé LLM' : undefined}
                className="text-xs font-medium bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
              >
                Suivant
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/OnboardingWizard.tsx
git commit -m "feat(onboarding): coquille du wizard (progression, nav, gate, fin+tour)"
```

---

### Task 11: Monter le nouveau wizard, supprimer l'ancien

**Files:**
- Modify: `src/pages/DashboardPage.tsx:10` (import) et `:278` (montage)
- Delete: `src/features/onboarding/OnboardingKeysWizard.tsx`

- [ ] **Step 1: Remplacer l'import et le montage**

Dans `src/pages/DashboardPage.tsx`, remplacer la ligne 10 :

```ts
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
```

et la ligne 278 :

```tsx
      <OnboardingWizard />
```

- [ ] **Step 2: Supprimer l'ancien wizard**

```bash
git rm src/features/onboarding/OnboardingKeysWizard.tsx
```

- [ ] **Step 3: Vérifier qu'aucune autre référence ne subsiste**

Run: `grep -rn "OnboardingKeysWizard" src/`
Expected: aucun résultat.

- [ ] **Step 4: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat(onboarding): monte OnboardingWizard, supprime l'ancien wizard mono-étape"
```

---

## Phase D — Points de ré-entrée manuels

### Task 12: Bouton de ré-entrée partagé + bandeau Réglages

**Files:**
- Create: `src/features/onboarding/ResumeSetupButton.tsx`
- Modify: `src/components/shared/SettingsPanel.tsx` (passer un bandeau dans `headerBlock`)

- [ ] **Step 1: Composant bouton réutilisable**

```tsx
// src/features/onboarding/ResumeSetupButton.tsx
import { Sparkles } from 'lucide-react'
import { useOnboardingStore } from './onboarding.store'

/** Variante `banner` (Réglages) ou `item` (drawer de nav). Ouvre le wizard à l'étape 0. */
export function ResumeSetupButton({ variant = 'banner' }: { variant?: 'banner' | 'item' }) {
  const openWizard = useOnboardingStore((s) => s.openWizard)
  if (variant === 'item') {
    return (
      <button
        onClick={openWizard}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
      >
        <Sparkles className="w-4 h-4 text-indigo-300 shrink-0" />
        <span className="text-sm font-medium">Configurer l'application</span>
      </button>
    )
  }
  return (
    <button
      onClick={openWizard}
      className="w-full flex items-center gap-3 bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/10 border border-indigo-500/25 rounded-xl px-4 py-3 hover:from-indigo-500/25 transition-colors text-left"
    >
      <Sparkles className="w-5 h-5 text-indigo-300 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">Assistant de configuration</p>
        <p className="text-[11px] text-white/50">Reprendre la mise en place guidée (clés, modèles, connecteurs)</p>
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Afficher le bandeau en tête du SettingsPanel**

Dans `SettingsPanel.tsx`, importer le composant :

```ts
import { ResumeSetupButton } from '@/features/onboarding/ResumeSetupButton'
```

Dans `headerBlock` (l.1170), insérer le bandeau juste après `{header}` et avant le `<nav>` :

```tsx
  const headerBlock = (
    <div className="flex flex-col gap-4 shrink-0">
      {header}
      <ResumeSetupButton variant="banner" />
      <nav
        aria-label="Sections des paramètres"
        /* …inchangé… */
      >
```

- [ ] **Step 3: Vérifier types + rendu**

Run: `npx tsc -b`
Expected: aucune erreur. Le bandeau apparaît en tête des Réglages ; un clic ouvre le wizard à l'étape 0.

- [ ] **Step 4: Commit**

```bash
git add src/features/onboarding/ResumeSetupButton.tsx src/components/shared/SettingsPanel.tsx
git commit -m "feat(onboarding): bouton de ré-entrée + bandeau Assistant de configuration dans les Réglages"
```

---

### Task 13: Entrée dans le drawer de navigation

**Files:**
- Modify: `src/features/navigation/ModuleNavDrawer.tsx`

- [ ] **Step 1: Repérer le point d'insertion**

Run: `grep -n "return (\|footer\|</nav>\|modules.map\|className=\"" src/features/navigation/ModuleNavDrawer.tsx | head -20`
Expected: identifier la fin de la liste des modules (avant fermeture du drawer) pour y placer une zone « bas de drawer ».

- [ ] **Step 2: Insérer `ResumeSetupButton variant="item"`**

Importer en tête :

```ts
import { ResumeSetupButton } from '@/features/onboarding/ResumeSetupButton'
```

Ajouter, en pied de la liste des entrées du drawer (après le dernier module, dans une section séparée par une bordure) :

```tsx
        <div className="mt-2 pt-2 border-t border-white/[0.06]">
          <ResumeSetupButton variant="item" />
        </div>
```

(Adapter le wrapper exact aux classes du drawer repérées au Step 1, en restant cohérent avec le style des autres entrées.)

- [ ] **Step 3: Vérifier types + rendu**

Run: `npx tsc -b`
Expected: aucune erreur. Le drawer affiche « Configurer l'application » en pied ; un clic ouvre le wizard.

- [ ] **Step 4: Commit**

```bash
git add src/features/navigation/ModuleNavDrawer.tsx
git commit -m "feat(onboarding): entrée « Configurer l'application » dans le drawer de nav"
```

---

## Phase E — Vérification finale

### Task 14: Build + lint + tests complets

- [ ] **Step 1: Types (project references)**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 2: Tests**

Run: `npm run test:run`
Expected: tous verts, dont `onboardingGate.test.ts` (6) et `completeOnboarding.test.ts` (2).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: pas d'erreur bloquante (warnings tolérés).

- [ ] **Step 4: Build de production**

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 5: Vérification manuelle (parcours réel, à valider par l'utilisateur)**

- Nouveau compte (aucune clé) → le wizard s'ouvre seul à l'étape 0.
- « Suivant » bloqué à l'étape Clés tant qu'aucune clé saisie ; débloqué après saisie.
- Étapes Modèles/Connecteurs « Passer » fonctionne ; étape finale « Terminer » écrit `users/{uid}.onboardingComplete=true` (vérifier dans Firestore) → recharger : ne se rouvre plus.
- « Lancer la visite guidée » ferme le wizard et démarre le tour Dashboard.
- Compte existant (clés déjà présentes, pas de flag) → le wizard NE s'ouvre PAS.
- Bandeau « Assistant de configuration » (Réglages) et entrée drawer rouvrent le wizard à la demande.

- [ ] **Step 6: Commit final éventuel (si ajustements)**

```bash
git add -A
git commit -m "chore(onboarding): ajustements post-vérification"
```

---

## Self-review (couverture spec)

- ✅ 5 étapes (Bienvenue/Clés/Modèles/Connecteurs/Profil+tour) → Tasks 9-10
- ✅ Étape Clés obligatoire (blocage « Suivant ») → Task 10 (`nextDisabled`)
- ✅ Auto-ouverture `hydraté && !complete && !hasKey` + cas user existant → Tasks 1, 10
- ✅ Flag Firestore `onboardingComplete` (lecture piggyback + écriture gardée) → Tasks 2, 3, 10
- ✅ Ré-entrée : bandeau Réglages + drawer → Tasks 12, 13
- ✅ Extraction complète partagée (cascade IA + connecteurs, sans duplication) → Tasks 5-8
- ✅ Remplacement (pas de cohabitation) → Task 11
- ✅ Tour Dashboard lancé depuis l'étape finale → Task 9 (`startDashboardTour`), Task 10 (`launchTour`)
- ✅ Dark mode + style modale conservés → Tasks 9, 10
- ✅ Tests (gate + completeOnboarding) → Tasks 1, 2 ; vérif globale → Task 14
- ✅ Règles Firestore inchangées (vérifié : `users/{uid}` writable par le user hors champs access*) → hors périmètre confirmé
