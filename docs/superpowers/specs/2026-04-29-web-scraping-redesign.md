# Web Scraping — Refonte architecturale

> 2026-04-29 — Refonte du module Web Scraping. Objectif : un pipeline unique
> qui produit un schéma canonique fiable et reproductible, en remplacement
> des trois pipelines parallèles actuels qui divergent.

## 1. Problème

Aujourd'hui, **trois pipelines de scraping coexistent** et entrent en conflit :

| Module | Rôle | Taille |
|---|---|---|
| `features/scraping/useJina.ts` | Modal "Web Scraping" depuis DataPage (single + listing + crawl) | 1091 l |
| `features/excel/ai-enrichment/useProductEnrichment.ts` | Enrichissement ligne par ligne dans une feuille Excel | 4322 l |
| `features/scraping-templates/engine.ts` (+ extension Chrome) | Templates par fournisseur (CSS/XPath déterministe) | 651 l |

Symptômes observés par l'utilisateur : *« rien ne fonctionne, les données sont aléatoires, pas structurées »*. Causes structurelles :

1. **Trois prompts système** différents → comportement divergent selon l'entry point.
2. **Trois normalisations** différentes (`normalizeToRows`, `enrichWithMarkdownGroups`, `applyTemplate`) → format de sortie incohérent.
3. **Listes de hosts hardcodées** dans le code (`BRAND_OFFICIAL_SITES`, `RESELLER_HOSTS`, regex SPA) → contraire à la règle « pas de scrapers par fournisseur ».
4. **`useProductEnrichment.ts` à 4322 lignes** : code ingérable, mode `auto` / `template` / `manual` mélangés, post-process markdown omniprésent.
5. **Mode "Produit unique" du modal *bypass*** vers la pipeline d'enrichissement → deux UI pour le même résultat.
6. **Détection d'hallucination naïve** : regex sur quelques mots ("produit principal", "lorem ipsum") qui rate l'essentiel.
7. **Specs explosées en colonnes Excel dynamiques** (`spec_groupe_nom`) → potentiellement des centaines de colonnes par feuille.

J'ai écarté un refactor cosmétique qui garderait les trois pipelines côte à côte : ça ne résout aucune des causes structurelles ci-dessus.

## 2. Architecture cible

**Un pipeline unique, quatre points d'entrée, un schéma canonique unique.**

```
fetch (Jina + Cloud Function fallback)
   ↓
bundle (multi-page : tabs + PDFs + sub-pages)
   ↓
LLM extract (prompt + vendorPrompt + globalRules)
   ↓
EnrichedProduct (canonical)
   ↓
projector (single view | sheet rows | design asset)
```

### 2.1 Points d'entrée

```typescript
scrapeProduct(url, opts?)        → EnrichedProduct          // single
scrapeListing(url, opts?)        → EnrichedProduct[]        // catalogue
enrichRow(row, opts?)            → EnrichedProduct          // batch (1 ligne)
crawlSite(rootUrl, opts?)        → EnrichedProduct[]        // crawl
```

`crawlSite` réutilise `scrapeListing` puis `enrichRow` pour chaque produit découvert.

### 2.2 Schéma canonique (source de vérité)

Remplace `EnrichedProduct` actuel **et** `ScrapeResult.rows` (les deux structures sont fusionnées en une seule).

```typescript
const EnrichedProductSchema = z.object({
  url: z.string(),
  scrapedAt: z.number(),

  identity: z.object({
    name: z.string(),
    reference: z.string().nullable(),
    brand: z.string().nullable(),
    ean: z.string().nullable(),
    breadcrumb: z.array(z.string()).default([]),
  }),

  marketing: z.object({
    subtitle: z.string().nullable(),
    description: z.string().nullable(),
    advantages: z.array(z.object({ text: z.string(), group: z.string().optional() })).default([]),
  }),

  commercial: z.object({
    price: z.object({
      amount: z.number().nullable(),
      currency: z.string().default('EUR'),
      raw: z.string(),
    }).nullable(),
    availability: z.string().nullable(),
  }),

  specifications: z.array(z.object({
    group: z.string(),  // titre de section, "Général" si absent
    name: z.string(),
    value: z.string(),
  })).default([]),

  variants: z.array(z.object({
    reference: z.string(),
    label: z.string(),
    properties: z.record(z.string()),
  })).default([]),

  media: z.object({
    images: z.array(z.string().url()).default([]),
    documents: z.array(z.object({
      name: z.string(),
      url: z.string().url(),
    })).default([]),
  }),

  meta: z.object({
    sourcesScraped: z.array(z.string()),
    llmModel: z.string(),
    llmProvider: z.enum(['claude', 'gemini', 'openai']),
    warnings: z.array(z.string()).default([]),
  }),
})

export type EnrichedProduct = z.infer<typeof EnrichedProductSchema>
```

