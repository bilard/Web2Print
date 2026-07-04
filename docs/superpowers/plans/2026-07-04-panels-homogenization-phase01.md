# Homogénéisation des panneaux — Phase 0 + 1 (kit + Catalogue)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraire UN kit de panneau partagé (`src/components/shared/panel/`) et migrer Création Studio (validation) + le Catalogue (« Style des fiches » et « Fond de page ») dessus, en accordéon standard, **sans changer aucune fonction**.

**Architecture :** Un module `shared/panel/` exporte `PropertySection` (accordéon, union des deux `Section` existants) + les champs typés promus de `promoPanelUi.tsx`. Chaque module remplace ses primitives locales par ce kit ; l'état, les handlers et les valeurs restent identiques (seuls le JSX de structure et les classes changent).

**Tech Stack :** React 18, TypeScript strict, Vitest.

## Global Constraints

- **INVARIANT ABSOLU : aucune fonction ne change.** Props, état, handlers, valeurs, logique métier IDENTIQUES. Seuls la structure (sections repliables) et les classes/tokens changent. Si un vrai bug de comportement est repéré → le SIGNALER, ne pas le corriger ici.
- TS strict, pas d'`any` ; **`npx tsc -b`** (jamais `tsc --noEmit`).
- Tests `npm run test:run` ; code mort `npx knip` (baseline exit 0 — supprimer les primitives locales devenues mortes après migration).
- Théming par tokens standard : `text-white/40`, `text-white/60`, `bg-well`, `bg-white/5`, `border-white/10`, accent `#6366f1`/`indigo-500`. Blanc véritable = `text-[#fff]`. Ne pas modifier `src/components/ui/**`.
- Composants ≤ 150 lignes.
- Après chaque phase : `tsc -b`+`test:run`+`lint`+`knip` verts, commit, `npm run build` + `firebase deploy --only hosting`, smoke de PARITÉ (tous les contrôles répondent comme avant).

---

## Phase 0 — Le kit partagé (+ Création Studio)

### Task 1 : Créer `src/components/shared/panel/`

**Files:**
- Create: `src/components/shared/panel/PropertySection.tsx`
- Create: `src/components/shared/panel/fields.tsx`
- Create: `src/components/shared/panel/index.ts`
- Test: `src/components/shared/panel/PropertySection.test.tsx`

**Interfaces:**
- Produces : `PropertySection`, `NumField`, `SelectField<T>`, `SliderField`, `SegButtons<T>`, `inputCls`.

- [ ] **Step 1 : `PropertySection` (union des deux accordéons existants)**

```tsx
// src/components/shared/panel/PropertySection.tsx
// Section de propriétés repliable — SOURCE DE VÉRITÉ unique de l'app (remplace les
// accordéons dupliqués de l'Éditeur, de Création Studio et du Catalogue).
// Union des deux : help/tourId (Éditeur) + badge/defaultOpen (Création).
import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { OptionHelp } from '@/components/shared/OptionHelp'

interface Props {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  help?: string
  tourId?: string
  badge?: ReactNode
}

export function PropertySection({ title, children, defaultOpen = true, help, tourId, badge }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="flex flex-col gap-2.5 border-b border-white/5 pb-3 last:border-b-0" data-tour={tourId ? `opt-${tourId}` : undefined}>
      <div className="flex items-center gap-1">
        <button onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors">
          <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} /> {title}
        </button>
        {help && <OptionHelp text={help} />}
        {badge != null && <span className="ml-auto text-[#818cf8]">{badge}</span>}
      </div>
      {open && <div className="flex flex-col gap-2.5">{children}</div>}
    </section>
  )
}
```

