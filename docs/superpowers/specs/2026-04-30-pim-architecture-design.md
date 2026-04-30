# PIM — Architecture & navigation

**Date** : 2026-04-30
**Statut** : design validé, prêt pour plan d'implémentation

## Contexte & problème

L'écran « Données » (`DataPage.tsx`) gère aujourd'hui des **BDD** (documents Firebase) qui contiennent un tableau de **sheets** Excel. Le scraping ajoute une sheet par hostname ; les sheets sont rendues comme onglets horizontaux en haut du DataTable.

Cette structure ne scale pas pour un usage PIM réel : l'utilisateur veut agréger des **centaines de sources** (sites e-commerce, fournisseurs, fichiers importés, saisie manuelle) dans un même projet et travailler avec une **taxonomie unique**, peu importe la source d'origine du produit.

Objectif : transformer l'écran en vraie interface PIM type Akeneo / Pimcore, avec une primitive « produit master » au niveau projet et un panneau de navigation dédié pour les sources.

## Modèle de données

```
Project   (= document Firebase, l'actuel "fichier sauvegardé")
├─ id, name, path, taxonomyLevels[]
├─ sources : Source[]
│   ├─ id, name (host ou filename), kind: 'scrape' | 'import' | 'manual'
│   ├─ url?, favicon?, lastSyncedAt
│   ├─ group? : string         ← dossier custom utilisateur
│   └─ schema : ColumnDef[]    ← champs scrapés bruts (prix-source, url, image-source)
│
├─ products : Product[]         ← TABLE MASTER projet-level (sub-collection Firestore)
│   ├─ _id, masterSku, masterEan, primarySourceId
│   ├─ fields : { [key]: { value, winningSourceId, overridden? } }
│   ├─ sourceLinks : SourceLink[]
│   │    ├─ sourceId, externalSku?, externalUrl?
│   │    └─ snapshot : { …raw row de la source }  ← jamais écrasé
│   └─ taxonomyPath : string[], needsDedup: boolean
│       (chemin de catégorie dans la taxonomie projet, ex ["Outillage", "Visseuses"])
│
└─ taxonomy   ← définition projet-level (tags + niveaux), partagée par tous les produits (existant)
```

### Stratégie de fusion par champ

**Définition « source primaire »** : la première source ayant créé le produit master. Stockée sur le master en `primarySourceId`. Ne change pas si la source est supprimée — le master est alors supprimé en cascade (voir Risques).

| Champ | Comportement |
|---|---|
| `sku`, `ean`, `gtin` | Clé d'identité, immuable (sert au matching) |
| `name`, `description`, `brand`, `category` | Valeur de la source primaire ; override manuel possible (`overridden: true` verrouille) |
| `price`, `image`, `stock`, `external_url` | **Toujours par source** — exposés via `sourceLinks[].snapshot`, jamais fusionnés |
| Tout autre champ scrapé | Idem prix/image : conservé par source dans `snapshot` |

### Règle de matching à l'ingestion

Pour chaque ligne entrante :
1. `sku = normalize(row.sku ?? row.ean ?? row.gtin ?? row.ref)`
2. Match exact dans `project.products` → ajoute un `SourceLink` au master existant + applique stratégie par champ
3. Pas de match → crée un nouveau master
4. Pas de SKU détectable → crée un master synthétique avec `needsDedup: true` → badge UI pour merge manuel ultérieur

### Dédup manuelle (`needsDedup`)

Les produits flag `needsDedup: true` exposent dans la DataTable un menu kebab `Fusionner avec…` qui ouvre une popover :
- recherche fuzzy (titre + description) parmi les produits du même chemin taxonomique
- aperçu côte-à-côte des deux produits
- `Fusionner` → le produit `needsDedup` est absorbé par la cible (le `sourceLink` est transféré, le master synthétique supprimé)
- `Ignorer` → flag retiré sans merge (le produit reste comme master autonome)

### Conséquences UX

- La DataTable centrale affiche les **produits master**, pas les rows source par source
- Un produit master peut afficher dans une cellule `prix` un mini-bloc multi-source (« 24,90 € · Castorama / 26,00 € · Leroy Merlin »)
- La fiche produit (`ProductSheet`) gagne un onglet « Sources » avec le snapshot brut de chacune

## Layout & navigation

3 colonnes type Akeneo / Pimcore :

