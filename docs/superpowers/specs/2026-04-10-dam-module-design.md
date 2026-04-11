# Module DAM (Digital Asset Management) — Design Spec

## Objectif

Ajouter un module de gestion d'assets images de type DAM professionnel, intégré à la fois dans le Dashboard (page complète) et dans l'éditeur canvas (panneau latéral). Le module agrège des banques d'images gratuites (Pexels, Unsplash) via un moteur de recherche performant avec autocomplétion, catégories, recherche par image similaire, et gestion de collections/favoris partagés.

## Sources d'images

| Source | API | Authentification | Limites |
|--------|-----|-----------------|---------|
| Pexels | `api.pexels.com/v1` | Clé API (header `Authorization`) | 200 req/h (gratuit) |
| Unsplash | `api.unsplash.com` | Clé API (header `Authorization`) | 50 req/h (gratuit) |

Pixabay réservé pour une version future. Freepik exclu.

## Architecture

### Frontend

```
src/features/dam/
  ├── components/
  │   ├── DamPage.tsx              — Page complète DAM (section Dashboard)
  │   ├── DamSidebar.tsx           — Sidebar filtres (source, orientation, couleur, catégories)
  │   ├── DamSearchBar.tsx         — Barre de recherche avec autocomplétion
  │   ├── DamImageGrid.tsx         — Grille masonry des résultats
  │   ├── DamImageCard.tsx         — Card image (hover: favori, ajouter, télécharger)
  │   ├── DamLightbox.tsx          — Prévisualisation plein écran
  │   ├── DamCollections.tsx       — Gestion des collections
  │   ├── DamFavorites.tsx         — Liste des favoris
  │   ├── DamRecentImages.tsx      — Historique images récentes
  │   ├── DamSearchByImage.tsx     — Upload image pour recherche par similarité
  │   └── DamStockTab.tsx          — Version compacte pour panneau éditeur (300px)
  ├── hooks/
  │   ├── useDamSearch.ts          — Recherche texte + filtres via Cloud Function
  │   ├── useDamSearchByImage.ts   — Recherche par image similaire
  │   ├── useDamAutocomplete.ts    — Suggestions de recherche
  │   ├── useDamFavorites.ts       — CRUD favoris Firestore
  │   ├── useDamCollections.ts     — CRUD collections Firestore
  │   └── useDamRecent.ts          — Historique recherches récentes (localStorage + Firestore)
  └── types.ts                     — Types DamImage, DamCollection, DamFilter, etc.

src/stores/dam.store.ts            — État global : query, filtres, résultats, pagination, favoris
```

### Backend (Firebase Cloud Functions)

```
functions/src/dam/
  ├── searchImages.ts              — Proxy : reçoit query+filtres, appelle Pexels+Unsplash, fusionne+trie
  ├── searchSimilar.ts             — Recherche par image similaire (Pexels reverse search)
  └── autocomplete.ts              — Suggestions basées sur recherches populaires + API suggestions
```

Les clés API Pexels et Unsplash sont stockées dans Firebase Functions config (`functions:config:set`), jamais exposées côté client.

### Firestore — Schéma

```
dam_assets/{assetId}
  ├── sourceProvider: "pexels" | "unsplash"
  ├── sourceId: string              — ID chez le provider
  ├── sourceUrl: string             — URL originale chez le provider
  ├── thumbnailUrl: string          — URL thumbnail provider
  ├── previewUrl: string            — URL preview moyenne résolution
  ├── fullUrl: string               — URL haute résolution
  ├── storagePath: string | null    — Chemin Firebase Storage si sauvegardé localement
  ├── width: number
  ├── height: number
  ├── photographer: string
  ├── photographerUrl: string
  ├── description: string
  ├── tags: string[]
  ├── color: string                 — Couleur dominante hex
  ├── orientation: "landscape" | "portrait" | "square"
  ├── addedBy: string               — UID utilisateur qui l'a ajouté
  ├── addedAt: Timestamp
  └── usageCount: number            — Nombre de fois utilisé dans des projets

dam_collections/{collectionId}
  ├── name: string
  ├── description: string
  ├── coverAssetId: string | null
  ├── ownerId: string               — UID créateur
  ├── sharedWith: string[]           — UIDs avec accès
  ├── visibility: "private" | "shared"
  ├── assetIds: string[]             — Références vers dam_assets
  ├── createdAt: Timestamp
  └── updatedAt: Timestamp

dam_favorites/{docId: `${uid}_${assetId}`}
  ├── userId: string
  ├── assetId: string
  └── createdAt: Timestamp
```

