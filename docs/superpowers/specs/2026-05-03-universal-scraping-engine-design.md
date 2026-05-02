# Moteur de scraping universel — Design

**Date** : 2026-05-03
**Auteur** : Claude (brainstorm avec ibsstudio)
**Statut** : draft, en review utilisateur

## Contexte

Le moteur d'enrichissement actuel (`useProductEnrichment.ts`) repose sur une cascade Jina (POST `X-Engine: browser` + GET JSON merged), parsers heuristiques (`parseSpecifications`, `parseAdvantages`, `parseDescription`) et fallback LLM via cascade `gemini → claude` (DeepSeek/Qwen ignorés faute de clé / d'implémentation).

Diagnostic sur des produits réels (session 2026-05-03) :

| Source | Markdown | Specs | Avantages | Description | Verdict |
|---|---|---|---|---|---|
| **Dyson Spot+Scrub Ai** | 79 k chars (Jina + clé paid) | 14 ✓ | 15 hiérarchique ✓ | propre ✓ | **OK** |
| **RS Components Makita** | 13 k chars | 9 ✓ après dedup | 0 (image-only bullets) | n/a | **OK** |
| **Jardiland Mythos** | 7,6 k chars (Jina basic) | 8 (5 garbage : prose, UI livraison, headings) | 2 (manque) | 1178 chars (début pollué) | **dégradé** |
| **Leroy Merlin Makita** | 16 chars (Akamai bloque) | 0 | 0 | 0 | **bloqué** |

Sources de pertes :
1. Jina seul ne passe pas l'anti-bot Akamai sur certains GSA (Leroy Merlin).
2. JSON-LD Schema.org embarqué dans 90 %+ des sites e-commerce **n'est pas exploité** — c'est pourtant la source la plus fiable (zéro parsing heuristique).
3. Format 3 (`Clé : Valeur`) du parser specs matche des phrases prose contenant `:` → faux positifs.
4. `detectBrandFromUrl` existe mais n'est pas branché dans le pipeline d'enrichissement (uniquement utilisé pour suggestion UI dans `ScrapeTab.tsx`).
5. Patterns garbage non couverts : "En stock", "+1 offre", "Avantages produits=- bullet…".

## Objectif

Faire évoluer le moteur pour qu'il fonctionne de manière équivalente sur les 4 grands types de cibles :
- **B2B distributeur** (RS Components, Conrad, Distrelec) — déjà couvert
- **B2C site fabricant** (Dyson, Makita, Bosch) — déjà couvert
- **GSA grande surface alimentaire/bricolage** (Leroy Merlin, Castorama, Boulanger) — actuellement bloqué
- **GSM grande distribution / pure player** (Jardiland, Cdiscount) — actuellement dégradé

Cible : ≥ 10 specs structurées et description ≥ 200 chars sur 90 % des URLs testées, sans appel LLM (DIRECT BUILD).

## Approche : option Z (additif)

Garder le pipeline existant intact. Ajouter de nouvelles couches qui enrichissent le résultat. Si une nouvelle couche échoue → fallback transparent sur le pipeline actuel. Pas de régression sur Dyson/RS qui marchent.

Trois axes en parallèle :

- **Axe A** — Multi-sources cascade (Firecrawl, fallback fabricant)
- **Axe B** — Parser JSON-LD Schema.org universel
- **Axe C** — Durcir les parsers existants (Format 3, anti-prose, anti-UI)

## Architecture globale

```
URL produit
   │
   ├─► [NOUVEAU] StructuredData fetcher
   │      Fetch HTML brut via CORS proxy (puis Jina HTML mode si échec)
   │      Extrait JSON-LD Schema.org Product
   │      → { name, description, sku, brand, image, additionalProperty[], ... }
   │
   ├─► [EXISTANT] Jina POST/GET cascade (inchangé)
   │      → markdownContent
   │
   ├─► [NOUVEAU] Firecrawl fallback (si scoreMd(jina) < 15)
   │      → markdown enrichi
   │
   ├─► [NOUVEAU] Manufacturer fallback (si url ∈ RESELLER_HOSTS && score < 5)
   │      → re-scrape via étapes 1-3 sur l'URL fabricant détectée
   │
   └─► PARSERS (durcis Axe C)
          ├─► Format 1-4b stricts (anti-prose, anti-bullet, anti-heading)
          ├─► Dedup par nom (déjà OK)
          └─► Filtres UI livraison/promo

Résultat = MERGE (priorité JSON-LD > markdown parsing > fallbacks)
```

