# Veille tarifaire — Scraping authentifié Kramp (login Bright Data + match exact)

> Date : 2026-07-22 · Statut : conçu, à valider

## Problème

Kramp.com (distributeur B2B pièces agricoles/motoculture) **cache ses prix tant qu'on n'est pas connecté**, et protège l'accès (anti-bot). Le mode générique existant (recherche web Jina + Firecrawl) ne sait pas se connecter → kramp reste à 0. Or kramp indexe les **références fabricant/OEM**, donc une fois connecté l'appariement EXACT (réf/EAN) devrait matcher directement — vraie couverture, contrairement aux marketplaces grand public (cdiscount) où les réfs OEM sont absentes.

## Objectif

Récupérer les prix kramp **connecté**, apparier par **preuve exacte** (réf/EAN), et les faire remonter dans le dashboard « Veille tarifaire » comme n'importe quel concurrent — **sans** file « À confirmer » (le match exact suffit, zéro faux positif).

## Phase 0 — RÉSULTATS (2026-07-22, GATE PASSÉ) → pivot moteur

Reconnaissance live (browserWs Bright Data + clés prod) :
- ❌ **Bright Data Scraping Browser INTERDIT la saisie de mot de passe** (`Forbidden action: password typing is not allowed`, y compris via `element.value`). **L'approche A (login Bright Data) est morte.**
- ✅ **Firecrawl `actions` sait se connecter** : `url=login.kramp.com`, actions `write` #username / input[type=password], `click` button[name=login-btn]. Pas de blocage mot de passe.
- ✅ **Navigation en session dans le MÊME appel** via action `executeJavascript` (`location.assign(url)`) — Firecrawl n'a pas d'action `navigate`. Les **prix connectés sont visibles** (ex. 246,84 €).
- ✅ **Recherche par réf** : URL path-based `https://www.kramp.com/shop-fr/fr/search/<réf>`. Réf F1 `092.48.801` → fiche `…/p/courroie-trapézoïdale--09248801`, **prix 12,06 €**, **match EXACT** (l'ID URL = réf sans points). Recherche **par réf ET par EAN** supportée par kramp (confirmé utilisateur) : réf fabricant d'abord, **EAN en repli** si la réf est exotique. (Mon test EAN 4049582633196 était « sans correspondance » car ce produit précis n'est pas chez kramp, pas parce que l'EAN serait non cherchable.)
- Sélecteurs login : `#username`, `input[type=password]`, `button[name=login-btn]`. Fiche produit : `/shop-fr/fr/p/<slug>--<id>`.

## Approche retenue : Firecrawl `actions` (login intégré), 1 appel = login + recherche + fiche

Le moteur n'est PAS Bright Data mais **Firecrawl `actions`** (déjà câblé serveur via `firecrawlScrapeProduct`). Un lookup kramp = **un appel Firecrawl** : login → `executeJavascript` vers `/search/<réf>` → scrape (liste) → `executeJavascript` vers la fiche → scrape (prix), OU login → search → fiche selon ce qui tient dans une chaîne d'actions. Session portée à l'intérieur de l'appel (Firecrawl ne persiste pas entre appels).

**Coût / seam B** : login-par-réf est coûteux. Piste d'optimisation (à mesurer, pas à construire d'emblée) = **une chaîne d'actions par TICK** qui logge une fois puis enchaîne N `executeJavascript`+`scrape` (N réfs) → login amorti. Le fetcher reste derrière une interface abstraite `AuthFetcher` pour permettre cette évolution sans toucher aux appelants.

## Invariants de sûreté

- **Secrets** : identifiants dans `users/{uid}.siteCredentials.kramp` = `{login, password, host, loginUrl}` (déjà stockés, Firestore serveur-only). **Jamais** dans le git, les logs, ni un fichier tracké. Aucune valeur de mot de passe journalisée.
- **Zéro faux positif** : on ne touche PAS `proveMatch` ; kramp passe par le chemin EXACT (réf/EAN), comme les sites PrestaShop. Cf. `reference_price_watch_join_keys_per_site`.
- **Coût borné** : 1 login / tick, ≤ budget réfs/tick (existant `productBudget`). Abort-signal respecté (réutilise le durcissement du commit 1416099f). Timeouts de navigation (90 s, déjà en place).

## Composants

