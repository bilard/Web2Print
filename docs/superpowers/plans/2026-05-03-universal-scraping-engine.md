# Universal Scraping Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre le moteur de scraping pour qu'il extraie des données complètes (description, specs, avantages, PDFs, images) sur des sites B2B / B2C / GSA / GSM, avec fallbacks anti-bot, en mode additif (ne casse pas Dyson/RS qui marchent).

**Architecture:** Option Z — additif. Pipeline existant (Jina cascade + parsers heuristiques) inchangé. Trois nouvelles couches en parallèle : JSON-LD Schema.org extractor, Firecrawl fallback, manufacturer site fallback. Merge avec priorité JSON-LD > markdown > fallbacks. Parsers existants durcis pour réduire les faux positifs.

**Tech Stack:** TypeScript, Vitest, DOMParser (browser), Jina Reader API, Firecrawl API, CORS proxies (allorigins, corsproxy.io). Pipeline déjà en place dans `src/features/excel/ai-enrichment/useProductEnrichment.ts` et `src/features/scraping/core/`.

---

## File Structure

### Nouveaux fichiers

| Fichier | Responsabilité |
|---|---|
| `src/features/scraping/core/structuredData.ts` | Parse JSON-LD Schema.org Product depuis HTML brut |
| `src/features/scraping/core/structuredDataFetcher.ts` | Récupère HTML brut via CORS proxy ou Jina HTML, appelle structuredData |
| `src/features/scraping/core/firecrawlFallback.ts` | Wrapper Firecrawl API v2 |
| `src/features/scraping/core/manufacturerFallback.ts` | Re-scrape sur site fabricant détecté quand revendeur bloqué |
| `src/features/scraping/core/__tests__/structuredData.test.ts` | Tests JSON-LD parser |
| `src/features/scraping/core/__tests__/fixtures/jardiland-jsonld.html` | Fixture HTML Jardiland pour tests |
| `src/features/scraping/core/__tests__/fixtures/dyson-jsonld.html` | Fixture HTML Dyson pour tests |
| `src/features/scraping/core/__tests__/fixtures/malformed-jsonld.html` | Fixture HTML JSON-LD cassé |
| `src/features/scraping/core/__tests__/fixtures/multi-product-jsonld.html` | Fixture HTML avec plusieurs Products |

### Fichiers modifiés

| Fichier | Changements |
|---|---|
| `src/features/scraping/core/parsers/parseSpecifications.ts` | Fixes C.1-C.4, C.6 (anti-prose, anti-bullet, anti-heading, UI livraison) |
| `src/features/scraping/core/parsers/parseAdvantages.ts` | Fix C.5 (extractGroupName preserve heading complet si strip → vide) |
| `src/features/excel/ai-enrichment/useProductEnrichment.ts` | Intégration structured data + Firecrawl + manufacturer fallback dans pipeline |
| `src/features/excel/ai-enrichment/scrapeBundle.ts` | Optionnel : passer fallback callbacks depuis useProductEnrichment |
| `src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts` | Tests régression supplémentaires |

---

### Task 1 : Fix C.1 — Format 3 anti-prose

