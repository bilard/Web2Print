# Homogénéisation des panneaux — Phase 3 (RightPanelStack)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Faire passer les sections maison des sous-panneaux du RightPanelStack (PalettePanel, PagePanel, PrintPanel) au kit `PropertySection`, en préservant `data-tour` et toute la logique.

**Architecture :** **Opération « envelopper » UNIQUEMENT** — remplacer chaque en-tête de section local (`<section>`+`<h4>`/`<h3>`) par `<PropertySection title=… tourId=…>` du kit, en gardant le contenu (champs, composants locaux, handlers) STRICTEMENT inchangé. On NE remplace PAS les champs ad-hoc par `NumField`/`SelectField`/`SliderField` (ça changerait le comportement : clamp, commit `onBlur` vs `onChange`, couleur d'état actif, sliders mm/px/° incompatibles avec le `SliderField` 0..1 du kit).

**Tech Stack :** React 18, TypeScript strict.

## Global Constraints

- **INVARIANT ABSOLU : aucune fonction ne change.** Champs, handlers, stores, Fabric, presets, Firestore : intacts. Seul l'en-tête de section (structure repliable + style) change.
- **Préserver les ancres d'onboarding** : pour chaque `<section data-tour="opt-XXX">` enveloppée, passer `tourId="XXX"` à `PropertySection` (qui réémet `data-tour="opt-XXX"`). Une section sans `data-tour` → `PropertySection` sans `tourId`.
- **NE PAS toucher** : `globalFabricCanvas`/`syncToStore`/`triggerSave`, `useUIStore`/`useMergeStore`/`usePaletteStore`/`usePrintPresets`/`useVersions`, Firestore, et les composants locaux `MarkGroup`/`SliderControl`/`ColorControl` (PrintPanel), `ColorSwatch`/`GradientSwatch`/`AddColorForm`/`AddGradientForm` (PalettePanel), les inputs number à commit `onBlur`+clamp (PagePanel).
- **NE PAS toucher** le wrapper `CollapsiblePanel` (dnd) ni `RightPanelStack.tsx`.
- **Hors périmètre (repoussés)** : `Animation3DPanel`, `DataMergePanel` (couplage Fabric fort + sliders hors kit). **Non concernés** (pas de multi-sections) : `AssetsPanel`, `NanoBanaPanel`, `LayersPanel`, `VersionsPanel`.
- TS strict, pas d'`any` ; **`npx tsc -b`** ; `npm run lint` ; `npx knip` exit 0 (retirer les composants d'en-tête locaux devenus morts après wrap, ex. un `<h4>` inline). Ne pas modifier `src/components/ui/**`.
- Alignement tokens léger toléré sur les en-têtes enveloppés (l'`indigo-500` nommé des headers → géré par `PropertySection`) ; NE PAS restyler les champs internes (risque visuel/fonction).

**Pattern d'enveloppe (à appliquer partout) :**
```tsx
// AVANT
<section className="..." data-tour="opt-XXX">
  <h4 className="...">Titre</h4>
  {/* contenu inchangé */}
</section>
// APRÈS
<PropertySection title="Titre" tourId="XXX">
  {/* contenu inchangé */}
</PropertySection>
```
Import : `import { PropertySection } from '@/components/shared/panel'`.

---

### Task 1 : PalettePanel (le plus sûr — aucun Fabric)

**Files:** Modify `src/components/panels/PalettePanel.tsx` (+ `BrandKitSection`/`ObjectStylesSection`/`PreflightSection` si définis dans des fichiers séparés — sinon inline).

- [ ] **Step 1 : Envelopper les sections**

Lire le fichier. Envelopper dans `PropertySection` les blocs à en-tête `<h4>` : « Couleurs du projet », « Dégradés du projet », et les sections `BrandKitSection`/`ObjectStylesSection` (aligner leur `<section>`+`<h4>` sur `PropertySection` de la même façon). Contenu (`ColorSwatch`/`GradientSwatch`/`AddColorForm`/`AddGradientForm`, `usePaletteStore`, `savePaletteToFirestore`) INCHANGÉ. Préserver tout `data-tour` en `tourId`.

- [ ] **Step 2 : Vérif + commit**

Run : `npx tsc -b && npm run test:run && npm run lint && npx knip`
```bash
git add src/components/panels/PalettePanel.tsx
git commit -m "feat(editor): PalettePanel — sections sur le kit PropertySection (fonctions inchangées)"
```

### Task 2 : PagePanel (2 sections — attention au commit onBlur+clamp)

**Files:** Modify `src/components/panels/PagePanel.tsx`

- [ ] **Step 1 : Envelopper « Dimensions » et « Arrière-plan »**

Envelopper les 2 `<section>` (`data-tour="opt-page-dims"` → `tourId="page-dims"` ; `data-tour="opt-page-bg"` → `tourId="page-bg"`) dans `PropertySection`. **NE PAS toucher** aux inputs number (commit `onBlur`/Enter + `Math.max` clamp), aux presets, aux seg-buttons de type de fond, ni à `globalFabricCanvas`/`ensurePageBgRect`/`triggerSave`/conversions mm↔pt. Le footer récap reste hors section.

- [ ] **Step 2 : Vérif + commit**

Run : `npx tsc -b && npm run test:run && npm run lint && npx knip`
```bash
git add src/components/panels/PagePanel.tsx
git commit -m "feat(editor): PagePanel — sections Dimensions/Arrière-plan sur le kit (fonctions inchangées)"
```

### Task 3 : PrintPanel (plusieurs sections — garder les composants locaux)

**Files:** Modify `src/components/panels/PrintPanel.tsx`

- [ ] **Step 1 : Envelopper les sections**

Envelopper dans `PropertySection` les `<section>`/`<h3>` : « Famille de paramètres », « Résolution », « Fond perdu », « Repères », « Zone de sécurité » (+ `PreflightSection` si c'est une `<section>` maison), en préservant les `data-tour` en `tourId`. **NE PAS toucher** aux composants locaux `MarkGroup`/`SliderControl`/`ColorControl`, ni à `usePrintPresets`/`applyPrintDefaults`/`setDoc` Firestore/les ~28 setters `useUIStore`.

- [ ] **Step 2 : Vérif + commit + deploy + smoke (Phase 3)**

Run : `npx tsc -b && npm run test:run && npm run lint && npx knip`
```bash
git add src/components/panels/PrintPanel.tsx
git commit -m "feat(editor): PrintPanel — sections sur le kit PropertySection (fonctions inchangées)"
npm run build && firebase deploy --only hosting
```
Smoke (`?fresh=1`) : Éditeur → panneaux droits Palette / Page / Impression : sections repliables au style standard, tous les contrôles (couleurs, dimensions avec commit onBlur+clamp, DPI/presets/repères) répondent EXACTEMENT comme avant ; les tours d'onboarding (`data-tour` préservés) fonctionnent.

---

## Self-Review

**Spec coverage :** Phase 3 de la spec (RightPanelStack sur le kit) → Tasks 1-3 (Palette/Page/Print), avec Animation3D/DataMerge explicitement repoussés et Assets/NanoBana/Layers/Versions non concernés (pas de multi-sections) — décision documentée par la cartographie.

**Invariant :** opération « envelopper » seulement ; champs/handlers/Fabric/stores/composants locaux intacts ; `data-tour`→`tourId` préservés.

**Placeholder scan :** les instructions « lire le fichier, envelopper les sections X/Y » sont le contrat de migration structurelle (le pattern d'enveloppe est fourni explicitement) ; aucun TODO de logique. Les tourId exacts sont dérivés des `data-tour` existants (règle explicite).

**Type consistency :** `PropertySection` (kit) consommé identiquement dans les 3 tâches, comme en Phases 0-2.