### Firebase Storage

```
dam/{assetId}/original.{ext}       — Image haute résolution (quand sauvegardée localement)
dam/{assetId}/thumb.jpg             — Thumbnail 300px
```

## Intégration UI

### 1. Dashboard — Section "Images"

Nouvelle entrée dans la sidebar du Dashboard (`DashboardPage.tsx`), entre "library" et "data" :

- **Section ID** : `images`
- **Icône** : `ImageIcon` (Lucide)
- **Label** : "Images"
- **Couleur accent** : `#6366f1` (indigo, cohérent avec le thème)

Le contenu affiche `DamPage` avec :

- **Sidebar gauche (200px)** : barre de recherche, bouton "Chercher par image", filtres (source, orientation, couleur dominante, catégories prédéfinies)
- **Zone principale** : onglets (Stock / Mes images / Favoris / Collections / Récents), compteur résultats, tri, suggestions de recherche, grille masonry 4 colonnes
- **Actions au survol d'une image** : favori, ajouter à collection, télécharger, prévisualiser (lightbox)
- **Lightbox** : image plein écran, infos photographe, attribution, boutons d'action (ajouter au projet, favori, collection, télécharger)

### 2. Éditeur — Onglet Stock dans NanoBanaPanel

Nouvel onglet "Stock" ajouté à `NanoBanaPanel.tsx` (4e onglet après Gallery/Upload/Generate) :

- Version compacte de la recherche DAM (300px de large)
- Recherche texte + filtres rapides (chips : source, recherche par image)
- Grille 3 colonnes compacte
- Drag-drop vers le canvas pour insérer l'image
- Clic pour ajouter à la position centrée sur le viewport

### 3. ToolBar — Bouton Image avec dropdown

Nouveau bouton "Image" ajouté dans `ToolBar.tsx` après le séparateur des outils de création :

- **Icône** : `ImageIcon` (Lucide)
- **Raccourci** : `I`
- **Comportement au clic** : affiche un dropdown avec 4 options :
  - "Stock images" — ouvre panneau NanoBana sur l'onglet Stock
  - "Mes images" — ouvre panneau NanoBana sur l'onglet Gallery
  - "Uploader" — ouvre panneau NanoBana sur l'onglet Upload
  - "Générer (IA)" — ouvre panneau NanoBana sur l'onglet Generate

## Moteur de recherche

### Recherche texte

1. L'utilisateur tape un mot-clé dans la barre de recherche
2. Après 300ms de debounce, appel à la Cloud Function `searchImages`
3. La function appelle Pexels et Unsplash en parallèle
4. Les résultats sont fusionnés, dédupliqués (par URL source), triés par pertinence
5. Pagination par curseur (scroll infini)

### Autocomplétion

- Suggestions affichées après 2 caractères tapés
- Sources : recherches récentes de l'utilisateur (localStorage) + termes populaires (cache Firestore `dam_popular_searches`)
- Catégories prédéfinies : Business, Nature, Technologie, Food, Sport, Voyage, Personnes, Art

### Recherche par image similaire

1. L'utilisateur uploade une image (ou sélectionne une image du projet)
2. L'image est envoyée à la Cloud Function `searchSimilar`
3. La function utilise l'API Pexels de recherche par similarité visuelle
4. Résultats affichés dans la grille avec badge "Similaire à..."

### Filtres

| Filtre | Valeurs | API Pexels | API Unsplash |
|--------|---------|------------|--------------|
| Source | Toutes, Pexels, Unsplash | — | — |
| Orientation | Tout, Paysage, Portrait, Carré | `orientation` | `orientation` |
| Couleur | 10 couleurs prédéfinies | `color` | `color` |
| Catégorie | 8 catégories | mapping mots-clés | mapping mots-clés |
| Tri | Pertinence, Récent, Populaire | `per_page`, `page` | `order_by` |

