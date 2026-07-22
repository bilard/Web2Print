# Kramp — scraping authentifié (Firecrawl actions + match exact) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Récupérer les prix kramp.com connecté (login Firecrawl actions), apparier par référence fabricante EXACTE, et les faire remonter dans le dashboard « Veille tarifaire » via le node « Recherche dirigée ».

**Architecture:** kramp est un site « authentifié » reconnu par la présence d'identifiants dans `users/{uid}.siteCredentials.kramp`. Un lot de produits/tick est traité en 2 phases, chacune = UN appel Firecrawl `/v2/scrape` avec une chaîne d'`actions` (login une fois, puis navigation `executeJavascript` + `scrape` par cible) : phase 1 = recherche par réf (repli EAN) → URLs fiches ; phase 2 = fiches → prix « Prix brut » (HT). Appariement par `proveMatch` (égalité normalisée réf/EAN, `normalizeRef` retire les points : `092.48.801`→`09248801`). Le node exclut les sites authentifiés de la passe générique Firecrawl pour éviter le double traitement.

**Tech Stack:** TypeScript (functions, Node 20), Firecrawl `/v2/scrape` actions (proxy stealth), Firebase Admin (Firestore), Vitest (functions/vitest.config.ts).

## Global Constraints

- **Secrets** : identifiants lus depuis `users/{uid}.siteCredentials.kramp` = `{login, password, loginUrl, host}`. **JAMAIS** journaliser login/password ; **jamais** de valeur d'identifiant dans le git.
- **Zéro faux positif** : appariement uniquement via `proveMatch` (keys.ts) — égalité exacte normalisée. Pas de LLM juge, pas de « premier résultat », pas de file « À confirmer » pour kramp.
- **Prix kramp = HT** (B2B, libellé « Prix brut ») → `taxIncluded: false` sur les listings kramp.
- **Serveur-only** : tout le code kramp vit dans `functions/src/` (le node client ne câble pas le générique). Pas de jumeau client.
- **Coût borné** : login amorti (1 login / lot via chaîne d'actions), ≤ `productBudget` produits/tick, abort-signal (`ctx.signal`) respecté.
- **Vérif types** : `cd functions && npx tsc -b` (exit 0). **Tests** : `cd functions && npx vitest run <path>`.
- Réponses/commentaires en **français**.

---

### Task 1: Lecture des identifiants de site

**Files:**
- Create: `functions/src/scraper/siteCredentials.ts`

**Interfaces:**
- Produces: `interface SiteCredentials { login: string; password: string; loginUrl: string; host: string }` ; `getSiteCredentials(uid: string, host: string): Promise<SiteCredentials | null>`

- [ ] **Step 1: Créer le helper** (lecture Firestore, miroir de `getUserApiKey`)

```ts
// functions/src/scraper/siteCredentials.ts
import { getFirestore } from 'firebase-admin/firestore'

export interface SiteCredentials {
  login: string
  password: string
  loginUrl: string
  host: string
}

/** Identifiants d'un site authentifié (ex. kramp) depuis users/{uid}.siteCredentials[host].
 *  null si absent ou incomplet. Serveur-only ; ne JAMAIS journaliser le retour. */
export async function getSiteCredentials(uid: string, host: string): Promise<SiteCredentials | null> {
  const snap = await getFirestore().doc(`users/${uid}`).get()
  const all = (snap.data()?.siteCredentials ?? {}) as Record<string, { login?: string; password?: string; loginUrl?: string }>
  const c = all[host]
  if (!c?.login || !c?.password) return null
  return { login: c.login, password: c.password, loginUrl: c.loginUrl ?? 'https://login.kramp.com/', host }
}
```

- [ ] **Step 2: Vérifier les types**

Run: `cd functions && npx tsc -b`
Expected: exit 0, aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add functions/src/scraper/siteCredentials.ts
git commit -m "feat(veille): lecture des identifiants de site authentifié (siteCredentials)"
```

---

### Task 2: Parsers kramp purs (URLs recherche, fiche produit)

**Files:**
- Create: `functions/src/priceWatch/catalog/krampParse.ts`
- Test: `functions/src/priceWatch/catalog/krampParse.test.ts`

**Interfaces:**
- Consumes: `CompetitorListing` depuis `./prestashop` (champs utilisés : `url, name, ref, price, currency, taxIncluded`).
- Produces:
  - `krampRefFromUrl(url: string): string`
  - `parseFrPrice(raw: string): number | null`
  - `parseKrampSearchUrls(markdown: string): string[]`
  - `parseKrampProduct(markdown: string, url: string): CompetitorListing | null`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// functions/src/priceWatch/catalog/krampParse.test.ts
import { describe, it, expect } from 'vitest'
import { krampRefFromUrl, parseFrPrice, parseKrampSearchUrls, parseKrampProduct } from './krampParse'

// Markdown représentatif d'une page de RECHERCHE kramp connectée (structure observée live).
const SEARCH_MD = `### Résultats de recherche
[Courroie trapézoïdale](https://www.kramp.com/shop-fr/fr/p/courroie-trapezoidale--09248801)
Prix brut 12,06 €`

// Markdown représentatif d'une FICHE produit kramp connectée (structure observée live).
const PRODUCT_MD = `## Réservoir d'huile hydro stiga villa
- 1150 HST
- Adaptable sur Villa
Plus de détails
#### Prix brut
## 93,57 €
`

describe('krampParse', () => {
  it('krampRefFromUrl : réf = segment après « -- »', () => {
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/p/x--09248801')).toBe('09248801')
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/p/r%C3%A9servoir--1134381601')).toBe('1134381601')
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/no-ref')).toBe('')
  })
  it('parseFrPrice : nombre français → number', () => {
    expect(parseFrPrice('1 234,56 €')).toBe(1234.56)
    expect(parseFrPrice('93,57')).toBe(93.57)
    expect(parseFrPrice('gratuit')).toBeNull()
  })
  it('parseKrampSearchUrls : URLs fiches /p/…--ref du markdown', () => {
    expect(parseKrampSearchUrls(SEARCH_MD)).toEqual([
      'https://www.kramp.com/shop-fr/fr/p/courroie-trapezoidale--09248801',
    ])
    expect(parseKrampSearchUrls('aucun résultat')).toEqual([])
  })
  it('parseKrampProduct : prix « Prix brut » (HT), réf, nom', () => {
    const l = parseKrampProduct(PRODUCT_MD, 'https://www.kramp.com/shop-fr/fr/p/reservoir--1134381601')
    expect(l).not.toBeNull()
    expect(l!.ref).toBe('1134381601')
    expect(l!.price).toBe(93.57)
    expect(l!.taxIncluded).toBe(false)
    expect(l!.currency).toBe('EUR')
    expect(l!.name.toLowerCase()).toContain('stiga')
  })
  it('parseKrampProduct : null si pas de prix', () => {
    expect(parseKrampProduct('## Produit sans prix', 'https://www.kramp.com/shop-fr/fr/p/x--1')).toBeNull()
  })
})
```

- [ ] **Step 2: Lancer le test → échec attendu**

Run: `cd functions && npx vitest run src/priceWatch/catalog/krampParse.test.ts`
Expected: FAIL (`krampParse` introuvable / fonctions non définies).

- [ ] **Step 3: Écrire l'implémentation minimale**

```ts
// functions/src/priceWatch/catalog/krampParse.ts
// Parsers PURS des pages kramp CONNECTÉES (via Firecrawl markdown). Serveur-only.
// Prix = libellé « Prix brut » (HT, tarif B2B). Textes VERBATIM (aucune reformulation IA).
import type { CompetitorListing } from './prestashop'

/** Réf kramp = segment après le dernier « -- » de l'URL fiche : /p/<slug>--<ref>. */
export function krampRefFromUrl(url: string): string {
  const m = url.match(/--([^/?#]+)(?:[/?#]|$)/)
  return m ? decodeURIComponent(m[1]) : ''
}

/** Prix français « 1 234,56 » → 1234.56 ; null si non parsable ou ≤ 0. */
export function parseFrPrice(raw: string): number | null {
  const s = String(raw).replace(/[^\d.,\s]/g, '').replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  const n = Number(s)
  return isFinite(n) && n > 0 ? n : null
}

/** URLs de fiches produit (/p/<slug>--<ref>) présentes dans le markdown d'une recherche. */
export function parseKrampSearchUrls(markdown: string): string[] {
  const re = /https:\/\/www\.kramp\.com\/shop-fr\/fr\/p\/[^\s)"']*--[^\s)"']+/g
  return [...new Set(markdown.match(re) ?? [])]
}

/** Fiche produit kramp connectée → listing appariable. Prix = montant € après « Prix brut ».
 *  null si aucun prix (pas une fiche exploitable). */
export function parseKrampProduct(markdown: string, url: string): CompetitorListing | null {
  const ref = krampRefFromUrl(url)
  const nameM = markdown.match(/^#{1,3}\s+(?!Prix brut)(.+)$/m)
  const name = nameM ? nameM[1].trim() : ''
  const priceM = markdown.match(/Prix brut[^\d]{0,40}?([\d\s.]+,\d{2})\s*€/i)
  const price = priceM ? parseFrPrice(priceM[1]) : null
  if (price == null) return null
  return { url, name, ref, price, currency: 'EUR', taxIncluded: false }
}
```

- [ ] **Step 4: Lancer le test → succès attendu**

Run: `cd functions && npx vitest run src/priceWatch/catalog/krampParse.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Vérifier les types + commit**

```bash
cd functions && npx tsc -b
cd /Applications/_IA/Claude_workspace/Web2Print
git add functions/src/priceWatch/catalog/krampParse.ts functions/src/priceWatch/catalog/krampParse.test.ts
git commit -m "feat(veille): parsers kramp purs (URLs recherche, prix fiche HT)"
```

---

### Task 3: Fetcher authentifié Firecrawl (login amorti + batch scrape)

**Files:**
- Create: `functions/src/scraper/krampFirecrawl.ts`

**Interfaces:**
- Consumes: `SiteCredentials` (Task 1).
- Produces: `krampBatchScrape(targetUrls: string[], creds: SiteCredentials, firecrawlKey: string, timeoutMs?: number): Promise<Map<string, string>>` (clé = URL cible, valeur = markdown de la page connectée).

- [ ] **Step 1: Écrire l'implémentation** (pas de test unitaire — appel réseau externe ; validé par smoke live en Step 2)

```ts
// functions/src/scraper/krampFirecrawl.ts
// Fetcher AUTHENTIFIÉ kramp via Firecrawl /v2/scrape `actions` : UN appel = login kramp
// une seule fois, puis navigation `executeJavascript` (location.assign) + `scrape` par
// cible → prix connectés. Firecrawl renvoie data.actions.scrapes[] dans l'ORDRE des
// actions scrape (mapping par index, fiable). Bright Data est INUTILISABLE ici (il
// interdit la saisie de mot de passe). Ne JAMAIS journaliser creds.
import * as logger from 'firebase-functions/logger'
import type { SiteCredentials } from './siteCredentials'

const FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v2/scrape'
// Nb de pages par appel Firecrawl : chaque page = ~8 s d'attente ; au-delà de ~6 la
// chaîne d'actions devient trop longue (timeout Firecrawl). Le login est réamorti par
// chunk — reste très inférieur au login-par-réf.
const CHUNK = 6

/** UN appel Firecrawl par chunk : login kramp puis, pour chaque URL du chunk,
 *  navigation `executeJavascript` + `scrape`. Renvoie map(url cible → markdown). */
async function scrapeChunk(chunk: string[], creds: SiteCredentials, firecrawlKey: string, timeoutMs: number): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const actions: Record<string, unknown>[] = [
    { type: 'wait', milliseconds: 2500 },
    { type: 'click', selector: '#username' }, { type: 'write', text: creds.login },
    { type: 'click', selector: 'input[type=password]' }, { type: 'write', text: creds.password },
    { type: 'click', selector: 'button[name=login-btn]' }, { type: 'wait', milliseconds: 6000 },
  ]
  for (const u of chunk) {
    actions.push({ type: 'executeJavascript', script: `window.location.assign(${JSON.stringify(u)})` })
    actions.push({ type: 'wait', milliseconds: 8000 })
    actions.push({ type: 'scrape' })
  }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(FIRECRAWL_SCRAPE, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({
        url: creds.loginUrl || 'https://login.kramp.com/',
        proxy: 'stealth', waitFor: 2000, actions, formats: ['markdown'],
      }),
    })
    if (!res.ok) { logger.warn(`[kramp] Firecrawl ${res.status}`); return out }
    const json = (await res.json()) as { data?: { actions?: { scrapes?: { markdown?: string }[] } } }
    const scrapes = json.data?.actions?.scrapes ?? []
    scrapes.forEach((s, i) => { const key = chunk[i]; if (key) out.set(key, s.markdown ?? '') })
    return out
  } catch (e) {
    logger.warn(`[kramp] Firecrawl erreur réseau : ${e instanceof Error ? e.message : e}`)
    return out
  } finally { clearTimeout(t) }
}