### 1. `functions/src/scraper/krampFirecrawl.ts` (NOUVEAU) — lookup authentifié via Firecrawl actions
- `krampLookup(query, apiKey): Promise<{ html: string, finalUrl: string } | null>` — un appel Firecrawl `/v2/scrape` avec la chaîne d'actions : `write` login (#username, input[type=password]), `click` button[name=login-btn], `wait`, `executeJavascript` → `location.assign('…/shop-fr/fr/search/<query>')`, `wait`, `scrape`. Renvoie le HTML/markdown de la page de recherche connectée.
- Identifiants lus depuis `users/{uid}.siteCredentials.kramp` (login/password), clé Firecrawl depuis `apiKeys.overrides.firecrawl`.
- Interface `AuthFetcher` conservée = seam pour l'optim « login-once-par-tick » (chaîne multi-scrape) ultérieure, sans toucher aux appelants.
- ⚠️ Ne JAMAIS journaliser login/password.

### 2. `functions/src/priceWatch/catalog/krampParse.ts` (NOUVEAU, PUR + jumeau client) — découverte & extraction kramp
- `krampSearchUrl(ref): string` — URL de recherche interne kramp par référence.
- `parseKrampSearchLinks(html): string[]` — URLs fiches produit depuis la page de recherche.
- `parseKrampProduct(html, url): CompetitorListing | null` — {name, price, ref, ean?, availability} depuis une fiche connectée. JSON-LD schema.org d'abord (réutilise la logique de `genericListing.ts` si applicable), sinon parse ciblé. **Textes VERBATIM** (l'IA ne rédige rien) — cf. `feedback_scraping_verbatim_no_ai_text`.
- Pur → testable hors réseau (fixtures HTML capturées en Phase 0).

### 3. `functions/src/workflow/nodes/directedSearch.ts` (MODIF) — intégration site authentifié
- Un site dont le domaine nu a une entrée `siteCredentials` = **site authentifié**. On construit la session UNE fois par tick (paresseux : seulement si ≥ 1 site auth dans les sites configurés).
- Pour un site auth : `extractProduct`/discovery utilisent `authFetcher.fetchHtml` + `krampParse` au lieu de Firecrawl. Le reste (proveMatch, persistance, curseur, dashboard) est inchangé — kramp réutilise le pipeline directed-search.
- `close()` en `finally` de la passe. Le compteur diagnostic (commit 1416099f) s'étend à kramp : recherches · sans résultat · extraites · appariées.
- Jumeau serveur uniquement (le node client ne câble déjà pas le générique — auth serveur-only, comme Firecrawl).

## Flux (un tick)

```
[si ≥1 site auth] openKrampSession(creds) → login 1×
 pour chaque réf du budget :
   krampSearchUrl(réf) → fetchHtml → parseKrampSearchLinks → 1-3 fiches
     fetchHtml(fiche) → parseKrampProduct → listing
       proveMatch(clés source, listing) EXACT → hit
 close()
persist hits → dashboard (identique aux autres directed hits)
```

## Plan par phases (go/no-go tôt)

- **Phase 0 — Reconnaissance & validation (GATE)** : smoke local puppeteer-core connecté au Scraping Browser Bright Data (browserWs lu depuis `config/brightdata`). Vérifier : (1) le login kramp (SSO `login.kramp.com` → redirection) réussit ; (2) la recherche interne **par réf fabricant ET par EAN** sort la bonne fiche ; (3) le prix est présent dans le HTML connecté ; (4) **5 réfs F1 réelles** matchent (kramp porte-t-il tes réfs ?). Les deux clés (réf, EAN) sont déjà couvertes par `candidateKeys`/`proveMatch`. Capturer des fixtures HTML. **Si le login est infranchissable ou kramp ne porte pas les réfs → on s'arrête là et on rapporte.**
- **Phase 1** — `authSession.ts` + `krampParse.ts` (+ tests purs sur fixtures Phase 0).
- **Phase 2** — Intégration `directedSearch.ts` + config (kramp dans `sites` + reconnaissance auto via `siteCredentials`). Déploiement functions.
- **Phase 3** — Observation en prod (diagnostic) : taux d'appariement kramp réel. Décision d'étendre / d'optimiser vers B selon le coût Bright Data.

## Hors périmètre (YAGNI)

- Implémentation B (cookies + Web Unlocker) : seam prévu, pas construit.
- UI de saisie des identifiants (stockés directement pour l'instant ; UI Settings plus tard si besoin d'autres sites auth).
- Autres marketplaces authentifiés : le module est kramp-spécifique d'abord ; on généralisera si un 2e site auth apparaît.