**Files:**
- Modify: `src/features/scraping/core/parsers/parseSpecifications.ts:393-403` (Format 3 block)
- Test: `src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts` (ajouter cas)

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts` après le dernier `it(...)` du `describe` :

```ts
it('specs : Format 3 rejette les phrases prose contenant `:` (Jardiland)', () => {
  const md = `# Produit

## Caractéristiques

| Marque | Makita |
| Poids | 3.3kg |

Optimisez la croissance de vos plantes : la serre Mythos maintient une température idéale.

serre de jardin en polycarbonate : double paroi Mythos de 2,3 m².
`
  const specs = parseSpecsFromMarkdown(md)
  const names = specs.map(s => s.name)
  expect(names).toContain('Marque')
  expect(names).toContain('Poids')
  // Phrases prose ne doivent JAMAIS devenir des specs via Format 3
  expect(names).not.toContain('Optimisez la croissance de vos plantes')
  expect(names).not.toContain('serre de jardin en polycarbonate')
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts -t "Format 3 rejette les phrases prose"
```

Expected: FAIL avec `expected names not to contain "serre de jardin en polycarbonate"` ou similaire.

- [ ] **Step 3: Implémenter le fix dans parseSpecifications.ts**

Modifier le bloc Format 3 (autour de la ligne 393) dans `src/features/scraping/core/parsers/parseSpecifications.ts`. Trouver :

```ts
    // Format 3 : Clé : Valeur (sans markdown bold)
    if (inSpecSection) {
      const kvMatch = trimmed.match(/^([^:]{2,50})\s*:\s+(.{1,200})$/)
      if (kvMatch) {
        const n = kvMatch[1].replace(/\*\*/g, '').trim()
        const v = kvMatch[2].replace(/\*\*/g, '').trim()
        if (n && v && !/^https?:/.test(n)) {
          add(n, v, currentGroup)
          continue
        }
      }
    }
```

Remplacer par :

```ts
    // Format 3 : Clé : Valeur (sans markdown bold)
    // Anti-prose : le name doit ressembler à un vrai nom de spec (max 5 mots,
    // commence par majuscule, pas par article). Sans ce check, des phrases
    // prose contenant `:` étaient capturées comme specs (Jardiland-style).
    if (inSpecSection) {
      const kvMatch = trimmed.match(/^([^:]{2,50})\s*:\s+(.{1,200})$/)
      if (kvMatch) {
        const n = kvMatch[1].replace(/\*\*/g, '').trim()
        const v = kvMatch[2].replace(/\*\*/g, '').trim()
        const looksLikeSpecName =
          n.split(/\s+/).length <= 5
          && /^[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ]/.test(n)
          && !/^(le|la|les|un|une|des|du|de|cette|ce|ces|votre|notre|optimis[eé]z?|am[eé]lior[eé]z?|d[eé]couvr[eé]z?|s[eé]lectionnez|profit[eé]z?)\b/i.test(n)
        if (n && v && !/^https?:/.test(n) && looksLikeSpecName) {
          add(n, v, currentGroup)
          continue
        }
      }
    }
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts -t "Format 3 rejette les phrases prose"
```

Expected: PASS.

- [ ] **Step 5: Lancer toute la suite scraping**

```bash
npx vitest run src/features/scraping/ src/features/excel/ai-enrichment/
```

Expected: tous tests verts (>= 191 + 1 nouveau = 192).

- [ ] **Step 6: Commit**

```bash
git add src/features/scraping/core/parsers/parseSpecifications.ts src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts
git commit -m "fix(scraping): Format 3 reject prose sentences in specs name (anti-Jardiland prose)"
```

---

### Task 2 : Fix C.2 + C.3 — Bullet/heading dans add()

**Files:**
- Modify: `src/features/scraping/core/parsers/parseSpecifications.ts:296-340` (function `add`)
- Test: `src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts` :

```ts
it('specs : rejette les valeurs commençant par bullet markdown `- ...`', () => {
  const md = `# Produit

## Caractéristiques

| Avantages produits | - Pratiquement incassable, la |
| Poids | 3.3kg |
`
  const specs = parseSpecsFromMarkdown(md)
  const names = specs.map(s => s.name)
  expect(names).not.toContain('Avantages produits')
  expect(names).toContain('Poids')
})

it('specs : rejette les noms qui sont des headings de section', () => {
  const md = `# Produit

## Caractéristiques

| Caractéristiques techniques | - Dimensions ext. hors tout |
| Description | Texte long |
| Marque | Makita |
`
  const specs = parseSpecsFromMarkdown(md)
  const names = specs.map(s => s.name)
  expect(names).not.toContain('Caractéristiques techniques')
  expect(names).not.toContain('Description')
  expect(names).toContain('Marque')
})
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

```bash
npx vitest run src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts -t "specs : rejette"
```

Expected: 2 tests FAIL.

- [ ] **Step 3: Implémenter les fixes dans add()**

Dans `src/features/scraping/core/parsers/parseSpecifications.ts`, trouver la fonction `add` et le bloc existant :

```ts
    if (/^[•·]\s/.test(n) || /^[•·]\s/.test(v)) return
```

Remplacer par :

```ts
    // Rejet bullets en nom OU valeur (n'est PAS une spec, c'est une cellule
    // de table qui a capturé un bullet de feature).
    if (/^[•·]\s/.test(n) || /^[•·]\s/.test(v)) return
    // Rejet bullets markdown `- ` ou `* ` en valeur (ex: `Avantages produits=- Item`)
    if (/^[-*]\s/.test(v)) return
    // Rejet noms qui sont des headings de section
    const SECTION_HEADING_RE = /^(caract[eé]ristiques?|sp[eé]cifications?|d[eé]tails?|description|avantages?|points?\s+forts?|fiche|info\s|[eé]quipement|application)/i
    if (SECTION_HEADING_RE.test(n) && n.length < 35) return
```

- [ ] **Step 4: Lancer les tests**

```bash
npx vitest run src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts -t "specs : rejette"
```

Expected: 2 PASS.

- [ ] **Step 5: Suite complète, vérifier zéro régression**

```bash
npx vitest run src/features/scraping/ src/features/excel/ai-enrichment/
```

Expected: tous verts.

- [ ] **Step 6: Commit**

```bash
git add src/features/scraping/core/parsers/parseSpecifications.ts src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts
git commit -m "fix(scraping): reject bullet values and section heading names in specs"
```

---

### Task 3 : Fix C.4 — UI livraison/promo

**Files:**
- Modify: `src/features/scraping/core/parsers/parseSpecifications.ts` (function `add`)
- Test: `src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
it('specs : rejette les UI de livraison/promo (Jardiland: En stock, +1 offre)', () => {
  const md = `# Produit

## Caractéristiques

| En stock | GRATUIT à partir du mardi 12 mai |
| + | 1 offre |
| Voir l'offre | Voir détails |
| Estimation livraison | 3-5 jours |
| Marque | Makita |
| Poids | 3.3kg |
`
  const specs = parseSpecsFromMarkdown(md)
  const names = specs.map(s => s.name)
  expect(names).not.toContain('En stock')
  expect(names).not.toContain('+')
  expect(names).not.toContain("Voir l'offre")
  expect(names).not.toContain('Estimation livraison')
  expect(names).toContain('Marque')
  expect(names).toContain('Poids')
})
```

- [ ] **Step 2: Vérifier que le test échoue**

```bash
npx vitest run src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts -t "rejette les UI de livraison"
```

Expected: FAIL.

- [ ] **Step 3: Ajouter DELIVERY_UI_RE dans parseSpecifications.ts**

Trouver dans `src/features/scraping/core/parsers/parseSpecifications.ts` la déclaration de `FINANCIAL_NAME_RE` (autour de ligne 247) et ajouter juste après :

```ts
  /** UI de livraison/promo/checkout que les sites GSA mettent en cellule de
   *  tableau (Jardiland, Leroy Merlin) et qu'on capture par erreur en spec. */
  const DELIVERY_UI_RE = /^(en\s+stock|stock\s+disponible|disponible|indisponible|livraison|gratuit\s+(à\s+partir|d[eè]s)|estim(ée|ation)|exp[eé]di[eé]e?|d[eé]livr[eé]e?|retir[eé]\s+en|click\s+&\s+collect|\+\s*\d+\s+offres?|voir\s+l['']offre|voir\s+d[eé]tails?|comparer)$/i
```

Puis dans la fonction `add`, juste après les checks `FINANCIAL_VALUE_RE` :

```ts
    if (FINANCIAL_NAME_RE.test(v)) return
    // Cookie banner buttons: déjà existant
    // ...
    // Delivery / promo UI cells (Jardiland-style)
    if (DELIVERY_UI_RE.test(n) || DELIVERY_UI_RE.test(v)) return
```

Aussi rejeter les noms = juste un caractère/symbole isolé :
```ts
    // Nom = juste un symbole/séparateur (ex: "+", "-", "/", "?")
    if (/^[+\-*/?!.,;:]$/.test(n)) return
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

```bash
npx vitest run src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts -t "rejette les UI de livraison"
```

Expected: PASS.

- [ ] **Step 5: Suite complète**

```bash
npx vitest run src/features/scraping/ src/features/excel/ai-enrichment/
```

Expected: tous verts.

- [ ] **Step 6: Commit**

```bash
git add src/features/scraping/core/parsers/parseSpecifications.ts src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts
git commit -m "fix(scraping): reject delivery/promo UI cells (En stock, +1 offre, Voir l'offre)"
```

---

### Task 4 : Fix C.6 — Anti-prose composite

**Files:**
- Modify: `src/features/scraping/core/parsers/parseSpecifications.ts` (function `add`)
- Test: `src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts`

- [ ] **Step 1: Écrire le test**

```ts
it('specs : rejette les noms longs sans valeur structurée (prose composite)', () => {
  const md = `# Produit

## Caractéristiques

| Pratiquement incassable la serre maintient une température | idéale pour vos plantes et protège du soleil |
| Marque | Makita |
| Poids | 3.3kg |
`
  const specs = parseSpecsFromMarkdown(md)
  const names = specs.map(s => s.name)
  expect(names.every(n => n.split(/\s+/).length <= 5)).toBe(true)
  expect(names).toContain('Marque')
  expect(names).toContain('Poids')
})
```

- [ ] **Step 2: Vérifier que le test échoue**

```bash
npx vitest run src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts -t "noms longs sans valeur structurée"
```

Expected: FAIL.

- [ ] **Step 3: Ajouter le check anti-prose composite dans add()**

Dans `parseSpecifications.ts`, fonction `add`, ajouter à la FIN des checks (avant `seen.add(key)`) :

```ts
    // Anti-prose composite : nom > 5 mots ET valeur sans chiffre/unité
    // = très probablement une phrase prose découpée par erreur
    if (n.split(/\s+/).length > 5 && !/[:\d]|\b(mm|cm|kg|g|w|v|hz|ml|l|nm|rpm|db|°|%|bar|psi|mpa)\b/i.test(v)) return
```

- [ ] **Step 4: Test**

```bash
npx vitest run src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts -t "noms longs sans valeur structurée"
```

Expected: PASS.

- [ ] **Step 5: Suite complète**

```bash
npx vitest run src/features/scraping/ src/features/excel/ai-enrichment/
```

Expected: tous verts.

- [ ] **Step 6: Commit**

```bash
git add src/features/scraping/core/parsers/parseSpecifications.ts src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts
git commit -m "fix(scraping): reject long-name + unstructured-value pairs (anti-prose composite)"
```

---

### Task 5 : Fix C.5 — extractGroupName préserve heading complet

**Files:**
- Modify: `src/features/scraping/core/parsers/parseAdvantages.ts:49-56` (function `extractGroupName`)
- Test: `src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts`

- [ ] **Step 1: Écrire le test**

```ts
it('avantages : préserve "Avantages produits" complet quand le strip donnerait juste "produits"', () => {
  const md = `# Produit

## Caractéristiques

**Avantages produits**

- Pratiquement incassable
- Anti-UV
- Démontable
`
  const advs = parseAdvantagesFromMarkdown(md)
  // Au moins un avantage avec le groupe "Avantages produits" (ou similaire qui contient le heading complet)
  const hasCompleteGroup = advs.some(a => /avantages\s+produits/i.test(a.group ?? ''))
  expect(hasCompleteGroup).toBe(true)
  expect(advs.length).toBeGreaterThanOrEqual(3)
})
```

- [ ] **Step 2: Vérifier que le test échoue (ou pas — peut-être déjà OK selon code existant)**

```bash
npx vitest run src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts -t "Avantages produits.*complet"
```

Si PASS dès maintenant : skip le fix mais garder le test (régression). Sinon continuer.

- [ ] **Step 3: Ajuster extractGroupName si besoin**

Dans `src/features/scraping/core/parsers/parseAdvantages.ts`, trouver `extractGroupName` :

```ts
  const extractGroupName = (raw: string): string | undefined => {
    const cleaned = raw
      .replace(/\*\*/g, '')
      .replace(/^les\s*\+\s*/i, '')
      .replace(/^(avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|atouts?|plus\s+produit|caract[eé]ristiques?)\s*/i, '')
      .trim()
    return cleaned.length > 1 && cleaned.length < 80 ? cleaned : undefined
  }
```

Remplacer par :

```ts
  const extractGroupName = (raw: string): string | undefined => {
    const stripped = raw
      .replace(/\*\*/g, '')
      .replace(/^les\s*\+\s*/i, '')
      .replace(/^(avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|atouts?|plus\s+produit|caract[eé]ristiques?)\s*/i, '')
      .trim()
    // Si le strip vide trop le heading (ex: "Avantages produits" -> "produits"
    // qui est ambigu), on garde le heading complet pour préserver la sémantique.
    if (stripped.length < 3 || stripped.split(/\s+/).length === 1) {
      const fullCleaned = raw.replace(/\*\*/g, '').trim()
      return fullCleaned.length > 1 && fullCleaned.length < 80 ? fullCleaned : undefined
    }
    return stripped.length > 1 && stripped.length < 80 ? stripped : undefined
  }
```

- [ ] **Step 4: Test**

```bash
npx vitest run src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts -t "Avantages produits.*complet"
```

Expected: PASS.

- [ ] **Step 5: Suite complète, vérifier qu'on n'a pas cassé Dyson**

```bash
npx vitest run src/features/scraping/ src/features/excel/ai-enrichment/
```

Expected: tous verts.

- [ ] **Step 6: Commit**

```bash
git add src/features/scraping/core/parsers/parseAdvantages.ts src/features/scraping/core/__tests__/dysonRealMarkdown.test.ts
git commit -m "fix(scraping): preserve full heading when extracted group name is ambiguous"
```

---

### Task 6 : Module structuredData.ts — parser pure

**Files:**
- Create: `src/features/scraping/core/structuredData.ts`
- Create: `src/features/scraping/core/__tests__/structuredData.test.ts`

- [ ] **Step 1: Créer le fichier de test**

Créer `src/features/scraping/core/__tests__/structuredData.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { parseStructuredDataFromHtml } from '../structuredData'

describe('parseStructuredDataFromHtml', () => {
  it('extrait Product simple avec @type unique', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Serre Mythos","description":"Serre polycarbonate 2,3 m²","sku":"21373502","brand":{"@type":"Brand","name":"Canopia by Palram"},"image":["https://example.com/img1.jpg","https://example.com/img2.jpg"]}
      </script>
    </head><body></body></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.name).toBe('Serre Mythos')
    expect(data?.description).toBe('Serre polycarbonate 2,3 m²')
    expect(data?.sku).toBe('21373502')
    expect(data?.brand).toBe('Canopia by Palram')
    expect(data?.images).toEqual(['https://example.com/img1.jpg','https://example.com/img2.jpg'])
  })

  it('extrait additionalProperty[] vers specs', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"X","additionalProperty":[
          {"@type":"PropertyValue","name":"Surface","value":"2.3","unitText":"m²"},
          {"@type":"PropertyValue","name":"Matériau","value":"Polycarbonate"}
        ]}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.specs).toEqual([
      { name: 'Surface', value: '2.3 m²' },
      { name: 'Matériau', value: 'Polycarbonate' },
    ])
  })

  it('flatten @graph array', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@graph":[
          {"@type":"Organization","name":"Jardiland"},
          {"@type":"Product","name":"Mythos","description":"desc"}
        ]}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.name).toBe('Mythos')
    expect(data?.description).toBe('desc')
  })

  it('strip HTML dans description', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"X","description":"<p>Texte avec <b>HTML</b></p>"}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.description).toBe('Texte avec HTML')
  })

  it('JSON malformé → null sans crash', () => {
    const html = `<html><head>
      <script type="application/ld+json">{not valid json</script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data).toBeNull()
  })

  it('multi Product → pick celui avec le plus de champs', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"Variant 1"}
      </script>
      <script type="application/ld+json">
        {"@type":"Product","name":"Variant 2","description":"d","sku":"123","brand":"B"}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.name).toBe('Variant 2')
    expect(data?.sku).toBe('123')
  })

  it('aucun JSON-LD → null', () => {
    const html = `<html><head></head><body><p>Hello</p></body></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data).toBeNull()
  })

  it('image string seule → array d\'1 élément', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"X","image":"https://example.com/single.jpg"}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.images).toEqual(['https://example.com/single.jpg'])
  })

  it('brand string sans @type → string', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"X","brand":"Makita"}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.brand).toBe('Makita')
  })

  it('extrait gtin et mpn', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"X","gtin13":"1234567890123","mpn":"DHR202Z"}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.gtin).toBe('1234567890123')
    expect(data?.mpn).toBe('DHR202Z')
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent (le module n'existe pas)**

```bash
npx vitest run src/features/scraping/core/__tests__/structuredData.test.ts
```

Expected: FAIL avec "Cannot find module '../structuredData'" ou "parseStructuredDataFromHtml is not a function".

- [ ] **Step 3: Implémenter le module**

Créer `src/features/scraping/core/structuredData.ts` :

```ts
/**
 * Parse les données Schema.org/JSON-LD embarquées dans le HTML d'une page produit.
 * Source de vérité quand disponible (90%+ des sites e-commerce sérieux).
 */

export interface StructuredProductData {
  name?: string
  description?: string
  brand?: string
  manufacturer?: { name: string; url?: string }
  sku?: string
  gtin?: string
  mpn?: string
  category?: string
  images: string[]
  specs: Array<{ name: string; value: string }>
}

const stripHtml = (s: string): string => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()

const isProduct = (item: unknown): item is Record<string, unknown> => {
  if (!item || typeof item !== 'object') return false
  const t = (item as Record<string, unknown>)['@type']
  if (typeof t === 'string') return t === 'Product'
  if (Array.isArray(t)) return t.includes('Product')
  return false
}

const flattenItems = (items: unknown[]): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    if (Array.isArray(obj['@graph'])) {
      out.push(...flattenItems(obj['@graph']))
    } else {
      out.push(obj)
    }
  }
  return out
}

const scoreProduct = (p: Record<string, unknown>): number => {
  let s = 0
  if (p.name) s++
  if (p.description) s++
  if (p.sku) s++
  if (p.gtin13 || p.gtin || p.gtin12 || p.gtin8) s++
  if (p.mpn) s++
  if (p.brand) s++
  if (p.image) s++
  if (Array.isArray(p.additionalProperty) && p.additionalProperty.length > 0) s += p.additionalProperty.length
  return s
}

const extractImages = (img: unknown): string[] => {
  if (!img) return []
  if (typeof img === 'string') return /^https?:\/\//.test(img) ? [img] : []
  if (Array.isArray(img)) {
    return img
      .map(x => typeof x === 'string' ? x : (x && typeof x === 'object' && typeof (x as Record<string, unknown>).url === 'string' ? (x as Record<string, string>).url : null))
      .filter((u): u is string => !!u && /^https?:\/\//.test(u))
  }
  if (typeof img === 'object' && typeof (img as Record<string, unknown>).url === 'string') {
    const u = (img as Record<string, string>).url
    return /^https?:\/\//.test(u) ? [u] : []
  }
  return []
}

const extractBrand = (brand: unknown): string | undefined => {
  if (!brand) return undefined
  if (typeof brand === 'string') return brand
  if (typeof brand === 'object' && typeof (brand as Record<string, unknown>).name === 'string') {
    return (brand as Record<string, string>).name
  }
  return undefined
}

const extractSpecs = (props: unknown): Array<{ name: string; value: string }> => {
  if (!Array.isArray(props)) return []
  return props
    .map(p => {
      if (!p || typeof p !== 'object') return null
      const obj = p as Record<string, unknown>
      const name = typeof obj.name === 'string' ? obj.name : null
      const valueRaw = obj.value
      const unit = typeof obj.unitText === 'string' ? ' ' + obj.unitText : ''
      const value = valueRaw == null ? '' : String(valueRaw) + unit
      if (!name || !value) return null
      return { name: name.trim(), value: value.trim() }
    })
    .filter((x): x is { name: string; value: string } => x !== null)
}

export function parseStructuredDataFromHtml(html: string): StructuredProductData | null {
  if (typeof DOMParser === 'undefined') return null
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return null
  }

  const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
  const allItems: Record<string, unknown>[] = []
  for (const s of Array.from(scripts)) {
    try {
      const parsed = JSON.parse(s.textContent ?? '')
      if (Array.isArray(parsed)) {
        allItems.push(...flattenItems(parsed))
      } else {
        allItems.push(...flattenItems([parsed]))
      }
    } catch {
      // JSON malformé : skip ce <script>
    }
  }

  const products = allItems.filter(isProduct)
  if (products.length === 0) return null

  // Plusieurs Products : pick celui avec le plus de champs renseignés
  const product = products.length === 1
    ? products[0]
    : products.slice().sort((a, b) => scoreProduct(b) - scoreProduct(a))[0]

  const nameRaw = product.name
  const name = typeof nameRaw === 'string'
    ? nameRaw
    : Array.isArray(nameRaw) && typeof nameRaw[0] === 'string'
      ? nameRaw[0]
      : undefined

  const descRaw = typeof product.description === 'string' ? product.description : undefined
  const description = descRaw ? stripHtml(descRaw) : undefined

  const sku = typeof product.sku === 'string' ? product.sku : undefined
  const gtin = (typeof product.gtin13 === 'string' && product.gtin13)
    || (typeof product.gtin === 'string' && product.gtin)
    || (typeof product.gtin12 === 'string' && product.gtin12)
    || (typeof product.gtin8 === 'string' && product.gtin8)
    || undefined
  const mpn = typeof product.mpn === 'string' ? product.mpn : undefined
  const category = typeof product.category === 'string' ? product.category : undefined

  const brand = extractBrand(product.brand)
  const manufacturerRaw = product.manufacturer
  const manufacturer = (manufacturerRaw && typeof manufacturerRaw === 'object'
    && typeof (manufacturerRaw as Record<string, unknown>).name === 'string')
    ? {
        name: (manufacturerRaw as Record<string, string>).name,
        url: typeof (manufacturerRaw as Record<string, unknown>).url === 'string'
          ? (manufacturerRaw as Record<string, string>).url
          : undefined,
      }
    : undefined

  const images = extractImages(product.image)
  const specs = extractSpecs(product.additionalProperty)

  return { name, description, brand, manufacturer, sku, gtin: gtin || undefined, mpn, category, images, specs }
}
```

- [ ] **Step 4: Lancer les tests**

```bash
npx vitest run src/features/scraping/core/__tests__/structuredData.test.ts
```

Expected: 10/10 PASS.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: pas d'erreur.

- [ ] **Step 6: Commit**

```bash
git add src/features/scraping/core/structuredData.ts src/features/scraping/core/__tests__/structuredData.test.ts
git commit -m "feat(scraping): JSON-LD Schema.org Product parser"
```

---

### Task 7 : Module structuredDataFetcher.ts — fetch HTML brut

**Files:**
- Create: `src/features/scraping/core/structuredDataFetcher.ts`
- Create: `src/features/scraping/core/__tests__/structuredDataFetcher.test.ts`

- [ ] **Step 1: Écrire le test (avec fetch mock)**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractStructuredDataFromUrl } from '../structuredDataFetcher'