/** Login amorti + scrape par lots (chunks de CHUNK pages). Renvoie map(url → markdown). */
export async function krampBatchScrape(
  targetUrls: string[], creds: SiteCredentials, firecrawlKey: string, timeoutMs = 200_000,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!firecrawlKey || targetUrls.length === 0) return out
  for (let i = 0; i < targetUrls.length; i += CHUNK) {
    const part = await scrapeChunk(targetUrls.slice(i, i + CHUNK), creds, firecrawlKey, timeoutMs)
    for (const [k, v] of part) out.set(k, v)
  }
  return out
}
```

- [ ] **Step 2: Smoke live (validation manuelle du mécanisme)** — script jetable dans le scratchpad

Écrire un script Node (`.cjs` ou via `ts-node`) qui lit la clé Firecrawl + les creds depuis Firestore (token gcloud, comme les scripts de reconnaissance existants) et appelle une réimplémentation identique de `krampBatchScrape` sur deux URLs de recherche (`…/search/1134381601`, `…/search/092.48.801`). 
Expected : la map renvoie 2 entrées ; le markdown de `1134381601` contient `…/p/…--1134381601`.
(Le smoke valide le mécanisme Firecrawl réel ; il n'est pas commité.)

- [ ] **Step 3: Vérifier les types + commit**

```bash
cd functions && npx tsc -b
cd /Applications/_IA/Claude_workspace/Web2Print
git add functions/src/scraper/krampFirecrawl.ts
git commit -m "feat(veille): fetcher authentifié kramp via Firecrawl actions (login amorti)"
```

---

### Task 4: Passe kramp authentifiée (orchestration 2 phases + preuve exacte)

**Files:**
- Create: `functions/src/priceWatch/catalog/krampAuthPass.ts`
- Test: `functions/src/priceWatch/catalog/krampAuthPass.test.ts`

**Interfaces:**
- Consumes: `DirectedSourceProduct` depuis `./searchDirected` ; `candidateKeys, proveMatch` depuis `./keys` ; `parseKrampSearchUrls, parseKrampProduct` depuis `./krampParse` ; `CompetitorListing` depuis `./prestashop`.
- Produces:
  - `interface KrampScrapeDep { scrape: (urls: string[]) => Promise<Map<string, string>>; signal?: { aborted: boolean }; log?: (m: string) => void }`
  - `interface KrampHit { productId: string; listing: CompetitorListing; evidence: string }`
  - `krampAuthPass(products: DirectedSourceProduct[], deps: KrampScrapeDep): Promise<KrampHit[]>`

- [ ] **Step 1: Écrire le test qui échoue** (fake scrape injecté → aucun réseau)

```ts
// functions/src/priceWatch/catalog/krampAuthPass.test.ts
import { describe, it, expect } from 'vitest'
import { krampAuthPass } from './krampAuthPass'
import type { DirectedSourceProduct } from './searchDirected'

