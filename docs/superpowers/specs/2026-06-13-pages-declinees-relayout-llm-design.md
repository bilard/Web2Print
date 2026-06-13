# Pages déclinées — re-layout multi-format piloté par LLM

> Spec de conception · 2026-06-13 · feature « Pages déclinées » (export multi-format éditable)

## Problème

La feature « Pages déclinées » (Éditeur → Exporter → « Pages déclinées ») crée
aujourd'hui une page éditable par format coché (carré / story / paysage /
bannière) via `projectObjectsToFormat` (`src/features/export/declineLayout.ts:43`)
qui applique une **homothétie uniforme** (scale « contain » + centrage).

Conséquence : passer d'un carré 1:1 à une story 9:16 ou une bannière 3:1 produit
le design source **rétréci et centré dans du vide letterboxé**. Le fond ne remplit
jamais le nouveau ratio, le contenu devient minuscule. Résultat inutilisable :
la feature n'a aucun intérêt si le contenu n'est pas **réadapté automatiquement**
au ratio cible.

## Objectif

« Créer les pages » réadapte automatiquement la mise en page de chaque déclinaison
au ratio cible, via un re-layout **piloté par LLM multimodal** :
- le fond pleine-page remplit le format (cover, rogne le débord) — fini le vide ;
- les éléments de contenu (titre, prix, photo, logo…) sont replacés et
  redimensionnés dans des régions cohérentes avec le ratio cible ;
- les pages restent **réellement éditables** (re-layouting JSON, aucun PNG figé) ;
- ça **réussit toujours**, même LLM indisponible : repli déterministe sur
  l'homothétie actuelle.

Hors-scope (YAGNI) : reflow/wrap fin du texte par l'IA, ajout/suppression
d'éléments par l'IA, formats personnalisés au-delà des `DECLINE_TARGETS` existants,
édition du prompt par l'utilisateur.

## Architecture

Un seul appel LLM pour tous les formats cochés (image envoyée 1×, cohérence
inter-formats). Le LLM **place** (quelle région chaque élément occupe dans le
ratio cible) ; un calcul **déterministe dimensionne** (cover/contain, ratio
préservé) → zéro distorsion, zéro hallucination de taille.

### Flux

1. **Rendu source** : la page source est la page courante, déjà rendue à l'écran
   (images chargées CORS-OK). On exporte un PNG via `canvas.toDataURL`
   (même approche que `src/features/export/useExportPng.ts:26`, grille/marques
   exclues du rendu). → `imageDataUri`.
2. **Descripteurs** : on sérialise le canvas (`FABRIC_SERIALIZED_PROPS`), on filtre
   grille + marques de coupe (`data.isGrid`, `data.isPrintMark`), et on construit
   un descripteur **indexé** par objet de design :
   `{ i, type, role?, text?, xPct, yPct, wPct, hPct }`
   où `i` = index stable (mapping retour), bbox en % du canvas source,
   `role` = `data.role` si présent (flyer décomposé), `text` = contenu tronqué
   pour les objets texte.
3. **Appel LLM** : `generateJson` (`src/features/ai/llmRouter.ts:274`) avec
   `imageDataUris: [imageDataUri]`, le prompt + les descripteurs + la liste des
   formats cibles cochés (id, w, h, ratio). Tâche `design.relayoutMultiFormat`,
   température 0.
4. **Validation** : schéma Zod (`safeParse`). En cas d'échec → **1 réparation**
   (re-prompt avec les erreurs), puis re-validation (pattern prompt-to-flow,
   `usePromptToFlow.ts:33`).
5. **Application déterministe** : pour chaque format, `applyRelayout` mappe les
   boîtes % renvoyées vers des objets Fabric transformés (cf. règles ci-dessous).
6. **Création des pages** : inchangé — `addPage(w, h)` + `updatePage(id,
   { canvasJSON, label })`, page source restaurée à la fin
   (`useDeclineToPages.ts`).

### Repli déterministe

Si (a) pas de clé LLM / budget épuisé, (b) `generateJson` lève, ou (c) validation
KO après réparation : on retombe sur `projectObjectsToFormat` **par format**, on
crée quand même les pages, et on émet un toast d'avertissement
(« adaptation IA indisponible — repli géométrique »). « Créer les pages » ne
bloque jamais et ne lève jamais vers l'UI.

## Contrat LLM

### Sortie (schéma Zod + JSON Schema)

```ts
{
  formats: Array<{
    id: string                  // id du format cible (ex. 'story')
    elements: Array<{
      i: number                 // index de l'objet source
      xPct: number              // boîte cible : coin haut-gauche, fraction [0..1] de la page cible
      yPct: number
      wPct: number              // taille de la boîte, fraction [0..1]
      hPct: number
      fit: 'cover' | 'contain'  // cover = fond pleine-page ; contain = contenu
    }>
  }>
}
```

