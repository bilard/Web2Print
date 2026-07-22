# Veille tarifaire — Scraping authentifié Kramp (login Bright Data + match exact)

> Date : 2026-07-22 · Statut : conçu, à valider

## Problème

Kramp.com (distributeur B2B pièces agricoles/motoculture) **cache ses prix tant qu'on n'est pas connecté**, et protège l'accès (anti-bot). Le mode générique existant (recherche web Jina + Firecrawl) ne sait pas se connecter → kramp reste à 0. Or kramp indexe les **références fabricant/OEM**, donc une fois connecté l'appariement EXACT (réf/EAN) devrait matcher directement — vraie couverture, contrairement aux marketplaces grand public (cdiscount) où les réfs OEM sont absentes.

## Objectif

Récupérer les prix kramp **connecté**, apparier par **preuve exacte** (réf/EAN), et les faire remonter dans le dashboard « Veille tarifaire » comme n'importe quel concurrent — **sans** file « À confirmer » (le match exact suffit, zéro faux positif).

## Approche retenue : A (session authentifiée par tick), seam pour B

À chaque tick cron, ouvrir **un** Chrome distant Bright Data (Scraping Browser), se connecter **une fois**, réutiliser la session pour les ~20 réfs du budget, déconnecter en fin de tick. Le fetcher authentifié est exposé derrière une **interface abstraite** `AuthFetcher { fetchHtml(url), close() }` pour qu'un futur passage à B (récolte de cookies + réutilisation via Web Unlocker, moins cher, login amorti sur plusieurs ticks) soit un remplacement de l'implémentation sans toucher aux appelants.

**Pourquoi pas B d'emblée** : plomberie cookies (sérialisation/expiration/domaine) + risque prix-en-JS non matérialisés par le Web Unlocker HTTP. Optimisation prématurée tant que le login et la couverture ne sont pas prouvés.

## Invariants de sûreté

- **Secrets** : identifiants dans `users/{uid}.siteCredentials.kramp` = `{login, password, host, loginUrl}` (déjà stockés, Firestore serveur-only). **Jamais** dans le git, les logs, ni un fichier tracké. Aucune valeur de mot de passe journalisée.
- **Zéro faux positif** : on ne touche PAS `proveMatch` ; kramp passe par le chemin EXACT (réf/EAN), comme les sites PrestaShop. Cf. `reference_price_watch_join_keys_per_site`.
- **Coût borné** : 1 login / tick, ≤ budget réfs/tick (existant `productBudget`). Abort-signal respecté (réutilise le durcissement du commit 1416099f). Timeouts de navigation (90 s, déjà en place).

## Composants

### 1. `functions/src/scraper/authSession.ts` (NOUVEAU) — fetcher authentifié Bright Data
- Factory `openKrampSession(creds): Promise<AuthFetcher>` :
  - `getBrightDataBrowserWs()` → `puppeteer.connect(wsEndpoint)` (réutilise `scrapingBrowserCore` : puppeteer-extra + stealth, require paresseux).
  - **Login** : `goto(loginUrl)` = `https://login.kramp.com/` (**sous-domaine SSO dédié** → flux de redirection vers `kramp.com/shop` après authentification, à mapper en Phase 0). Remplir champs identifiant/mot de passe, soumettre, **suivre la redirection**, attendre l'état connecté (cookie de session partagé sur `.kramp.com` ou sélecteur post-login). Throw explicite si le login échoue (pas de scraping non authentifié silencieux).
  - Retourne `{ fetchHtml(url) → HTML (même page/onglet réutilisé), close() → browser.disconnect() }`.
- Interface `AuthFetcher` = seam pour l'implémentation B ultérieure.
- ⚠️ Sélecteurs login/kramp = **inconnus à ce stade** → découverts en Phase 0.

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
