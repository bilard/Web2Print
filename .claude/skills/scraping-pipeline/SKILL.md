---
name: scraping-pipeline
description: Use when un site web sort une fiche produit incomplète ou fausse dans le PIM (specs/PDF/images/breadcrumb/référence manquants, textes d'un autre produit, images hors-sujet, 0 produit découvert au Crawl), ou pour étendre le scraping à un nouveau pattern de site — Jina, Firecrawl, Bright Data, fetchPageHtml
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, Agent
---

# Pipeline de scraping universel — diagnostic et extension

Site signalé : $ARGUMENTS

## Règle d'or

**JAMAIS de code par-vendeur.** Chaque fix = un signal générique (standard schema.org, pattern de CMS, convention de CDN, structure DOM répétée) + garde-fou de non-régression (si le signal est absent → comportement inchangé) + test sur fixture réelle. Un fix qui ne marche que pour UN site est un bug.

## Références

- **`references/jina-api.md`** — en-têtes complets Jina Reader (`r.jina.ai`) ET
  Search (`s.jina.ai`) : `X-Engine`, `X-Proxy`(résidentiel anti-bot), `X-Target-Selector`,
  `X-Remove-Selector`, `X-Locale`, `X-With-Links-Summary: all`, `X-Retain-Images`,
  `X-Respond-With`, `X-Site`… + ce que l'app envoie déjà et les leviers non branchés.

## Carte du pipeline (qui fait quoi)

| Étage | Fichier | Rôle |
|---|---|---|
| Découverte Crawl | `src/features/scraping/useJina.ts` `discover()` + `core/discoverLinks.ts` | cartes produit (CF `cardLinks`) > contenu−nav > union |
| Classification liens | `functions/src/scraper/extractBreadcrumb.ts` | Puppeteer : CMP dismissal, scroll itératif, `navLinks`/`cardLinks`/images |
| Moteur fiche | `src/features/excel/ai-enrichment/useProductEnrichment.ts` `enrichProductCore` | cache → URL → scrape → build (UNIQUE moteur : PIM, workflow, Telegram) |
| HTML brut | `scrapeManufacturerRawData` (même fichier) | via `fetchSourceHtml` (CF `fetchPageHtml`) : REDUX_STORE → JSON-LD maison → structured-data canonique → NEXT_DATA → DOM (tables/dl/techspecs) → PDFs |
| Données structurées | `src/features/scraping/core/structuredData.ts` | JSON-LD (`@graph`, **`ProductGroup.hasVariant`**), microdata, entités HTML, unitCode |
| Cascade HTML anti-bot | `src/features/scraping/core/structuredDataFetcher.ts` | CF → proxies → Jina HTML → Firecrawl → Bright Data |
| Parsers markdown | `src/features/scraping/core/parsers/` | specs (Formats 1-6), advantages, `parseNamedDocLinks`, `filterImagesByRef` |
| Build fiche | `buildManufacturerProduct` + `buildIdentity` | merge raw+markdown, EAN/réf/sous-titre/pictos, filtre images par réf |

## Diagnostic en étages (dans CET ordre)

Chaque étage répond à UNE question. Ne pas sauter d'étage, ne pas proposer de fix avant l'étage 4.

**1. Que contient la page ? (vérité terrain)**
```bash
curl -sL "<URL>" -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36" -o /tmp/page.html -w "%{http_code} %{size_download}\n"
python3 -c "
html = open('/tmp/page.html').read()
for n in ['__REDUX_STORE','__NEXT_DATA__','application/ld+json','ProductGroup','itemtype','techspecs','breadcrumb','.pdf','<UNE_SPEC_VISIBLE_SUR_LA_PAGE>']:
    print(f'{n!r:28} → {html.count(n)}')"
```
- HTML < 50 ko ou marqueurs absents → SPA/anti-bot : la donnée vient du rendu (Jina browser / CF Puppeteer / Bright Data), pas du HTML statique.
- JSON-LD présent → inspecter `@type` : si `ProductGroup`, les Product sont dans `hasVariant` (déjà géré — vérifier que ça matche).

**2. Que voit Jina ? (markdown)**
```bash
curl -s "https://r.jina.ai/<URL>" -H "Accept: application/json" --max-time 60 -o /tmp/jina.json
python3 -c "
import json; c = json.load(open('/tmp/jina.json'))['data']['content']
open('/tmp/page.md','w').write(c); print(len(c))
i = c.find('<UNE_SPEC_VISIBLE>'); print(c[max(0,i-300):i+500])"
```
Donnée présente dans le markdown mais absente de la fiche → **bug de parser** (étage 3). Absente du markdown → bug de rendu/scroll/onglet (CF Puppeteer ou Jina POST).

**3. Que sortent les parsers ? (fixtures réelles)**
Test vitest temporaire `src/__tmp.test.ts` qui lit `/tmp/page.md` ou `/tmp/page.html` et appelle le parser canonique (`parseSpecsFromMarkdown`, `parseStructuredDataAny`, `extractBreadcrumbFromHtml`, `parseNamedDocLinks`…). Lancer avec `--silent=false --reporter=verbose`. C'est ici qu'on voit le format exact qui échappe aux parsers.

**4. Que fait le run réel ? (logs prod)**
Re-scraper dans l'app (onglet frais ⌘R — un onglet ouvert garde l'ancien bundle après deploy !) et lire la console : `[structured-data]`, `[manufacturer]`, `[manufacturer-build]`, `[enrichment]`, `[discover]`. Signatures connues :
- `Jina injected downloads: 0` / `images collected: 0` → bloc injecté vide ou CMP qui verrouille le scroll
- `no HTML available` → cascade HTML KO sur ce site
- `cache has only N specs` → le scrape cache resert un vieux markdown pauvre