Point d'entrée principal : `useProductEnrichment.ts` (API inchangée — `enrich(input)`).

Nouveaux modules :
- `src/features/scraping/core/structuredData.ts` — extraction JSON-LD
- `src/features/scraping/core/firecrawlFallback.ts` — wrapper Firecrawl API
- `src/features/scraping/core/manufacturerFallback.ts` — re-scrape sur site officiel détecté

Modules durcis (en place) :
- `src/features/scraping/core/parsers/parseSpecifications.ts` (Format 3 strict, garbage UI étendu)
- `src/features/scraping/core/parsers/parseAdvantages.ts` (déjà refait en hiérarchique, à compléter pour bold sections inline Jardiland-style)

## Axe A — Multi-sources cascade

### Cascade

```
1. Jina GET basic                (gratuit, rapide)            ── existant
       │ scoreMd < 10
       ▼
2. Jina POST X-Engine: browser  (cher, JS exécuté, anti-bot)   ── existant
       │ scoreMd < 15
       ▼
3. Firecrawl                    (alternatif, anti-bot fort)    ── NOUVEAU
       │ scoreMd < 5
       ▼
4. Site fabricant               (si URL ∈ RESELLER_HOSTS)      ── NOUVEAU
       └─► Re-scrape via étapes 1-3 sur l'URL fabricant
```

### Firecrawl fallback (`firecrawlFallback.ts`)

**Trigger** : `scoreMd(jinaResult) < 15`.

**Endpoint** : `POST https://api.firecrawl.dev/v2/scrape`

```json
{
  "url": "https://...",
  "formats": ["markdown", "extract"],
  "onlyMainContent": true,
  "extract": {
    "schema": {
      "specs": "array",
      "advantages": "array",
      "description": "string"
    }
  }
}
```

**Auth** : clé API Firecrawl déjà présente dans `localStorage.getItem('designstudio_apikey_firecrawl')`. Pas de nouvelle config.

**Retour** : structure `{ markdown: string, extract: { specs?: string[], advantages?: string[], description?: string } }`.

### Manufacturer fallback (`manufacturerFallback.ts`)

**Trigger** : `RESELLER_HOSTS.test(url)` ET `scoreMd(jinaResult) < 5`.

**Logique** :
1. `detectBrandFromUrl(url)` → `{ brand, officialSite }` (déjà existant dans `useJina.ts`)
2. Extraire la référence produit du titre via regex `/[A-Z]{2,5}[\-\s]?\d{1,4}[\w\-]*/`
3. Construire URL fabricant : `${officialSite.baseUrl}/search?q=${ref}` ou `${officialSite.baseUrl}${officialSite.searchPattern}${ref}` selon config
4. Re-scrape via étapes 1-3 de la cascade sur cette URL

**Limite** : marche si la marque est dans `BRAND_OFFICIAL_SITES` (Makita, Bosch, Dewalt, Stihl, etc. déjà mappées). Sinon → skip, retourne `null`.

### Score de qualité

Réutilisation du `scoreMd` existant (`specs × 3 + avantages × 2 + bonus desc`). Constantes seuil exposées en haut de `scrapeProductBundle` :

```ts
const FALLBACK_THRESHOLDS = {
  jinaPostFromGet: 10,    // déjà existant
  firecrawlFromJina: 15,  // nouveau
  manufacturerFromAll: 5, // nouveau
}
```

### Logging

Chaque source loggée dans la console + dans `scrapingHub/debugLog` :
```
[enrichment-cascade] jina-basic: score=8, md=12k chars, 850ms
[enrichment-cascade] jina-post: score=12, md=45k chars, 4.2s
[enrichment-cascade] firecrawl: score=22, md=68k chars, 6.1s ✓ kept
```

Permet de mesurer où on gagne et où on perd, et de tuner les seuils plus tard.

## Axe B — JSON-LD Schema.org extractor

### Module : `structuredData.ts`

