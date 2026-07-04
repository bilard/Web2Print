# Homogénéisation des panneaux — Phase 2 (Éditeur)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Dédupliquer le 3ᵉ accordéon : le `Section` local de l'Éditeur (`PropertiesPanel.tsx`) utilise désormais le kit `PropertySection`, sans changer aucun comportement.

**Architecture :** Remplacer l'implémentation locale de `Section` par un mince adaptateur qui délègue au kit en fixant `defaultOpen={false}` (comportement historique de l'Éditeur = sections repliées par défaut). Les 10 appels `<Section title tourId help>` restent inchangés (le kit accepte `tourId`/`help`/`badge`/`defaultOpen`). Les primitives de champ locales (`NumInput`/`SelectInput`/`SliderInput`/`Toggle`/`Row`/`Label`) restent LOCALES (API px différente du kit — unification field-level = raffinement futur, hors périmètre).

**Tech Stack :** React 18, TypeScript strict.

## Global Constraints

- **INVARIANT ABSOLU : aucune fonction ne change.** Toutes les sections restent **repliées par défaut** (`defaultOpen=false`), mêmes `help`/`tourId`, mêmes contrôles/handlers Fabric. Seule l'implémentation de l'accordéon est mutualisée.
- TS strict, pas d'`any` ; **`npx tsc -b`** ; `npm run lint` ; `npx knip` exit 0 (retirer les imports devenus morts).
- Ne pas modifier `src/components/ui/**`. Composant ≤ … (fichier déjà volumineux — ne PAS restructurer au-delà de la tâche).

---

### Task 1 : `PropertiesPanel` utilise le kit `PropertySection`

**Files:**
- Modify: `src/components/panels/PropertiesPanel.tsx`

**Interfaces:**
- Consumes : `PropertySection` de `@/components/shared/panel`.

- [ ] **Step 1 : Importer le kit**

Ajouter en tête (près des autres imports `@/components/shared/…`) :

```ts
import { PropertySection } from '@/components/shared/panel'
```

- [ ] **Step 2 : Remplacer l'implémentation locale de `Section` par un adaptateur**

Remplacer la fonction `Section` locale (actuellement lignes ~241-256, l'accordéon avec `useState`/`ChevronRight`/`OptionHelp`) par :

```tsx
// Accordéon mutualisé (kit shared/panel) ; l'Éditeur garde ses sections REPLIÉES par
// défaut (defaultOpen=false) — un appelant peut toujours surcharger.
function Section(props: React.ComponentProps<typeof PropertySection>) {
  return <PropertySection defaultOpen={false} {...props} />
}
```

(Les 10 appels `<Section title=… tourId=… help=…>` fonctionnent tels quels : le kit expose `title`/`help`/`tourId`/`badge`/`defaultOpen`.)

- [ ] **Step 3 : Nettoyer les imports devenus morts**

L'ancien `Section` local utilisait `OptionHelp` (ligne ~251) et `ChevronRight`. Après remplacement :
- `OptionHelp` n'est plus utilisé dans ce fichier → **retirer** son import (ligne 23).
- `ChevronRight` : vérifier `grep -n "ChevronRight" src/components/panels/PropertiesPanel.tsx` — s'il n'est plus utilisé ailleurs, le retirer de l'import lucide ; s'il l'est (autres chevrons), le garder.
- `useState` : garder (utilisé par d'autres états du panneau — vérifier).
- `React` : le JSX `React.ComponentProps` nécessite le type `React` — l'import `import { useRef, useState, useEffect } from 'react'` n'expose pas `React`. Utiliser plutôt `import { type ComponentProps } from 'react'` et `function Section(props: ComponentProps<typeof PropertySection>)`.

- [ ] **Step 4 : Vérif de parité**

Run : `npx tsc -b && npm run test:run && npm run lint && npx knip`
Expected : PASS. Comportement IDENTIQUE : sections repliées par défaut, `help` (icône `?`) et `tourId` (`data-tour="opt-prop-*"`) préservés sur les 10 sections, tous les contrôles Fabric inchangés.

- [ ] **Step 5 : Commit + deploy + smoke**

```bash
git add src/components/panels/PropertiesPanel.tsx
git commit -m "feat(editor): PropertiesPanel utilise le kit PropertySection (dédup accordéon, fonctions inchangées)"
npm run build && firebase deploy --only hosting
```
Smoke (`?fresh=1`) : Éditeur → sélectionner un objet → panneau Propriétés : les 10 sections (Remplissage, Contour, Opacité & Fusion, Ombre, Taille & Position, Cadrage, Police, Paragraphe, Transformation, Arranger) sont **repliées par défaut**, se déplient au clic, l'icône d'aide `?` et le tour d'onboarding fonctionnent, tous les réglages Fabric répondent comme avant.

---

## Self-Review

**Spec coverage :** Phase 2 de la spec (« Éditeur : `PropertiesPanel` migre son `Section` vers le kit, `help`/`tourId` préservés ») → Task 1. ✔ L'unification des primitives de CHAMP (NumInput≠NumField) est explicitement hors périmètre (API différentes, risque) — notée pour un raffinement futur.

**Invariant :** l'adaptateur `defaultOpen={false}` reproduit exactement le défaut historique ; les 10 appels et tous les handlers Fabric sont inchangés.

**Placeholder scan :** les « vérifier si ChevronRight/useState encore utilisés » sont des gardes de nettoyage nommées (retirer si mort), pas des TODO de logique.

**Type consistency :** `PropertySection` (kit, Phase 0) consommé via l'adaptateur `Section` ; `ComponentProps<typeof PropertySection>` garantit la compatibilité des 10 appels au type-check.