const realFetch = global.fetch

describe('extractStructuredDataFromUrl', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    global.fetch = realFetch
  })

  it('utilise allorigins, retourne data si Product trouvé', async () => {
    const html = '<html><head><script type="application/ld+json">{"@type":"Product","name":"X","description":"d"}</script></head></html>'
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })
    const data = await extractStructuredDataFromUrl('https://example.com/p/x')
    expect(data?.name).toBe('X')
    expect(data?.description).toBe('d')
  })

  it('fallback sur corsproxy.io si allorigins échoue', async () => {
    const html = '<html><head><script type="application/ld+json">{"@type":"Product","name":"Y"}</script></head></html>'
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('allorigins down'))
      .mockResolvedValueOnce({ ok: true, text: async () => html })
    const data = await extractStructuredDataFromUrl('https://example.com/p/y')
    expect(data?.name).toBe('Y')
  })

  it('retourne null si tous les proxies échouent', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('p1'))
      .mockRejectedValueOnce(new Error('p2'))
      .mockRejectedValueOnce(new Error('p3'))
    const data = await extractStructuredDataFromUrl('https://example.com/x')
    expect(data).toBeNull()
  })

  it('retourne null si HTML sans Product', async () => {
    const html = '<html><body>Hello</body></html>'
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })
    const data = await extractStructuredDataFromUrl('https://example.com/x')
    expect(data).toBeNull()
  })

  it('respecte le timeout (15s par tentative)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise(() => {})) // never resolves
    const start = Date.now()
    const data = await extractStructuredDataFromUrl('https://example.com/slow', { timeoutMs: 100 })
    const elapsed = Date.now() - start
    expect(data).toBeNull()
    expect(elapsed).toBeLessThan(500)
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
npx vitest run src/features/scraping/core/__tests__/structuredDataFetcher.test.ts
```

Expected: FAIL (module n'existe pas).

- [ ] **Step 3: Implémenter le fetcher**

Créer `src/features/scraping/core/structuredDataFetcher.ts` :

```ts
import { parseStructuredDataFromHtml, type StructuredProductData } from './structuredData'
import { getApiKey } from '@/lib/apiKeys'

const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
]

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<string | null> => {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) return null
    return await r.text()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export interface ExtractOptions {
  timeoutMs?: number
}