```ts
export interface StructuredProductData {
  name?: string
  description?: string
  brand?: string
  manufacturer?: { name: string; url?: string }
  sku?: string
  gtin?: string
  mpn?: string  // manufacturer part number
  category?: string  // depuis BreadcrumbList ou category field
  images: string[]
  specs: Array<{ name: string; value: string }>
}

export async function extractStructuredDataFromUrl(
  url: string,
): Promise<StructuredProductData | null>

export function parseStructuredDataFromHtml(
  html: string,
): StructuredProductData | null
```

### Étapes (parseStructuredDataFromHtml)

1. `new DOMParser().parseFromString(html, 'text/html')`
2. `doc.querySelectorAll('script[type="application/ld+json"]')` → array
3. Pour chaque bloc :
   - `JSON.parse(textContent)` avec try/catch (beaucoup de sites ont JSON malformé)
   - Si `@graph` array → flatten
   - Si root est array → flatten
4. Filtrer par `@type === 'Product'` (multi-types possibles : `['Product', 'Offer']`)
5. Si plusieurs Products trouvés → prendre celui avec le plus de champs renseignés (heuristique : score = nombre de champs non-null)
6. Mapper vers `StructuredProductData` :
   - `name` : string ou array → premier
   - `description` : strip HTML tags si présents
   - `image` : string ou array → array uniformisé, filtre URLs http(s)
   - `brand` : `{ name: ... }` ou string → string
   - `additionalProperty[]` : `[{ name, value, unitText? }]` → `specs[]` avec value+unitText concaténé
7. Extraire breadcrumb depuis `@type: BreadcrumbList` séparément (pour `category`)

### Récupération du HTML brut (extractStructuredDataFromUrl)

Cascade :
1. **CORS proxy** (déjà utilisé dans `scrapeManufacturerRawData`) :
   - `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
   - `https://corsproxy.io/?${encodeURIComponent(url)}`
2. **Jina HTML mode** (fallback) : `https://r.jina.ai/${url}` avec header `X-Return-Format: html`

Si tous échouent → return `null`.

Timeout par tentative : 15 s (CORS proxy), 25 s (Jina).

### Intégration dans `useProductEnrichment.ts`

Lancement en parallèle avec le scrape Jina :

```ts
const [structured, bundle] = await Promise.allSettled([
  extractStructuredDataFromUrl(productUrl),
  scrapeProductBundle(productUrl, deps),
])

const structuredData = structured.status === 'fulfilled' ? structured.value : null
const markdownContent = bundle.status === 'fulfilled' ? bundle.value.mergedMarkdown : null
```

Au moment du build du résultat enrichi :

```ts
enriched = {
  description: structuredData?.description || mdDescription,
  specifications: mergeSpecs(structuredData?.specs, mdSpecs),  // priorité JSON-LD, complément markdown
  advantages: mdAdvantages,  // pas dans JSON-LD usuel
  images: dedupImages([...(structuredData?.images ?? []), ...mdImages]),
  brand: structuredData?.brand,
  sku: structuredData?.sku,
  // ...
}
```

`mergeSpecs(jsonLdSpecs, mdSpecs)` :
- Inclut tous les `jsonLdSpecs` (priorité)
- Ajoute les `mdSpecs` qui ne sont PAS dans `jsonLdSpecs` (par nom normalisé)

### Cas non-couverts par JSON-LD

- Sites sans Schema.org Product → fallback complet sur markdown parsing (pas de régression).
- Sites avec JSON-LD minimaliste (juste `name` + `image`) → on prend ce qu'on peut, le reste vient du markdown.
- Sites avec JSON-LD malformé → catch, return null, fallback markdown.

### Tests

Fixtures dans `src/features/scraping/core/__tests__/fixtures/`:
- `jardiland-mythos.html` (sample real)
- `dyson-spot-scrub.html`
- `rs-components-makita.html`
- `malformed-jsonld.html`
- `multi-product-jsonld.html` (pick best)

Tests :
- Champs principaux extraits correctement
- `@graph` array correctement flatten
- HTML stripé dans description
- Multiple `<script>` JSON-LD : pick le Product avec le plus de champs
- JSON malformé → `null`, pas de crash

## Axe C — Durcissement des parsers

### Fix C.1 — Format 3 (Clé : Valeur) anti-prose

**Avant** : `^([^:]{2,50})\s*:\s+(.{1,200})$` matche les phrases prose contenant `:`.

**Après** : ajouter check `looksLikeSpecName(name)` :

