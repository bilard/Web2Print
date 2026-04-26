# Pivot 2+3 — Nano Banana sans texte + template overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Refactor le pipeline Claude Design pour que Nano Banana 2 génère un fond visuel SANS texte (prompt anti-typo), pose ce PNG plein canvas locked, et compose tous les textes/données via le layout template existant de `composeDesignFromScrapedData` (sans fond crème, avec pills critiques uniquement). Supprimer toute la phase Claude Vision sur NB2 et le code de masking β1.

**Architecture:** NB2 = source du visuel pur (photo + ambiance). Layout overlay = template fixe issu de Jina scrape. Aucun Claude Vision intermédiaire. ZÉRO superposition possible.

**Tech Stack:** TypeScript strict, Fabric.js v6, vitest, React 18 + Vite 5.

**Working tree:** Direct sur master (pas de worktree, voir `feedback_no_worktree.md`).

---

## File Structure

| Fichier | Statut | Responsabilité |
|---|---|---|
| `src/features/ai-design/generateNanoBananaRef.ts` | Modifié | Prompt anti-texte agressif pour générer fond visuel pur |
| `src/features/ai-design/composeDesignFromScrapedData.ts` | Modifié | Garder pills critiques (`badge_bg`, `price_block`, `cta_bg`) ; supprimer/neutraliser checkmarks ronds (`feature_dot_*`) ; préfixer features avec `✓ ` unicode ; **conserver** `mode: 'creative'` + `background` (utilisé par fallback) |
| `src/features/ai-design/renderNanoBananaCanvas.ts` | Modifié | Nouvelle fonction `renderNanoBananaTemplate(canvas, dataUri, scrapedData, w, h)` ; supprimer `pickMaskColor`, `buildMaskRect`, `buildEditableTextbox`, `resolveImageForSlot`, `renderNanoBananaWithOverlays` |
| `src/features/ai-design/useGenerateDesign.ts` | Modifié | Supprimer la phase `analyzeDesignForEdit` ; supprimer `overrideTextsWithScrapedData` ; remplacer routing β1+β2 par `if (NB2 OK) → renderNanoBananaTemplate ; else → ancien pipeline creative` |
| `src/features/ai-design/analyzeDesignForEdit.ts` | Supprimé | Plus de Claude Vision sur NB2 |
| `src/features/ai-design/sampleColor.ts` + `.test.ts` | Supprimés | Plus de mask, plus de sample pixel |

Conservés : `scrapeProductForDesign.ts`, `brandLogos.ts`, `saveRefImageToGallery.ts`, et les fonctions vectorielles legacy dans `renderNanoBananaCanvas.ts` (utilisées par fallback creative).

---

## Task 1 : NB2 prompt anti-texte

**Files:**
- Modify: `src/features/ai-design/generateNanoBananaRef.ts`

- [ ] **Step 1.1: Lire le prompt actuel pour situer la zone à modifier**

```bash
sed -n '1,200p' src/features/ai-design/generateNanoBananaRef.ts
```

- [ ] **Step 1.2: Localiser la fonction qui construit le prompt envoyé à NB2**

Chercher le bloc qui assemble le prompt final (probablement une string template ou une fonction `buildPrompt(...)`). Sortir une copie pour examiner.

- [ ] **Step 1.3: Refactor le prompt pour insister sur "ZERO TEXT"**