const SEARCH_MD = '[Réservoir](https://www.kramp.com/shop-fr/fr/p/reservoir-hydro-stiga--1134381601)'
const PRODUCT_MD = '## Réservoir hydro stiga\n#### Prix brut\n## 93,57 €'
const searchUrl = (q: string) => `https://www.kramp.com/shop-fr/fr/search/${encodeURIComponent(q)}`
const PROD_URL = 'https://www.kramp.com/shop-fr/fr/p/reservoir-hydro-stiga--1134381601'

// Fake : recherche → markdown liste ; fiche → markdown produit.
function fakeScrape(map: Record<string, string>) {
  return async (urls: string[]) => new Map(urls.map((u) => [u, map[u] ?? '']))
}

describe('krampAuthPass', () => {
  it('apparie par réf exacte (points normalisés) et renvoie le prix HT', async () => {
    const products: DirectedSourceProduct[] = [{ id: 'p1', ref: '113438160/1', ean: '8008989408024' }]
    const scrape = fakeScrape({ [searchUrl('1134381601')]: SEARCH_MD, [PROD_URL]: PRODUCT_MD })
    const hits = await krampAuthPass(products, { scrape })
    expect(hits).toHaveLength(1)
    expect(hits[0].productId).toBe('p1')
    expect(hits[0].listing.price).toBe(93.57)
    expect(hits[0].listing.taxIncluded).toBe(false)
  })

  it('aucun hit si la fiche n’apparie aucune clé (zéro faux positif)', async () => {
    const products: DirectedSourceProduct[] = [{ id: 'p2', ref: '999999' }]
    const scrape = fakeScrape({ [searchUrl('999999')]: SEARCH_MD, [PROD_URL]: PRODUCT_MD }) // fiche = ref 1134381601 ≠ 999999
    const hits = await krampAuthPass(products, { scrape })
    expect(hits).toHaveLength(0)
  })

  it('respecte le signal d’abort', async () => {
    const products: DirectedSourceProduct[] = [{ id: 'p1', ref: '1134381601' }]
    const scrape = fakeScrape({})
    const hits = await krampAuthPass(products, { scrape, signal: { aborted: true } })
    expect(hits).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Lancer le test → échec attendu**

Run: `cd functions && npx vitest run src/priceWatch/catalog/krampAuthPass.test.ts`
Expected: FAIL (`krampAuthPass` introuvable).

- [ ] **Step 3: Écrire l'implémentation**

```ts
// functions/src/priceWatch/catalog/krampAuthPass.ts
// Passe kramp AUTHENTIFIÉE d'un lot de produits, en 2 phases (chacune = 1 appel scrape,
// login amorti) : (1) recherche par réf, repli EAN → URLs fiches ; (2) fiches → prix.
// Appariement par PREUVE EXACTE (proveMatch, réf/EAN normalisés). Serveur-only.
import type { DirectedSourceProduct } from './searchDirected'
import type { CompetitorListing } from './prestashop'
import { candidateKeys, proveMatch } from './keys'
import { parseKrampSearchUrls, parseKrampProduct } from './krampParse'

export interface KrampScrapeDep {
  /** login + navigation + scrape → map(url cible → markdown connecté). Injecté. */
  scrape: (urls: string[]) => Promise<Map<string, string>>
  signal?: { aborted: boolean }
  log?: (m: string) => void
}
export interface KrampHit {
  productId: string
  listing: CompetitorListing
  evidence: string
}

const searchUrl = (q: string): string => `https://www.kramp.com/shop-fr/fr/search/${encodeURIComponent(q)}`

/** Sépare les valeurs de clés en réfs (essayées d'abord) et EAN (repli). */
function refThenEan(keys: ReturnType<typeof candidateKeys>): { refs: string[]; eans: string[] } {
  const refs: string[] = [], eans: string[] = []
  for (const k of keys) (k.kind === 'ean' ? eans : refs).push(k.value)
  return { refs: [...new Set(refs)], eans: [...new Set(eans)] }
}

export async function krampAuthPass(products: DirectedSourceProduct[], deps: KrampScrapeDep): Promise<KrampHit[]> {
  if (deps.signal?.aborted || products.length === 0) return []
  const keysByProduct = new Map(products.map((p) => [p.id, candidateKeys(p)]))

  // Phase 1 : une recherche par réf (1re) + une par EAN (repli) pour chaque produit,
  // toutes dans UN appel scrape (login amorti).
  const phase1: { productId: string; refQ?: string; eanQ?: string }[] = []
  const searchTargets: string[] = []
  for (const p of products) {
    const { refs, eans } = refThenEan(keysByProduct.get(p.id)!)
    const refQ = refs[0], eanQ = eans[0]
    if (!refQ && !eanQ) continue
    phase1.push({ productId: p.id, refQ, eanQ })
    if (refQ) searchTargets.push(searchUrl(refQ))
    if (eanQ) searchTargets.push(searchUrl(eanQ))
  }
  if (searchTargets.length === 0 || deps.signal?.aborted) return []
  const searchMd = await deps.scrape([...new Set(searchTargets)])

  // Produit → 1re URL fiche trouvée (réf d'abord, sinon EAN).
  const productUrlByProduct = new Map<string, string>()
  for (const x of phase1) {
    const fromRef = x.refQ ? parseKrampSearchUrls(searchMd.get(searchUrl(x.refQ)) ?? '') : []
    const fromEan = x.eanQ ? parseKrampSearchUrls(searchMd.get(searchUrl(x.eanQ)) ?? '') : []
    const url = fromRef[0] ?? fromEan[0]
    if (url) productUrlByProduct.set(x.productId, url)
  }
  if (productUrlByProduct.size === 0 || deps.signal?.aborted) return []

  // Phase 2 : scrape des fiches → prix, puis preuve exacte.
  const prodUrls = [...new Set(productUrlByProduct.values())]
  const prodMd = await deps.scrape(prodUrls)
  const hits: KrampHit[] = []
  for (const [productId, url] of productUrlByProduct) {
    const listing = parseKrampProduct(prodMd.get(url) ?? '', url)
    if (!listing) continue
    const proof = proveMatch(keysByProduct.get(productId)!, {
      sku: listing.ref, gtin13: listing.gtin13, url: listing.url, name: listing.name,
    })
    if (proof) {
      hits.push({ productId, listing, evidence: proof.evidence })
      deps.log?.(`kramp : ${listing.name} ${listing.price}€ (preuve ${proof.evidence})`)
    }
  }
  return hits
}
```

- [ ] **Step 4: Lancer le test → succès attendu**

Run: `cd functions && npx vitest run src/priceWatch/catalog/krampAuthPass.test.ts`
Expected: PASS (3 tests). Si `proveMatch` ne matche pas `113438160/1`↔`1134381601` : vérifier `normalizeRef` (retire déjà les non-alphanumériques) — le test doit passer sans modifier keys.ts.

- [ ] **Step 5: Vérifier types + commit**

```bash
cd functions && npx tsc -b
cd /Applications/_IA/Claude_workspace/Web2Print
git add functions/src/priceWatch/catalog/krampAuthPass.ts functions/src/priceWatch/catalog/krampAuthPass.test.ts
git commit -m "feat(veille): passe kramp authentifiée (2 phases, preuve exacte réf/EAN)"
```

---

### Task 5: Intégration dans le node « Recherche dirigée » + déploiement + validation live

**Files:**
- Modify: `functions/src/workflow/nodes/directedSearch.ts`

**Interfaces:**
- Consumes: `getSiteCredentials` (Task 1), `krampBatchScrape` (Task 3), `krampAuthPass, KrampHit` (Task 4).

- [ ] **Step 1: Câbler la passe kramp dans le node**

Dans `functions/src/workflow/nodes/directedSearch.ts` : après le calcul de `sites` et avant/autour de l'appel `directedPass`, (a) détecter les sites authentifiés via `getSiteCredentials`, (b) les EXCLURE de `directedPass` (pas de double traitement), (c) lancer `krampAuthPass` sur la même tranche de produits, (d) fusionner les hits dans `pass.results` (même persistance `savePage` + lignes résultat + curseur).

Remplacer le bloc de construction de `sites`/`pass` par :

```ts
    // Sites AUTHENTIFIÉS (identifiants dans siteCredentials) : traités par krampAuthPass
    // (login Firecrawl), PAS par la passe générique. Les autres sites suivent le flux existant.
    const authByDomain = new Map<string, Awaited<ReturnType<typeof getSiteCredentials>>>()
    for (const s of sites) {
      const cred = await getSiteCredentials(ctx.uid, bare(s.domain))
      if (cred) authByDomain.set(s.siteId, cred)
    }
    const regularSites = sites.filter((s) => !authByDomain.has(s.siteId))

    // Tranche de produits du tick (identique pour la passe générique et la passe auth).
    const startIdx = startCursor % Math.max(1, products.length)
    const slice = products.slice(startIdx, startIdx + budget)

    const pass = await directedPass(products, regularSites, startIdx, budget, {
      fetchHtml: async (url) => { try { return await fetchHtml(url, 20000) } catch { return null } },
      ...(hasGeneric && firecrawlKey ? { searchWeb, extractProduct } : {}),
      signal: ctx.signal,
      log: (m) => ctx.log('info', m),
    })

    // Passe AUTHENTIFIÉE (kramp…) : un site auth = un lot krampAuthPass sur la tranche.
    for (const [siteId, cred] of authByDomain) {
      if (ctx.signal?.aborted) break
      const key = firecrawlKey || (await getUserApiKey(ctx.uid, 'firecrawl'))
      if (!key) { ctx.log('warn', `Site authentifié ${cred!.host} mais aucune clé Firecrawl — ignoré.`); continue }
      const authHits = await krampAuthPass(slice, {
        scrape: (urls) => krampBatchScrape(urls, cred!, key, 200_000),
        signal: ctx.signal,
        log: (m) => ctx.log('info', m),
      })
      for (const h of authHits) pass.results.push({ productId: h.productId, siteId, hit: { listing: h.listing, evidence: h.evidence, query: h.listing.ref ?? '' } })
      ctx.log('info', `Auth ${cred!.host} : ${authHits.length} prix apparié(s) sur ${slice.length} produit(s).`)
    }
```

Ajouter les imports en tête de fichier :

```ts
import { getSiteCredentials } from '../../scraper/siteCredentials'
import { krampBatchScrape } from '../../scraper/krampFirecrawl'
import { krampAuthPass } from '../../priceWatch/catalog/krampAuthPass'
```

- [ ] **Step 2: Vérifier types + lint**

Run: `cd functions && npx tsc -b` puis `cd /Applications/_IA/Claude_workspace/Web2Print && npm run lint`
Expected: tsc exit 0 ; lint sans erreur bloquante.

- [ ] **Step 3: Lancer toute la suite de tests priceWatch**

Run: `cd functions && npx vitest run src/priceWatch` puis `cd /Applications/_IA/Claude_workspace/Web2Print && npx vitest run src/features/priceWatch`
Expected: tous verts (les modules purs jumelés inchangés + nouveaux tests kramp).

- [ ] **Step 4: Commit + déploiement**

```bash
git add functions/src/workflow/nodes/directedSearch.ts
git commit -m "feat(veille): node Recherche dirigée — passe authentifiée kramp (login Firecrawl)"
firebase deploy --only functions:workflowCronScheduler
```

- [ ] **Step 5: Activer kramp en prod + validation live (5 réfs)**

1. Ajouter `https://www.kramp.com/` à la config `sites` du node `directed-search` du workflow planifié `wf_1784591652775_9qn25z` (patch Firestore via token gcloud, méthode des scripts existants). kramp est auto-reconnu comme authentifié via `siteCredentials`.
2. Attendre 1-2 ticks cron, puis lire les logs :
   Run: `firebase functions:log --only workflowCronScheduler -n 200 | grep -iE "Auth kramp|kramp :"`
   Expected : lignes « Auth kramp.com : N prix apparié(s) … » avec N > 0 sur la tranche contenant des réfs kramp connues (ex. 092.48.801, 1134381601).
3. **Vérifier HT vs TTC** : confirmer que « Prix brut » kramp est bien HT (comparer un prix connu, ex. réservoir stiga ≈ 93,57 € HT) ; si kramp affiche en fait du TTC, passer `taxIncluded: true` dans `parseKrampProduct` (Task 2) et redéployer.
4. Vérifier dans le dashboard « Veille tarifaire » que kramp apparaît avec des prix appariés (colonne concurrent kramp.com).

**Go/no-go final** : si N = 0 sur des réfs connues, investiguer (timing render des pages, sélecteurs login modifiés) avant d'élargir le budget.