(Vérifie la signature réelle de `OptionHelp` dans `src/components/shared/OptionHelp.tsx` — si sa prop n'est pas `text`, adapte l'appel. Si l'import crée un cycle, importe `OptionHelp` en type-only impossible → garde l'import runtime, c'est un composant partagé sans dépendance panel.)

- [ ] **Step 2 : Champs promus (repris VERBATIM de `promoPanelUi.tsx`)**

Créer `src/components/shared/panel/fields.tsx` en copiant `inputCls`, `NumField`, `SelectField`, `SliderField`, `SegButtons` exactement depuis `src/features/retail-promo/promoPanelUi.tsx` (lignes 4, 21-69), avec le `labelCls` local. Ne rien changer à leur logique.

- [ ] **Step 3 : Baril**

```ts
// src/components/shared/panel/index.ts
export { PropertySection } from './PropertySection'
export { NumField, SelectField, SliderField, SegButtons, inputCls } from './fields'
```

- [ ] **Step 4 : Test léger (open/close)**

```tsx
// src/components/shared/panel/PropertySection.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { test, expect } from 'vitest'
import { PropertySection } from './PropertySection'

test('PropertySection : replie/déplie au clic', () => {
  render(<PropertySection title="Remplissage"><div>contenu</div></PropertySection>)
  expect(screen.getByText('contenu')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Remplissage'))
  expect(screen.queryByText('contenu')).not.toBeInTheDocument()
})
```

(Si `@testing-library/react` n'est pas installé — vérifie `package.json` —, remplace par un test de non-régression du rendu via un utilitaire déjà présent, ou omets ce test et valide au smoke ; NE PAS ajouter de dépendance.)

- [ ] **Step 5 : Vérif + commit**

Run : `npx tsc -b && npm run test:run && npm run lint && npx knip`
Expected : PASS. ⚠ knip signalera `shared/panel/*` comme inutilisé tant que Task 2 ne l'importe pas → committer Task 1 **avec** Task 2 (voir Task 2 Step 4).

### Task 2 : Migrer Création Studio sur le kit (valide + dé-duplique)

**Files:**
- Modify: `src/features/retail-promo/PromoPropertiesPanel.tsx`, `PromoShapeOptions.tsx`, `PromoTextOptions.tsx`, `PromoConditionalSection.tsx` (imports)
- Delete: `src/features/retail-promo/promoPanelUi.tsx`

**Interfaces:**
- Consumes : le kit (Task 1).

- [ ] **Step 1 : Remplacer les imports**

Dans les 4 fichiers qui importent de `./promoPanelUi` (`PromoPropertiesPanel`, `PromoShapeOptions`, `PromoTextOptions`, `PromoConditionalSection`) : remplacer `import { Section, NumField, SelectField, SliderField, SegButtons, inputCls } from './promoPanelUi'` par `import { PropertySection as Section, NumField, SelectField, SliderField, SegButtons, inputCls } from '@/components/shared/panel'`.

- [ ] **Step 2 : Supprimer `promoPanelUi.tsx`**

`git rm src/features/retail-promo/promoPanelUi.tsx` (ses primitives vivent désormais dans le kit).

- [ ] **Step 3 : Vérif de parité**

Run : `npx tsc -b && npm run test:run && npm run lint && npx knip`
Expected : PASS. Le comportement de Création Studio est IDENTIQUE (mêmes props/handlers) ; seul le style des sections s'aligne (white/60→white/40, +badge conservé). Aucune régression fonctionnelle.

- [ ] **Step 4 : Commit (Tasks 1+2) + deploy + smoke**

```bash
git add src/components/shared/panel/ src/features/retail-promo/PromoPropertiesPanel.tsx src/features/retail-promo/PromoShapeOptions.tsx src/features/retail-promo/PromoTextOptions.tsx src/features/retail-promo/PromoConditionalSection.tsx
git rm src/features/retail-promo/promoPanelUi.tsx
git commit -m "feat(ui): kit de panneau partagé (shared/panel) + Création Studio migré dessus"
npm run build && firebase deploy --only hosting
```
Smoke (`?fresh=1`) : Création Studio → panneau Propriétés : sections repliables, onglets Forme/Texte, tous les champs (police/paragraphe/remplissage/contour/ombre/…) répondent comme avant.

---

## Phase 1 — Catalogue sur le kit + fix disposition libre

### Task 3 : « Style des fiches » (CardStyle*) en accordéon standard

**Files:**
- Modify: `src/features/catalog/components/steps/CardStyleCard.tsx`, `CardStyleTypo.tsx`, `CardStyleColors.tsx`

**Interfaces:**
- Consumes : `PropertySection` du kit.

- [ ] **Step 1 : Structurer en sections repliables**

Dans `CardStyleCard.tsx`, remplacer les blocs à titre `<div className="text-xs font-semibold ...">` par des `PropertySection` du kit, SANS toucher aux props/handlers (`patch`, `style`, `sampleFields`, `onLayoutChange`, etc. inchangés). Structure cible (mêmes contrôles, juste enveloppés) :
- `<PropertySection title="Texte : taille & police">` → `<CardStyleTypo … />` (inchangé à l'intérieur)
- `<PropertySection title="Couleurs des objets">` → `<CardStyleColors … />` (inchangé)
- `<PropertySection title="Image">` → les 2 sliders image (Largeur / Marge du visuel) — extraits tels quels
- `<PropertySection title="Éléments affichés">` → la grille de toggles + « Texte du ruban » + le toggle « Disposition libre » + « Réinitialiser les positions » (tous inchangés)

Le header « Style des fiches » + « Réinitialiser » et l'aperçu (`CardStylePreview`) restent tels quels. Aligner les tokens du conteneur sur le standard (`bg-well`/`white/40`), mais NE PAS changer la logique.

- [ ] **Step 2 : Aligner tokens dans CardStyleTypo/CardStyleColors**

Remplacer les tokens divergents (`text-muted-foreground`, `bg-surface-2`, `focus:ring-indigo-600`) par les tokens standard (`text-white/40`, `bg-well`/`bg-white/5`, `focus:border-[#6366f1]`) — cosmétique pur, aucun changement de valeur/handler. Les `<input type=color>` de `CardStyleColors` restent (leur FONCTION ne change pas ; l'adoption d'un `ColorField` partagé est repoussée).

- [ ] **Step 3 : Vérif de parité**

Run : `npx tsc -b && npm run lint && npx knip`
Expected : PASS. Tous les sliders/selects/toggles/couleurs pilotent EXACTEMENT le même `cardStyle` qu'avant.

- [ ] **Step 4 : Commit**

```bash
git add src/features/catalog/components/steps/CardStyleCard.tsx src/features/catalog/components/steps/CardStyleTypo.tsx src/features/catalog/components/steps/CardStyleColors.tsx
git commit -m "feat(catalog): panneau Style des fiches en sections accordéon standard (fonctions inchangées)"
```

### Task 4 : « Fond de page » (PageOptions*) sur le kit

**Files:**
- Modify: `src/features/catalog/components/steps/PageOptionControls.tsx`, `PageOptionsPanel.tsx`

**Interfaces:**
- Consumes : `PropertySection`.

- [ ] **Step 1 : `OptSection` devient un alias repliable du kit**

Dans `PageOptionControls.tsx`, remplacer l'implémentation de `OptSection` (non repliable) par une ré-exportation du kit, en gardant la MÊME signature `{ title, children }` (les appelants ne changent pas) :

```tsx
import { PropertySection } from '@/components/shared/panel'
export function OptSection({ title, children }: { title: string; children: ReactNode }) {
  return <PropertySection title={title}>{children}</PropertySection>
}
```

`OptToggle`, `OptSlider`, `optFieldClass` restent (ou alignent leurs tokens sur le standard) — leur logique ne change pas. Résultat : toutes les sections « Fond de page » deviennent repliables sans toucher `PageOptionsPanel`/`PageOptionsCover`/`PageOptionsTheme`.

- [ ] **Step 2 : Vérif + commit + deploy + smoke (Phase 1)**

Run : `npx tsc -b && npm run test:run && npm run lint && npx knip`
```bash
git add src/features/catalog/components/steps/PageOptionControls.tsx src/features/catalog/components/steps/PageOptionsPanel.tsx
git commit -m "feat(catalog): panneau Fond de page en sections repliables (kit partagé)"
npm run build && firebase deploy --only hosting
```
Smoke (`?fresh=2`) : Catalogue → étape Prompt « Style des fiches » (sections repliables, tokens alignés, tous les réglages OK) ET Aperçu « Fond de page » (sections repliables, contextuelles par type de page, réglages OK).

### Task 5 : Fix du chevauchement « disposition libre »

**Files:**
- Modify: `src/features/catalog/components/pages/freeLayout.ts`
- Test: `src/features/catalog/components/pages/freeLayout.test.ts`

**Interfaces:**
- Modifie `FREE_DEFAULT_LAYOUT` (positions de repli sans chevauchement + w/h qui laissent respirer).

- [ ] **Step 1 : Repli calé sur le flux (sans chevauchement)**

Remplacer `FREE_DEFAULT_LAYOUT` dans `freeLayout.ts` par des positions aérées (bandeau haut, image ~45 % de haut, textes empilés, prix en bas, détails tout en bas) qui ne se recouvrent pas :

```ts
export const FREE_DEFAULT_LAYOUT: Record<CardObjectId, CardBox> = {
  promo: { x: 3, y: 2, w: 94 },
  image: { x: 10, y: 12, w: 80, h: 40 },
  sticker: { x: 80, y: 44 },
  kicker: { x: 3, y: 12 },
  vedette: { x: 66, y: 2 },
  brand: { x: 5, y: 55, w: 90 },
  name: { x: 5, y: 60, w: 90 },
  description: { x: 5, y: 68, w: 90 },
  ref: { x: 5, y: 82, w: 45 },
  price: { x: 55, y: 80, w: 40 },
  unit: { x: 5, y: 88, w: 45 },
  details: { x: 5, y: 93, w: 90 },
}
```

- [ ] **Step 2 : Le test de repli reste vert + garde d'ordre**

Adapter/valider `freeLayout.test.ts` : `freeLayoutBox('name', DEFAULT_CARD_STYLE)` = `FREE_DEFAULT_LAYOUT.name` ; ajouter une assertion que `promo.y < image.y < name.y < price.y < details.y` (empilement croissant → pas de recouvrement vertical grossier).

- [ ] **Step 3 : Vérif + commit + deploy + smoke**

Run : `npx tsc -b && npm run test:run && npm run lint && npx knip`
```bash
git add src/features/catalog/components/pages/freeLayout.ts src/features/catalog/components/pages/freeLayout.test.ts
git commit -m "fix(catalog): repli de disposition libre aéré (plus de chevauchement des objets)"
npm run build && firebase deploy --only hosting
```
Smoke (`?fresh=3`) : activer « Disposition libre » sur une fiche fraîche → les objets sont répartis sans se chevaucher (cf. Image #12), puis déplaçables.

---

## Self-Review

**Spec coverage :** kit partagé unique (PropertySection + champs) → Task 1 ✔ ; Création migrée/validée + dé-duplication → Task 2 ✔ ; Catalogue « Style des fiches » accordéon + tokens → Task 3 ✔ ; « Fond de page » repliable → Task 4 ✔ ; fix chevauchement disposition libre → Task 5 ✔. Phases 2-5 (Éditeur/RightPanelStack/Workflows/Settings) = cycles suivants (hors ce plan, cf. spec).

**Invariant « aucune fonction ne change » :** Tasks 2-4 = swap d'imports + enveloppe `PropertySection` + tokens ; aucun handler/valeur touché. Task 5 = données de repli (pas de logique). Task 1 = code neuf.

**Placeholder scan :** les « vérifie la signature de OptionHelp / présence de @testing-library » sont des gardes nommées (adapter/omettre), pas des TODO de logique.

**Type consistency :** `PropertySection` (Task 1) consommé Tasks 2/4 ; champs du kit consommés Task 2 ; `FREE_DEFAULT_LAYOUT`/`freeLayoutBox` (Task 5) cohérents avec Phase 1 précédente.