/**
 * Fetch raw HTML for a URL via CORS proxy cascade and extract JSON-LD Product data.
 * Returns null if no Product found or all fetches fail.
 */
export async function extractStructuredDataFromUrl(
  url: string,
  opts: ExtractOptions = {},
): Promise<StructuredProductData | null> {
  const timeoutMs = opts.timeoutMs ?? 15_000

  // 1. CORS proxies
  for (const proxy of CORS_PROXIES) {
    const html = await fetchWithTimeout(proxy(url), timeoutMs)
    if (html && html.length > 500) {
      const data = parseStructuredDataFromHtml(html)
      if (data) return data
    }
  }

  // 2. Jina HTML mode (fallback)
  const jinaKey = getApiKey('jina')
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 25_000)
    const headers: Record<string, string> = {
      'X-Return-Format': 'html',
      'Accept': 'text/html',
    }
    if (jinaKey) headers['Authorization'] = 'Bearer ' + jinaKey
    const r = await fetch('https://r.jina.ai/' + url, { headers, signal: ctrl.signal })
    clearTimeout(t)
    if (r.ok) {
      const html = await r.text()
      if (html && html.length > 500) {
        const data = parseStructuredDataFromHtml(html)
        if (data) return data
      }
    }
  } catch {
    // ignore
  }

  return null
}
```

- [ ] **Step 4: Lancer les tests**

```bash
npx vitest run src/features/scraping/core/__tests__/structuredDataFetcher.test.ts
```

Expected: 5/5 PASS.

- [ ] **Step 5: TypeScript**

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: 0 erreur.

- [ ] **Step 6: Commit**

```bash
git add src/features/scraping/core/structuredDataFetcher.ts src/features/scraping/core/__tests__/structuredDataFetcher.test.ts
git commit -m "feat(scraping): fetcher HTML brut via CORS proxy + Jina HTML fallback"
```

---

### Task 8 : Intégration JSON-LD dans useProductEnrichment

**Files:**
- Modify: `src/features/excel/ai-enrichment/useProductEnrichment.ts` (autour de l'appel à `scrapeProductBundle`, ligne ~3920-3940)

- [ ] **Step 1: Identifier le point d'intégration**

Lire les lignes 3920-3950 de `useProductEnrichment.ts` :

```bash
sed -n '3920,3950p' src/features/excel/ai-enrichment/useProductEnrichment.ts
```

Repérer le bloc `if (productUrl && !usedCache)` qui appelle `scrapeProductBundle`.

- [ ] **Step 2: Importer les nouvelles fonctions**

Ajouter en haut du fichier (après les autres imports) :

```ts
import { extractStructuredDataFromUrl, type StructuredProductData } from '@/features/scraping/core/structuredDataFetcher'
```

(adapter le chemin `@/features/scraping/core/structuredDataFetcher` selon les alias TS du projet — vérifier `tsconfig.json` ; si pas d'alias, utiliser un chemin relatif)

- [ ] **Step 3: Lancer en parallèle JSON-LD + Jina**

Dans le bloc qui appelle `scrapeProductBundle`, remplacer :

```ts
            if (multiEnabled) {
              log(`Multi-URL bundle (X-Engine: browser + onglets auto) → ${productUrl}`)
              const bundle = await scrapeProductBundle(productUrl, {
                deepScrape: async (url) => { ... },
                fastScrape: (url) => jinaScrapeMarkdown(url),
                log,
              })
              markdownContent = bundle.mergedMarkdown || null
              ...
            } else {
              ...
            }