**Conséquence** : le LLM retourne toujours cet objet (validation Zod stricte, retry avec message d'erreur réinjecté en cas d'échec). Plus de `normalizeToRows` qui devine. Plus de divergence single/listing.

### 2.3 Projecteurs

Un projecteur = pure function `EnrichedProduct → format consommateur`. Aucun appel LLM, aucune logique métier.

- `productToSheetRow(p, opts): ExcelRow` — pour Listing/Batch/Crawl. Les specs sont sérialisées en colonnes `[group] name` (logique actuelle de `scrapeResultToSheet`, isolée et testable).
- `productsToSheet(p[], name): ExcelSheet` — wrapper avec génération de colonnes auto + taxonomie depuis breadcrumb.
- `productToDesignAsset(p): DesignProductAsset` — pour Claude Design (single product, format riche).

### 2.4 Modèles LLM

Mémoire utilisateur : `claude-opus-4-7` + `gemini-3.1-pro-preview` par défaut.

- `scrapeProduct` (single, qualité critique) → **Claude Opus 4.7**
- `scrapeListing` / `enrichRow` / `crawlSite` (volumes, vitesse) → **Gemini 3.1 Pro**

Surchargeable via paramètre `opts.model`.

### 2.5 Prompts

```typescript
// core/prompts.ts

const SYSTEM_PROMPT = `
Tu es un extracteur produit. Tu retournes EXCLUSIVEMENT un objet JSON
conforme au schéma EnrichedProduct fourni.

Règles absolues :
1. Langue : tout en FRANÇAIS (sauf références/EAN/URLs).
2. Fidélité : si une info n'est pas dans la source, retourne null.
   N'INVENTE rien — pas de prix plausible, pas d'EAN inventé.
3. Specs groupées : respecte les sections de la page (group = titre de section).
4. Bruit : ignore les bandeaux cookies/GDPR, navigation, footer, recos.
5. Images : URLs absolues uniquement, pas d'icônes/logos site.
`

function buildExtractPrompt(opts: {
  vendorPrompt?: string  // Firestore : "Sur Milwaukee, breadcrumb dans data-attribute"
  globalRules?: string   // Markdown global hub admin
  userPrompt?: string    // Saisie ad-hoc utilisateur
  isSingle: boolean
}): string
```

Un seul prompt système, partagé par tous les entry points.

## 3. Décomposition fichier par fichier

### 3.1 Module cible