```ts
const looksLikeSpecName = (n: string) =>
  n.split(/\s+/).length <= 5
  && /^[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ]/.test(n)  // commence par majuscule
  && !/^(le|la|les|un|une|des|du|de|cette|ce|ces|votre|notre)\b/i.test(n)
```

Si `name` ne matche pas → reject.

### Fix C.2 — Bullets capturés en valeurs

**Problème** : `Avantages produits=- Pratiquement incassable, la`

**Fix** : dans `add()`, rejeter si `value` commence par bullet markdown :

```ts
if (/^[-*•]\s/.test(v)) return  // valeur = bullet, pas une vraie spec
```

### Fix C.3 — Headings de section capturés en clé

**Problème** : `Caractéristiques techniques=- Dimensions ext...`

**Fix** : dans `add()`, rejeter si `name` est un heading de section connu :

```ts
const SECTION_HEADING_RE = /^(caract[eé]ristiques?|sp[eé]cifications?|d[eé]tails?|description|avantages?|points?\s+forts?|fiche|info\s|[eé]quipement|application)/i
if (SECTION_HEADING_RE.test(n) && n.length < 35) return
```

### Fix C.4 — UI livraison/promo

**Problème** : `En stock=GRATUIT à partir...`, `+=1 offre`.

**Fix** : nouveau `DELIVERY_UI_RE` ajouté aux rejets :

```ts
const DELIVERY_UI_RE = /^(en\s+stock|stock\s+disponible|disponible|indisponible|livraison|gratuit\s+(à\s+partir|d[eè]s)|estim(ée|ation)|exp[eé]di[eé]e?|d[eé]livr[eé]e?|retir[eé]\s+en|click\s+&\s+collect|\+\s*\d+\s+offres?|voir\s+l['']offre|comparer)$/i
if (DELIVERY_UI_RE.test(n) || DELIVERY_UI_RE.test(v)) return
```

### Fix C.5 — Avantages bold inline (Jardiland-style)

**Problème** : Jardiland a :
```
**Avantages produits**
- Pratiquement incassable
- Anti-UV
- Démontable
```

Le parser actuel capture mal cette structure : `**Avantages produits**` est repéré comme bold heading (currentBoldGroup = "Avantages produits"), mais comme c'est aussi `featureKeywords.test("Avantages produits") === true` (matche `avantages?`), ça déclenche `inFeatureZone = true` ET `currentGroup = extractGroupName("Avantages produits") = "produits"` (puisque `^(avantages?|...)\s*` est strippé).

Le `currentGroup` devient "produits" — pas idéal mais OK. Les bullets suivants devraient être collectés.

À durcir : si l'extracted group est < 3 chars ou ne ressemble pas à un nom (juste un mot vide après strip), garder le heading complet : "Avantages produits" → `currentGroup = "Avantages produits"` quand strip retournerait juste "produits".

### Fix C.6 — Anti-prose composite

Garde-fou final dans `add()` (combo des fixes ci-dessus) :

```ts
// Pattern de "specs" qui sont en réalité des bouts de prose
if (n.split(/\s+/).length > 5 && !/[:\d]|\b(mm|cm|kg|w|v|hz|ml|l|g)\b/i.test(v)) return
// nom > 5 mots + valeur sans chiffre/unité = prose, pas spec
```

### Tests

Fixture `jardiland-real.md` (extrait du markdown actuel sur Mythos serre) :
- 0 spec garbage parmi les anciennes (En stock, +=1 offre, etc. tous filtrés)
- Description ≥ 500 chars propre
- Avantages ≥ 4 (vs 2 actuellement)

Pas de régression sur Dyson, RS Components, Makita.

## Merge final & priorité de sources

Pour chaque champ de `EnrichedProduct`, ordre de priorité :

| Champ | Priorité 1 | Priorité 2 | Priorité 3 |
|---|---|---|---|
| `name` (titre) | JSON-LD `name` | H1 markdown | titre input |
| `description` | JSON-LD `description` | parseDescriptionFromMarkdown | H1 fallback |
| `brand` | JSON-LD `brand.name` | détection URL | input.brand |
| `sku` / `mpn` | JSON-LD `sku`/`mpn` | regex titre | — |
| `images` | union (JSON-LD + markdown extracted) dédupliquée par filename stem | — | — |
| `specifications` | union (JSON-LD `additionalProperty` en premier + markdown specs en complément) dédup par nom | — | — |
| `advantages` | parseAdvantagesFromMarkdown (Firecrawl extract.advantages en bonus) | — | — |
| `documents` | union markdown PDFs + JINA_EXTRACTED_DOWNLOADS | — | — |
| `category` | JSON-LD breadcrumb | navigation breadcrumb existante | — |