```
┌──────────┬───────────────────┬──────────────────────────────────────────┐
│ PROJETS  │  SOURCES          │  Castorama › Outillage › Visseuses       │
│ (BDD)    │  (sites scrapés)  │  ──────────────────────────────────────  │
│          │                   │  [Maj] [Sauver] [Exporter]    🔍 …       │
│ + Nouv.  │  🔍 Filtrer       │  ──────────────────────────────────────  │
│          │  + Source ▾       │  Filtres taxo (chips actifs)             │
│ ⌂ Cast.  │   ├─ Importer     │  ──────────────────────────────────────  │
│   174    │   ├─ Scraper      │                                          │
│ ⌂ Decath.│   └─ Manuel       │   ┌──────────────────────────────┐       │
│ ⌂ NEW    │                   │   │  DataTable produits master   │       │
│          │  📁 Fournisseurs  │   │  (multi-sources fusionnées)  │       │
│          │   🌐 nicoll.fr ▾  │   └──────────────────────────────┘       │
│          │      185 · 12 ★   │                                          │
│          │   🌐 milwaukee ▾  │   ▼ Panneau droit collapsable :          │
│          │      412 · 89 ★   │     • Champs                             │
│          │   📄 import.xlsx  │     • Taxonomie                          │
│          │      54           │     • Fiche produit (au clic d'une row)  │
│          │  📁 Catalogues    │                                          │
│          │   🌐 leroy… ▾     │                                          │
│          │      1 248 · 0    │                                          │
│          │  ▾ Manuel · 12    │                                          │
└──────────┴───────────────────┴──────────────────────────────────────────┘
```

### Colonne 1 — Projets (~180 px, refonte légère)

Liste plate ou en dossiers (déjà implémenté). Épuration : on retire la barre d'onglets sheets, ce niveau ne montre plus que les BDD.

### Colonne 2 — Sources (~240 px, **nouveau panneau**)

- Recherche en haut (filtre les sources par nom/host)
- Bouton unique `+ Source ▾` qui déroule les 3 modes d'entrée (importer / scraper / manuel)
- Liste scrollable, virtualisée si > 100 sources, regroupée par `group` (dossiers custom drag-drop)
- Chaque ligne : icône type (🌐 scrape / 📄 import / ✏️ manuel) + nom + count produits + count enrichis (★)
- Sélection : single-click = filtre, cmd-click = multi-sélection, click sur le projet (col 1) = vue globale projet (toutes sources)
- Menu kebab par source : renommer · re-scraper · déplacer dans groupe · supprimer

### Colonne 3 — Vue principale

- Breadcrumb dynamique : `Castorama` (vue globale) ou `Castorama › milwaukee.eu` ou `Castorama › 3 sources` (multi)
- Chips actifs de filtres taxonomiques juste sous la toolbar (cliquables pour retirer)
- DataTable au centre = produits **master** (jamais les rows brutes)
- Panneau droit collapsable : toggle `Champs` / `Taxonomie` actuel + nouvel onglet `Sources` quand un produit est ouvert

### Disparitions & states

- La barre d'onglets horizontale (pills `nicoll.fr ✕ …`) disparaît, remplacée par la sélection col 2
- Empty state projet 0 source : gros bouton `+ Source` au centre
- Empty state source 0 produit : `Re-scraper` / `Voir log`
- Responsive < 1280 px : col 2 collapse en drawer

## Flux d'ingestion (3 modes unifiés)

Tout passe par le même pipeline :

```
[+ Source ▾] → choix du mode → modal dédiée → preview →
   ↓
(matching SKU contre project.products) → preview merge :
   "12 nouveaux produits · 8 mergés · 3 sans SKU (à dédupliquer)"
   ↓
[Confirmer] → écriture Firebase → source apparaît dans col 2 sélectionnée
```

### Mode 1 — Importer un fichier (Excel/CSV)

Réutilise `ExcelImportModal` existante, étendue :
- Pré-sélectionne le projet courant (plus de « create new BDD »)
- Ajoute un champ « Groupe (optionnel) »
- Détection auto colonne SKU/EAN (déjà partiellement implémentée via `fieldDetection`)
- Préview du matching avant import

### Mode 2 — Scraper une URL

Réutilise `ScrapingModal` existante, sortie modifiée :
- `Produit unique` → 1 ligne → 1 produit master
- `Liste / Catalogue` → N lignes → N produits master
- `Crawl` → N pages → N produits master
- La modal n'écrase plus jamais les sheets ; envoie au pipeline matching
- Logique SPA / Puppeteer existante conservée

### Mode 3 — Saisie manuelle

Ouvre une fiche vierge dans une « Source manuelle » (créée à la volée si absente, kind `'manual'`). Pas de matching — chaque produit créé est unique.

