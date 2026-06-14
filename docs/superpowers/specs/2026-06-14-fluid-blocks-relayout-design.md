# Reformater « Fluide (IA) » — re-layout par blocs

> Spec — 2026-06-14

## Problème

Le re-layout LLM **par objet** (« Pages déclinées ») éparpille une composition soudée (prix collé au tube, badges en place) car chaque objet est placé indépendamment. La mise à l'échelle **proportionnelle déterministe** (`cover`/`contain`) préserve la composition mais **ne sait pas ré-agencer** : un flyer portrait → A4 paysage est soit rogné (cover), soit cerné de marges (contain). Aucune des deux n'est la « Mise en page fluide » d'InDesign / le « Magic Resize » de Canva.

## Principe : l'IA raisonne en BLOCS, le code exécute par bloc

1. **L'IA regroupe** les éléments en **2 à 5 blocs cohérents** (visuel produit, bloc prix/promo, bloc texte, fond/cadre) ET **place chaque bloc** (région cible) pour le nouveau format.
2. **Le code applique UNE SEULE transformation par bloc** (contain dans la région du bloc, facteur d'échelle + translation uniques pour tous les objets du bloc) → la composition **interne** de chaque bloc reste **verrouillée**. L'éparpillement objet-par-objet est **structurellement impossible**.
3. **Repli déterministe garanti** : si l'IA est indisponible/échoue, on retombe sur `projectObjectsToFormat(..., 'cover')` (composition entière préservée). Ne lève jamais.

C'est le « Magic Resize » de Canva, fait correctement : IA pour le **jugement** (regroupement + placement), code déterministe pour l'**exécution** (cohérence garantie).

## Architecture

### Découpage (tout dans `src/features/export/` sauf routing)

| Unité | Rôle | Pur ? |
|---|---|---|
| `fluidBlocks.ts` | types + schémas (Zod/JSON) + `applyFluidBlocks()` (placement → géométrie par bloc) | ✅ pur |
| `fluidBlocks.test.ts` | tests `applyFluidBlocks` | — |
| `fluidRelayoutToFormat.ts` | orchestrateur : descripteurs + image → LLM (`design.fluidRelayout`) → `applyFluidBlocks` ; **repli cover garanti**, ne lève jamais | — |
| `llmRouter.ts` (modif) | tâche `design.fluidRelayout` (gemini primary → claude, temp 0) | — |
| `useDeclineToPages.ts` (modif) | branche `transform: 'fluid'` → rend l'image source + `fluidRelayoutToFormat` | — |
| `useReformatPage.ts` (modif) | `transform: 'fluid'` + toast (IA, mention repli) | — |

On **réutilise** : `buildDescriptors` (de `relayoutMultiFormat.ts`) pour les descripteurs par objet, `renderSourceDataUri` (viewport neutralisé) pour l'image, `projectObjectsToFormat(...,'cover')` pour le repli, toute la plomberie `declineToPages` (rendu / nouvelle page / navigation). **Aucune régression** des « Pages déclinées » (`transform` défaut `'ai'`) ni des modes `'contain'`/`'cover'`.

### Schéma LLM (`design.fluidRelayout`)

```ts
{ formats: [ { id: string, blocks: [ { indices: number[], xPct, yPct, wPct, hPct } ] } ] }
```

- `indices` : indices d'objets (mapping vers le tableau source) formant le bloc. Chaque index dans **un** bloc idéalement ; un index absent → repli cover pour cet objet ; un index dupliqué → la 1ʳᵉ occurrence gagne.
- `xPct,yPct,wPct,hPct` : région cible du bloc (coin haut-gauche + taille, fractions [0..1] de la page CIBLE). Bornes clampées à l'application.

### `applyFluidBlocks(objects, srcW, srcH, dstW, dstH, blocks)` (pur)

Pour chaque bloc :
1. Calcule la **bbox source** de ses objets : `x0=min(left)`, `y0=min(top)`, `x1=max(left+width*scaleX)`, `y1=max(top+height*scaleY)`. (Approximation sans rotation/origine, cohérente avec `buildDescriptors`.)
2. Région cible px : `rx=clamp(xPct)*dstW`, `ry=…`, `rw=max(wPct,0.01)*dstW`, `rh=…`.
3. **Contain** : `s = min(rw/bw, rh/bh)` ; bloc centré dans sa région : `offX = rx + (rw - bw*s)/2`, `offY = ry + (rh - bh*s)/2`.
4. Pour chaque objet du bloc : `left = (left - x0)*s + offX` ; `top = (top - y0)*s + offY` ; `scaleX *= s` ; `scaleY *= s`. **Même `s`/`off` pour tous les objets du bloc** → compo interne intacte.

Tombent en **repli cover** (`projectObjectsToFormat([o],…,'cover')[0]`) : objet sans bloc, OU bloc à bbox nulle (`bw<=0`/`bh<=0`). Renvoie de NOUVEAUX objets (sources non mutées).

> Pas d'anti-chevauchement : les chevauchements **voulus** (prix sur le tube) sont à l'intérieur d'un même bloc (préservés) ; entre blocs, on fait confiance aux régions de l'IA.

### Prompt (directeur artistique, image en vision)

« Tu es DA. Image de référence + éléments (i, type, role?, text?, bbox source %). (1) REGROUPE en 2–5 BLOCS cohérents (visuel produit ; prix/promo ; texte ; fond/cadre), chaque i dans un bloc. (2) Pour le format cible (ratio différent), PLACE chaque bloc (région xPct,yPct,wPct,hPct, fractions page cible) : exploite l'espace selon l'orientation (paysage → blocs côte à côte ; portrait → empilés) ; le fond/cadre couvre la page (0,0,1,1) ; préserve la hiérarchie ; ne fais pas déborder un bloc. JSON {formats:[{id, blocks:[{indices,xPct,yPct,wPct,hPct}]}]}. »

### Orchestration `fluidRelayoutToFormat`

`{ imageDataUri, objects, srcW, srcH, target }` → `buildDescriptors` → `generateJson({ task:'design.fluidRelayout', schema, imageDataUris:[…] })` → `applyFluidBlocks` pour le format renvoyé. **Try/catch + repli** `projectObjectsToFormat(...,'cover')` : LLM absent, image illisible, format omis, descripteurs vides. Renvoie `{ objects, usedFallback }`. Ne lève jamais.

### Branche `declineToPages({ transform:'fluid' })`

`'fluid'` → rend l'image source (`renderSourceDataUri`, nécessaire à la vision) → `fluidRelayoutToFormat` par cible → `byFormat`. `usedFallback` propagé. `'ai'`/`'contain'`/`'cover'` inchangés.

### `useReformatPage`

`transform: 'fluid'`. Toast : succès « Format adapté par IA (mise en page fluide) » ; si `usedFallback` → « repli proportionnel (IA indisponible) ». Reste : règle `shouldReformat`, idempotence, nouvelle page, navigation — inchangé.

## Repli & robustesse

- Sans clé LLM / budget épuisé (rappel : budget bridé ~1 $/mois) / image CORS / JSON invalide → **cover déterministe**, composition entière préservée, jamais bloqué. Toast le signale.
- Composition **interne** de chaque bloc : garantie par construction (transformation unique par bloc), indépendamment de la qualité de l'IA. Le pire cas IA = mauvais **placement** de blocs, jamais un éparpillement intra-bloc.

## Hors périmètre (YAGNI)

- Sélecteur de mode (Fluide/Remplir/Tenir) dans l'UI : `'fluid'` est le défaut du reformat ; `'cover'`/`'contain'` restent accessibles par option programmatique. Picker UI = itération ultérieure si demandé.
- Ancrage type ressort/contrainte par objet (Cassowary) : non — les blocs + IA couvrent le besoin.
- Anti-chevauchement inter-blocs : non (casserait les chevauchements voulus).

## Validation

- `fluidBlocks.test.ts` : (1) 2 objets d'un même bloc gardent leur **écart relatif** après transformation (compo interne préservée) ; (2) objet sans bloc → repli cover ; (3) bloc à bbox nulle → repli ; (4) région clampée hors page.
- Smoke test manuel (clé LLM réelle) : flyer portrait → **A4 Paysage** → produit et bloc prix/texte ré-agencés côte à côte/empilés cohéremment, chaque bloc interne intact ; repli cover si clé retirée. À ajouter `docs/TESTS-A-FAIRE.md` §A1bis.