## Décisions et trade-offs

- **Pas de réécriture du pipeline existant** (option Z) : risque min, déploiement progressif. Les nouvelles couches viennent en plus.
- **JSON-LD via CORS proxy plutôt que via Cloud Function** : on a déjà des proxies fonctionnels, pas besoin d'investir dans une nouvelle fonction Firebase.
- **Firecrawl en couche 3 plutôt qu'en remplacement** : Firecrawl est plus cher que Jina ; on ne l'utilise que quand vraiment bloqué.
- **Pas de selectors par site** (Jardiland-specific, Leroy Merlin-specific) : on fait confiance à JSON-LD + parsers durcis. Si un site est totalement inutilisable, l'utilisateur copie-colle l'URL fabricant manuellement.
- **Pas de cache JSON-LD séparé** : on ré-extrait à chaque enrichissement. Volume faible, coût négligeable. Le cache Jina existant suffit.

## Risques

| Risque | Mitigation |
|---|---|
| JSON-LD mal formé sur certains sites → crash parser | try/catch global, return null |
| CORS proxy down → pas de HTML pour JSON-LD | fallback Jina HTML mode |
| Firecrawl API quota dépassé | catch, fallback sur markdown actuel |
| Manufacturer fallback boucle infinie (revendeur → revendeur) | flag `inManufacturerFallback` pour éviter récursion |
| Régression sur Dyson/RS qui marchent | tests fixture sur ces 2 sites + dyson real markdown test existant |

## Critères de réussite

- Sur Jardiland Mythos : ≥ 8 specs propres (vs 3 utiles aujourd'hui), ≥ 4 avantages (vs 2), description nettoyée (sans avantages au début)
- Sur Leroy Merlin Makita DHR202Z : enrichissement réussi via fallback fabricant Makita (vs vide aujourd'hui)
- Sur Dyson Spot+Scrub Ai : 14 specs, 15 avantages hiérarchiques (PAS DE RÉGRESSION)
- Sur RS Components Makita : 9 specs après dedup (PAS DE RÉGRESSION)
- DIRECT BUILD réussi (pas d'appel LLM) sur ≥ 90 % des URLs testées

## Tâches d'implémentation (ordre)

1. **Axe C — Durcissement parsers** (changements isolés, base solide)
   - C.1 à C.6 dans `parseSpecifications.ts`
   - C.5 dans `parseAdvantages.ts`
   - Tests régression Dyson + RS + Jardiland fixture
2. **Axe B — JSON-LD extractor** (module isolé, testable seul)
   - `structuredData.ts` (pure parsing)
   - `extractStructuredDataFromUrl` (avec fallbacks proxy)
   - Fixtures HTML + tests
3. **Intégration JSON-LD dans pipeline** (modifications `useProductEnrichment.ts`)
   - Lancement parallèle, merge avec priorité
4. **Axe A — Firecrawl fallback** (module + intégration)
   - `firecrawlFallback.ts`
   - Intégration dans `scrapeProductBundle` ou en post
5. **Axe A — Manufacturer fallback** (module + intégration)
   - `manufacturerFallback.ts`
   - Intégration avec garde anti-récursion
6. **Tests E2E** (script qui enrichit Dyson/RS/Jardiland/LeroyMerlin via les nouveaux parsers et compare)
7. **Cleanup** : supprimer code mort éventuel, documentation README scrapers

## Hors scope

- Pas de UI Settings nouvelle (toggle multi-sources, etc.) — utilise les seuils hardcodés.
- Pas d'OpenGraph parsing (couvert partiellement par JSON-LD).
- Pas de microdata / RDFa (rare en pratique, marche déjà via markdown).
- Pas de gestion de variantes produit (référencement multi-SKU) — out of scope.
- Pas de contournement actif anti-bot (CAPTCHA solving, etc.) — uniquement Firecrawl + fallback fabricant.
