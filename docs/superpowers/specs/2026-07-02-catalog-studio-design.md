# Spec — Module « Catalogue studio » (catalogue multi-page piloté par prompts)

Date : 2026-07-02
Statut : validé (conception approuvée en session)

## 1. Objectif

Nouveau module professionnel de création de catalogue produit multi-page à partir d'une
sélection de la base PIM, entièrement piloté par un prompt global :

- couverture et 4e de couverture générées via prompt (textes + visuel IA) ;
- page de sommaire automatique avec numéros de page réels ;
- nombre de produits par page décidé par l'IA (ajustable par l'utilisateur) ;
- headers/footers data-driven reflétant l'Univers / Famille / Sous-famille courants.

## 2. Décisions structurantes (validées avec l'utilisateur)

| Sujet | Décision |
|---|---|
| Moteur de rendu | **Hybride** : génération + aperçu en HTML/CSS (façon module promo) ; conversion vers Fabric pour retouche = **Phase 2** |
| Rôle des prompts | **Tout piloté par un prompt global** : couvertures, thème, grilles, headers/footers, sommaire déclinent le même style |
| Taxonomie | **Mixte** : détection auto depuis les données PIM + réorganisation manuelle de l'arbre avant génération |
| Grille produits | **L'IA décide** la densité par section (N/page, vedettes) ; l'utilisateur peut corriger le plan avant génération |
| Ruptures de section | Chaque **Univers** ouvre sur une page d'ouverture (visuel + titre) ; familles/sous-familles s'enchaînent en flux, header mis à jour |
| Format de page | **A4 portrait par défaut** + choix libre (A4 paysage, A5, carré, personnalisé en mm) |
| Sorties | V1 : **PDF print pro** (fonds perdus, traits de coupe) + **PDF écran**. Phase 2 : retouche Fabric. Phase 3 : flipbook en ligne + export IDML |

## 3. Emplacement dans l'application

- Nouvelle `Section` `'catalog'` dans `src/features/navigation/modules.ts` (label « Catalogue »),
  permission `catalog.view`, entrée dans `MODULE_ITEMS` (enfants : « Nouveau », « Mes catalogues »).
- La section Dashboard affiche la **liste des catalogues** + bouton « Nouveau ».
- Le **builder** s'ouvre en plein écran sur une route dédiée **`/catalog/:id`**
  (ajout dans `src/app/router.tsx`, lazy + `ProtectedRoute`) — un catalogue de 100 pages
  a besoin de place, contrairement à la fiche promo unitaire.
- Code du module : `src/features/catalog/` (composants ≤ 150 lignes, logique hors UI).

## 4. Wizard en 5 étapes

### Étape 1 — Source & sélection
- Choix d'un projet PIM (`listPimProjects` / `loadPimMergeData` de `src/features/merge/pimSource.ts`)
  ou d'une feuille Excel (`DataSourceRef` merge).
- Sélection des produits : filtre taxonomique (pattern `taxonomyNavFilter` de `usePimStore`),
  recherche, cases à cocher, « tout sélectionner » par nœud.

### Étape 2 — Structure
- Construction auto de l'arbre Univers / Famille / Sous-famille depuis `Product.taxonomyPath`
  (PIM) ou depuis les colonnes mappées via `TaxonomyLevelMap` (Excel). Repli : mapping manuel
  de 1 à 3 colonnes sur les niveaux.
- Arbre réorganisable : renommer, fusionner, réordonner (drag via @dnd-kit), déplacer des
  produits d'un nœud à l'autre. Les nœuds vides sont ignorés à la génération.
- Choix du format de page : A4 portrait (défaut), A4 paysage, A5, carré, personnalisé (mm).

### Étape 3 — Prompt & style
- Un **prompt global** (ambiance, couleurs, typo, ton) + contexte (nom du catalogue, arbre,
  volumétrie par section, échantillons de colonnes).
- Nouvelle tâche LLM **`catalog.plan`** ajoutée à `TASK_ROUTING`/`TASK_TEMPERATURE` de
  `src/features/ai/llmRouter.ts`, appelée via `generateJson` (schéma Zod + `schemaForLLM`),
  sur le patron de `useGeneratePromoTemplate.ts`.
- Sortie : **`CatalogPlan`** =
  - `theme` : palette (accent, fonds, encres), fontes (parmi `FONT_OPTIONS` du module promo),
    style des headers/footers (variante, couleurs), style des pages d'ouverture d'univers ;
  - `sections[]` : pour chaque nœud de l'arbre → grille (`productsPerPage` ∈ {1,2,3,4,6,8}),
    produits « vedette » proposés (pleine page ou demi-page) ;
  - `cover` / `backCover` : titre, sous-titre, baseline, prompt image dérivé ;
  - `toc` : titre, style.
- Visuels de couverture générés par **Nano Banana** (`useImageGeneration` de
  `src/features/nanobana/`) à partir du prompt image dérivé ; régénérables unitairement.
- **L'IA propose, l'utilisateur dispose** : tout le plan est éditable (grille par section,
  vedettes, textes de couverture, palette) et régénérable avant l'étape 4.
- **Repli sans IA** : si `catalog.plan` échoue après cascade/retry, plan par défaut
  déterministe (grille 4/page partout, thème neutre, couverture typographique sans image)
  — la génération n'est jamais bloquée.

