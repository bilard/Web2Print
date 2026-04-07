# Module "Briefs clients IA" — Design

**Date :** 2026-04-07
**Statut :** Validé, prêt pour implémentation
**Domaine :** `features/briefs/`

## 1. Objectif

Permettre à un commercial d'utiliser une taxonomie produit comme base d'un dossier client guidé par l'IA, et de produire en sortie :

1. Un **panier de produits** recommandés à partir d'un brief client (formulaire dynamique alimenté par Gemini, sourcing depuis le catalogue Adobe Commerce / Magento — mocké pour le MVP).
2. Un **document PowerPoint commercial** (`.pptx`) structuré par IA et rendu avec PptxGenJS, incluant le branding du client (logo + couleurs).
3. Des **simulations visuelles** (hero + in-situ par produit) générées par Gemini 3 Pro Image (« Nano Banana 2 »).

L'utilisateur cible du MVP est l'admin commercial. Le client final n'a pas d'écran dédié — c'est l'admin qui remplit le formulaire avec/pour lui.

## 2. Vue d'ensemble & flux

Un **Brief** est un document Firestore persistant représentant un dossier client. Il traverse 5 étapes éditables et réversibles :

1. **Formulaire client** — socle fixe configurable (société, identité visuelle, livraison, contexte)
2. **Questions dynamiques IA** — Gemini analyse le socle, sélectionne les branches pertinentes de la taxonomie, agrège les questions attachées à ces nœuds
3. **Panier produits** — Gemini + catalogue → liste éditable avec quantités, justifications, prix, remise
4. **Structure deck + images** — Gemini génère un plan de slides (JSON typé) + prompts images
5. **Assemblage PPT** — PptxGenJS produit le `.pptx` final, branding appliqué

Persistance continue (React Query + Firestore). Toute étape est rééditable et relançable indépendamment.

### Intégration UI

- **Module principal :** dans `TaxonomiesPage`, nouvelle barre d'onglets `[ Arbre ] [ Briefs clients ]` dans la zone principale (à droite de l'arbre). Sélecteur "⚙ Configurer le formulaire" pour ouvrir le builder.
- **Widget Dashboard :** carte "Briefs récents" listant les 5 derniers briefs tous taxonomies confondues. Clic → deep-link `/taxonomies?taxonomyId=X&briefId=Y&step=N`.
- **Routes :** `TaxonomiesPage` accepte `briefId` et `step` en query params.

## 3. Modèle de données

### 3.1 Extension du nœud taxonomie

Les questions dynamiques sont stockées **dans le nœud existant** (pas de collection séparée).

```ts
interface TaxonomyNode {
  // ... champs existants
  magentoCategoryId?: string
  magentoSkus?: string[]
  questions?: DynamicQuestion[]
  questionsGeneratedAt?: Timestamp
}

interface DynamicQuestion {
  id: string                  // uuid stable
  label: string
  type: 'text' | 'number' | 'select' | 'multiselect' | 'boolean'
  options?: string[]
  required: boolean
  helpText?: string
}
```

Les questions sont générées par Gemini (premier jet), validées/éditées par l'admin, puis sauvegardées.

### 3.2 Template de formulaire client (par taxonomie)

Embarqué dans le doc taxonomie sous `formTemplate: ClientFormField[]`. Une seule lecture pour charger la taxonomie + son template. 1:1 avec la taxonomie.

```ts
interface ClientFormField {
  id: string                  // uuid stable
  key: string                 // 'companyName', 'siret', 'shippingAddress'...
  label: string
  type: 'text' | 'textarea' | 'number' | 'email' | 'select'
        | 'color' | 'logo_upload' | 'budget_range' | 'address'
  required: boolean
  placeholder?: string
  helpText?: string
  options?: string[]          // pour select
  group?: string              // 'Société' | 'Identité visuelle' | 'Livraison' | 'Contexte' | custom
  order: number
  builtin: boolean            // non supprimable, label/required/help éditables
}
```

#### Champs builtins par défaut (initialisés à la création de la taxonomie)