```
src/features/scraping/
├── core/
│   ├── canonicalSchema.ts          (~120 l) — Zod schema EnrichedProduct
│   ├── canonicalProjectors.ts      (~200 l) — productToSheetRow, productsToSheet, productToDesignAsset
│   ├── prompts.ts                  (~150 l) — SYSTEM_PROMPT + buildExtractPrompt
│   ├── extractCanonical.ts         (~150 l) — appel LLM + validation Zod + retry
│   ├── fetchPage.ts                (~150 l) — Jina Reader + Cloud Function Puppeteer fallback
│   ├── bundleSources.ts            (~120 l) — multi-page (depuis scrapeBundle.ts existant, à généraliser)
│   ├── relatedUrls.ts              (~150 l) — découverte tabs/PDFs/subpages (existant, déplacé)
│   ├── debug.ts                    (~80 l)  — debug log (depuis scraping-hub/debugLog)
│   └── parsers/
│       ├── parseDescription.ts     (~80 l)  — parser description depuis markdown
│       ├── parseAdvantages.ts      (~120 l) — parser avantages + groupes
│       ├── parseSpecifications.ts  (~150 l) — parser specs groupées
│       ├── parseVariants.ts        (~100 l) — parser variantes depuis tableau HTML
│       ├── parseDocuments.ts       (~80 l)  — parser PDFs
│       ├── parsePrice.ts           (~60 l)  — parser prix vers { amount, currency, raw }
│       └── garbageFilter.ts        (~50 l)  — filtre cookies/GDPR/recaptcha
├── engines/
│   ├── singleProduct.ts            (~100 l) — scrapeProduct(url) → EnrichedProduct
│   ├── listing.ts                  (~120 l) — scrapeListing(url) → EnrichedProduct[]
│   ├── batch.ts                    (~150 l) — enrichRow(row) → EnrichedProduct
│   └── crawl.ts                    (~150 l) — crawlSite(rootUrl) → EnrichedProduct[]
├── ui/
│   ├── ScrapingModal/
│   │   ├── index.tsx               (~150 l) — orchestrateur 4 onglets
│   │   ├── SingleTab.tsx           (~150 l) — URL → 1 produit
│   │   ├── ListingTab.tsx          (~150 l) — URL listing → N produits
│   │   ├── BatchTab.tsx            (~120 l) — N URLs en parallèle
│   │   └── CrawlTab.tsx            (~120 l) — site complet
│   ├── EnrichedProductView.tsx     (~200 l) — rendu canonical (specs groupées, variants, images, docs)
│   └── EnrichmentPanel/
│       ├── index.tsx               (~250 l) — layout + orchestration
│       ├── ProductHeader.tsx       (~100 l) — nom + breadcrumb + état
│       ├── tabs/
│       │   ├── MarketingTab.tsx    (~200 l) — description + avantages + variants
│       │   ├── SpecsTab.tsx        (~200 l) — specs groupées éditables
│       │   └── SourcesTab.tsx      (~150 l) — URLs + images + docs
│       ├── ActionsBar.tsx          (~150 l) — boutons enrichir / sauvegarder / reset
│       └── PromptInspector.tsx     (~150 l) — debug du prompt envoyé
├── admin/  (ex-scraping-hub)
│   ├── ScrapingHubPage.tsx         (~80 l)  — orchestrateur
│   ├── VendorPromptsTab.tsx        (~250 l) — édition par domaine (ex-VendorsTab simplifié)
│   ├── RulesTab.tsx                (~150 l) — règles globales markdown (existant)
│   └── DebugTab.tsx                (~150 l) — debug Jina/LLM (existant)
└── store/
    ├── enrichmentStore.ts          (~200 l) — Zustand : entries par (sheetName, rowId) (existant)
    └── vendorPromptsStore.ts       (~150 l) — Firestore : { [domain]: { prompt, brandAliases } }
```

**Total estimé : ~3 800 lignes répartis sur ~30 modules de 50–250 lignes**, contre ~9 000 lignes actuelles concentrées sur 4 fichiers monolithiques.

### 3.2 Fichiers supprimés

| Fichier | Lignes | Raison |
|---|---|---|
| `features/scraping/useJina.ts` | 1091 | Remplacé par `core/` + `engines/` |
| `features/scraping-templates/engine.ts` | 651 | Engine déterministe CSS/XPath supprimé |
| `features/scraping-templates/VisualTemplateBuilder.tsx` | 619 | UI capture visuelle supprimée |
| `features/scraping-templates/TemplateEditor.tsx` | 501 | Idem |
| `features/scraping-templates/useChromeExtension.ts` | 155 | Plus de couplage extension |
| `features/scraping-templates/overlayScript.ts` | 269 | Idem |
| `features/scraping-templates/applyFieldPrompts.ts` | 135 | Logique mergée dans `extractCanonical` |
| `features/scraping-templates/getVendorFieldRows.ts` | 187 | Plus de `vendorFieldOrder` |
| `features/scraping-templates/VendorFieldOrderModal.tsx` | 216 | Idem |
| `pages/ScrapingTemplatesPage.tsx` | ~50 | Page route supprimée |
| Route `/scraping-templates` (App.tsx) | — | Idem |
| Extension Chrome (dossier séparé) | — | Sortie du repo |

**Total supprimé : ~3 900 lignes.**

### 3.3 Fichiers conservés simplifiés

| Fichier actuel | Nouveau nom / état |
|---|---|
| `scraping-templates/templatesStore.ts` | → `store/vendorPromptsStore.ts` — schema réduit à `{ id, domain, brandAliases, vendorPrompt, createdAt, updatedAt }` |
| `scraping-templates/types.ts` | → `store/vendorPromptsStore.ts` (inline) — schema Zod simplifié |
| `scraping-templates/buildEnrichmentPrompt.ts` | → `core/prompts.ts` (mergé) |
| `scraping-templates/useMatchingTemplate.ts` | → `store/vendorPromptsStore.ts` — `findVendorPromptForUrl(url)` |
| `scraping-templates/fetchSourceHtml.ts` | → `core/fetchPage.ts` (mergé, méthode `fetchHtml`) |
| `scraping-hub/*` | → `admin/*` (renommé) |
| `excel/ai-enrichment/scrapeBundle.ts` | → `core/bundleSources.ts` (généralisé) |
| `excel/ai-enrichment/relatedUrls.ts` | → `core/relatedUrls.ts` (déplacé) |
| `excel/ai-enrichment/enrichmentStore.ts` | → `store/enrichmentStore.ts` (déplacé) |
| `excel/ai-enrichment/types.ts` | Fusionné dans `core/canonicalSchema.ts` |
| `excel/ai-enrichment/useSaveEnrichedProduct.ts` | Conservé tel quel (~210 l, OK) |

