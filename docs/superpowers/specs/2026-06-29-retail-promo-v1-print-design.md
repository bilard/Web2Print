# Module « Visuels Promo Retail » — V1 Print — Design

> Date : 2026-06-29
> Statut : approuvé (design) — en attente de relecture spec avant plan d'implémentation
> Périmètre : **V1-Print uniquement**. Web (V2) et Animé (V3) sont des sous-projets distincts, chacun avec son propre spec.

## 1. Objectif

Créer un nouveau module qui produit des **visuels promotionnels Retail imprimables** (affiche, encart, étiquette rayon) à partir d'un **dataset existant sélectionné**, avec les **mécanismes promotionnels graphiques** habituels (prix barré, badge de remise, lot, validité/mentions/badges) et une **lisibilité maximale**.

Moteur **hybride** : l'IA génère un **gabarit** (plan de mise en page) ; la **fusion de données** le remplit pour produire N visuels. Approche retenue : **C+A** — livrer d'abord un socle fiable (kit de blocs + 3-4 templates curés), puis brancher le générateur de plan IA par-dessus.

### Non-objectifs (V1)
- Pas de génération de fond **raster** par IA (approche « Option B » réservée aux phases web/animé).
- Pas de sortie **web** ni **animée** (V2/V3).
- **Aucun nouveau format d'export** : on réutilise la pile existante.
- Pas de refonte de `merge`/`export`/règles conditionnelles : réutilisation.

## 2. Découpage en phases (contexte)

| Phase | Contenu | S'appuie sur |
|---|---|---|
| **V1 — Print** *(ce spec)* | Carte promo imprimable générée en hybride + fusion + export PDF/PNG 300 dpi par lot | `features/merge`, `features/export`, règles conditionnelles |
| V2 — Web | Décline les visuels print → snippet/bannière/story/carré | Pages déclinées (relayout LLM) + Pack social |
| V3 — Animé | Anime les promos (dévoilement prix, badge qui pulse) → MP4 | HyperFrames (`features/video`) |

## 3. Réutilisation de l'existant (socle ~90 %)

- **Fusion** : `features/merge/useDataMerge.ts`, `mergeEngine.ts` (`{{variables}}`, fallback de résolution), `stores/merge.store.ts` (`fieldMap`, `formulas`, `hideLineIfEmpty`, `currentRowIndex`).
- **Sources** : Excel (`stores/excel.store.ts`) et PIM (`stores/pim.store.ts`, `features/merge/pimSource.ts`).
- **Règles conditionnelles** : moteur pur + applier réversible existant (façon EasyCatalog) → pilote la visibilité des blocs.
- **Export** : `features/export/` (`useExportPng`, `useExportPdf` + marques de coupe `mmToPx`), `useBatchExport.ts` (boucle rows → PNG/PDF).
- **Placement IA** : `features/export/relayoutMultiFormat.ts` (`buildRelayoutPrompt`, `applyRelayout`), `declineLayout.ts` — logique de positionnement en % réutilisée pour instancier le plan.
- **Éditeur Fabric** : `EditorPage`, `CanvasContainer` (`globalFabricCanvas`), `useAutoSave`.
- **Navigation** : `features/navigation/modules.ts` + `DashboardPage.tsx` (pattern d'ajout de section).
- **Garde-fous Fabric connus** (à appliquer en instanciant blocs/plan) : `neutralizePlaceholderImages`, `unwrapNeutralClipGroups` + `perPixelTargetFind`, Textbox scaling intrinsèque, auto-fit largeur mono-ligne uniquement.

## 4. Architecture des composants

### 4.1 Modèle de données promo (canonique)
Fichier : `src/features/retail-promo/promoSchema.ts`

Schéma unique alimenté par toute source :
- **Produit** : `name`, `image`, `brand`, `brandLogo`, `ref`, `ean`, `category`
- **Prix** : `oldPrice`, `newPrice`, `currency`, `unit` (ex. `/kg`)
- **Mécanisme** : `type ∈ {simple, remise, lot, pack}`
  - `remisePct`, `remiseMontant` (**calculés** à partir de `oldPrice`/`newPrice`)
  - `lotQty`, `lotOffert` (ex. 2+1), `lotPrice` (ex. « les 2 pour X »)
- **Validité** : `validFrom`, `validTo`
- **Légal** : `mentions`, `enseigne`
- **Badges** : `badges: string[]` (Nouveau / Exclu / Stock limité)

Règles :
- Les champs **calculés** (remisePct/remiseMontant) passent par les **formules de fusion** existantes quand c'est possible (source unique d'affichage/fusion/export). ⚠️ Le moteur de formules est **sans priorité d'opérateurs** → parenthéser explicitement toute formule générée.
- Un **mappage** colonnes source → champs promo réutilise `fieldMap` (`merge.store`), avec auto-détection (fuzzy) + override manuel.
- Source **manuelle** = mini-éditeur in-app qui produit des lignes au même schéma.

