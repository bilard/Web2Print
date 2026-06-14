# Veille tarifaire concurrentielle — Design

> Date : 2026-06-14
> Statut : spec validée (phasage approuvé), en attente de relecture avant plan d'implémentation

## 1. Contexte & problème

Le node de workflow actuel **« Veille prix » (`price-watch`)** ne fait que comparer un **même scrape** entre deux runs (mémoire `users/{uid}/priceWatch/{watchId}`). Il part d'une liste d'URLs déjà connues (`scrape-url`).

Le besoin réel est une **veille tarifaire concurrentielle** : partir de **MON catalogue** (SKU / EAN / Nom / Marque + mon prix) et **retrouver chaque produit chez des concurrents** pour comparer les prix dans le temps, de façon **automatique (Cron, sans navigateur ouvert)**.

Différence clé : il faut une étape de **découverte + rapprochement** (trouver la bonne page produit sur chaque site), absente du pipeline actuel.

## 2. Objectifs

- Catalogue de produits surveillés avec clé relationnelle **SKU → EAN → (Nom + Marque)** en repli.
- Liste de **sites concurrents** à scraper, avec un **pattern de champs** à extraire (prix, dispo…).
- **Découverte** de la page produit sur chaque site (cascade de stratégies).
- **Validation LLM** du rapprochement avec score de confiance ; les matchs douteux passent en file « à confirmer ».
- **Épinglage** de l'URL validée → pas de re-découverte à chaque run (coût maîtrisé).
- **Alertes** (Telegram/email) sur : positionnement vs mon prix, variation chez un concurrent, rupture/dispo, nouveau concurrent.
- Forme : **module dédié** (page de config + visualisation) **+ un node pont** exécutable sous Cron headless.

## 3. Non-objectifs (v1)

- Pas d'automatisation du moteur de recherche interne des sites en v1 (fragile : anti-bot/sélecteurs) → reporté en v3.
- Pas d'import CSV/Excel en v1 → v2.
- Pas de suivi de disponibilité en v1 → v2.
- Pas de détection de « nouveau concurrent » en v1 → v3.
- Aucun parser par-fournisseur (règle projet : enrichissement généraliste Jina + LLM).

## 4. Contrainte structurante : exécution headless serveur

Tout l'intérêt = **Cron sans navigateur**. Or `cron` est `runtime:'server'` et l'exécuteur serveur **refuse** les nodes `SERVER_UNSUPPORTED`. Le node pont DOIT donc avoir une implémentation **serveur** complète.

**Vérifié** : `functions/src/workflow/nodes/` contient déjà des réimplémentations headless wire-compatibles :
- `network.ts` → `web-search` (`jinaSearch`) et `scrape-url` (`jinaRead` + extraction LLM `callLlm`/`parseLlmJson`),
- `priceWatch.ts` → diff,
- accès Firestore admin.

➡️ Tout le pipeline (découverte → scrape → validation LLM → diff → alerte) **peut tourner côté serveur**. Le node pont sera implémenté **deux fois** : version client (`src/features/workflows/registry/`) pour l'aperçu dans l'éditeur, version serveur (`functions/src/workflow/nodes/`) pour le Cron — comme les autres nodes réseau.

## 5. Modèle de données (Firestore)

Généralise le `priceWatch/{watchId}` existant plutôt que d'inventer un store parallèle. Un **suivi** (`watchId`) regroupe un catalogue, des sites, des matchs et un historique.

```
users/{uid}/priceWatch/{watchId}                       # métadonnées du suivi
  { name, thresholdPct, rediscoverEveryDays, createdAt, updatedAt }

users/{uid}/priceWatch/{watchId}/products/{productId}  # MON catalogue
  { sku?, ean?, name, brand?, myPrice?, sourceSheetId?, sourceRowId? }

users/{uid}/priceWatch/{watchId}/sites/{siteId}        # concurrents
  { domain, urlPattern?, fieldMap?: Record<canonical, siteField> }
  # urlPattern ex : "https://site.com/p/{sku}" — placeholders {sku}/{ean}/{name}

users/{uid}/priceWatch/{watchId}/matches/{productId}__{siteId}  # URL épinglée
  { url, confidence, status: 'auto'|'confirmed'|'pending'|'rejected',
    lastPrice?, lastInStock?, updatedAt, lastDiscoveredAt }

users/{uid}/priceWatch/{watchId}/history/{productId}__{siteId}  # série temporelle bornée
  { values: Array<{ price, inStock?, at }> }   # ring buffer des N derniers relevés (N≈30)
```

Choix de rétention : **ring buffer last-N** (≈30 relevés) par produit×site, dans un document `values: []` unique (même pattern que les auto-snapshots et le `priceWatch.values` actuel). Évite la croissance non bornée et la facturation de millions de docs.

## 6. Pipeline d'un run (par produit × site)