| Group | key | type | required |
|---|---|---|---|
| Société | `companyName` | text | ✓ |
| Société | `siret` | text | – |
| Société | `sector` | text | – |
| Société | `contactName` | text | – |
| Société | `contactEmail` | email | – |
| Identité visuelle | `logoUrl` | logo_upload | – |
| Identité visuelle | `primaryColor` | color | – |
| Identité visuelle | `secondaryColor` | color | – |
| Livraison | `shippingAddress` | address | – |
| Contexte | `contextSummary` | textarea | ✓ |
| Contexte | `budget` | budget_range | – |

L'admin peut ajouter des champs custom (`builtin: false`, supprimables).

### 3.3 Brief

Collection Firestore `briefs/{briefId}`.

```ts
interface Brief {
  id: string
  taxonomyId: string
  ownerId: string
  clientName: string                   // dérivé de client.values.companyName, dénormalisé pour la liste
  status: 'draft' | 'form_filled' | 'cart_ready' | 'deck_ready' | 'completed'
  currentStep: 1 | 2 | 3 | 4 | 5

  // Étape 1 — formulaire client
  client: {
    formTemplateSnapshot: ClientFormField[]   // figé au moment du brief
    values: Record<string, unknown>           // key → valeur
  }

  // Étape 2 — questions dynamiques sélectionnées par l'IA
  dynamicForm?: {
    selectedNodeIds: string[]
    questions: DynamicQuestion[]              // snapshot figé
    answers: Record<string, unknown>          // questionId → réponse
    aiReasoning?: string
  }

  // Étape 3 — panier
  cart?: {
    items: CartItem[]
    subtotal?: number                         // somme items (calculé)
    discount?: { type: 'percent' | 'amount'; value: number }
    totalEstimate?: number                    // après remise
    aiReasoning?: string
  }

  // Étape 4 — deck
  deck?: {
    slides: SlideSpec[]
  }

  // Étape 5
  pptxUrl?: string                            // Firebase Storage

  // Versioning IA pour reproductibilité
  aiVersions?: {
    questions?: string
    branchSelection?: string
    cart?: string
    deck?: string
  }

  createdAt: Timestamp
  updatedAt: Timestamp
}

interface CartItem {
  sku: string
  name: string
  categoryNodeId: string                       // traçabilité taxonomie
  quantity: number
  unitPrice?: number                           // prix catalogue
  unitPriceOverride?: number                   // édité par l'utilisateur
  imageUrl?: string
  description?: string
  aiJustification?: string
  source: 'ai' | 'manual'
}
```

### 3.4 Sous-collection `briefs/{briefId}/images/{imageId}`

```ts
interface BriefImage {
  id: string                  // clé naturelle : 'hero' ou `product_${sku}`
  type: 'hero' | 'product'
  productSku?: string
  prompt: string
  url: string                 // Firebase Storage
  thumbnailUrl?: string
  updatedAt: Timestamp
}
```