```

Par :

```ts
            // Lancer en parallèle JSON-LD (rapide) et Jina markdown (long)
            const structuredPromise = extractStructuredDataFromUrl(productUrl).catch(() => null)
            let bundle: Awaited<ReturnType<typeof scrapeProductBundle>> | null = null
            if (multiEnabled) {
              log(`Multi-URL bundle (X-Engine: browser + onglets auto) → ${productUrl}`)
              bundle = await scrapeProductBundle(productUrl, {
                deepScrape: async (url) => {
                  const r = await jinaScrapeMaufacturerPage(url)
                  return r ? { markdown: r.markdown, html: r.html } : null
                },
                fastScrape: (url) => jinaScrapeMarkdown(url),
                log,
              })
              markdownContent = bundle.mergedMarkdown || null
              if (bundle.sourcesScrapped.length > 1) {
                log(`✓ Bundle : ${bundle.sourcesScrapped.length} sources fusionnées (${bundle.pdfsFound.length} PDFs)`)
              }
              ;(bundle as unknown as { __forCache: { sourcesScrapped: string[] } }).__forCache = { sourcesScrapped: bundle.sourcesScrapped }
              ;(globalThis as unknown as { __lastBundle?: unknown }).__lastBundle = bundle
            } else {
              log(`Scrape single-URL (multi-URL désactivé) → ${productUrl}`)
              const r = await jinaScrapeMaufacturerPage(productUrl)
              markdownContent = r?.markdown ?? null
            }
            const structuredData = await structuredPromise
            if (structuredData) {
              const fields = [
                structuredData.name && 'name',
                structuredData.description && 'description',
                structuredData.brand && 'brand',
                structuredData.sku && 'sku',
                structuredData.images.length > 0 && `${structuredData.images.length} images`,
                structuredData.specs.length > 0 && `${structuredData.specs.length} specs`,
              ].filter(Boolean).join(', ')
              log(`✓ JSON-LD Schema.org extrait : ${fields}`)
              console.log('[enrichment] structured-data:', structuredData)
            }
            // Stocker pour utilisation au moment du build
            ;(globalThis as unknown as { __lastStructured?: StructuredProductData | null }).__lastStructured = structuredData