## Où brancher un fix (points d'extension canoniques)

- **Nouveau format de specs markdown** → nouveau Format dans `parseSpecifications.ts` (jamais un parser parallèle) + test dans `__tests__/parseSpecifications.test.ts` avec extrait RÉEL.
- **Nouveau schéma de donnée structurée** → `structuredData.ts` (`flattenItems`/parsers) ; `scrapeManufacturerRawData` l'utilise via la passe 2bis.
- **Nouveau pattern de documents/images** → `core/parsers/` (module dédié + test), branché dans `buildManufacturerProduct`.
- **Site qui bloque le HTML** → vérifier la cascade `structuredDataFetcher.ts` (CF → proxies → Jina → Firecrawl → BD) ; escalade Bright Data Scraping Browser pour DataDome dur.
- **Découverte Crawl polluée** → `extractBreadcrumb.ts` (classification DOM) + `discoverLinks.ts` (sélection d'étages).

## Garde-fous obligatoires

1. Un filtre ne VIDE jamais une liste : signal absent ou < seuil → liste inchangée (cf. `filterImagesByProductRef`).
2. Sections cookies/consent/avis = poison récurrent des parsers → exclusions par heading, pas par site.
3. `tsc -b` + `npm run test:run` + `npx knip` avant commit ; déployer (`npm run build` + `firebase deploy --only hosting`, + `--only functions:extractBreadcrumb` si CF touchée) ; **vérifier en prod sur le site signalé ET re-tester un site déjà validé** (Makita `product/dda351rtj.html` = référence).
4. L'aperçu du modal Scrape n'affiche PAS l'identité (réf/EAN/sous-titre/breadcrumb) — valider via les logs ou la fiche importée.

## Pièges déjà payés (ne pas re-déboguer)

| Symptôme | Cause connue |
|---|---|
| « rien n'a changé » après deploy | onglet SPA sur l'ancien bundle → ⌘R |
| Toutes les fiches du crawl identiques | URLs = menu/catégories (vérifier `tier:` dans les logs discover) |
| 0 spec sur site à variantes (Milwaukee/TTI) | JSON-LD `ProductGroup.hasVariant` |
| 0 spec sur CMS PAM (Makita) | bullets `*  Nom␣␣Valeur` (Format 6) + HTML via CF |
| PDF nommés par filename | libellé sur la ligne AU-DESSUS d'un lien vide `[](url.pdf)` |
| Centaines d'images hors produit | carrousels liés → filtre par référence dans le nom de fichier |
| proxies allorigins/corsproxy | MORTS depuis 2026-06 → `fetchSourceHtml` (CF) partout |
| Description = garantie/CGV (Trafic/Magento) | la sous-page `conditions-generales` était fusionnée au bundle (préfixe partagé = locale) → blocklist segments transverses dans `relatedUrls` (2 copies !) + prose CGV dans `garbageFilter` |
| Avantages = footer enseigne (« Nos promesses », newsletter, TVA, Mollie) | l'UI de login Magento (« La création d'un compte possède de nombreux avantages ») ouvrait la featureZone sans heading pour la fermer → exitKeywords compte/checkout + réassurance enseigne dans `garbageFilter` (filtre aussi la synthèse LLM via `sanitizeEnriched`) |
| EAN = sku interne (JSON-LD gtin 7 chiffres) | gtin validé 8-14 chiffres dans buildIdentity ; VRAI EAN via `parseIcecatGtin` (widget IcecatLive → paire spec liftée) |
| Cellule sale malgré re-scrape propre | l'upsert d'import PRÉSERVE les cellules non vides quand la nouvelle valeur est vide — re-générer la base (Démo express) ou vider la cellule à la main |