### 4.2 Kit de blocs promo éditables
Dossier : `src/features/retail-promo/blocks/`

Chaque bloc = un **sous-groupe Fabric** + métadonnées. Enregistrement **par effet de bord** (comme les nodes workflow : un symbole utilisé seulement dans son fichier n'est pas exporté ; un `initPromoBlocks()` importe les fichiers pour déclencher l'enregistrement).

Catalogue V1 :
| Bloc | Liaisons `{{}}` | Règle de visibilité |
|---|---|---|
| `PrixBarré` (était/maintenant) | oldPrice, newPrice, currency | visible si `oldPrice > newPrice` |
| `BadgeRemise` (-X% / -X€) | remisePct \| remiseMontant | visible si remise > 0 |
| `BandeauLot` (2+1 / les 2 pour X) | lotQty, lotOffert, lotPrice | visible si `type ∈ {lot, pack}` |
| `BandeauValidité` (du…au…) | validFrom, validTo | visible si dates présentes |
| `Mentions` | mentions | visible si non vide |
| `BadgeStatut` (Nouveau/Exclu/Stock limité) | badges[] | visible si badge présent |
| `CadrePhoto` | image (cover/contain) | toujours |
| `Accroche` | headline (brief ou saisie) | toujours |

Interface d'un bloc (conceptuelle) :
```
PromoBlock = {
  id: string
  label: string
  bindings: string[]          // champs promo requis
  build(ctx): fabric.Group     // crée le sous-groupe éditable + placeholders {{}}
  visibilityRule: Rule         // règle conditionnelle (moteur existant)
  defaultStyle: StyleTokens    // couleurs/typo par défaut, thémables
}
```

### 4.3 Templates curés (3-4 print)
Dossier : `src/features/retail-promo/templates/`

Définitions de templates faits-main assemblant les blocs, pré-câblées (liaisons + règles) :
- Affiche **A4 portrait** (794×1123)
- Encart **½ page**
- Étiquette **rayon A6**
- **A3** portrait