```

- [ ] **Step 4: Au moment du DIRECT BUILD, fusionner avec JSON-LD**

Trouver le bloc PATH A `if (markdownContent && markdownContent.length > 200)` (autour de ligne 4130) :

```ts
        if (markdownContent && markdownContent.length > 200) {
          const mdSpecs = parseSpecsFromMarkdown(markdownContent)
          const mdAdvantages = parseAdvantagesFromMarkdown(markdownContent)
          const primaryMd = extractPrimarySourceSection(markdownContent)
          let mdDescription = parseDescriptionFromMarkdown(primaryMd)
```

Juste après ces 4 lignes, ajouter le merge JSON-LD :

```ts
          const structured = (globalThis as unknown as { __lastStructured?: StructuredProductData | null }).__lastStructured ?? null

          // Merge JSON-LD prioritaire si disponible
          if (structured) {
            // Description : JSON-LD si présente et > 50 chars
            if (structured.description && structured.description.length > 50) {
              mdDescription = structured.description
            }
            // Specs : ajouter celles de JSON-LD non dupliquées par nom
            if (structured.specs.length > 0) {
              const existingNames = new Set(mdSpecs.map(s => s.name.toLowerCase()))
              for (const sp of structured.specs) {
                if (!existingNames.has(sp.name.toLowerCase())) {
                  mdSpecs.unshift({ name: sp.name, value: sp.value })  // unshift = priorité
                  existingNames.add(sp.name.toLowerCase())
                }
              }
            }
          }
```

- [ ] **Step 5: Aussi merger images JSON-LD au moment du build directBuild**

Toujours dans le PATH A, trouver `const directImages = parseImagesFromMarkdown(markdownContent)`. Juste après :

```ts
            const directImages = parseImagesFromMarkdown(markdownContent)
            // Merge images JSON-LD (priorité, dédupliqué)
            const structuredImages = structured?.images ?? []
            const allImages = [...structuredImages, ...directImages]
            const seenImageStems = new Set<string>()
            const mergedDirectImages: string[] = []
            for (const u of allImages) {
              const stem = u.split('/').pop()?.split('?')[0]?.split('.')[0] ?? u
              if (!seenImageStems.has(stem)) {
                seenImageStems.add(stem)
                mergedDirectImages.push(u)
              }
            }
```

Et plus bas, remplacer `images: [...new Set(directImages)]` par `images: [...new Set(mergedDirectImages)]`.

- [ ] **Step 6: Lancer la suite tests existante (vérifier zéro régression)**

```bash
npx vitest run src/features/scraping/ src/features/excel/ai-enrichment/
```

Expected: tous verts (pas de nouveaux tests d'intégration ici, juste pas casser l'existant).

- [ ] **Step 7: TypeScript**

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: 0 erreur.

- [ ] **Step 8: Commit**

```bash
git add src/features/excel/ai-enrichment/useProductEnrichment.ts
git commit -m "feat(scraping): integrate JSON-LD Schema.org parser in enrichment pipeline"
```

---

### Task 9 : Module firecrawlFallback.ts

**Files:**
- Create: `src/features/scraping/core/firecrawlFallback.ts`
- Create: `src/features/scraping/core/__tests__/firecrawlFallback.test.ts`

- [ ] **Step 1: Écrire les tests (avec fetch mock)**

Créer `src/features/scraping/core/__tests__/firecrawlFallback.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { firecrawlScrape } from '../firecrawlFallback'

const realFetch = global.fetch

describe('firecrawlScrape', () => {
  beforeEach(() => { global.fetch = vi.fn() as unknown as typeof fetch })
  afterEach(() => { global.fetch = realFetch })

  it('retourne le markdown si succès', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { markdown: '# Hello\n\nProduit XYZ' } }),
    })
    const result = await firecrawlScrape('https://example.com/p', 'fc-test-key')
    expect(result?.markdown).toBe('# Hello\n\nProduit XYZ')
  })

  it('retourne null si pas de clé', async () => {
    const result = await firecrawlScrape('https://example.com/p', '')
    expect(result).toBeNull()
  })

  it('retourne null si réponse non-ok', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 429 })
    const result = await firecrawlScrape('https://example.com/p', 'fc-test-key')
    expect(result).toBeNull()
  })

  it('retourne null si fetch throw', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'))
    const result = await firecrawlScrape('https://example.com/p', 'fc-test-key')
    expect(result).toBeNull()
  })

  it('extrait advantages/specs/description si présent dans `extract`', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          markdown: '# x',
          extract: {
            description: 'Une description',
            advantages: ['avantage 1', 'avantage 2'],
            specs: [{ name: 'Poids', value: '1kg' }],
          },
        },
      }),
    })
    const result = await firecrawlScrape('https://example.com/p', 'fc-test-key')
    expect(result?.extract?.description).toBe('Une description')
    expect(result?.extract?.advantages).toEqual(['avantage 1', 'avantage 2'])
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
npx vitest run src/features/scraping/core/__tests__/firecrawlFallback.test.ts
```

Expected: FAIL (module n'existe pas).

- [ ] **Step 3: Implémenter le module**

Créer `src/features/scraping/core/firecrawlFallback.ts` :

```ts
/**
 * Firecrawl v2 scrape API wrapper.
 * Utilisé en fallback quand Jina retourne un markdown trop pauvre (anti-bot Akamai).
 */

export interface FirecrawlExtract {
  description?: string
  advantages?: string[]
  specs?: Array<{ name: string; value: string }>
}

export interface FirecrawlResult {
  markdown: string
  extract?: FirecrawlExtract
}

const FIRECRAWL_API = 'https://api.firecrawl.dev/v2/scrape'
const TIMEOUT_MS = 60_000

export async function firecrawlScrape(
  url: string,
  apiKey: string,
): Promise<FirecrawlResult | null> {
  if (!apiKey) return null

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(FIRECRAWL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'extract'],
        onlyMainContent: true,
        extract: {
          schema: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              advantages: { type: 'array', items: { type: 'string' } },
              specs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    value: { type: 'string' },
                  },
                  required: ['name', 'value'],
                },
              },
            },
          },
        },
      }),
      signal: ctrl.signal,
    })
    if (!r.ok) return null
    const json = await r.json() as { data?: { markdown?: string; extract?: FirecrawlExtract } }
    const markdown = json.data?.markdown ?? ''
    if (!markdown && !json.data?.extract) return null
    return { markdown, extract: json.data?.extract }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