```
Pour chaque produit P × site S :
  1. matches/{P}__{S} existe et status ∈ {auto,confirmed} et URL épinglée ?
       OUI  → re-scrape juste cette URL (pas de découverte)
       NON  → DÉCOUVERTE (cascade) :
                a. urlPattern de S + clé de P (sku→ean→name) → URL construite
                b. recherche web : « site:{domain} {sku|ean} » puis « site:{domain} {brand} {name} »
                c. [v3] moteur de recherche du site (Puppeteer/Bright Data)
              → URL candidate
  2. SCRAPE des champs (price, inStock, name, brand…) via jinaRead + extraction LLM
  3. VALIDATION LLM : compare P (nom/marque/sku/ean) à la page candidate → score 0–1
       score ≥ seuil  → match.status = 'auto', URL épinglée
       score < seuil  → match.status = 'pending' (file « à confirmer », pas d'alerte)
  4. DIFF & POSITIONNEMENT :
       - push {price, inStock, at} dans le ring buffer history
       - variation concurrent : |price - prevPrice| / prevPrice ≥ thresholdPct ?
       - positionnement : price < myPrice (un concurrent passe sous mon prix) ?
       - [v2] dispo : inStock changé ?
  5. Agréger les lignes « à alerter » → port `changes` (→ Telegram), sinon rien
```

**Maîtrise du coût** (combinatoire produits × sites × runs) :
- Régime permanent = uniquement re-scrape des URLs épinglées + diff (pas de recherche LLM).
- Re-découverte **périodique** (`rediscoverEveryDays`, défaut hebdo) ou manuelle, jamais à chaque run.
- Validation LLM **batchée** quand plusieurs candidats sont à valider.
- `log()` explicite du nombre d'ops par run pour la transparence.

## 7. Forme produit

### Module dédié (page) — section `pim`-style dans `DashboardPage`
- Nouveau `Section` `'price-watch'` dans `src/features/navigation/modules.ts` (+ icône, accent, permission `priceWatch.view`).
- Panneau React (sous `src/features/priceWatch/`) :
  - **Onglet Catalogue** : choisir une feuille PIM + mapper colonnes (sku/ean/name/brand/myPrice), ou saisie manuelle.
  - **Onglet Sites** : domaine + urlPattern + mapping de champs.
  - **Onglet Comparatif** : tableau produit × site (mon prix vs concurrents, écart, statut match), file « à confirmer » avec boutons Confirmer/Rejeter.
  - **Onglet Historique** [v2] : graphe des prix dans le temps.
- Logique métier dans des **hooks** (`src/features/priceWatch/`), pas dans les composants UI (convention projet). Accès Firebase via hooks de `features/`.

### Node pont — `price-watch-track`
- Config : `watchId` (sélection d'un suivi enregistré), `thresholdPct` (surcharge optionnelle).
- Entrée : `tick` (du Cron) optionnelle ; sortie : `changes` (sheet) → Telegram, `all` (sheet).
- Exécute le pipeline §6 pour le suivi désigné. **Implémentation client + serveur** (wire-compatible).
- Workflow type : `Cron → price-watch-track → Envoyer via Telegram`.

## 8. Découpage en phases

| Phase | Périmètre | Justification |
|-------|-----------|---------------|
| **v1 (slice)** | Catalogue **PIM + saisie manuelle** · découverte **pattern d'URL + recherche web** · validation LLM + file « à confirmer » + **épinglage** · alertes **positionnement + variation concurrent** · **page module + node pont (client & serveur)** + Cron | Valeur end-to-end, headless, sans le maillon fragile |
| **v2** | Import **CSV/Excel** · alertes **rupture/dispo** · **graphe d'historique** | Extensions à faible risque |
| **v3** | Découverte **moteur du site** (Puppeteer/Bright Data) · alerte **nouveau concurrent** | Maillon fragile (anti-bot/sélecteurs) isolé en dernier |

## 9. Gestion des erreurs & cas limites

- **Produit sans SKU ni EAN** : repli sur recherche `brand + name` ; si validation LLM < seuil → `pending`, jamais d'alerte fausse.
- **Site anti-bot** : si scrape vide/bloqué → log warn (même sémantique que le bandeau PIM), match laissé inchangé, pas de fausse alerte « prix à 0 ».
- **Premier relevé** d'un produit×site : mémorisé, aucune alerte (comme `price-watch` actuel).
- **URL épinglée morte** (404) : repasse en `pending` + re-découverte au prochain cycle.
- **Utilisateur non connecté** côté serveur : le run Cron porte le `uid` propriétaire du workflow (garde de propriété déjà en place).
- **Prix illisible** : `parsePrice` (réutilisé de `priceWatchNode.ts`) → NaN → ligne ignorée.

## 10. Tests

- **Purs / unitaires** (Vitest) : `parsePrice`, diff/positionnement, construction d'URL depuis pattern + clé, sélection de la clé relationnelle (sku→ean→name+brand), bornage du ring buffer, parsing de la réponse de validation LLM.
- **Wire-compat** : test que `price-watch-track` n'est pas dans `SERVER_UNSUPPORTED` et que client/serveur exposent les mêmes ports/clés de config (cf. `promptToFlowServer.test.ts`).
- **Smoke visuel utilisateur** : un suivi réel (quelques produits, 2 sites) + run manuel + vérif de la file « à confirmer » et d'une alerte Telegram réelle.

## 11. Réutilisation (briques existantes)

- Découverte : `@/features/scraping/webContext` (`gatherWebContext`) côté client ; `jinaSearch` côté serveur.
- Scrape champs : `enrichRow` / `enrichProductCore` (client) ; `jinaRead` + `callLlm` (serveur).
- Diff/prix : `parsePrice` + logique de `priceWatchNode.ts`.
- Telegram : node `telegram` existant.
- Navigation : `modules.ts` (source unique sidebar + drawer).
- RBAC : permission `priceWatch.view` via `permissions.ts` + gate `SECTION_PERMISSION`.