Stockés/instanciés comme **Projets** (réutilise le stockage de templates et l'ouverture éditeur).

### 4.4 Générateur IA de plan (le « A » du hybride)
Fichiers : `src/features/retail-promo/useGeneratePromoPlan.ts`, `useInstantiatePlan.ts`

- **Entrée** LLM : brief (accroche/ton) + format cible + **un produit-échantillon** + **catalogue des blocs** (id, label, bindings) + palette/marque.
- **Sortie** LLM : **plan JSON** = liste de blocs choisis avec `position`/`size` en **% de page**, `palette`, `fonts`, `background`. **Jamais de pixels.**
- **Instanciation** : `useInstantiatePlan` construit un **template Fabric éditable** réel à partir du plan (réutilise la logique de placement en % de `applyRelayout`/`declineLayout` + garde-fous Fabric).
- **Validation + réparation** (façon Prompt-to-Flow) : plan invalide (bloc inconnu, % hors borne, liaison absente) → réparé ; si irrécupérable → **repli** sur le template curé le plus proche du format.
- Le LLM **ne juge jamais la complétude** : tous les blocs requis par les données présentes sont posés ; l'IA ne fait qu'art-diriger (positions/style).

### 4.5 UI / navigation
- Nouvelle **section** `retail-promo` : `features/navigation/modules.ts` (type `Section`, `MODULE_ITEMS`, `SECTION_PERMISSION`), lazy import + condition de rendu dans `DashboardPage.tsx`, permission `retailPromo.view`.
- **Page** : `src/features/retail-promo/RetailPromoPage.tsx`, **lazy-importée** dans `DashboardPage.tsx` (même pattern que les autres sections) + composants d'étape (< 150 lignes chacun) :
  1. **Source** : PIM (projet) / Excel (fichier) / **sélection manuelle**
  2. **Format + template** (galerie) **ou** « Générer (IA) » (brief)
  3. **Mappage champs** (auto + override) + **aperçu 1er produit** + réglage mécanismes/règles
  4. **Export par lot**
- Éditer un visuel ouvre l'**éditeur Fabric existant**.

### 4.6 Export
Réutilisation directe :
- **PNG 300 dpi** (`useExportPng`), **PDF** + marques de coupe taille constante (`mmToPx`).
- **Lot** : `useBatchExport` (boucle rows → applique chaque ligne → exporte).
- *(Pas de nouveau format. Décli web = V2, animé = V3.)*

## 5. Flux de données

```
Source (PIM | Excel | manuel)
  → mappage colonnes → champs promo canoniques (promoSchema)
  → [voie A] brief + format + échantillon + catalogue blocs → LLM → plan JSON
            → validation/réparation → instanciation → template Fabric éditable
     [voie C] choix template curé
  → fusion (useDataMerge) : pour chaque row, résout {{}} + applique règles de visibilité des blocs
  → aperçu (1er produit) / édition (éditeur Fabric)
  → export par lot (PNG 300dpi / PDF + marques) (useBatchExport)
```

## 6. Gestion des erreurs

- **Plan IA invalide** → réparation, sinon repli template curé (jamais d'échec bloquant).
- **Champ manquant** (ex. pas d'`oldPrice`) → le bloc concerné est **masqué** par sa règle de visibilité (pas d'affichage cassé).
- **Image produit absente/illisible** → placeholder neutralisé (`neutralizePlaceholderImages`) ; le visuel reste exportable.
- **Formule** générée → parenthésée (moteur sans priorité d'opérateurs) ; vérifier le résultat sur le 1er produit.
- **Échec LLM** (quota/JSON) → message clair + bascule galerie de templates curés.

## 7. Stratégie de test

Tests purs (Vitest) :
- `promoSchema` : mappage source → champs + **calcul remise** (pct/montant, unité, devise).
- **Règles de visibilité** des blocs (chaque ligne du tableau 4.2).
- **Validation/réparation du plan** (bloc inconnu, % hors borne, liaison absente, repli).
- Smoke **export par lot** (N lignes → N fichiers).

## 8. Frontières & fichiers (nouveau dossier)

`src/features/retail-promo/`
- `promoSchema.ts` — champs canoniques + mappage + calculs
- `blocks/` — kit (1 fichier par bloc, enregistrement par effet de bord) + `index.ts` (`initPromoBlocks`)
- `templates/` — définitions des templates curés
- `useRetailPromoSource.ts` — sélection/normalisation de la source
- `useGeneratePromoPlan.ts` — appel LLM → plan JSON
- `useInstantiatePlan.ts` — plan → template Fabric éditable (validation/réparation/repli)
- `RetailPromoPage.tsx` + composants d'étape (< 150 lignes chacun)

Réutilise (sans modifier la logique métier) : `features/merge`, `features/export`, moteur de règles conditionnelles, garde-fous Fabric.

## 9. Conventions projet à respecter

- Composants `PascalCase.tsx` ≤ 150 lignes ; hooks `useCamelCase.ts` ; stores `camelCase.store.ts`.
- TS strict, pas d'`any` ; props typées.
- Théming par tokens (`bg-surface`, `white` = avant-plan thémable, `text-[#fff]` = blanc vrai) ; accent `#6366f1`.
- Vérification : `npx tsc -b` (project references), `npm run lint`, `npm run test:run`, `npx knip` (baseline exit 0).
- Réponses/commentaires en français.
- Fin de tâche → commit master puis `npm run build` + `firebase deploy --only hosting`.

## 10. Risques connus / points de vigilance

- **Netteté des prix en print** : raison du choix « pas de raster » en V1 — les prix restent vectoriels/Textbox.
- **`toDataURL` viewport vs design-space** (piège relayout/déclinaisons) — déjà documenté, à reprendre tel quel.
- **Fidélité des styles à la fusion** (`remapStyles`, auto-fit largeur mono-ligne uniquement) — réutiliser les correctifs existants.
- **JSON LLM peu fiable** sur certains modèles (gemini-3.5) → modèle structuré fiable + validation/réparation.