Remplacer ou enrichir le prompt principal avec une section anti-typo claire et répétée. Reprendre la structure suivante (à intégrer dans le prompt existant en tant que bloc final, avant l'envoi) :

```
ABSOLUTE REQUIREMENTS — STRICTLY ENFORCED:
- ZERO TEXT in the image. No typography, no letters, no numbers, no symbols.
- NO PRICE TAGS, NO BADGES, NO LABELS, NO STICKERS, NO LOGOS, NO BRAND NAMES.
- The image must be 100% TEXT-FREE so typography will be added in a later editing step.
- Composition: leave generous negative space for text overlays to be added later (avoid filling the entire canvas with the product or busy decoration).

Style: lifestyle product photography, clean ambient background, professional retouching, soft lighting, cinematic mood. The product should be visible but not the only element — show it in context.
```

Si le prompt existant inclut des données scraped (titre, prix, features), les retirer ou les neutraliser : la NB2 ne doit pas savoir quels textes existent côté Jina, sinon elle aura tendance à les écrire.

- [ ] **Step 1.4: Vérifier la compile**

```bash
npx tsc -b --noEmit 2>&1 | grep -E "ai-design" | head -5
```

Expected: compile clean ou seulement erreurs sur fichiers à supprimer plus tard.

- [ ] **Step 1.5: Pas de commit ici** — bundlé avec Task 2.

---

## Task 2 : Adapter `composeDesignFromScrapedData`

**Files:**
- Modify: `src/features/ai-design/composeDesignFromScrapedData.ts`

- [ ] **Step 2.1: Préfixer les features avec `✓ ` unicode**

Dans la boucle qui pousse les `feature_${i}` texts, modifier le `text` pour préfixer :

```ts
text: `✓ ${feat}`,
```

(Garder `role: 'feature'`.)

- [ ] **Step 2.2: Supprimer ou conserver les `feature_dot_*` decorativeShapes**

Le checkmark unicode remplace désormais les pastilles vertes. Pour éviter la double indication visuelle quand le canvas est posé sur un NB2 (qui peut déjà avoir ses propres icônes/cercles décoratifs en arrière-plan), supprimer les `decorativeShapes.push({ id: 'feature_dot_${i}', ... })` dans la boucle features.

- [ ] **Step 2.3: Vérifier que les pills critiques sont toujours produites**

Les decorativeShapes restantes attendues :
- `badge_bg` (pill verte derrière "OFFRE EXCLUSIVE")
- `price_block` (rect noir derrière le prix actuel)
- `cta_bg` (pill verte derrière "J'EN PROFITE")

Confirmer en lisant le fichier que ces 3 sont toujours pushed.

- [ ] **Step 2.4: Compile**

```bash
npx tsc -b --noEmit 2>&1 | grep -E "ai-design" | head -5
```

- [ ] **Step 2.5: Pas de commit ici** — bundlé avec Task 3 et 4.

---

## Task 3 : Nouvelle fonction `renderNanoBananaTemplate`

**Files:**
- Modify: `src/features/ai-design/renderNanoBananaCanvas.ts`

- [ ] **Step 3.1: Identifier la zone à insérer la nouvelle fonction**

Lire le fichier pour repérer les helpers existants (`renderBackground`, `renderDecorativeShapes`, `addEditableTextOverlays`, `addEditableImageSlots`, `placeFabricImage`, `decodeImage`, `cropFromDecoded`, `proxiedImageUrl`).

- [ ] **Step 3.2: Ajouter `renderNanoBananaTemplate`**

Ajouter la fonction (à la suite des helpers conservés, AVANT les helpers β1 que l'on supprimera dans Task 5) :

```ts
import { composeDesignFromScrapedData } from './composeDesignFromScrapedData'
import type { ScrapedProductData } from './scrapeProductForDesign'

/**
 * Pipeline pivot 2+3 : place le PNG Nano Banana 2 plein canvas locked comme
 * fond visuel pur (NB2 a généré sans texte). Pose ensuite le layout template
 * issu de composeDesignFromScrapedData (pills critiques + textes + images
 * data) par-dessus, sans masquage car il n'y a aucun texte à masquer.
 */
export async function renderNanoBananaTemplate(
  canvas: Canvas,
  nanoBananaDataUri: string,
  scrapedData: ScrapedProductData,
  canvasWidth: number,
  canvasHeight: number,
): Promise<void> {
  // 1. Background NB2 plein canvas, locked
  const bg = await FabricImage.fromURL(nanoBananaDataUri, { crossOrigin: 'anonymous' })
  if (!bg || !bg.width || !bg.height) {
    throw new Error('Nano Banana background image failed to load')
  }
  bg.set({
    left: 0,
    top: 0,
    scaleX: canvasWidth / bg.width,
    scaleY: canvasHeight / bg.height,
    selectable: false,
    evented: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    hoverCursor: 'default',
    originX: 'left',
    originY: 'top',
  })
  bg.data = { isNanoBananaBg: true }
  canvas.add(bg)
  const pageBg = canvas.getObjects().find((o) => o.data?.isPageBg)
  if (pageBg) {
    const idx = canvas.getObjects().indexOf(pageBg)
    canvas.moveObjectTo(bg, idx + 1)
  } else {
    canvas.sendObjectToBack(bg)
  }

  // 2. Layout template depuis Jina
  const analysis = composeDesignFromScrapedData(scrapedData)

  // 3. Pills critiques uniquement (filtrer les autres decorativeShapes éventuelles)
  const CRITICAL_SHAPE_IDS = new Set(['badge_bg', 'price_block', 'cta_bg'])
  const criticalShapes = (analysis.decorativeShapes ?? []).filter((s) => CRITICAL_SHAPE_IDS.has(s.id))
  renderDecorativeShapes(canvas, criticalShapes, canvasWidth, canvasHeight)

  // 4. Textes éditables
  addEditableTextOverlays(canvas, analysis.texts, canvasWidth, canvasHeight)

  // 5. Image slots (logo + photo produit, avec fallback NB2 crop si manque)
  await addEditableImageSlots(
    canvas,
    analysis.imageSlots,
    canvasWidth,
    canvasHeight,
    nanoBananaDataUri,
    undefined, // productImageUrl ; déjà dans scrapedData.imageUrl si dispo, mais composeDesignFromScrapedData expose juste les slots
    scrapedData.brandDomain,
  )
}
```

NOTE: `addEditableImageSlots` actuellement attend `productImageUrl` séparé. Pour cette version, on peut passer `scrapedData.imageUrl` validé via `isLikelyProductImage`. Adapter la signature ou résoudre dans la fonction si besoin :

```ts
const productImageUrl = scrapedData.imageUrl && isLikelyProductImage(scrapedData.imageUrl)
  ? scrapedData.imageUrl
  : undefined
```

- [ ] **Step 3.3: Compile + lint**

```bash
npx tsc -b --noEmit 2>&1 | grep -E "ai-design" | head -10
```

Erreurs attendues : aucune sur cette nouvelle fonction.

- [ ] **Step 3.4: Pas de commit ici** — bundlé avec Task 4.

---

## Task 4 : Simplifier `useGenerateDesign`

**Files:**
- Modify: `src/features/ai-design/useGenerateDesign.ts`

- [ ] **Step 4.1: Supprimer l'import et l'appel à `analyzeDesignForEdit`**

Localiser le bloc Phase 2 (`setState({...step: 'analyzing'})` + `await analyzeDesignForEdit(base64Data)`) et le SUPPRIMER. Plus de phase analyse.

- [ ] **Step 4.2: Supprimer `overrideTextsWithScrapedData` et son appel**

La fonction et son appel ne servent plus (composeDesignFromScrapedData fournit directement les bons textes depuis Jina). Supprimer la fonction entière (~60 lignes en haut du fichier) et son appel.

- [ ] **Step 4.3: Remplacer le routing β1+β2 par un routing simple**

Remplacer le bloc `try { if (analysis.mode === 'retail') ... else ... }` par :

```ts
try {
  if (dataUri && scrapedProductData) {
    // Pipeline pivot 2+3 : NB2 fond visuel + layout template
    const fontFamilies = ['Inter']  // composeDesignFromScrapedData utilise Inter ; ajuster si évolution
    await ensureGoogleFontsLoaded(fontFamilies)
    await renderNanoBananaTemplate(canvas, dataUri, scrapedProductData, canvasWidth, canvasHeight)
  } else if (scrapedProductData) {
    // NB2 KO + scrapedData OK : fallback compose-direct full (avec fond crème)
    const analysis = composeDesignFromScrapedData(scrapedProductData)
    if (!analysis.background || !analysis.decorativeShapes) {
      failAt('rendering', 'compose-direct fallback : background/decorativeShapes absents')
      return
    }
    await ensureGoogleFontsLoaded(analysis.texts.map((t) => t.fontFamily))
    renderBackground(canvas, analysis.background, canvasWidth, canvasHeight)
    renderDecorativeShapes(canvas, analysis.decorativeShapes, canvasWidth, canvasHeight)
    addEditableTextOverlays(canvas, analysis.texts, canvasWidth, canvasHeight)
    await addEditableImageSlots(
      canvas,
      analysis.imageSlots,
      canvasWidth,
      canvasHeight,
      undefined,
      undefined,
      scrapedProductData.brandDomain,
    )
  } else {
    failAt('rendering', 'Ni NB2 ni scrapedProductData disponibles — rien à rendre')
    return
  }
  canvas.requestRenderAll()
  syncToStore(canvas)
  requestAnimationFrame(() => globalFitCanvas?.())
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  failAt('rendering', `Construction canvas échouée : ${msg}`)
  return
}
```

- [ ] **Step 4.4: Mettre à jour les imports**

Imports à RETIRER :
- `analyzeDesignForEdit` (la fonction)
- `TextElement` type (si seulement utilisé par `overrideTextsWithScrapedData`)

Imports à ENRICHIR :
- Ajouter `renderNanoBananaTemplate` à l'import `from './renderNanoBananaCanvas'`
- Conserver `renderBackground, renderDecorativeShapes, addEditableTextOverlays, addEditableImageSlots`

Imports à RETIRER (du même bloc) :
- `renderNanoBananaWithOverlays` (devient mort)

- [ ] **Step 4.5: Compile + lint**

```bash
npx tsc -b --noEmit 2>&1 | grep -E "ai-design" | head -20
npm run lint -- src/features/ai-design/ 2>&1 | head -30
```

Expected: zéro erreur. Lint warnings = OK si seulement imports inutilisés (Task 5 nettoie).

- [ ] **Step 4.6: Commit point intermédiaire**

```bash
git add src/features/ai-design/generateNanoBananaRef.ts \
        src/features/ai-design/composeDesignFromScrapedData.ts \
        src/features/ai-design/renderNanoBananaCanvas.ts \
        src/features/ai-design/useGenerateDesign.ts
git commit -m "$(cat <<'EOF'
feat(ai-design): pivot 2+3 NB2 sans texte + template overlays

Refactor du pipeline pour ne plus tenter d'aligner pixel-perfect des
overlays sur un PNG NB2 textué (architecture β1 retirée — voir le bilan
E2E dans le spec 2026-04-26-nano-banana-text-free-template-design.md).

- Prompt NB2 réécrit pour produire un fond visuel ZÉRO texte (lifestyle
  photography, ambient background, generous negative space)
- Nouvelle fonction renderNanoBananaTemplate : pose le PNG NB2 plein
  canvas locked + layout template depuis composeDesignFromScrapedData
  (pills critiques + textes + images data, pas de fond crème)
- composeDesignFromScrapedData : préfixe les features avec ✓ unicode,
  supprime les feature_dot_* (pastilles vertes redondantes sous le NB2)
- useGenerateDesign : supprime la phase Claude Vision et
  overrideTextsWithScrapedData ; routing simplifié à NB2 OK + Jina OK
  → renderNanoBananaTemplate, sinon fallback compose-direct full

Cleanup du code β1 mort dans le commit suivant.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 : Cleanup code β1 mort

**Files:**
- Delete: `src/features/ai-design/analyzeDesignForEdit.ts`
- Delete: `src/features/ai-design/sampleColor.ts`
- Delete: `src/features/ai-design/sampleColor.test.ts`
- Modify: `src/features/ai-design/renderNanoBananaCanvas.ts` (retirer helpers β1)

- [ ] **Step 5.1: Confirmer aucun import résiduel vers les fichiers à supprimer**

```bash
grep -rn "from.*analyzeDesignForEdit\|from.*sampleColor" src/ 2>/dev/null
```

Expected: 0 résultat (à part les self-references dans les fichiers eux-mêmes).

Si match : tracer et nettoyer avant de procéder.

- [ ] **Step 5.2: Supprimer les fichiers β1**

```bash
git rm src/features/ai-design/analyzeDesignForEdit.ts \
       src/features/ai-design/sampleColor.ts \
       src/features/ai-design/sampleColor.test.ts
```

- [ ] **Step 5.3: Retirer les helpers β1 de `renderNanoBananaCanvas.ts`**

Supprimer du fichier les fonctions exportées :
- `pickMaskColor`
- `buildMaskRect`
- `buildEditableTextbox`
- `resolveImageForSlot`
- `renderNanoBananaWithOverlays`

Supprimer également les imports désormais inutilisés (`sampleAvgColorAroundBbox`, types `TextElement`/`ImageSlot` si seulement utilisés par ces helpers, type `Bbox` import si idem).

CONSERVER : `renderBackground`, `renderDecorativeShapes`, `addEditableTextOverlays`, `addEditableImageSlots`, `placeFabricImage`, `decodeImage`, `cropFromDecoded`, `proxiedImageUrl`, `bboxToPx`, `renderNanoBananaTemplate` (la nouvelle fonction).

- [ ] **Step 5.4: Compile + lint + tests**

```bash
npx tsc -b --noEmit 2>&1 | head -30
npm run lint -- src/features/ai-design/ 2>&1 | head -20
npm run test:run 2>&1 | tail -20
```

Expected: zéro erreur compile, lint clean, tests passent (la suite vitest peut perdre les 3 tests `sampleColor.test.ts` qu'on a supprimés — c'est attendu).

- [ ] **Step 5.5: Commit cleanup**

```bash
git add src/features/ai-design/renderNanoBananaCanvas.ts
git commit -m "$(cat <<'EOF'
chore(ai-design): remove β1 retail dead code (Claude Vision masking pipeline)

Suite au pivot 2+3 (le NB2 ne génère plus de texte, plus besoin de
masquage ni de Claude Vision sur NB2) :

- Suppression : analyzeDesignForEdit.ts (Claude Vision sur NB2)
- Suppression : sampleColor.ts + tests (M2 sample pixel)
- Retrait des helpers β1 dans renderNanoBananaCanvas.ts :
  pickMaskColor, buildMaskRect, buildEditableTextbox,
  resolveImageForSlot, renderNanoBananaWithOverlays

Conservation des fonctions vectorielles (renderBackground,
renderDecorativeShapes, addEditableTextOverlays, addEditableImageSlots)
qui restent utilisées par le fallback compose-direct full.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 : Validation E2E manuelle

**Files:** Aucun changement de code.

- [ ] **Step 6.1: Démarrer le dev server**

```bash
npm run dev
```

(Probablement déjà lancé d'une session précédente. Si oui, simplement recharger la page.)

- [ ] **Step 6.2: Test 1 — URL Brico Dépôt (le test échec précédent)**

Dans le browser, ouvrir Claude Design Studio. Coller l'URL Brico Dépôt utilisée précédemment (ou n'importe quelle URL produit retail). Lancer. Critères :
- Le NB2 généré est un fond visuel sans (ou avec très peu de) texte parasite
- Les overlays template (logo, titre, features avec ✓, rating, prices, CTA) sont propres
- ZÉRO superposition NB2 ↔ overlays
- Tout est éditable au double-clic

- [ ] **Step 6.3: Test 2 — Fallback NB2 KO**

Forcer NB2 à échouer (jet temporaire `throw new Error('test')` dans `generateNanoBananaRef.ts`). Vérifier le fallback compose-direct full s'active (fond crème + tout vectoriel + tout éditable).

- [ ] **Step 6.4: Cleanup**

Retirer le throw, sauvegarder, dernier check visuel.

- [ ] **Step 6.5: Commit éventuel des micro-ajustements post-E2E**

Si des fixes ont été nécessaires pendant E2E (positionnement, fontSize, etc.), commit avec message clair.

---

## Self-Review

- ✅ Spec coverage : Task 1-5 couvre prompt anti-texte + new renderer + simplification useGenerateDesign + cleanup. Task 6 = validation.
- ✅ Pas de placeholder.
- ✅ Cohérence types : `renderNanoBananaTemplate(canvas, dataUri, scrapedData, w, h)` utilisé partout.
- ⚠️ Risque : NB2 pourrait résister au prompt anti-texte. Si E2E révèle du texte parasite trop intrusif, on itérera sur le prompt en Task 6.5.