Validation Zod : `xPct/yPct ∈ [0,1]`, `wPct/hPct ∈ (0,1]`, `fit` enum, `i` entier
référençant un descripteur connu. Les `i` manquants dans la réponse retombent sur
leur position homothétique pour ce format (tolérance, pas d'erreur bloquante).

### Prompt (esquisse)

- Rôle : directeur artistique qui réadapte une affiche à un nouveau ratio.
- Contraintes : préserver la hiérarchie visuelle ; le fond pleine-page prend
  `fit:'cover'` et couvre toute la page ; le reste `fit:'contain'` ; ne pas faire
  déborder les boîtes hors page ; éviter les chevauchements du contenu.
- Entrée : image de référence (multimodale) + descripteurs JSON + formats cibles.
- Sortie : strictement le JSON du schéma.

## Application déterministe (`applyRelayout`)

Pur, sans Fabric, testable. Pour un objet source sérialisé et sa boîte cible :

- Taille rendue source : `curW = (width ?? 0) * (scaleX ?? 1)`,
  `curH = (height ?? 0) * (scaleY ?? 1)`.
- Boîte cible en px : `bx = xPct*dstW`, `by = yPct*dstH`, `bw = wPct*dstW`,
  `bh = hPct*dstH`.
- Facteur d'échelle **uniforme** (pas de distorsion) :
  - `contain` : `f = min(bw/curW, bh/curH)`
  - `cover` : `f = max(bw/curW, bh/curH)`
- Nouvelle échelle : `scaleX' = (scaleX ?? 1) * f`, `scaleY' = (scaleY ?? 1) * f`.
- Nouvelle position (origine left/top par défaut — cas de la décompo et des docs
  ordinaires), centrée dans la boîte :
  `left' = bx + (bw - curW*f)/2`, `top' = by + (bh - curH*f)/2`.
- Si `curW <= 0` ou `curH <= 0` (pas de dimensions) → on garde le repli
  homothétique pour cet objet.
- Toutes les autres propriétés (fill, stroke, data, styles…) **préservées**.

`fit:'cover'` peut déborder la page (rognage attendu pour un fond) ; c'est voulu.

## Modules

| Fichier | État | Rôle |
|---|---|---|
| `src/features/export/relayoutMultiFormat.ts` | **nouveau** (pur) | Schéma Zod + JSON, `buildDescriptors(objects, srcW, srcH)`, `applyRelayout(objects, srcW, srcH, dstW, dstH, elements)` |
| `src/features/export/relayoutToFormats.ts` | **nouveau** | Orchestration : PNG + descripteurs → `generateJson` → validation + 1 réparation → fallback `projectObjectsToFormat` par format |
| `src/features/export/useDeclineToPages.ts` | **modifié** | Devient async : rend le PNG source, appelle `relayoutToFormats`, crée les pages |
| `src/features/export/declineLayout.ts` | inchangé | `projectObjectsToFormat` reste le repli déterministe |
| `src/features/ai/llmRouter.ts` | **modifié** | Tâche `design.relayoutMultiFormat` dans `TASK_ROUTING` (primary `gemini`, fallback `claude`, modèle `gemini-3.1-pro-preview`) + température `0` |
| `src/features/export/ExportModal.tsx` | **modifié** | États loading/progress/error (déjà présents) + libellé « adaptation IA » + gestion « pas de clé / budget » → toast + repli, jamais de blocage |
| `src/features/export/relayoutMultiFormat.test.ts` | **nouveau** | Tests unitaires de `applyRelayout` (cover vs contain, % → px, centrage, dimensions manquantes) et `buildDescriptors` |

## Tests

Unitaires (Vitest, sur les fonctions pures) :
- `applyRelayout` : `contain` tient dans la boîte sans distorsion ; `cover` remplit
  et déborde ; centrage correct ; `scaleX=scaleY` (ratio préservé) ; objet sans
  dimensions → repli ; propriétés non géométriques préservées.
- `buildDescriptors` : bbox en %, `role`/`text` extraits, grille/marques exclues.
- Schéma Zod : rejette `xPct` hors borne, `fit` inconnu, `i` inconnu.

Manuel (checklist `docs/TESTS-A-FAIRE.md`, section A1 à réécrire) :
- Cocher plusieurs formats → fond qui remplit chaque ratio (pas de letterbox),
  contenu replacé cohéremment, objets éditables, page source intacte.
- LLM coupé (clé retirée) → repli géométrique + toast, pages créées quand même.

## Risques / décisions

- **Origine des objets** : on suppose origine left/top (défaut Fabric, cas décompo
  et docs ordinaires). Les objets à origine centrée seraient mal placés — non géré
  en v1 (rare dans ce flux).
- **Latence** : un appel LLM (multimodal) au clic. UX via états loading déjà
  présents dans `ExportModal`.
- **Coût** : image envoyée 1× pour tous les formats → coût borné. Passe par la
  cascade/proxy LLM existants (budget mensuel bloquant respecté).
- **Texte** : pas de reflow IA en v1 ; le `contain` dans la boîte assignée + édition
  manuelle post-création suffisent.