### Re-scraping d'une source existante

Click droit source → `Mettre à jour`. Re-fetch via `sourceUrl`, diff au niveau master (ajoutés, modifiés, disparus), `UpdatePreviewModal` étendue.

### Préview de matching SKU (élément central)

Avant validation, l'utilisateur voit 3 catégories : **nouveaux** / **mergés sur produits existants** / **sans SKU à dédupliquer**. La même préview pour les 3 modes (import, scrape, re-scrape). Sans elle, l'utilisateur ne saurait pas pourquoi N lignes ont « disparu ».

## Découpage technique

```
src/features/pim/
├─ types.ts                       Project, Source, Product, SourceLink, MergePreview
├─ usePimProject.ts               hook React Query : load/save project (Firebase)
├─ useSources.ts                  CRUD sources d'un projet
├─ useProducts.ts                 lecture/filtrage des produits master
├─ matching/
│   ├─ normalizeSku.ts            sku/ean/gtin → clé canonique
│   ├─ matchRows.ts               (rows entrants, products) → MergePreview
│   ├─ mergeStrategy.ts           résolution champ par champ
│   └─ matching.test.ts
├─ migration/
│   ├─ migrateLegacyBdd.ts        sheets[] → sources[] + products[]
│   └─ migration.test.ts
└─ index.ts

src/components/pim/
├─ ProjectsColumn.tsx             col 1 (refonte du sidebar BDD existant)
├─ SourcesColumn.tsx              col 2 NEUVE
│   ├─ SourceItem.tsx
│   ├─ SourceGroup.tsx
│   ├─ AddSourceMenu.tsx          le "+ Source ▾"
│   └─ SourceContextMenu.tsx
├─ MatchPreviewModal.tsx          la préview de fusion (mode-agnostique)
└─ ProductMasterCell.tsx          rendu cellule multi-source
```

### Modifications dans l'existant

- `DataPage.tsx` : remplace l'organisation actuelle (sidebar BDD + onglets sheets) par les 3 colonnes. Allège ~200 lignes.
- `ScrapingModal.tsx` : la sortie pousse vers `matchRows()` au lieu de `setSheets()`. Plus de `appendSheetRows` / `mergeSheet` côté modal.
- `ExcelImportModal.tsx` : projet courant pré-sélectionné, sortie via matching.
- `excel.store.ts` → `pim.store.ts`, types refactorés.
- `useExcelFirebase.ts` → `usePimFirebase.ts`, schéma Firestore mis à jour.

### Schéma Firestore

```
projects/{projectId}
├─ name, path, createdAt, updatedAt
├─ taxonomyLevels: string[]
└─ sources: Source[]

projects/{projectId}/products/{productId}
├─ masterSku, masterEan
├─ fields: { [k]: { value, winningSourceId, overridden } }
├─ sourceLinks: SourceLink[]
├─ taxonomy: string[]
└─ needsDedup: boolean
```

Sub-collection `products` plutôt qu'array : permet pagination Firestore et requêtes filtrées (par sourceId, taxonomy, needsDedup) sans recharger tout le projet.

### Migration des BDD existantes

One-shot, déclenchée explicitement par l'utilisateur :

```
Pour chaque doc Firebase legacy :
  1. Crée projects/{newId} avec name, path repris
  2. Pour chaque sheet :
       - Source { name: sheet.name, kind: 'scrape' (ou 'import'),
                  schema: sheet.columns }
  3. Pour chaque row de chaque sheet :
       - normalizeSku(row) → match dans projet :
            merge sur master existant ; sinon nouveau master
       - sourceLinks = [{ sourceId, snapshot: row }]
  4. Réutilise sheet.taxonomy / taxonomyLevels au niveau projet
  5. Marque le doc legacy avec migratedTo: newId (rollback possible)
```

Activation : flag `?migrate=1` en dev, puis bouton manuel « Migrer mes anciennes BDD » en prod, suppression du flag après vérif. Pas de migration silencieuse — l'utilisateur voit un récap par BDD migrée.

### Performance / scaling

- Col 2 avec 500+ sources : virtualisation (`react-window`), recherche debounced
- DataTable avec 10 000+ produits : virtualisation existante, pas de changement
- Matching d'un import de 5 000 lignes : `Map<string, productId>` indexée, O(n). Web Worker uniquement si la mesure montre > 50 ms (pas d'optim aveugle)
- Lecture projet : `products` chargés à la demande (page de 100), pas tous d'un coup

