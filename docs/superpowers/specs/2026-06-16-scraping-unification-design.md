# Unification des interfaces de scraping — design

**Date** : 2026-06-16
**Statut** : approuvé (approche A)

## Problème

Deux UX font le même métier (Jina / Bright Data / LLM), d'où la confusion :

1. **Modal « Web Scraping »** (`src/features/scraping/ScrapingModal.tsx` + `ScrapeTab`/`MapExtractTab`/`CrawlTab`/`SearchTab`) — onglets Scrape / Map+Extract / Crawl / Recherche, sélection interactive, utilisé par le PIM (`DataPage`).
2. **Nodes de workflow** (`src/features/workflows/registry/`) — `scrape-url`, `list-products`, `web-search`, `web-ask`, `enrichment`. Pas de Crawl, pas de Map interactif.

Le **moteur est déjà partagé** (`enrichProductCore` / `useProductEnrichment.ts`, `readPageWithEscalation`, `useJina`). La dette est **UX/structurelle** : plusieurs nodes épars côté workflow + un modal séparé.

## Décision (approche A)

Un **node unique `web-scraping`** avec un champ **Mode** :

| Mode | Remplace | Logique réutilisée |
|------|----------|--------------------|
| **Scrape** | `scrape-url` | run de scrapeNodes (1+ URL → champs) |
| **Liste** | `list-products` | run de listProductsNode (pages liste → produits, pagination) |
| **Recherche** | `web-search` | run de webSearchNode |
| **Question** | `web-ask` | run de webAskNode |
| **Crawl** | *(nouveau côté workflow)* | découverte de fiches façon `CrawlTab` (Jina listing + CF) |

- Le node aiguille (`run`) vers les logiques **déjà écrites** ; aucune réécriture du moteur.
- La config est **conditionnelle au mode** (champs affichés selon Scrape/Liste/Recherche/Question/Crawl).
- Les anciens types (`scrape-url`, `list-products`, `web-search`, `web-ask`) deviennent des **alias dépréciés** : retirés du menu « + » (plus proposés à la création), mais toujours exécutables → **zéro régression** sur les workflows existants.
- `enrichment` reste séparé (rôle distinct : enrichir une colonne URL d'une sheet, pas un point d'entrée scraping).
- Le modal PIM est **hors scope** de ce chantier (il garde son rôle ; il pourra plus tard pointer vers le node, mais pas maintenant).

## Décomposition (livraison par étapes)

1. **Node façade `web-scraping`** + sélecteur de mode (Scrape / Liste / Recherche / Question) aiguillant vers les runs existants. Anciens nodes masqués du menu mais fonctionnels. Parité client + serveur.
2. **Mode Crawl** ajouté au node (capacité manquante côté workflow).
3. **Finitions** : connecteurs/badges par mode, doc, vérif cron headless.

## Tâche connexe (indépendante) — STOP run serveur

Ajouter un bouton **STOP** au panneau « Lancer (serveur) » : écrit un flag d'abandon (`workflowRunsLive/{id}.abortRequested`) que l'executor headless lit entre les nodes (via le hook `onProgress` déjà en place) → `AbortController.abort()`. Faite **avant** l'unification (petit, isolé, débloque l'UX immédiate).

## Invariants

- **Parité client/serveur** obligatoire (deux runtimes du node, comme pour les autres nodes).
- Réutiliser les runs existants (ne pas dupliquer la logique de scraping).
- Pas de logique par-vendeur (cf. règles scraping-pipeline).