**Régénération = écrasement** (pas d'historique de variants). 1 slot par rôle.

### 3.5 Catalogue produit

Interface `ProductCatalogProvider`. Deux implémentations :

- **`MockCatalogProvider`** (MVP) : JSON statique en seed dans `features/briefs/catalog/mock-catalog.json`
- **`MagentoCatalogProvider`** (futur) : Cloud Function proxy → API REST `/rest/V1/products` ou GraphQL `/graphql`. Auth via integration token côté serveur uniquement.

```ts
interface CatalogProduct {
  sku: string
  name: string
  description: string
  price: number
  imageUrl: string
  magentoCategoryIds?: string[]
  attributes?: Record<string, unknown>
}

interface ProductCatalogProvider {
  search(filter: { categoryNodeIds?: string[]; magentoCategoryIds?: string[]; query?: string; limit?: number }): Promise<CatalogProduct[]>
  getBySku(sku: string): Promise<CatalogProduct | null>
}
```

Choix runtime via `catalog.factory.ts` selon variable d'environnement.

### 3.6 Storage layout

```
briefs/{briefId}/logo.png            # logo client uploadé
briefs/{briefId}/images/hero.webp
briefs/{briefId}/images/product_{sku}.webp
briefs/{briefId}/deck.pptx
```

### 3.7 Sécurité Firestore

```
match /briefs/{briefId} {
  allow read, write: if request.auth.uid == resource.data.ownerId;
  allow create: if request.auth.uid == request.resource.data.ownerId;

  match /images/{imageId} {
    allow read, write: if request.auth.uid == get(/databases/$(database)/documents/briefs/$(briefId)).data.ownerId;
  }
}
```

Index Firestore : `briefs` sur `(ownerId, taxonomyId, updatedAt desc)` et `(ownerId, updatedAt desc)` pour le widget Dashboard.

## 4. Architecture technique

### 4.1 Arborescence

```
src/
├── features/
│   └── briefs/
│       ├── types.ts
│       ├── useBriefs.ts                    # liste/CRUD (filtre { taxonomyId?, limit? })
│       ├── useBrief.ts                     # un brief par id
│       ├── useBriefMutations.ts            # create/update/delete/advanceStep
│       ├── useFormTemplate.ts              # CRUD template formulaire
│       ├── useBriefImages.ts               # sous-collection images
│       │
│       ├── ai/
│       │   ├── geminiClient.ts             # wrapper Cloud Function HTTPS callable
│       │   ├── generateDynamicQuestions.ts
│       │   ├── selectBranches.ts
│       │   ├── generateCart.ts
│       │   ├── generateDeckStructure.ts
│       │   ├── generateImagePrompts.ts
│       │   └── prompts/
│       │       ├── questions.prompt.ts     # contient VERSION = '1.0.0'
│       │       ├── branchSelection.prompt.ts
│       │       ├── cart.prompt.ts
│       │       └── deck.prompt.ts
│       │
│       ├── catalog/
│       │   ├── ProductCatalogProvider.ts   # interface
│       │   ├── MockCatalogProvider.ts
│       │   ├── MagentoCatalogProvider.ts   # stub
│       │   ├── catalog.factory.ts
│       │   └── mock-catalog.json
│       │
│       └── pptx/
│           ├── deckBuilder.ts              # SlideSpec[] → PptxGenJS
│           ├── slideRenderers/
│           │   ├── CoverSlide.ts
│           │   ├── ContextSlide.ts
│           │   ├── ProductGridSlide.ts
│           │   ├── ProductFocusSlide.ts
│           │   ├── BudgetSlide.ts
│           │   └── CTASlide.ts
│           └── branding.ts
│
├── stores/
│   └── brief.store.ts                      # état UI : currentStep, panneaux ouverts
│
├── components/
│   ├── briefs/
│   │   ├── BriefsPanel.tsx
│   │   ├── BriefsList.tsx
│   │   ├── BriefCard.tsx
│   │   ├── BriefStepper.tsx
│   │   ├── BriefEditor.tsx
│   │   │
│   │   ├── steps/
│   │   │   ├── Step1ClientForm.tsx
│   │   │   ├── Step2DynamicForm.tsx
│   │   │   ├── Step3Cart.tsx
│   │   │   ├── Step4DeckImages.tsx
│   │   │   └── Step5Export.tsx
│   │   │
│   │   ├── form-builder/
│   │   │   ├── FormBuilderModal.tsx
│   │   │   ├── FieldList.tsx               # @dnd-kit sortable
│   │   │   ├── FieldEditor.tsx
│   │   │   ├── FieldPreview.tsx
│   │   │   └── fieldTypes.ts
│   │   │
│   │   ├── form-renderer/
│   │   │   ├── DynamicFormRenderer.tsx
│   │   │   └── fields/
│   │   │       ├── TextField.tsx
│   │   │       ├── TextareaField.tsx
│   │   │       ├── NumberField.tsx
│   │   │       ├── EmailField.tsx
│   │   │       ├── SelectField.tsx
│   │   │       ├── ColorField.tsx
│   │   │       ├── LogoUploadField.tsx
│   │   │       ├── BudgetRangeField.tsx
│   │   │       └── AddressField.tsx
│   │   │
│   │   ├── cart/
│   │   │   ├── CartItemRow.tsx
│   │   │   ├── CartAddProductDialog.tsx
│   │   │   ├── CartDiscountPopover.tsx
│   │   │   └── exportCartCsv.ts
│   │   │
│   │   └── deck/
│   │       ├── SlideThumbnailGrid.tsx
│   │       ├── SlideEditor.tsx
│   │       └── ImageGalleryPanel.tsx
│   │
│   ├── taxonomy/
│   │   └── TaxonomyMainTabs.tsx            # onglets Arbre / Briefs clients
│   │
│   └── dashboard/
│       └── RecentBriefsWidget.tsx
│
└── lib/
    └── functions/                          # Firebase Functions (déploiement séparé)
        ├── geminiText.ts
        ├── geminiImage.ts
        ├── magentoProxy.ts                 # stub MVP
        └── pptxAssembler.ts                # OPTIONNEL si problème mémoire front
```

### 4.2 Frontières et responsabilités

- **`features/briefs/ai/*`** : seul endroit qui parle à Gemini. Aucun composant React n'y accède directement.
- **`features/briefs/catalog/*`** : seul endroit qui connaît le catalogue. L'IA n'invente jamais de produit — elle reçoit la liste et choisit dedans.
- **`features/briefs/pptx/*`** : seul endroit qui parle à PptxGenJS. Reçoit `(SlideSpec[], branding, images)` → blob.
- **`stores/brief.store.ts`** : uniquement état UI éphémère. Tout état persistant passe par React Query + Firestore.
- **Cloud Functions** : appels Gemini (clé API serveur) + Magento (token serveur) + génération images. Le front voit uniquement des endpoints HTTPS callable Firebase.

### 4.3 Async des étapes IA

Appels HTTPS callable synchrones avec loader/skeleton. Étapes 2/3/4 prennent typiquement 5–60s. Évolution possible vers Cloud Tasks si dépassement de la limite Firebase Functions de 60s, mais pas dans le MVP.

### 4.4 Convention prompts versionnés

Chaque fichier `*.prompt.ts` exporte `VERSION = '1.0.0'`. Lors d'une génération, la version est stockée dans `brief.aiVersions.{key}`. Permet de reproduire/déboguer un brief ancien.

## 5. Contrats IA

Tous les appels Gemini text utilisent `responseMimeType: 'application/json'` + `responseSchema`. Validation Zod côté client en réception. Sur échec : 1 retry avec message d'erreur injecté, puis erreur user-friendly.

### 5.1 Appel A — Génération des questions d'un nœud

**Entrée :** `{ taxonomyName, nodePath, childrenLabels, existingQuestions? }`

**Schéma de sortie :**

```ts
const QuestionsResponse = z.object({
  questions: z.array(z.object({
    label: z.string(),
    type: z.enum(['text','number','select','multiselect','boolean']),
    options: z.array(z.string()).optional(),
    required: z.boolean(),
    helpText: z.string().optional(),
    rationale: z.string()
  })).max(8)
})
```

**Garde-fou :** max 8 questions par nœud.

### 5.2 Appel B — Sélection des branches taxonomie

**Entrée :** `{ clientForm: { values }, taxonomyTree: Array<{ nodeId, path, hasQuestions }> }` (arbre aplati, uniquement nœuds avec questions).

**Schéma de sortie :**

```ts
const BranchSelectionResponse = z.object({
  selectedNodeIds: z.array(z.string()).min(1).max(10),
  reasoning: z.string()
})
```

Les questions correspondantes sont ensuite chargées et agrégées (dédupe par label normalisé) dans le formulaire dynamique de l'étape 2.

### 5.3 Appel C — Génération du panier

**Entrée :** `{ brief: { client, dynamicAnswers }, catalog: CatalogProduct[], budgetHint? }`. Le `catalog` est pré-filtré côté serveur selon les `selectedNodeIds`.

**Schéma de sortie :**

```ts
const CartResponse = z.object({
  items: z.array(z.object({
    sku: z.string(),
    quantity: z.number().int().positive(),
    aiJustification: z.string()
  })).min(1).max(30),
  totalEstimate: z.number(),
  reasoning: z.string()
})
```

**Garde-fou critique :** après réception, filtrer les items dont le `sku` n'existe pas dans le catalog envoyé. Si > 30 % des SKU sont invalides → retry avec rappel « use only the provided SKUs ». L'IA ne peut jamais inventer un produit.

### 5.4 Appel D — Génération de la structure du deck

**Entrée :** `{ brief, cart, branding: { primaryColor, secondaryColor, hasLogo } }`

**Schéma de sortie (union discriminée) :**

```ts
const SlideSpec = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cover'),
    title: z.string(),
    subtitle: z.string(),
    heroPrompt: z.string()
  }),
  z.object({
    type: z.literal('context'),
    title: z.string(),
    bullets: z.array(z.string()).max(6)
  }),
  z.object({
    type: z.literal('product_grid'),
    title: z.string(),
    productSkus: z.array(z.string()).min(1).max(6),
    layout: z.enum(['2x2','3x2','1x3'])
  }),
  z.object({
    type: z.literal('product_focus'),
    title: z.string(),
    productSku: z.string(),
    keyPoints: z.array(z.string()).max(4),
    imagePrompt: z.string()
  }),
  z.object({
    type: z.literal('budget'),
    title: z.string(),
    showTotal: z.boolean(),
    showItemized: z.boolean()
  }),
  z.object({
    type: z.literal('cta'),
    title: z.string(),
    message: z.string(),
    contactEmail: z.string().optional()
  })
])

const DeckResponse = z.object({
  slides: z.array(SlideSpec).min(3).max(15),
  reasoning: z.string()
})
```

**Garde-fous :**
- Tous les `productSku` / `productSkus` doivent exister dans le panier → validation post-réception, sinon retry
- Type de slide inconnu → rejet et retry
- Min 3 slides (cover + 1 contenu + cta), max 15

### 5.5 Appel E — Génération des images (Gemini 3 Pro Image / Nano Banana 2)

Modèle : `gemini-3-pro-image-preview`. Appel server-side via Cloud Function. Multi-images en input :

- Image 1 : logo client (depuis Storage)
- Image 2 (optionnel) : image produit du catalogue
- Prompt texte composé selon le template ci-dessous

**Template de prompt :**

```
[Style baseline]: clean commercial product visualization, soft studio lighting,
high detail, suitable for a B2B sales presentation.

[Brand context]: client logo (provided as input image), brand colors {primary},
{secondary}. Apply logo subtly on product where appropriate.

[Subject]: {slide.imagePrompt OR slide.heroPrompt}

[Product reference]: {productName from catalog}, {productDescription}

[Constraints]: 16:9 aspect ratio, no text overlay, no watermarks, no people unless requested.
```

**Output :** image binaire → upload Storage (`briefs/{id}/images/{role}.webp`) → upsert doc Firestore → url retournée.

**Cache & coûts :** 1 image générée = 1 doc persistant, **régénération = écrasement** (pas d'historique). L'utilisateur peut éditer le prompt avant régénération.

## 6. Spécifications UI

Dark mode `#0f0f0f` / `#1a1a1a` / accent `#6366f1`. Composants ≤ 150 lignes.

### 6.1 Onglets dans `TaxonomiesPage`

Sous le header existant, quand une taxonomie est sélectionnée :

```
[ Arbre ]  [ Briefs clients ]                   ⚙ Configurer le formulaire
```

- "Arbre" → comportement actuel, 100 % préservé
- "Briefs clients" → `BriefsPanel`
- "⚙" → ouvre `FormBuilderModal`

### 6.2 Liste des briefs (`BriefsPanel` + `BriefsList`)

Header avec recherche client + filtre statut + bouton `[+ Nouveau brief]`. Grille responsive (auto-fill 320 px) de `BriefCard` affichant : nom client, badge statut, étape courante, métriques (nb produits, total), date de mise à jour.

### 6.3 Édition d'un brief (`BriefEditor`)

Layout 2 colonnes :

- **Gauche (220 px) :** `BriefStepper` vertical, 5 étapes, statut visuel (✓ / ● / ○), cliquable si les précédentes sont complètes
- **Droite :** contenu de l'étape courante avec footer fixe `[← Précédent] [Sauvegarder] [Suivant →]`

Le store `brief.store.ts` garde `currentBriefId` et `currentStep`.

### 6.4 Étape 3 — Panier (cœur commercial)

```
┌─ Panier proposé par l'IA ──────────────────────────────────┐
│ ℹ "{aiReasoning}" [voir +]                                 │
├────────────────────────────────────────────────────────────┤
│ 🏷 {category}                                              │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ [img] {name}                  {qty} × [prix éditable]│   │
│ │       💡 {aiJustification}                           │   │
│ │       [− qty +]                            [🗑 retirer]│ │
│ └──────────────────────────────────────────────────────┘   │
│ ...                                                         │
│ [+ Ajouter un produit manuellement]                        │
├────────────────────────────────────────────────────────────┤
│ Sous-total                              5 200 €            │
│ Remise [- 7%  ▾]                       -364 €              │
│ ─────────────────────────────────────────────              │
│ Total estimé                            4 836 €            │
│                                                             │
│ [↻ Régénérer le panier]  [⤓ Export CSV]                   │
└────────────────────────────────────────────────────────────┘
```

Détails :

- Items groupés par `categoryNodeId`
- Édition inline : qty +/-, suppression
- **Prix unitaire éditable** : si `unitPriceOverride` ≠ `unitPrice`, badge "modifié" + bouton ↺ pour reset
- "Ajouter manuellement" → `CartAddProductDialog` avec recherche dans le `CatalogProvider`, item ajouté avec `source: 'manual'`
- **Régénérer** : relance Appel C, **conserve** les items `source: 'manual'` (merge)
- **Remise** : popover `% / €` + champ numérique
- **Export CSV** : `nom, sku, catégorie, quantité, prix unitaire, prix total, justification IA`. Nom de fichier `${clientName}_${date}.csv`. Généré côté client.
- La slide `budget` du PPT reflète prix overrides + remise

### 6.5 Étape 4 — Deck + galerie

Layout 2 colonnes :

- **Gauche :** `SlideThumbnailGrid` — vignettes des slides en grille, `@dnd-kit` pour réordonner, ✏ pour éditer titre/bullets, ➕ pour insérer une slide (choix du type), 🗑 pour supprimer
- **Droite :** `ImageGalleryPanel` — toutes les images du brief, boutons `[↻ Régénérer]` `[✏ Éditer prompt]` `[⤓ Télécharger]`

Footer : `[Générer le deck final →]`.

### 6.6 Builder du formulaire (`FormBuilderModal`)

Modale plein écran, 3 colonnes :

- **Champs (gauche) :** liste sortable groupée par section, drag handle `⋮`, `[+ Ajouter]` en bas
- **Édition (centre) :** label, type, required, helpText, options (si select). Suppression désactivée pour les builtins.
- **Aperçu (droite) :** rendu live via `DynamicFormRenderer` (le même composant que l'étape 1, garantit WYSIWYG)

Footer : `[Annuler] [Enregistrer]`. Sauvegarde = mutation React Query sur le doc taxonomie, optimistic update.

### 6.7 Widget Dashboard (`RecentBriefsWidget`)

Carte dans `DashboardPage` listant les 5 derniers briefs de l'utilisateur tous taxonomies confondues. Chaque ligne : nom client, étape, taxonomie, date. Clic → deep-link `/taxonomies?taxonomyId=X&briefId=Y&step=N`.

## 7. Tests

Stratégie pragmatique. TypeScript strict élimine déjà beaucoup de bugs.

### Tests unitaires (Vitest)

Focus sur la logique pure :

- `features/briefs/ai/*` — validation Zod des réponses (mocker Gemini, tester parsing + retry + filtrage SKU invalides)
- `features/briefs/catalog/MockCatalogProvider` — recherche par catégorie, filtres
- `features/briefs/pptx/deckBuilder` — pour chaque type de slide, vérifier production d'objet PptxGenJS valide
- `features/briefs/pptx/branding` — application logo/couleurs
- Logique de calcul du panier : sous-total, remise %, remise montant, prix override

### Pas de tests pour

- Composants UI (faible ROI)
- Cloud Functions (testées via Firebase emulator)
- API Magento (hors scope MVP)

### Tests manuels structurés

Checklist `docs/superpowers/specs/briefs-test-checklist.md` à exécuter avant chaque release.

## 8. Livraison incrémentale

5 lots indépendants. Chaque lot a son propre plan d'implémentation, son propre PR, son propre cycle de review.

| Lot | Contenu | Dépend de |
|---|---|---|
| **1. Modèle & infra** | types Zod/TS, schémas Firestore, hooks `useBriefs`/`useBrief`/`useFormTemplate`, `MockCatalogProvider`, sécurité Firestore. Pas d'UI. | – |
| **2. Builder formulaire** | `FormBuilderModal`, `DynamicFormRenderer`, onglets `TaxonomyMainTabs` dans `TaxonomiesPage`. Permet de configurer un template par taxonomie. Pas d'IA. | 1 |
| **3. Étapes 1-2-3 (formulaire → questions IA → panier)** | Cloud Functions Gemini text, prompts versionnés, écrans Step1/Step2/Step3, panier complet (édition prix, remise, CSV). Module commercialement utilisable sans PPT. | 2 |
| **4. Étape 4 (deck + images)** | Cloud Function Gemini image, galerie, structure de slides éditable. | 3 |
| **5. Étape 5 (PPTX)** | `deckBuilder`, slide renderers, branding, téléchargement. | 4 |

Le widget `RecentBriefsWidget` du Dashboard est livré à la fin du lot 3 (premier moment où la liste de briefs a du sens).

## 9. Risques & mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Gemini renvoie du JSON malformé | Bloquant | Schéma Zod + retry 1× avec message d'erreur injecté + erreur user-friendly |
| Gemini invente des SKU absents du catalogue | Bloquant commercial | Validation post-réception, filtrage, retry si > 30 % invalides |
| Coût Gemini Image élevé | Budget | Cache strict (1 image / rôle), pas d'historique, prompts éditables, compteur visible côté admin |
| API Magento pas encore disponible | Aucun (mock MVP) | Interface `ProductCatalogProvider`, branchement en 1 fichier le moment venu |
| PptxGenJS lourd avec 15 slides + images | Performance | Limite 15 slides max, images compressées en webp, fallback assemblage serveur en cas de besoin |
| Templates de prompts évoluent → briefs anciens incohérents | Confusion | `aiVersions` stocké sur le brief, reproduction possible |
| XSS / injection via inputs texte | Sécurité | Tout en text node React, PptxGenJS échappe automatiquement |

## 10. Hors scope explicite

- Pas de partage public d'un brief avec le client (pas de lien magique)
- Pas de signature électronique du devis
- Pas de génération multilingue (FR uniquement)
- Pas d'historique de variants d'images (régénération = écrasement)
- Pas d'override de template de formulaire au niveau du nœud (uniquement par taxonomie)
- Pas d'intégration Magento réelle (mock seulement)
- Pas de tests E2E automatisés (manuel checklisté)
- Pas d'analytics / métriques d'usage du module

## 11. Stack & dépendances

Aucune nouvelle dépendance majeure. Tout est déjà dans le projet :

- `pptxgenjs` ✓
- `@dnd-kit/sortable` ✓
- `zod` (déjà via React Query / utilisé pour validation)
- `firebase` (Firestore, Storage, Functions, Auth) ✓
- `@google/generative-ai` côté Cloud Functions — **à ajouter dans `functions/package.json`**