## Actions sur les images

| Action | Description | Stockage |
|--------|-------------|----------|
| Ajouter au projet | Insère l'image sur le canvas Fabric.js | Téléchargement → Firebase Storage + dam_assets |
| Favoris | Toggle favori cross-projets | dam_favorites Firestore |
| Collection | Ajouter à une collection existante ou nouvelle | dam_collections Firestore |
| Téléchargement | Télécharge l'image localement (navigateur) | Aucun |
| Prévisualisation | Lightbox plein écran avec métadonnées | Aucun |
| Drag-drop | Glisser depuis la grille vers le canvas | Téléchargement → Firebase Storage |

### Attribution

Pexels et Unsplash exigent une attribution du photographe. Chaque image affichée inclut le nom du photographe. En lightbox, le lien vers le profil est affiché. Les métadonnées d'attribution sont sauvegardées dans `dam_assets`.

## Store Zustand — dam.store.ts

```typescript
interface DamState {
  // Recherche
  query: string
  filters: DamFilters
  results: DamImage[]
  loading: boolean
  hasMore: boolean
  page: number

  // Autocomplétion
  suggestions: string[]
  recentSearches: string[]

  // UI
  activeTab: 'stock' | 'my-images' | 'favorites' | 'collections' | 'recent'
  lightboxImage: DamImage | null
  selectedCollection: string | null

  // Actions
  setQuery: (q: string) => void
  setFilters: (f: Partial<DamFilters>) => void
  search: () => Promise<void>
  loadMore: () => Promise<void>
  setActiveTab: (tab: DamState['activeTab']) => void
  openLightbox: (image: DamImage) => void
  closeLightbox: () => void
}

interface DamFilters {
  source: 'all' | 'pexels' | 'unsplash'
  orientation: 'all' | 'landscape' | 'portrait' | 'square'
  color: string | null
  category: string | null
  sortBy: 'relevant' | 'latest' | 'popular'
}

interface DamImage {
  id: string
  sourceProvider: 'pexels' | 'unsplash'
  sourceId: string
  thumbnailUrl: string
  previewUrl: string
  fullUrl: string
  width: number
  height: number
  photographer: string
  photographerUrl: string
  description: string
  color: string
  isFavorite?: boolean
}
```

## Flux de données

```
Utilisateur tape "mountain" →
  DamSearchBar (debounce 300ms) →
    dam.store.setQuery("mountain") →
      useDamSearch → fetch Cloud Function searchImages({query, filters}) →
        Cloud Function appelle Pexels + Unsplash en parallèle →
          Fusion + déduplication + tri →
            Réponse JSON → dam.store.results →
              DamImageGrid (re-render masonry)
```

```
Utilisateur drag une image vers le canvas →
  DamImageCard (onDragStart, transfert URL) →
    CanvasContainer (onDrop) →
      Télécharge image haute résolution →
        Upload vers Firebase Storage (dam/{assetId}) →
          Crée/met à jour dam_assets Firestore →
            fabric.Image.fromURL() → canvas.add(img) →
              syncToStore()
```

## Considérations techniques

- **Rate limiting** : les APIs gratuites ont des limites (Pexels 200/h, Unsplash 50/h). La Cloud Function implémente un cache en mémoire (5 min TTL) pour les requêtes identiques, et un fallback sur la seconde source si une API atteint sa limite.
- **Pagination** : scroll infini avec Intersection Observer. Chargement par lots de 30 images.
- **Performance grille masonry** : utiliser CSS `columns` ou une lib légère. Lazy loading des images avec `loading="lazy"` et thumbnails basse résolution.
- **Drag-drop** : `onDragStart` natif HTML5 avec `dataTransfer` contenant l'URL preview. Le `CanvasContainer` écoute `onDrop`.
- **CORS** : les URLs Pexels/Unsplash permettent le hotlinking. Pour l'insertion canvas Fabric.js, télécharger via Cloud Function si CORS bloque.
- **Offline** : les favoris et collections sont disponibles hors-ligne via le cache Firestore. Les résultats de recherche nécessitent une connexion.