### Risques & parades

| Risque | Parade |
|---|---|
| Migration corrompt les données | Dry-run obligatoire, doc legacy conservé jusqu'à confirmation, flag `migratedTo` réversible |
| Matching SKU faux positif | Préview de fusion **toujours** affichée, dédup manuelle exposée via `needsDedup` |
| Re-scrape réécrit un champ édité manuellement | Flag `overridden: true` → re-scrape skip ces champs |
| Source supprimée laisse des `sourceLinks` orphelins | Cascade : retrait des liens ; produit sans `sourceLinks` restants → suppression définitive (confirmation modale obligatoire indiquant le nombre de produits qui disparaîtront) |
| Coût Firestore lectures products | React Query cache, listeners scoped sur source(s) sélectionnée(s) |

## Tests

### Unitaires

```
matching/
├─ normalizeSku.test.ts
│    "MIL-4933478577" / "mil 4933478577" / "4933478577 " → même clé
│    null/undefined/empty → null (pas de match)
│    EAN-13 vs SKU interne : priorité à l'EAN si les deux présents
│
├─ matchRows.test.ts
│    n rows, 0 produit existant     → preview { new: n, merged: 0, unmatched: 0 }
│    n rows, k SKU existants        → preview { new: n-k, merged: k, unmatched: 0 }
│    rows sans SKU                  → unmatched, needsDedup: true
│    SKU collision intra-batch      → 2 rows même SKU dans un import : merge sur 1 master
│
├─ mergeStrategy.test.ts
│    nouveau master, 1 source       → fields = valeurs source
│    masters fusionnés, name        → garde la source primaire (1ère ajoutée)
│    field flagged overridden       → la nouvelle source ne l'écrase pas
│    field price                    → reste dans sourceLinks[].snapshot
│
└─ migration.test.ts
     legacy doc avec 2 sheets       → 1 project + 2 sources
     2 sheets contenant même SKU    → 1 product avec 2 sourceLinks
     row sans SKU                   → product avec needsDedup: true
     taxonomyLevels conservés       → project.taxonomyLevels = sheet[0].taxonomyLevels
```

### Intégration (Vitest + RTL)

- `SourcesColumn` : rendu de 200 sources groupées, recherche filtre, multi-sélection cmd-click déclenche bon filtre table
- `MatchPreviewModal` : 3 catégories affichées, bouton `Importer` désactivé pendant calcul matching
- DataTable avec produits master : cellule prix multi-source affiche les N valeurs, fiche produit ouvre l'onglet Sources
- Re-scrape avec champ overridden : preview marque le champ comme « ignoré (verrouillé) »
- Migration : fixture legacy avec 3 sheets → vérifier `project.products[*].sourceLinks` corrects

### Manuels (golden path navigateur)

1. Projet vide → `+ Source` → scrape `nicoll.fr` produit unique → master créé
2. `+ Source` → scrape `fr.milwaukeetool.eu` catalogue → preview montre 0 mergés
3. Re-scrape Milwaukee 24h plus tard → preview montre tous mergés, 0 nouveaux
4. Édit manuel d'un nom dans la table → re-scrape → le nom édité reste
5. Migrer une BDD existante (« Decathlon » 2 produits) → vérifier products + sources
6. Supprimer une source → produits orphelins disparaissent, masters multi-sources gardent les autres liens
7. 200 sources factices générées → col 2 fluide au scroll

### Critères d'acceptation

- ☐ Aucune perte de données après migration (count produits avant = après)
- ☐ Aucune écriture qui ne passe pas par la préview de matching (sauf saisie manuelle)
- ☐ Re-scrape ne casse jamais un champ flag `overridden`
- ☐ Col 2 fluide à 500 sources (60 fps au scroll, mesure Chrome DevTools)
- ☐ Pas de régression : taxonomie, enrichissement IA, export XLSX, filtres IA/non-IA, ProductSheet
- ☐ Toutes les BDD legacy migrables sans intervention manuelle (sauf `needsDedup` annoncée)
- ☐ Type-check + tests verts ; build prod < taille bundle actuelle + 50 KB

## Hors scope (YAGNI)

- Fuzzy matching SKU (Levenshtein, similarité titre) — `normalizeSku` exact + `needsDedup` manuel suffisent
- Versioning historique des produits master
- Règles de merge configurables par l'utilisateur (toujours « source primaire gagne sauf override »)
- API publique exposant le PIM
- Permissions multi-utilisateur fines
- Webhooks « produit ajouté/modifié »