### Étape 4 — Aperçu
- **Moteur pur `catalogEngine.ts`** (aucune dépendance UI/Firebase) :
  `paginateCatalog(plan, tree, products) → CatalogPageDescriptor[]`.
  Séquence : couverture → sommaire (1..n pages selon la taille de l'arbre) → pour chaque
  univers : page d'ouverture puis pages produits en flux continu (familles/sous-familles
  enchaînent, ruptures matérialisées par le header) → 4e de couverture.
  Le sommaire est calculé en **deux passes** (pagination d'abord, numéros ensuite) pour des
  numéros de page exacts.
- Rendu HTML/CSS React data-driven : `CoverPage`, `TocPage`, `UniverseOpenerPage`,
  `ProductGridPage` (grille N-up + fiches produit), `CatalogHeader` (breadcrumb
  Univers › Famille › Sous-famille courants), `CatalogFooter` (pagination + nom du catalogue).
  Fiche produit : image, nom, marque, réf, prix, description courte — mapping colonnes→champs
  sur le patron `promoMapping.ts` (auto-guess + correction manuelle).
- Navigation par vignettes (rail latéral), rendu paresseux des pages hors écran.
- Produit sans image → placeholder neutre ; textes trop longs → clamp CSS déterministe.

### Étape 5 — Export
- **PDF écran** et **PDF print pro** : rendu natif de chaque page HTML → canvas → pdf-lib
  (pattern validé du projet ; pas de ré-import SVG dans Fabric).
- Print pro : fonds perdus et traits de coupe en dimensions physiques via le moteur mm/dpi
  existant (`mmToPx`), DPI au choix (150/300).
- Export par plage de pages possible ; nom de fichier configurable.

## 5. Données & persistance

- **`users/{uid}/catalogs`** : document catalogue = `{ id, name, sourceRef, selection,
  tree, prompt, plan, fieldMap, format, overrides, coverImages (réfs Storage/galerie),
  createdAt, updatedAt }`. Reprise d'édition à tout moment ; autosauvegarde à chaque étape.
- **`users/{uid}/catalogTemplates`** : modèles réutilisables (thème + grilles + styles,
  **sans** données ni sélection), sur le modèle exact de `promoTemplatesApi.ts`.
- `stripUndefined` à la frontière Firestore (piège connu : `setDoc` rejette `undefined`),
  `serverTimestamp` hors strip.
- Règles Firestore : mêmes patterns que `promoTemplates` (owner-only), + permission RBAC
  `catalog.view` dans `permissions.ts`.

## 6. Découpage du code (`src/features/catalog/`)

- `catalogEngine.ts` — pagination, sommaire, numérotation (pur, testé).
- `catalogTypes.ts` — `CatalogPlan`, `CatalogPageDescriptor`, `CatalogDoc`, `CatalogSection`.
- `catalogMapping.ts` — auto-mapping colonnes → champs fiche (patron `promoMapping.ts`).
- `useCatalogPlan.ts` — appel `generateJson('catalog.plan')` + repli par défaut.
- `useCatalogSource.ts` — chargement PIM/Excel + construction de l'arbre.
- `catalogsApi.ts` / `catalogTemplatesApi.ts` — persistance Firestore.
- `useCatalogExport.ts` — rendu pages → PDF (écran/print).
- `components/` — pages (Cover, Toc, Opener, ProductGrid, Header, Footer) + steps du wizard
  + `CatalogBuilderPage.tsx` (route `/catalog/:id`).
- Store : `stores/catalog.store.ts` (état du builder, persistance session comme
  `retailPromo.store.ts`).

## 7. Gestion d'erreurs

- LLM : cascade + retry Zod gérés par `llmRouter` ; échec final → plan par défaut + toast
  explicite (jamais de blocage).
- Image de couverture : échec Nano Banana → couverture typographique (aplat thème) + bouton
  « régénérer ».
- Source : projet PIM vide ou sans taxonomie → repli mapping manuel de colonnes ; aucune
  colonne mappable → catalogue mono-section « Produits ».
- Export : page qui échoue au rendu → page d'erreur visible dans le PDF + toast récapitulatif
  (pas d'échec silencieux).

## 8. Tests

- **Vitest sur `catalogEngine.ts`** (cœur critique) : pagination N-up, vedettes pleine/demi
  page, ruptures d'univers, sommaire 2 passes avec numéros exacts, sections vides, arbre à
  1 ou 2 niveaux seulement, produit sans image.
- Vitest sur `catalogMapping.ts` (auto-guess).
- Vérifications projet : `npx tsc -b`, `npm run lint`, `npm run test:run`, `npx knip`.
- Smoke test visuel en live après déploiement (catalogue réel depuis un projet PIM).

## 9. Hors périmètre V1 (phases suivantes)

- **Phase 2** : conversion page HTML → document Fabric éditable (retouche fine dans
  l'éditeur), sur le pont existant type `buildPromoHtml`.
- **Phase 3** : flipbook en ligne (consultation navigateur) + export IDML (briques
  EasyCatalog/IDML existantes).
- Règles conditionnelles par bloc (réutilisation `conditionalRules.ts`) — envisageable en V1.1.