### 3.4 Consommateurs externes à mettre à jour

| Fichier | Modification |
|---|---|
| `features/merge/useSourceVendors.ts` | Remplacer import `scraping-templates/templatesStore` → `scraping/store/vendorPromptsStore`, type `ScrapingTemplate` → `VendorPrompt` |
| `features/merge/VendorStatusPanel.tsx` | Idem ; remplacer `navigate('/scraping-templates?id=...')` → `navigate('/scraping-hub?tab=vendors&id=...')` (l'édition se fait désormais dans le hub admin) |
| `features/help/content/scraping.tsx` | Remplacer le lien `target: { path: '/scraping-templates' }` → `path: '/scraping-hub'` ; mettre à jour le contenu (plus de capture visuelle, juste le `vendorPrompt`) |
| `features/help/content/import-excel.tsx` | Idem |
| `pages/DashboardPage.tsx` | Retirer la section `scraping-templates` du menu sidebar et du switch ; conserver `scraping-hub` |
| `app/router.tsx` | Supprimer la route `/scraping-templates` |

### 3.5 Décomposition de `useProductEnrichment.ts` (4322 → ~150 l)

Le hook devient un orchestrateur fin :

```typescript
// engines/batch.ts
export function useEnrichRow() {
  return useCallback(async (input: EnrichRowInput) => {
    const url = await resolveProductUrl(input)
    const bundle = await scrapeProductBundle(url)
    const canonical = await extractCanonical(bundle, { url, isSingle: true })
    const enriched = enrichFromMarkdown(canonical, bundle.mergedMarkdown)
    return enriched
  })
}
```

Ce qui pesait dans les 4322 lignes :

| Bloc | Lignes | Destination |
|---|---|---|
| Mode `auto` LLM extraction | ~600 | `core/extractCanonical.ts` |
| Mode `template` (applyTemplate + score) | ~900 | **supprimé** |
| Mode `manual` LLM | ~400 | `core/extractCanonical.ts` |
| Post-process markdown | ~800 | `core/parsers/*.ts` (split en 6 modules) |
| Bundle multi-page (déjà extrait) | — | `core/bundleSources.ts` |
| URL discovery (Jina search) | ~300 | `core/resolveProductUrl.ts` |
| Garbage filter | ~50 | `core/parsers/garbageFilter.ts` |
| Logging LLM | ~100 | `core/debug.ts` |
| Hook orchestration | ~150 | `engines/batch.ts` |
| Imports + types | ~200 | éparpillés |

Le passage de 4322 → 1500 lignes au total (modules `core/` + `engines/`) vient de :
- Suppression du mode `template` (chemin déterministe)
- Suppression de l'extension Chrome
- Mutualisation : un seul filtre garbage, un seul parser markdown, un seul prompt système
- Suppression de la logique applyTemplate (jamais réutilisable hors templates)

### 3.6 Décomposition de `EnrichmentPanel.tsx` (1558 → ~1100 l)

```
ui/EnrichmentPanel/
├── index.tsx                  (~250 l)  — layout + orchestration
├── ProductHeader.tsx          (~100 l)  — nom + breadcrumb + état
├── tabs/
│   ├── MarketingTab.tsx       (~200 l)  — description + avantages + variants
│   ├── SpecsTab.tsx           (~200 l)  — specs groupées éditables
│   └── SourcesTab.tsx         (~150 l)  — URLs + images + docs (ex-ScrapedFieldsTab)
├── ActionsBar.tsx             (~150 l)  — boutons enrichir/sauvegarder/reset
└── PromptInspector.tsx        (~150 l)  — debug du prompt envoyé
```

Pas de gain massif ici : c'est principalement de la décomposition pour testabilité et lisibilité.

## 4. Stratégie de migration (5 phases)

**Phase 1 — Nouveau core, sans toucher à l'ancien.**
- `core/canonicalSchema.ts` + `core/extractCanonical.ts` + `core/prompts.ts`
- `core/parsers/*.ts` (6 modules)
- `core/canonicalProjectors.ts`
- Tests unitaires sur fixtures HTML/markdown
- Pas de régression possible : aucun consommateur encore branché

**Phase 2 — Nouveaux engines.**
- `engines/singleProduct.ts`, `engines/listing.ts`, `engines/batch.ts`, `engines/crawl.ts`
- `crawl` réutilise `listing` + `batch`
- Tests d'intégration : scraper 5 fixtures → schema valide

**Phase 3 — Migration UI.**
- `ScrapingModal` ré-écrit (4 onglets : Single, Listing, Batch, Crawl) sur le nouveau core
- `EnrichmentPanel` décomposé → branche sur `engines/batch.ts`
- `EnrichedProductView` partagé entre modal et panel

**Phase 4 — Migration des données vendor.**
- Pour chaque `ScrapingTemplate` Firestore existant, écrire un `VendorPrompt` avec `{ vendorDomain, brandAliases, vendorPrompt }`
- Garder la collection `scrapingTemplates` un mois en lecture seule pour rollback
- Suppression effective : `useJina.ts`, `engine.ts`, `VisualTemplateBuilder`, `TemplateEditor`, `useChromeExtension`, `overlayScript`, `applyFieldPrompts`, `getVendorFieldRows`, `VendorFieldOrderModal`, `ScrapingTemplatesPage`, route `/scraping-templates`

**Phase 5 — Hub admin.**
- `VendorsTab` (170 l) → `VendorPromptsTab` (~250 l) avec édition simple par domaine
- `RulesTab`, `DebugTab` inchangés (déplacés dans `admin/`)

## 5. Tests

- **Fixtures HTML** : 5 pages capturées (Milwaukee, Leroy Merlin, Decathlon, fabricant niche, listing catalogue) sauvées dans `__tests__/fixtures/*.html`
- **Tests parseurs** : chaque `parseXxx.ts` testé sur des fixtures markdown isolées
- **Tests extractCanonical** : sur les 5 fixtures, valider que la sortie est conforme au schéma Zod et que ≥ 80 % des champs critiques sont remplis
- **Snapshot tests** : avec `temperature=0.0`, deux runs sur la même fixture produisent un canonical identique (reproducibilité)
- **Tests projecteurs** : `productToSheetRow(canonical)` produit un `ExcelRow` avec les colonnes attendues, dans le bon ordre

## 6. Risques

| Risque | Impact | Atténuation |
|---|---|---|
| Migration Firestore : selecteurs CSS perdus | Modéré | Collection `scrapingTemplates` gardée un mois en read-only ; le `vendorPrompt` textuel suffit dans la majorité des cas |
| Coût LLM (Claude Opus en single) | Faible | Listing/batch/crawl restent sur Gemini Flash. L'utilisateur peut surcharger via `opts.model` |
| Sites résistants (DataDome, SPA agressive) | Modéré | Cloud Function Puppeteer (`renderPage`) en fallback automatique. À étendre depuis l'existante `extractBreadcrumb` |
| Régression utilisateurs ayant capturé des templates | Modéré | Le `vendorPrompt` migré est conservé, c'est lui qui porte 90 % de la valeur. Les selecteurs CSS de niche sont perdus mais ils cassaient déjà silencieusement |
| Hallucinations subtiles | Élevé (existant) | Validation Zod stricte + détection élargie : valeurs trop génériques, prix incohérents avec la marque, EAN invalides (checksum), URL d'image qui ne mène pas à une image |

## 7. Décisions clés cristallisées

1. **Un schéma canonique unique** (`EnrichedProduct`), validé Zod en sortie LLM, **pas de `ScrapeResult.rows` plat séparé**.
2. **Un pipeline unique**, quatre entry points (`scrapeProduct`, `scrapeListing`, `enrichRow`, `crawlSite`).
3. **Suppression complète** de l'engine déterministe CSS/XPath, de l'extension Chrome, des templates par fournisseur (au sens selecteurs).
4. **Conservation** du `vendorPrompt` textuel par domaine, des règles globales markdown, du debug log.
5. **Modèles** : Claude Opus 4.7 pour single, Gemini 3.1 Pro pour listing/batch/crawl. Surchargeable.
6. **Cloud Function Puppeteer** étendue (`renderPage`) pour les sites résistants ; sinon Jina Reader suffit.

---

## 8. Hors scope (pour des refontes futures)

- Détection automatique du type de page (single vs listing) — l'utilisateur choisit explicitement l'onglet.
- Cache de scraping persistant en Firestore — possible future optimisation.
- Export du `EnrichedProduct` vers d'autres formats (JSON-LD, schema.org Product) — non demandé.
- Comparaison automatique d'extractions sur la même URL (drift detection) — non demandé.