```

- [ ] **Step 4: Lancer les tests**

```bash
npx vitest run src/features/scraping/core/__tests__/firecrawlFallback.test.ts
```

Expected: 5/5 PASS.

- [ ] **Step 5: TypeScript**

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: 0 erreur.

- [ ] **Step 6: Commit**

```bash
git add src/features/scraping/core/firecrawlFallback.ts src/features/scraping/core/__tests__/firecrawlFallback.test.ts
git commit -m "feat(scraping): Firecrawl v2 fallback wrapper"
```

---

### Task 10 : Intégration Firecrawl dans useProductEnrichment

**Files:**
- Modify: `src/features/excel/ai-enrichment/useProductEnrichment.ts`

- [ ] **Step 1: Ajouter import**

```ts
import { firecrawlScrape } from '@/features/scraping/core/firecrawlFallback'
```

- [ ] **Step 2: Ajouter le fallback Firecrawl après l'évaluation du score Jina**

Trouver dans `useProductEnrichment.ts` le bloc `const primaryScore = scoreMd(markdownContent)` (autour de la ligne 3954). Juste après le bloc qui essaye les `additionalSources` alternatifs :

```ts
          // Fallback Firecrawl si score toujours faible
          const FIRECRAWL_THRESHOLD = 15
          const currentScore = scoreMd(markdownContent)
          if (currentScore < FIRECRAWL_THRESHOLD && productUrl) {
            const fcKey = getApiKey('firecrawl')
            if (fcKey) {
              log(`Score insuffisant (${currentScore}) → tentative Firecrawl`)
              const fcResult = await firecrawlScrape(productUrl, fcKey)
              if (fcResult?.markdown) {
                const fcSanitized = sanitizeJinaMarkdown(fcResult.markdown)
                const fcScore = scoreMd(fcSanitized)
                console.log('[enrichment] firecrawl score:', fcScore, '(', fcSanitized.length, 'chars)')
                if (fcScore > currentScore) {
                  log(`✓ Firecrawl meilleur (${fcScore} > ${currentScore}) — bascule sur Firecrawl`)
                  markdownContent = `## [Source: ${productUrl}]\n\n${fcSanitized}`
                }
              }
            }
          }
```

(Adapter le chemin import `@/lib/apiKeys` pour `getApiKey` — il est probablement déjà importé en haut du fichier ; sinon ajouter l'import)

- [ ] **Step 3: Tests existants doivent passer**

```bash
npx vitest run src/features/scraping/ src/features/excel/ai-enrichment/
```

Expected: tous verts.

- [ ] **Step 4: TypeScript**

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: 0 erreur.

- [ ] **Step 5: Commit**

```bash
git add src/features/excel/ai-enrichment/useProductEnrichment.ts
git commit -m "feat(scraping): Firecrawl fallback when Jina score < 15"
```

---

### Task 11 : Module manufacturerFallback.ts

**Files:**
- Create: `src/features/scraping/core/manufacturerFallback.ts`
- Create: `src/features/scraping/core/__tests__/manufacturerFallback.test.ts`

- [ ] **Step 1: Écrire les tests**

Créer `src/features/scraping/core/__tests__/manufacturerFallback.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { buildManufacturerSearchUrl, extractProductReference } from '../manufacturerFallback'

describe('extractProductReference', () => {
  it('extrait référence Makita DHR202Z depuis titre', () => {
    expect(extractProductReference('Perforateur Makita DHR202Z 18V Li-Ion')).toBe('DHR202Z')
  })
  it('extrait référence Bosch GBH-2-26 depuis titre', () => {
    expect(extractProductReference('Bosch GBH 2-26 perforateur')).toBe('GBH 2-26')
  })
  it('retourne null si pas de pattern reconnu', () => {
    expect(extractProductReference('Une serre de jardin polycarbonate')).toBeNull()
  })
})

describe('buildManufacturerSearchUrl', () => {
  it('construit URL search Makita', () => {
    const url = buildManufacturerSearchUrl('makita', 'DHR202Z')
    expect(url).toMatch(/makita\.fr/i)
    expect(url).toContain('DHR202Z')
  })
  it('retourne null si marque inconnue', () => {
    const url = buildManufacturerSearchUrl('unknown-brand', 'XYZ')
    expect(url).toBeNull()
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
npx vitest run src/features/scraping/core/__tests__/manufacturerFallback.test.ts
```

Expected: FAIL (module n'existe pas).

- [ ] **Step 3: Implémenter le module**

Créer `src/features/scraping/core/manufacturerFallback.ts` :

```ts
import { BRAND_OFFICIAL_SITES } from '@/features/scraping/useJina'

/**
 * Extrait une référence produit (ex: "DHR202Z", "GBH 2-26") depuis un titre
 * via regex. Retourne null si aucun pattern reconnu.
 */
export function extractProductReference(title: string): string | null {
  if (!title) return null
  // Pattern : 2-5 lettres majuscules suivies de chiffres, optionnellement
  // séparées par tiret/espace, parfois suivies de lettres/chiffres
  const m = title.match(/\b([A-Z]{2,5}[\s-]?\d{1,4}[\w-]*)\b/)
  return m ? m[1].trim() : null
}

/**
 * Construit une URL de recherche sur le site fabricant pour une référence donnée.
 * Retourne null si la marque n'est pas dans BRAND_OFFICIAL_SITES.
 */
export function buildManufacturerSearchUrl(brand: string, reference: string): string | null {
  const site = BRAND_OFFICIAL_SITES[brand.toLowerCase()]
  if (!site) return null
  // Heuristique : la plupart des sites supportent ?q=REF ou /search?q=REF
  const base = site.baseUrl.replace(/\/$/, '')
  return `${base}/search?q=${encodeURIComponent(reference)}`
}
```

- [ ] **Step 4: Lancer les tests**

```bash
npx vitest run src/features/scraping/core/__tests__/manufacturerFallback.test.ts
```

Expected: 5/5 PASS.

- [ ] **Step 5: TypeScript**

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: 0 erreur.

- [ ] **Step 6: Commit**

```bash
git add src/features/scraping/core/manufacturerFallback.ts src/features/scraping/core/__tests__/manufacturerFallback.test.ts
git commit -m "feat(scraping): manufacturer URL builder & reference extractor"
```

---

### Task 12 : Intégration manufacturer fallback dans useProductEnrichment

**Files:**
- Modify: `src/features/excel/ai-enrichment/useProductEnrichment.ts`

- [ ] **Step 1: Imports**

Ajouter en haut :

```ts
import { extractProductReference, buildManufacturerSearchUrl } from '@/features/scraping/core/manufacturerFallback'
import { detectBrandFromUrl } from '@/features/scraping/useJina'
```

- [ ] **Step 2: Ajouter le fallback manufacturer après Firecrawl**

Juste après le bloc Firecrawl (Task 10), ajouter :

```ts
          // Fallback fabricant si toujours rien et URL = revendeur
          const MANUFACTURER_THRESHOLD = 5
          const scoreAfterFc = scoreMd(markdownContent)
          if (scoreAfterFc < MANUFACTURER_THRESHOLD && productUrl) {
            const detected = detectBrandFromUrl(productUrl)
            const ref = extractProductReference(title)
            if (detected && ref) {
              const mfgSearchUrl = buildManufacturerSearchUrl(detected.brand, ref)
              if (mfgSearchUrl) {
                log(`Score toujours faible (${scoreAfterFc}) → essai site fabricant ${detected.brand} : ${mfgSearchUrl}`)
                try {
                  const mfgMd = await jinaScrapeMarkdown(mfgSearchUrl)
                  if (mfgMd) {
                    const mfgSanitized = sanitizeJinaMarkdown(mfgMd)
                    const mfgScore = scoreMd(mfgSanitized)
                    console.log('[enrichment] manufacturer score:', mfgScore, '(', mfgSanitized.length, 'chars)')
                    if (mfgScore > scoreAfterFc) {
                      log(`✓ Site fabricant meilleur (${mfgScore} > ${scoreAfterFc})`)
                      markdownContent = `## [Source: ${mfgSearchUrl}]\n\n${mfgSanitized}`
                    }
                  }
                } catch (err) {
                  console.warn('[enrichment] manufacturer fallback failed:', err)
                }
              }
            }
          }
```

- [ ] **Step 3: Tests existants**

```bash
npx vitest run src/features/scraping/ src/features/excel/ai-enrichment/
```

Expected: tous verts.

- [ ] **Step 4: TypeScript**

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: 0 erreur.

- [ ] **Step 5: Commit**

```bash
git add src/features/excel/ai-enrichment/useProductEnrichment.ts
git commit -m "feat(scraping): manufacturer site fallback when score < 5 on reseller URL"
```

---

### Task 13 : Tests E2E sur 4 produits réels

**Files:**
- Create: `src/features/scraping/core/__tests__/e2e-real-products.test.ts`

- [ ] **Step 1: Créer le test E2E**

Ce test n'est PAS lancé en CI (il fait des fetch externes). Marqué `it.skip` par défaut, à relancer manuellement après chaque tâche pour mesurer la qualité.

Créer `src/features/scraping/core/__tests__/e2e-real-products.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { sanitizeJinaMarkdown } from '@/features/excel/ai-enrichment/markdownSanitize'
import { parseSpecsFromMarkdown } from '../parsers/parseSpecifications'
import { parseAdvantagesFromMarkdown } from '../parsers/parseAdvantages'
import { parseDescriptionFromMarkdown } from '../parsers/parseDescription'
import { extractStructuredDataFromUrl } from '../structuredDataFetcher'

const PRODUCTS = [
  { name: 'Dyson Spot+Scrub', url: 'https://www.dyson.fr/aspirateurs/robots/spot-scrub-ai/noir', expectSpecs: 10, expectAdvs: 10 },
  { name: 'RS Makita Tronçonneuse', url: 'https://fr.rs-online.com/web/p/tronconneuses/2522571', expectSpecs: 7, expectAdvs: 0 },
  { name: 'Jardiland Mythos', url: 'https://www.jardiland.com/p/serre-de-jardin-polycarbonate-aluminium-vert-2-3-m-mythos-avec-embase-canopia-by-palram-21373502', expectSpecs: 5, expectAdvs: 3 },
  { name: 'Leroy Merlin DHR202Z', url: 'https://www.leroymerlin.fr/produits/perforateur-sans-fil-sans-batterie-makita-dhr202z-18-v-70255710.html', expectSpecs: 3, expectAdvs: 0 },
]

describe.skip('E2E real products (manual run)', () => {
  for (const p of PRODUCTS) {
    it(`${p.name}: enrichissement complet`, async () => {
      // Fetch via Jina basic (proxy local of cascade behavior)
      const r = await fetch('https://r.jina.ai/' + p.url, { headers: { 'Accept': 'application/json' } })
      const json = await r.json() as { data?: { content?: string } }
      const md = json.data?.content ?? ''
      const sanitized = sanitizeJinaMarkdown(md)
      const specs = parseSpecsFromMarkdown(sanitized)
      const advs = parseAdvantagesFromMarkdown(sanitized)
      const desc = parseDescriptionFromMarkdown(sanitized)
      const structured = await extractStructuredDataFromUrl(p.url)

      console.log(`\n[E2E ${p.name}]`)
      console.log(`  markdown: ${md.length} chars`)
      console.log(`  specs (md): ${specs.length}`)
      console.log(`  specs (json-ld): ${structured?.specs.length ?? 0}`)
      console.log(`  advs: ${advs.length}`)
      console.log(`  desc: ${desc.length} chars`)

      const totalSpecs = specs.length + (structured?.specs?.length ?? 0)
      expect(totalSpecs).toBeGreaterThanOrEqual(p.expectSpecs)
      expect(advs.length).toBeGreaterThanOrEqual(p.expectAdvs)
    }, 60_000)
  }
})
```

- [ ] **Step 2: Lancer le test E2E manuellement (skipped → enlever .skip temporairement)**

Modifier `describe.skip` en `describe` et lancer :

```bash
npx vitest run src/features/scraping/core/__tests__/e2e-real-products.test.ts --reporter=verbose
```

Observer la sortie pour chaque produit. Si un seuil n'est pas atteint, ajuster les seuils dans le test ou identifier ce qui manque.

- [ ] **Step 3: Re-mettre `.skip` (le test ne tourne pas en CI)**

Remettre `describe.skip` pour que le test ne s'exécute pas automatiquement.

- [ ] **Step 4: Commit**

```bash
git add src/features/scraping/core/__tests__/e2e-real-products.test.ts
git commit -m "test: E2E manual smoke tests for 4 real product URLs"
```

---

### Task 14 : Self-review final + cleanup

**Files:**
- (review uniquement, pas de fichier)

- [ ] **Step 1: Lancer toute la suite tests**

```bash
npx vitest run src/features/scraping/ src/features/excel/ai-enrichment/
```

Expected: tous verts. Compter le nombre total (>= 191 + nouveaux tests Tasks 1-12).

- [ ] **Step 2: Vérifier TypeScript**

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: 0 erreur.

- [ ] **Step 3: Vérifier qu'aucun fichier n'a été oublié dans .gitignore**

```bash
git status
```

Expected: working tree clean.

- [ ] **Step 4: Lancer build prod (sanity check)**

```bash
npm run build
```

Expected: build OK, pas d'erreur. (Si le projet n'a pas de target build, skip)

- [ ] **Step 5: Test manuel dans le browser**

1. Hard refresh `Cmd+Shift+R`
2. Vider caches : `await import('/src/features/excel/ai-enrichment/enrichmentStore.ts').then(m => m.useEnrichmentStore.setState({ scrapeCache: {}, entries: {} }))`
3. Enrichir Jardiland Mythos
4. Vérifier dans la console : log `✓ JSON-LD Schema.org extrait`, score Firecrawl si déclenché, manufacturer fallback si déclenché
5. Vérifier dans l'UI : description propre, ≥ 5 specs structurées, ≥ 3 avantages

- [ ] **Step 6: Pousser sur la branche**

```bash
git log --oneline -20
git push origin master
```

---

## Resume

13 tasks for the implementation, 1 final review task. Each commit is atomic and revertable. The plan can be paused/resumed at any task boundary because each task ends with passing tests + commit.

**Order rationale:**
- Tasks 1-5 (Axe C parser hardening) — isolated changes, high confidence, set the foundation
- Tasks 6-8 (Axe B JSON-LD) — new module + integration, biggest quality lift
- Tasks 9-10 (Firecrawl) — fallback for anti-bot sites
- Tasks 11-12 (Manufacturer) — last-resort fallback
- Tasks 13-14 — measurement + sanity checks

If something breaks at any task: revert that commit, fix, retry.
